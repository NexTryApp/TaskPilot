/**
 * Agent loop: goal → think → action → tool → result → repeat until done.
 * Includes: access control, tool caching, audit, context window, token budget.
 */

import type {
  AgentGoal,
  AgentRunState,
  ShortTermMemory,
  LongTermMemory,
  LLMAdapter,
  Message,
  ToolCall,
  LLMActionResponse,
  AccessContext,
  ScopedLongTermMemory,
} from './types.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import { ToolCache } from './tools/tool-cache.js';
import { AuditLogger } from './audit/audit-logger.js';
import type { AuditHandler } from './audit/audit-logger.js';
import { ContextManager } from './context/context-manager.js';
import type { ContextManagerOptions } from './context/context-manager.js';
import { TokenTracker } from './budget/token-tracker.js';

function generateId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface AgentLoopOptions {
  maxSteps?: number;
  systemPrompt?: string;
  /** TTL для кеша результатов инструментов (мс). 0 = бессрочно в пределах ранна. undefined = кеш выключен. */
  toolCacheTtlMs?: number;
  /** Кастомный обработчик аудита; по умолчанию console.log JSON. undefined = без аудита. */
  auditHandler?: AuditHandler | null;
  /** Настройки контекстного окна. undefined = без обрезки. */
  contextWindow?: ContextManagerOptions;
  /** Лимит токенов на ран. 0 = без лимита. */
  maxTokens?: number;
}

export async function runAgentLoop(
  goal: AgentGoal,
  memory: ShortTermMemory,
  tools: ToolRegistry,
  llm: LLMAdapter,
  longTermMemory?: LongTermMemory | null,
  options: AgentLoopOptions = {}
): Promise<AgentRunState> {
  const maxSteps = options.maxSteps ?? 15;
  const systemPrompt =
    options.systemPrompt ??
    `You are an autonomous agent. Achieve the user's goal step by step. Use tools when needed. When done, respond with a final answer.`;

  // --- Новые компоненты ---
  const toolCache = options.toolCacheTtlMs !== undefined
    ? new ToolCache({ ttlMs: options.toolCacheTtlMs })
    : null;

  const audit = options.auditHandler !== undefined
    ? new AuditLogger(options.auditHandler ?? undefined)
    : null;

  const contextMgr = options.contextWindow
    ? new ContextManager(options.contextWindow)
    : null;

  const tokenTracker = options.maxTokens
    ? new TokenTracker({ maxTokens: options.maxTokens })
    : null;

  // --- Инициализация ---
  memory.clear();
  const runId = goal.runId ?? `run_${Date.now()}`;
  const accessContext: AccessContext | undefined = goal.accessContext
    ? { ...goal.accessContext, runId }
    : undefined;

  audit?.runStart(accessContext, goal.goal);

  const systemMessage: Message = { role: 'system', content: systemPrompt };
  memory.append(systemMessage);

  let goalText = goal.goal;
  if (longTermMemory) {
    if (accessContext && 'setScope' in longTermMemory) {
      (longTermMemory as ScopedLongTermMemory).setScope(accessContext.principal.id);
    }
    const relevant = await longTermMemory.search(goal.goal, 3);
    if (relevant.length) {
      goalText += `\n\nRelevant context from memory:\n${relevant.map((e) => e.content).join('\n')}`;
    }
  }
  memory.append({ role: 'user', content: goalText });

  let step = 0;
  let done = false;
  let finalAnswer: string | undefined;

  while (!done && step < maxSteps) {
    // Token budget check
    if (tokenTracker?.isExceeded) {
      finalAnswer = '[Token budget exceeded]';
      done = true;
      break;
    }

    step++;

    // Context window trimming
    let messages = memory.getMessages();
    if (contextMgr) {
      messages = await contextMgr.trimMessages(messages, llm);
    }

    const definitions = tools.getDefinitions();

    // Track prompt tokens
    const promptText = messages.map((m) => m.content).join('\n');
    tokenTracker?.addFromText(promptText);

    const response: LLMActionResponse = await llm.chat(messages, definitions);

    // Track response tokens
    const responseText = (response.thought ?? '') + (response.finalAnswer ?? '');
    tokenTracker?.addFromText(responseText);

    if (response.finalAnswer != null && response.finalAnswer.trim() !== '') {
      finalAnswer = response.finalAnswer.trim();
      done = true;
      memory.append({
        role: 'assistant',
        content: (response.thought ? response.thought + '\n\n' : '') + finalAnswer,
      });
      break;
    }

    if (response.action) {
      const toolCallId = generateId();
      const toolCall: ToolCall = {
        id: toolCallId,
        tool: response.action.tool,
        arguments: response.action.arguments,
      };
      memory.append({
        role: 'assistant',
        content: response.thought ?? '',
        toolCalls: [toolCall],
      });

      // Cache check
      const cached = toolCache?.get(response.action.tool, response.action.arguments);
      if (cached) {
        memory.appendToolResult(toolCallId, cached.result);
        continue;
      }

      audit?.toolCall(accessContext, response.action.tool, response.action.arguments);

      let result: string | unknown;
      try {
        result = await tools.execute(
          response.action.tool,
          response.action.arguments,
          accessContext
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (err instanceof Error && err.name === 'AccessDeniedError') {
          audit?.toolDenied(accessContext, response.action.tool, errMsg);
        }
        result = errMsg;
        memory.appendToolResult(toolCallId, result, true);
        continue;
      }

      // Cache store
      toolCache?.set(response.action.tool, response.action.arguments, result);

      audit?.toolResult(accessContext, response.action.tool, {
        resultPreview: String(typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 200),
      });

      memory.appendToolResult(toolCallId, result);
      continue;
    }

    if (response.thought) {
      memory.append({ role: 'assistant', content: response.thought });
    }
    if (!response.action && !response.finalAnswer) {
      finalAnswer = response.thought ?? 'No further action.';
      done = true;
    }
  }

  audit?.runEnd(accessContext, step, done);

  return {
    runId,
    goal: goal.goal,
    messages: memory.getMessages(),
    currentStep: step,
    maxSteps,
    done,
    finalAnswer,
    metadata: goal.metadata,
    principalId: accessContext?.principal.id,
  };
}
