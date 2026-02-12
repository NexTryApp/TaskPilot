/**
 * LLM adapter: OpenAI-compatible API with tool/function calling.
 * Expects OPENAI_API_KEY. Can be swapped for Claude/other via same interface.
 */

import type { Message, ToolDefinition, LLMAdapter, LLMActionResponse, ToolCall } from '../types.js';

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
  /** API key. По умолчанию берётся из OPENAI_API_KEY. */
  apiKey?: string;
  /** Модель: gpt-4o, gpt-4o-mini, o3-mini и т.д. По умолчанию gpt-4o-mini. */
  model?: string;
  /**
   * Base URL провайдера (без /chat/completions).
   * Примеры:
   *   OpenAI:      https://api.openai.com/v1         (по умолчанию)
   *   Anthropic:   https://api.anthropic.com/v1
   *   Google:      https://generativelanguage.googleapis.com/v1beta/openai
   *   Groq:        https://api.groq.com/openai/v1
   *   Together:    https://api.together.xyz/v1
   *   Mistral:     https://api.mistral.ai/v1
   *   DeepSeek:    https://api.deepseek.com/v1
   *   OpenRouter:  https://openrouter.ai/api/v1
   *   Local (Ollama): http://localhost:11434/v1
   */
  baseUrl?: string;
}

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private chatUrl: string;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = options.model ?? 'gpt-4o-mini';
    const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.chatUrl = `${base}/chat/completions`;
    if (!this.apiKey) throw new Error('OpenAIAdapter: API key required (apiKey option or OPENAI_API_KEY env)');
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<LLMActionResponse> {
    const body = {
      model: this.model,
      messages: messagesToOpenAI(messages),
      tools: tools.length ? toolsToOpenAI(tools) : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
    };

    const res = await fetch(this.chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI API: no message in response');

    if (msg.tool_calls?.length) {
      const tc = msg.tool_calls[0];
      const name = tc.function?.name ?? '';
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}');
      } catch {
        // ignore
      }
      return {
        thought: msg.content ?? undefined,
        action: { tool: name, arguments: args },
      };
    }

    return {
      thought: msg.content ?? undefined,
      finalAnswer: msg.content ?? undefined,
    };
  }
}
