/**
 * LLM adapter: OpenAI-compatible API with tool/function calling.
 * Expects OPENAI_API_KEY. Can be swapped for Claude/other via same interface.
 *
 * Notes for non-OpenAI providers:
 *   - Anthropic via `https://api.anthropic.com/v1` works through OpenAI-compat shim
 *     but DOES NOT enable Anthropic-native features (prompt caching, extended
 *     thinking, native tool_use blocks). For full Anthropic features, write a
 *     dedicated adapter — see TODO at the bottom of this file.
 *   - Ollama: pass `apiKey: 'ollama'` (Ollama ignores it) and
 *     `baseUrl: 'http://localhost:11434/v1'`.
 */

import type {
  Message,
  ToolDefinition,
  LLMAdapter,
  LLMActionResponse,
  LLMTokenUsage,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function messagesToOpenAI(
  messages: Message[]
): Array<{ role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }> {
  const out: Array<{ role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = [];
  for (const m of messages) {
    if (m.role === 'system' || m.role === 'user') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.tool, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        for (const r of m.toolResults ?? []) {
          out.push({
            role: 'tool',
            tool_call_id: r.toolCallId,
            content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
          });
        }
      } else {
        out.push({ role: 'assistant', content: m.content });
      }
    }
  }
  return out;
}

function toolsToOpenAI(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties: t.parameters, required: Object.keys(t.parameters as object) },
    },
  }));
}

export interface OpenAIAdapterOptions {
  /** API key. Defaults to OPENAI_API_KEY env. */
  apiKey?: string;
  /** Model: gpt-4o, gpt-4o-mini, o3-mini, etc. Default gpt-4o-mini. */
  model?: string;
  /**
   * Provider base URL (without /chat/completions).
   * Examples:
   *   OpenAI:      https://api.openai.com/v1         (default)
   *   Anthropic:   https://api.anthropic.com/v1      (compat shim; no prompt caching)
   *   Google:      https://generativelanguage.googleapis.com/v1beta/openai
   *   Groq:        https://api.groq.com/openai/v1
   *   Together:    https://api.together.xyz/v1
   *   Mistral:     https://api.mistral.ai/v1
   *   DeepSeek:    https://api.deepseek.com/v1
   *   OpenRouter:  https://openrouter.ai/api/v1
   *   Local (Ollama): http://localhost:11434/v1
   */
  baseUrl?: string;
  /** Sampling temperature (0..2). undefined → provider default. */
  temperature?: number;
  /** Top-p nucleus sampling. undefined → provider default. */
  topP?: number;
  /** Max output tokens. undefined → provider default. */
  maxTokens?: number;
  /** Request timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Max retry attempts on 429/5xx/network errors. Default 3. */
  maxRetries?: number;
  /** Base backoff in ms — actual delay is base * 2^attempt + jitter. Default 1000. */
  retryBaseMs?: number;
}

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private chatUrl: string;
  private temperature: number | undefined;
  private topP: number | undefined;
  private maxTokens: number | undefined;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseMs: number;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    // Default to gpt-4o-mini (cheap, fast, widely available). Previously 'gpt-5.2' which does not exist.
    this.model = options.model ?? 'gpt-4o-mini';
    const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.chatUrl = `${base}/chat/completions`;
    this.temperature = options.temperature;
    this.topP = options.topP;
    this.maxTokens = options.maxTokens;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    if (!this.apiKey) throw new Error('OpenAIAdapter: API key required (apiKey option or OPENAI_API_KEY env)');
  }

  /** Sleep helper for retry backoff. */
  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Decide whether an HTTP status / error is retryable. */
  private isRetryable(status: number | null, err: unknown): boolean {
    if (status !== null) {
      // 429 = rate limit, 408 = request timeout, 5xx = server side
      return status === 429 || status === 408 || (status >= 500 && status <= 599);
    }
    // Network errors / aborts / unknown — retry once
    const msg = err instanceof Error ? err.message : String(err);
    return /ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed|network|abort/i.test(msg);
  }

  /**
   * Single HTTP request with timeout + JSON error parsing.
   * Throws on non-2xx. Returns parsed JSON body.
   */
  private async sendRequest(body: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const timeoutHandle = setTimeout(() => ctrl.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const raw = await res.text();
        // Try to parse provider error envelope `{ error: { message, type } }`.
        let message = raw;
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } };
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          // raw text stays as-is
        }
        const errWithStatus = new Error(`OpenAI API error ${res.status}: ${message}`);
        (errWithStatus as Error & { status: number }).status = res.status;
        throw errWithStatus;
      }

      return await res.json();
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<LLMActionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messagesToOpenAI(messages),
      tools: tools.length ? toolsToOpenAI(tools) : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
    };
    if (this.temperature !== undefined) body['temperature'] = this.temperature;
    if (this.topP !== undefined) body['top_p'] = this.topP;
    if (this.maxTokens !== undefined) body['max_tokens'] = this.maxTokens;

    // Retry loop with exponential backoff + jitter.
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const data = (await this.sendRequest(body)) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };

        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error('OpenAI API: no message in response');

        const usage: LLMTokenUsage | undefined = data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens:
                data.usage.total_tokens ??
                (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
            }
          : undefined;

        if (msg.tool_calls?.length) {
          // Parallel tool_calls support: collect all, expose via `actions`;
          // keep `action` = first one for backward compatibility.
          const allActions = msg.tool_calls.map((tc) => {
            const name = tc.function?.name ?? '';
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function?.arguments ?? '{}');
            } catch {
              // malformed arguments — leave as empty object; caller can decide
            }
            return { tool: name, arguments: args, id: tc.id };
          });

          return {
            thought: msg.content ?? undefined,
            action: allActions[0],
            actions: allActions.length > 1 ? allActions : undefined,
            usage,
          };
        }

        return {
          thought: msg.content ?? undefined,
          finalAnswer: msg.content ?? undefined,
          usage,
        };
      } catch (err) {
        lastErr = err;
        const status = (err as Error & { status?: number }).status ?? null;
        const canRetry = attempt < this.maxRetries && this.isRetryable(status, err);
        if (!canRetry) throw err;

        // Exponential backoff with jitter: base * 2^attempt + rand(0..base/2)
        const delay = this.retryBaseMs * Math.pow(2, attempt) + Math.random() * (this.retryBaseMs / 2);
        await this.sleep(delay);
      }
    }
    // Unreachable — the loop either returns or throws — but TS likes a sentinel.
    throw lastErr ?? new Error('OpenAIAdapter: retries exhausted');
  }
}

// TODO: AnthropicAdapter — dedicated adapter that uses native Anthropic API
//       (prompt caching with `cache_control: { type: 'ephemeral' }`, extended
//       thinking, native tool_use blocks). The OpenAI-compat shim above works
//       but throws away ~90% of Anthropic's cost savings from prompt caching.
