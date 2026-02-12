/**
 * Context window manager: sliding window + auto-summary.
 * Ensures message count does not exceed the limit.
 * When exceeded — old messages are replaced with summary.
 */

import type { Message, LLMAdapter, ToolDefinition } from '../types.js';

export interface ContextManagerOptions {
  /** Max messages in window (including system). Default 20. */
  maxMessages?: number;
  /** How many recent messages to always keep when trimming. Default 6. */
  keepRecent?: number;
  /** If true — generate summary via LLM; otherwise — just trim. Default false. */
  useLLMSummary?: boolean;
}

export class ContextManager {
  private maxMessages: number;
  private keepRecent: number;
  private useLLMSummary: boolean;

  constructor(options: ContextManagerOptions = {}) {
    this.maxMessages = options.maxMessages ?? 20;
    this.keepRecent = options.keepRecent ?? 6;
    this.useLLMSummary = options.useLLMSummary ?? false;
  }

  /**
   * If messages exceed maxMessages — trim.
   * Returns messages within window: system + [summary?] + recent.
   */
  async trimMessages(messages: Message[], llm?: LLMAdapter): Promise<Message[]> {
    if (messages.length <= this.maxMessages) return messages;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystem = messages.filter((m) => m.role !== 'system');

    if (nonSystem.length <= this.keepRecent) return messages;

    const toSummarize = nonSystem.slice(0, nonSystem.length - this.keepRecent);
    const recent = nonSystem.slice(nonSystem.length - this.keepRecent);

    let summaryText: string;

    if (this.useLLMSummary && llm) {
      summaryText = await this.generateSummary(toSummarize, llm);
    } else {
      summaryText = this.simpleSummary(toSummarize);
    }

    const summaryMessage: Message = {
      role: 'user',
      content: `[Context summary of ${toSummarize.length} previous messages]:\n${summaryText}`,
    };

    return [...systemMessages, summaryMessage, ...recent];
  }

  private simpleSummary(messages: Message[]): string {
    const lines: string[] = [];
    for (const m of messages) {
      const prefix = m.role === 'assistant' ? 'Agent' : 'User';
      const text = m.content.slice(0, 120);
      lines.push(`- ${prefix}: ${text}${m.content.length > 120 ? '...' : ''}`);
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          lines.push(`  [called ${tc.tool}]`);
        }
      }
    }
    return lines.join('\n');
  }

  private async generateSummary(messages: Message[], llm: LLMAdapter): Promise<string> {
    const transcript = messages
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const summaryPrompt: Message[] = [
      { role: 'system', content: 'Summarize the following agent conversation concisely (max 5 sentences). Focus on actions taken, results, and key decisions.' },
      { role: 'user', content: transcript },
    ];

    const response = await llm.chat(summaryPrompt, []);
    return response.finalAnswer ?? response.thought ?? 'No summary available.';
  }
}
