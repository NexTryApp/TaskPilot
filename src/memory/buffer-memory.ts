/**
 * Short-term memory: in-memory message buffer for the current run.
 */

import type { Message, ToolResult } from '../types.js';

import type { ShortTermMemory } from '../types.js';

export class BufferMemory implements ShortTermMemory {
  private messages: Message[] = [];

  getMessages(): Message[] {
    return [...this.messages];
  }

  append(message: Message): void {
    this.messages.push(message);
  }

  appendToolResult(toolCallId: string, content: string | unknown, isError?: boolean): void {
    const result: ToolResult = {
      toolCallId,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      isError,
    };
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant' && last.toolCalls?.length) {
      if (!last.toolResults) last.toolResults = [];
      last.toolResults.push(result);
    } else {
      this.messages.push({
        role: 'user',
        content: `[Tool result ${toolCallId}]: ${result.content}`,
        toolResults: [result],
      });
    }
  }

  clear(): void {
    this.messages = [];
  }
}
