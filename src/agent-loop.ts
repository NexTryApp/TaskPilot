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

/** Platform/location where the agent is currently operating. */
export interface AgentWorkspace {
  /** Platform identifier: telegram, chrome, terminal, api, task-manager, etc. */
  platform: string;
  /** Human-readable platform name */
  platformLabel: string;
  /** Current location: URL, chat name, command, etc. */
  location?: string;
  /** Current status text */
  status?: string;
  /** Icon hint for the UI */
  icon?: string;
}

/** Real-time step event emitted during agent execution. */
export interface AgentStepEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'tool_denied' | 'answer' | 'status' | 'error' | 'approval_needed' | 'approval_response' | 'security_block';
  step: number;
  timestamp: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  content?: string;
  context?: string;
  error?: string;
  /** Active workspace/platform context for this event */
  workspace?: AgentWorkspace;
}

export type OnStepCallback = (event: AgentStepEvent) => void;

export interface AgentLoopOptions {
  maxSteps?: number;
  systemPrompt?: string;
  /** TTL for tool result cache (ms). 0 = indefinite within run. undefined = cache disabled. */
  toolCacheTtlMs?: number;
  /** Custom audit handler; defaults to console.log JSON. undefined = no audit. */
  auditHandler?: AuditHandler | null;
  /** Context window options. undefined = no trimming. */
  contextWindow?: ContextManagerOptions;
  /** Token limit per run. 0 = unlimited. */
  maxTokens?: number;
  /** Callback for real-time step events. */
  onStep?: OnStepCallback;
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

  // --- Core components ---
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

  // --- Initialization ---
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

  const onStep = options.onStep;
  function emit(event: Omit<AgentStepEvent, 'timestamp'>): void {
    onStep?.({ ...event, timestamp: new Date().toISOString() } as AgentStepEvent);
  }

  emit({ type: 'status', step: 0, content: 'Agent started', context: 'initialization' });

  let step = 0;
  let done = false;
  let finalAnswer: string | undefined;

  while (!done && step < maxSteps) {
    // Token budget check
    if (tokenTracker?.isExceeded) {
      finalAnswer = '[Token budget exceeded]';
      done = true;
      emit({ type: 'status', step, content: 'Token budget exceeded' });
      break;
    }

    step++;
    emit({ type: 'thinking', step, content: 'LLM is processing...', context: 'llm' });

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

    if (response.thought) {
      emit({ type: 'thinking', step, content: response.thought, context: 'llm' });
    }

    if (response.finalAnswer != null && response.finalAnswer.trim() !== '') {
      finalAnswer = response.finalAnswer.trim();
      done = true;
      memory.append({
        role: 'assistant',
        content: (response.thought ? response.thought + '\n\n' : '') + finalAnswer,
      });
      emit({ type: 'answer', step, content: finalAnswer });
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
        emit({ type: 'tool_result', step, tool: response.action.tool, result: cached.result, content: 'Cached result' });
        memory.appendToolResult(toolCallId, cached.result);
        continue;
      }

      emit({ type: 'tool_call', step, tool: response.action.tool, args: response.action.arguments, context: response.action.tool });
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
          emit({ type: 'tool_denied', step, tool: response.action.tool, error: errMsg });
        } else {
          emit({ type: 'error', step, tool: response.action.tool, error: errMsg });
        }
        result = errMsg;
        memory.appendToolResult(toolCallId, result, true);
        continue;
      }

      // Cache store
      toolCache?.set(response.action.tool, response.action.arguments, result);

      const preview = String(typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 200);
      audit?.toolResult(accessContext, response.action.tool, { resultPreview: preview });
      emit({ type: 'tool_result', step, tool: response.action.tool, result, content: preview });

      memory.appendToolResult(toolCallId, result);
      continue;
    }

    if (response.thought) {
      memory.append({ role: 'assistant', content: response.thought });
    }
    if (!response.action && !response.finalAnswer) {
      finalAnswer = response.thought ?? 'No further action.';
      done = true;
      emit({ type: 'answer', step, content: finalAnswer });
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
