/**
 * Core types for the TaskPilot framework.
 * Agent = LLM + loop + tools + memory + state.
 * Security: Principal, AccessContext, ToolGuard for full access control.
 */

/** Access subject: who is executing the agent (user, tenant, roles, scopes). */
export interface Principal {
  id: string;
  tenantId?: string;
  roles?: string[];
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

/** Access context for the run: principal + runId, passed to access checks and to tools. */
export interface AccessContext {
  principal: Principal;
  runId: string;
}

/** Access check for tool invocation. Returns true or throws/returns error. */
export type ToolGuard = (
  context: AccessContext,
  toolName: string,
  args: Record<string, unknown>
) => boolean | void | Promise<boolean | void>;

/** Access policy: which tools and with what restrictions are available to principal. */
export interface AccessPolicy {
  /** Allowed tool names (if empty — all denied; ['*'] — all allowed). */
  allowedTools?: string[];
  /** Denied tool names. */
  deniedTools?: string[];
  /** Optional check before each invocation (e.g. based on args). */
  guard?: ToolGuard;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string | unknown;
  isError?: boolean;
}

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface AgentGoal {
  goal: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  /** Access context for checks and data isolation. */
  accessContext?: AccessContext;
}

export interface LLMActionResponse {
  thought?: string;
  action?: {
    tool: string;
    arguments: Record<string, unknown>;
  };
  finalAnswer?: string;
}

export interface AgentRunState {
  runId: string;
  goal: string;
  messages: Message[];
  currentStep: number;
  maxSteps: number;
  done: boolean;
  finalAnswer?: string;
  metadata?: Record<string, unknown>;
  /** Principal who executed the run (if accessContext was passed). */
  principalId?: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ShortTermMemory {
  getMessages(): Message[];
  append(message: Message): void;
  appendToolResult(toolCallId: string, content: string | unknown, isError?: boolean): void;
  clear(): void;
}

export interface LongTermMemory {
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  add(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;
}

/** Long-term memory with scope-based isolation (e.g. by principalId/tenantId). */
export interface ScopedLongTermMemory extends LongTermMemory {
  /** Set scope for subsequent search/add (e.g. principal.id). */
  setScope(scope: string): void;
}

export interface LLMAdapter {
  chat(messages: Message[], tools: ToolDefinition[]): Promise<LLMActionResponse>;
}

export interface ToolExecutor {
  name: string;
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context?: AccessContext): Promise<string | unknown>;
}
