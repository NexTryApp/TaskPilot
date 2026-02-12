/**
 * Mock LLM adapter for tests and demos without API key.
 * Returns predefined tool calls or final answer.
 */

import type { Message, ToolDefinition, LLMAdapter, LLMActionResponse } from '../types.js';

export interface MockAdapterBehavior {
  /** Next response: tool call or final answer */
  nextResponse?: LLMActionResponse;
  /** Or callback(goal, messages) => response */
  respond?: (goal: string, messages: Message[]) => LLMActionResponse | Promise<LLMActionResponse>;
}

export class MockLLMAdapter implements LLMAdapter {
  private behavior: MockAdapterBehavior;

  constructor(behavior: MockAdapterBehavior = {}) {
    this.behavior = behavior;
  }

  async chat(messages: Message[], _tools: ToolDefinition[]): Promise<LLMActionResponse> {
    if (this.behavior.respond) {
      const goal = messages.find((m) => m.role === 'user')?.content ?? '';
      return this.behavior.respond(goal, messages);
    }
    if (this.behavior.nextResponse) return this.behavior.nextResponse;
    return {
      thought: 'Mock agent thinking.',
      finalAnswer: 'Mock final answer. Set OPENAI_API_KEY for real LLM.',
    };
  }
}
