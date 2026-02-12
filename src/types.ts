/**
 * Core types for the TaskPilot framework.
 * Agent = LLM + loop + tools + memory + state.
 * Security: Principal, AccessContext, ToolGuard for full access control.
 */

/** Субъект доступа: кто выполняет запуск агента (пользователь, тенант, роли, скоупы). */
export interface Principal {
  id: string;
  tenantId?: string;
  roles?: string[];
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

/** Контекст доступа на время ранна: principal + runId, передаётся в проверки доступа и в инструменты. */
export interface AccessContext {
  principal: Principal;
  runId: string;
}

/** Проверка доступа к вызову инструмента. Возвращает true или выбрасывает / возвращает ошибку. */
export type ToolGuard = (
  context: AccessContext,
  toolName: string,
  args: Record<string, unknown>
) => boolean | void | Promise<boolean | void>;

/** Политика доступа: какие инструменты и с какими ограничениями доступны principal. */
export interface AccessPolicy {
  /** Разрешённые имена инструментов (если пусто — запрещено всё; ['*'] — все). */
  allowedTools?: string[];
  /** Запрещённые имена инструментов. */
  deniedTools?: string[];
  /** Опциональная проверка перед каждым вызовом (например, по args). */
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
  /** Контекст доступа для проверок и изоляции данных. */
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
  /** Principal, выполнивший ран (если был передан accessContext). */
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

/** Долгосрочная память с изоляцией по scope (например, по principalId/tenantId). */
export interface ScopedLongTermMemory extends LongTermMemory {
  /** Установить scope для следующих search/add (например, principal.id). */
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
