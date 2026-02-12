/**
 * TaskPilot — standalone autonomous AI agent framework.
 * LLM + agent loop + tools + memory. Zero external runtime dependencies.
 *
 * Usage:
 *   const memory = new BufferMemory();
 *   const tools = new ToolRegistry();
 *   tools.register(someTool);
 *   const llm = new OpenAIAdapter({ apiKey: '...' });
 *   const state = await runAgentLoop({ goal: '...' }, memory, tools, llm, undefined, { maxSteps: 10 });
 */

// --- Core ---
export { runAgentLoop } from './agent-loop.js';
export type { AgentLoopOptions, AgentStepEvent, AgentWorkspace, OnStepCallback } from './agent-loop.js';

// --- Tools ---
export { ToolRegistry, AccessDeniedError } from './tools/tool-registry.js';
export { ToolCache } from './tools/tool-cache.js';
export type { ToolCacheOptions, CacheEntry } from './tools/tool-cache.js';
export type { ToolDefinition, ToolExecutor } from './types.js';

// --- Memory ---
export { BufferMemory, SimpleLongTermMemory, ScopedLongTermMemoryImpl } from './memory/index.js';
export type { ShortTermMemory, LongTermMemory, ScopedLongTermMemory, MemoryEntry } from './types.js';

// --- LLM ---
export { OpenAIAdapter, MockLLMAdapter } from './llm/index.js';
export type { OpenAIAdapterOptions, MockAdapterBehavior } from './llm/index.js';

// --- Audit ---
export { AuditLogger } from './audit/audit-logger.js';
export type { AuditEntry, AuditHandler } from './audit/audit-logger.js';

// --- Validation ---
export { validateOutput, validateFinalAnswer } from './validation/output-validator.js';
export type { ValidationResult, OutputSchema } from './validation/output-validator.js';

// --- Context window ---
export { ContextManager } from './context/context-manager.js';
export type { ContextManagerOptions } from './context/context-manager.js';

// --- Token budget ---
export { TokenTracker } from './budget/token-tracker.js';
export type { TokenBudgetOptions } from './budget/token-tracker.js';

// --- Types ---
export type {
  AgentGoal,
  AgentRunState,
  Message,
  ToolCall,
  ToolResult,
  LLMActionResponse,
  LLMAdapter,
  Principal,
  AccessContext,
  AccessPolicy,
  ToolGuard,
} from './types.js';
