/**
 * TaskPilot Web Server: simple interface for running the agent.
 * Run: npx tsx web/server.ts
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  OpenAIAdapter,
} from '../src/index.js';
import type { AuditEntry, AccessContext } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Built-in demo tools ---
function createDemoTools(enabledTools: string[]): ToolRegistry {
  const registry = new ToolRegistry();

  if (enabledTools.includes('get_weather')) {
    registry.register({
      name: 'get_weather',
      definition: {
        name: 'get_weather',
        description: 'Get current weather for a city. Returns temperature and condition.',
        parameters: { city: { type: 'string', description: 'City name' } },
      },
      async execute(args) {
        const city = String(args['city'] ?? 'Unknown');
        // Demo data
        const temps: Record<string, number> = { Moscow: -5, London: 8, Tokyo: 14, 'New York': 2, Berlin: 3 };
        const temp = temps[city] ?? Math.floor(Math.random() * 30 - 5);
        const conditions = ['sunny', 'cloudy', 'rain', 'snow', 'windy'];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];
        return { city, temp, condition, unit: 'C' };
      },
    });
  }

  if (enabledTools.includes('create_task')) {
    registry.register({
      name: 'create_task',
      definition: {
        name: 'create_task',
        description: 'Create a new task with a title and optional list of steps.',
        parameters: {
          title: { type: 'string', description: 'Task title' },
          steps: { type: 'array', description: 'List of steps', items: { type: 'string' } },
        },
      },
      async execute(args, context) {
        return {
          id: `task_${Date.now()}`,
          title: args['title'],
          steps: args['steps'] ?? [],
          created: true,
          createdBy: context?.principal.id ?? 'web-user',
        };
      },
    });
  }

  if (enabledTools.includes('search_web')) {
    registry.register({
      name: 'search_web',
      definition: {
        name: 'search_web',
        description: 'Search the web for information. Returns search results.',
        parameters: { query: { type: 'string', description: 'Search query' } },
      },
      async execute(args) {
        const q = String(args['query'] ?? '');
        return {
          query: q,
          results: [
            { title: `Result 1 for "${q}"`, url: 'https://example.com/1', snippet: 'Demo search result.' },
            { title: `Result 2 for "${q}"`, url: 'https://example.com/2', snippet: 'Another demo result.' },
          ],
        };
      },
    });
  }

  if (enabledTools.includes('send_message')) {
    registry.register({
      name: 'send_message',
      definition: {
        name: 'send_message',
        description: 'Send a message to a user or channel.',
        parameters: {
          to: { type: 'string', description: 'Recipient (user or channel)' },
          text: { type: 'string', description: 'Message text' },
        },
      },
      async execute(args) {
        return { sent: true, to: args['to'], text: args['text'], timestamp: new Date().toISOString() };
      },
    });
  }

  return registry;
}

// --- API endpoint ---
app.post('/api/run', async (req, res) => {
  try {
    const { baseUrl, apiKey, model, goal, tools: enabledTools, maxSteps, maxTokens } = req.body;

    if (!apiKey || !model || !goal) {
      return res.status(400).json({ error: 'apiKey, model and goal are required' });
    }

    const memory = new BufferMemory();
    const toolRegistry = createDemoTools(enabledTools || []);

    const llm = new OpenAIAdapter({
      baseUrl: baseUrl || undefined,
      apiKey,
      model,
    });

    const auditLog: AuditEntry[] = [];
    function auditHandler(entry: AuditEntry): void {
      auditLog.push(entry);
    }

    const accessContext: AccessContext = {
      principal: { id: 'web-user', roles: ['user'] },
      runId: `web_${Date.now()}`,
    };

    const state = await runAgentLoop(
      { goal, accessContext },
      memory,
      toolRegistry,
      llm,
      null,
      {
        maxSteps: maxSteps || 10,
        maxTokens: maxTokens || 0,
        auditHandler,
        toolCacheTtlMs: 0,
        systemPrompt: 'You are a helpful autonomous agent. Use the available tools to achieve the goal. When done, give a final answer. Be concise.',
      }
    );

    // Add thought entries from messages
    const thoughts: AuditEntry[] = [];
    for (const msg of state.messages) {
      if (msg.role === 'assistant' && msg.content && !msg.toolCalls?.length) {
        thoughts.push({
          timestamp: new Date().toISOString(),
          event: 'thought' as AuditEntry['event'],
          runId: state.runId,
          principalId: 'web-user',
          meta: { content: msg.content },
        });
      }
    }

    res.json({ state, audit: auditLog });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent error:', message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  TaskPilot Web UI`);
  console.log(`  http://localhost:${PORT}\n`);
});
