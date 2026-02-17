/**
 * Context window manager: progressive compression.
 *
 * Three tiers of memory — the further back, the more compressed:
 *
 *  TIER 1 (Recent)  — full messages, no compression
 *  TIER 2 (Medium)  — moderate summary (key actions + results, ~60 chars/msg)
 *  TIER 3 (Old)     — heavy compression (just facts + outcomes, ~30 chars/msg)
 *
 * Pinned context (user name, key facts) NEVER gets compressed.
 *
 * Before each compression, the agent "reasons" about what's important
 * and warns about potential consequences of losing context.
 */

import type { Message, LLMAdapter } from '../types.js';

export interface ContextManagerOptions {
  /** Max messages in window (including system). Default 30. */
  maxMessages?: number;
  /** Tier 1: recent messages kept in full. Default 8. */
  keepRecent?: number;
  /** Tier 2: moderately compressed messages. Default 8. */
  keepMedium?: number;
  /** If true — use LLM for smart compression. Default false. */
  useLLMSummary?: boolean;
  /** Pinned context — ALWAYS included in system prompt, never compressed. */
  pinnedContext?: string;
  /** Callback when context is compressed — for UI notifications. */
  onCompression?: OnCompressionCallback;
}

/** Compression event — emitted when context is trimmed. */
export interface CompressionEvent {
  /** What tier was compressed */
  tier: 2 | 3;
  /** How many messages were compressed */
  messagesCompressed: number;
  /** Agent's reasoning about what's being lost */
  reasoning: string;
  /** Warning about potential consequences */
  consequences: string;
}

export type OnCompressionCallback = (event: CompressionEvent) => void;

export class ContextManager {
  private maxMessages: number;
  private keepRecent: number;
  private keepMedium: number;
  private useLLMSummary: boolean;
  private pinnedContext: string;
  private onCompression: OnCompressionCallback | null = null;

  /** Running summary of Tier 3 (oldest, most compressed). Accumulates across trims. */
  private tier3Summary: string = '';
  /** Count of messages that were folded into tier3Summary. */
  private tier3Count: number = 0;

  constructor(options: ContextManagerOptions = {}) {
    this.maxMessages = options.maxMessages ?? 30;
    this.keepRecent = options.keepRecent ?? 8;
    this.keepMedium = options.keepMedium ?? 8;
    this.useLLMSummary = options.useLLMSummary ?? false;
    this.pinnedContext = options.pinnedContext ?? '';
    this.onCompression = options.onCompression ?? null;
  }

  /** Set callback for compression events (reasoning + consequences). */
  setCompressionCallback(cb: OnCompressionCallback): void {
    this.onCompression = cb;
  }

  /** Update pinned context at any time (e.g. when user changes name in settings). */
  setPinnedContext(text: string): void {
    this.pinnedContext = text;
  }

  /**
   * Progressive trimming:
   * 1. System messages (always kept)
   * 2. Pinned context (always kept, injected after system)
   * 3. Tier 3 summary (oldest → ultra-compressed)
   * 4. Tier 2 (medium age → moderately compressed)
   * 5. Tier 1 (recent → full detail)
   */
  async trimMessages(messages: Message[], llm?: LLMAdapter): Promise<Message[]> {
    if (messages.length <= this.maxMessages) {
      return this.injectPinned(messages);
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    const totalNonSystem = nonSystem.length;
    if (totalNonSystem <= this.keepRecent) {
      return this.injectPinned(messages);
    }

    // Split into tiers
    const recentStart = Math.max(0, totalNonSystem - this.keepRecent);
    const mediumStart = Math.max(0, recentStart - this.keepMedium);

    const oldMessages = nonSystem.slice(0, mediumStart);       // → Tier 3 (heavy compress)
    const mediumMessages = nonSystem.slice(mediumStart, recentStart);  // → Tier 2 (moderate)
    const recentMessages = nonSystem.slice(recentStart);       // → Tier 1 (full)

    const result: Message[] = [...systemMessages];

    // --- Tier 3: Heavy compression (oldest) ---
    if (oldMessages.length > 0) {
      const newTier3 = this.useLLMSummary && llm
        ? await this.llmHeavySummary(oldMessages, llm)
        : this.heavySummary(oldMessages);

      // Accumulate with previous tier 3 summary
      if (this.tier3Summary) {
        this.tier3Summary = this.useLLMSummary && llm
          ? await this.llmMergeSummaries(this.tier3Summary, newTier3, llm)
          : `${this.tier3Summary}\n${newTier3}`;
      } else {
        this.tier3Summary = newTier3;
      }
      this.tier3Count += oldMessages.length;

      // Emit compression event with reasoning
      const reasoning = this.assessWhatIsLost(oldMessages);
      const consequences = this.assessConsequences(oldMessages);
      this.onCompression?.({
        tier: 3,
        messagesCompressed: oldMessages.length,
        reasoning,
        consequences,
      });
    }

    // Add Tier 3 accumulated summary
    if (this.tier3Summary) {
      result.push({
        role: 'user',
        content: `[Long-term memory — ${this.tier3Count} messages compressed]:\n${this.tier3Summary}`,
      });
    }

    // --- Tier 2: Moderate compression (medium age) ---
    if (mediumMessages.length > 0) {
      const tier2Text = this.useLLMSummary && llm
        ? await this.llmModerateSummary(mediumMessages, llm)
        : this.moderateSummary(mediumMessages);

      result.push({
        role: 'user',
        content: `[Recent history — ${mediumMessages.length} messages summarized]:\n${tier2Text}`,
      });

      // Emit tier 2 compression
      this.onCompression?.({
        tier: 2,
        messagesCompressed: mediumMessages.length,
        reasoning: `Moderately compressing ${mediumMessages.length} messages to save context space.`,
        consequences: 'Details of intermediate steps may be less precise.',
      });
    }

    // --- Tier 1: Full detail (recent) ---
    result.push(...recentMessages);

    return this.injectPinned(result);
  }

  // =========================================================================
  // Pinned context injection
  // =========================================================================

  private injectPinned(messages: Message[]): Message[] {
    if (!this.pinnedContext) return messages;

    // Find system message and append pinned context
    return messages.map((m) => {
      if (m.role === 'system') {
        return {
          ...m,
          content: `${m.content}\n\n--- PINNED (always remember) ---\n${this.pinnedContext}\n--- END PINNED ---`,
        };
      }
      return m;
    });
  }

  // =========================================================================
  // Tier 3: Heavy compression (oldest messages → just facts)
  // =========================================================================

  private heavySummary(messages: Message[]): string {
    const lines: string[] = [];
    for (const m of messages) {
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          const argsPreview = tc.arguments
            ? JSON.stringify(tc.arguments).slice(0, 40)
            : '';
          lines.push(`• ${tc.tool}(${argsPreview})`);
        }
      } else if (m.role === 'assistant' && m.content) {
        // Just the outcome, max 30 chars
        lines.push(`→ ${m.content.slice(0, 30)}${m.content.length > 30 ? '…' : ''}`);
      }
      // Skip user messages in heavy compression — only actions and results matter
    }
    return lines.join('\n') || 'No significant actions.';
  }

  // =========================================================================
  // Tier 2: Moderate compression (key actions + results)
  // =========================================================================

  private moderateSummary(messages: Message[]): string {
    const lines: string[] = [];
    for (const m of messages) {
      const prefix = m.role === 'assistant' ? 'Agent' : 'User';
      const text = m.content.slice(0, 80);
      lines.push(`- ${prefix}: ${text}${m.content.length > 80 ? '…' : ''}`);
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          const argsPreview = tc.arguments
            ? JSON.stringify(tc.arguments).slice(0, 60)
            : '';
          lines.push(`  → ${tc.tool}(${argsPreview})`);
        }
      }
    }
    return lines.join('\n');
  }

  // =========================================================================
  // Reasoning: assess what is being lost
  // =========================================================================

  private assessWhatIsLost(messages: Message[]): string {
    const tools = new Set<string>();
    let userMsgCount = 0;
    let agentMsgCount = 0;
    for (const m of messages) {
      if (m.role === 'user') userMsgCount++;
      if (m.role === 'assistant') agentMsgCount++;
      if (m.toolCalls) {
        for (const tc of m.toolCalls) tools.add(tc.tool);
      }
    }
    const toolList = tools.size > 0 ? `Tools used: ${[...tools].join(', ')}.` : '';
    return `Compressing ${messages.length} old messages (${userMsgCount} user, ${agentMsgCount} agent). ${toolList} Only key outcomes preserved.`;
  }

  private assessConsequences(messages: Message[]): string {
    const hasToolCalls = messages.some((m) => m.toolCalls?.length);
    const hasLongContent = messages.some((m) => m.content.length > 200);
    const parts: string[] = [];
    if (hasToolCalls) {
      parts.push('Tool call details and arguments will be shortened.');
    }
    if (hasLongContent) {
      parts.push('Long responses will be truncated to key facts only.');
    }
    parts.push('If the agent refers to earlier context, it may be less precise.');
    return parts.join(' ');
  }

  // =========================================================================
  // LLM-powered compression
  // =========================================================================

  private async llmHeavySummary(messages: Message[], llm: LLMAdapter): Promise<string> {
    const transcript = messages
      .map((m) => {
        const tc = m.toolCalls?.map((t) => `[${t.tool}]`).join(', ') || '';
        return `${m.role}: ${m.content.slice(0, 100)}${tc ? ' ' + tc : ''}`;
      })
      .join('\n');

    const response = await llm.chat([
      {
        role: 'system',
        content: `You compress agent conversation history into ultra-short factual notes.
Rules:
- Max 3 bullet points
- Only OUTCOMES and KEY DECISIONS — no process details
- If a tool was used, note WHAT it achieved, not the arguments
- 20 words max per bullet
- Language: match the user's language (Russian if Russian, English if English)`,
      },
      { role: 'user', content: transcript },
    ], []);

    return response.finalAnswer ?? response.thought ?? this.heavySummary(messages);
  }

  private async llmModerateSummary(messages: Message[], llm: LLMAdapter): Promise<string> {
    const transcript = messages
      .map((m) => {
        const tc = m.toolCalls?.map((t) => `[${t.tool}(${JSON.stringify(t.arguments).slice(0, 50)})]`).join(', ') || '';
        return `${m.role}: ${m.content.slice(0, 150)}${tc ? ' ' + tc : ''}`;
      })
      .join('\n');

    const response = await llm.chat([
      {
        role: 'system',
        content: `Summarize this agent conversation moderately — keep action details and results.
Rules:
- Max 5-7 bullet points
- Include tool names and what they returned
- Keep user requests and agent decisions
- 30 words max per bullet
- Language: match the user's language`,
      },
      { role: 'user', content: transcript },
    ], []);

    return response.finalAnswer ?? response.thought ?? this.moderateSummary(messages);
  }

  private async llmMergeSummaries(existing: string, newSummary: string, llm: LLMAdapter): Promise<string> {
    const response = await llm.chat([
      {
        role: 'system',
        content: `Merge two conversation summaries into one cohesive summary.
Rules:
- Remove duplicates
- Keep only the most important facts and outcomes
- Max 5 bullet points total
- 20 words max per bullet
- Language: match the input language`,
      },
      { role: 'user', content: `EXISTING SUMMARY:\n${existing}\n\nNEW SUMMARY:\n${newSummary}` },
    ], []);

    return response.finalAnswer ?? response.thought ?? `${existing}\n${newSummary}`;
  }
}
