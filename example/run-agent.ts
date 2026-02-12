/**
 * Example of running TaskPilot with all components:
 * access control, tool cache, audit, context window, token budget, output validation.
 */

import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  ScopedLongTermMemoryImpl,
  OpenAIAdapter,
  MockLLMAdapter,
  validateFinalAnswer,
} from '../src/index.js';
import type { Principal, AuditEntry, LLMActionResponse } from '../src/index.js';

async function main() {
  // --- Principal (who runs the agent) ---
  const principal: Principal = {
    id: 'user_42',
    tenantId: 'acme',
    roles: ['user'],
    scopes: ['tasks:read', 'tasks:write', 'weather:read'],
  };

  // --- Memory ---
  const memory = new BufferMemory();
  const longTerm = new ScopedLongTermMemoryImpl();
  longTerm.setScope(principal.id);
  await longTerm.add({ content: 'User prefers responses in English.', metadata: { source: 'profile' } });

  // --- Tools ---
  const tools = new ToolRegistry();

  tools.register({
    name: 'get_weather',
    definition: {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: { city: { type: 'string', description: 'City name' } },
    },
    async execute(args) {
      const city = String(args['city'] ?? '');
      return { city, temp: 18, condition: 'sunny' };
    },
  });

  tools.register({
    name: 'create_task',
    definition: {
      name: 'create_task',
      description: 'Create a task with title and optional steps',
      parameters: {
        title: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
      },
    },
    async execute(args, context) {
      const title = String(args['title'] ?? '');
      const steps = (args['steps'] as string[]) ?? [];
      return {
        id: 'task_1',
        title,
        steps,
        created: true,
        createdBy: context?.principal.id ?? 'anonymous',
      };
    },
  });

  tools.register({
    name: 'delete_task',
    definition: {
      name: 'delete_task',
      description: 'Delete a task (admin only)',
      parameters: { taskId: { type: 'string' } },
    },
    async execute(args) {
      return { deleted: true, taskId: args['taskId'] };
    },
  });

  // --- Access policy ---
  tools.setAccessPolicy({
    allowedTools: ['get_weather', 'create_task'],
    deniedTools: ['delete_task'],
    guard: async (ctx, toolName, args) => {
      // Example: only tenant 'acme' can create tasks
      if (toolName === 'create_task' && ctx.principal.tenantId !== 'acme') return false;
      return true;
    },
  });

  // --- Audit (logging) ---
  const auditLog: AuditEntry[] = [];
  function auditHandler(entry: AuditEntry): void {
    auditLog.push(entry);
    console.log(`[audit] ${entry.event} | ${entry.toolName ?? '-'} | principal=${entry.principalId}`);
  }

  // --- LLM ---
  let stepIndex = 0;
  const llm = process.env['OPENAI_API_KEY']
    ? new OpenAIAdapter({ model: 'gpt-4o-mini' })
    : new MockLLMAdapter({
        respond: (_goal): LLMActionResponse => {
          stepIndex++;
          if (stepIndex === 1) return { thought: 'First, I will check the weather.', action: { tool: 'get_weather', arguments: { city: 'Moscow' } } };
          if (stepIndex === 2) return { thought: 'Now I will create the task.', action: { tool: 'create_task', arguments: { title: 'Check weather', steps: ['Open app', 'View forecast'] } } };
          if (stepIndex === 3) return { thought: 'I will try to delete (will be denied).', action: { tool: 'delete_task', arguments: { taskId: 'task_1' } } };
          return { finalAnswer: 'Done: weather in Moscow — 18°C, sunny. Task "Check weather" created.' };
        },
      });

  // --- Run agent ---
  const state = await runAgentLoop(
    {
      goal: 'Find weather in Moscow and create task "Check weather".',
      accessContext: { principal, runId: 'demo_run_1' },
    },
    memory,
    tools,
    llm,
    longTerm,
    {
      maxSteps: 10,
      systemPrompt: 'You are a helpful assistant. Use tools when needed. Reply briefly in English.',
      toolCacheTtlMs: 0,                              // cache for entire run
      auditHandler,                                    // audit
      contextWindow: { maxMessages: 20, keepRecent: 6 }, // sliding window
      maxTokens: 50_000,                                // token budget
    }
  );

  // --- Result ---
  console.log('\n=== Agent Result ===');
  console.log('Done:', state.done);
  console.log('Steps:', state.currentStep);
  console.log('Principal:', state.principalId);
  console.log('Final:', state.finalAnswer);
  console.log('Messages:', state.messages.length);

  // --- Output validation ---
  const validation = validateFinalAnswer(state.finalAnswer, { type: 'string' });
  console.log('\nOutput valid:', validation.valid, validation.errors.length ? validation.errors : '');

  // --- Audit ---
  console.log('\n=== Audit Log ===');
  for (const entry of auditLog) {
    console.log(`  ${entry.event} | tool=${entry.toolName ?? '-'} | error=${entry.error ?? '-'}`);
  }
}

main().catch(console.error);
