/**
 * TaskPilot Web Server with SSE streaming and workspace tracking.
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
import type { AuditEntry, AccessContext, AgentStepEvent, AgentWorkspace } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Tool definition with workspace metadata ---
interface ToolMeta {
  name: string;
  description: string;
  platform: string;
  platformLabel: string;
  icon: string;
}

const TOOL_CATALOG: ToolMeta[] = [
  { name: 'telegram_send', description: 'Send a message via Telegram bot', platform: 'telegram', platformLabel: 'Telegram', icon: 'telegram' },
  { name: 'telegram_read', description: 'Read latest messages from a Telegram chat', platform: 'telegram', platformLabel: 'Telegram', icon: 'telegram' },
  { name: 'browser_open', description: 'Open a URL in the browser and get page content', platform: 'chrome', platformLabel: 'Chrome Browser', icon: 'chrome' },
  { name: 'browser_search', description: 'Search the web via browser', platform: 'chrome', platformLabel: 'Chrome Browser', icon: 'chrome' },
  { name: 'terminal_run', description: 'Execute a command in the terminal', platform: 'terminal', platformLabel: 'Terminal', icon: 'terminal' },
  { name: 'create_task', description: 'Create a task in the task manager', platform: 'task-manager', platformLabel: 'Task Manager', icon: 'tasks' },
  { name: 'get_weather', description: 'Get current weather for a city', platform: 'weather-api', platformLabel: 'Weather API', icon: 'api' },
  { name: 'send_email', description: 'Send an email', platform: 'email', platformLabel: 'Email', icon: 'email' },
];

// Map tool name → workspace info
function getToolWorkspace(toolName: string, args: Record<string, unknown>): AgentWorkspace {
  const meta = TOOL_CATALOG.find(t => t.name === toolName);
  if (!meta) return { platform: 'unknown', platformLabel: 'Unknown', icon: 'default' };

  const ws: AgentWorkspace = {
    platform: meta.platform,
    platformLabel: meta.platformLabel,
    icon: meta.icon,
  };

  // Add specific location info based on tool + args
  switch (toolName) {
    case 'telegram_send':
    case 'telegram_read':
      ws.location = `Chat: ${args['chat'] || args['to'] || 'unknown'}`;
      ws.status = toolName === 'telegram_send' ? 'Sending message...' : 'Reading messages...';
      break;
    case 'browser_open':
      ws.location = String(args['url'] || 'about:blank');
      ws.status = 'Loading page...';
      break;
    case 'browser_search':
      ws.location = `Search: "${args['query'] || ''}"`;
      ws.status = 'Searching...';
      break;
    case 'terminal_run':
      ws.location = `$ ${args['command'] || ''}`;
      ws.status = 'Running command...';
      break;
    case 'create_task':
      ws.location = `Task: "${args['title'] || ''}"`;
      ws.status = 'Creating task...';
      break;
    case 'get_weather':
      ws.location = `City: ${args['city'] || 'unknown'}`;
      ws.status = 'Fetching weather...';
      break;
    case 'send_email':
      ws.location = `To: ${args['to'] || 'unknown'}`;
      ws.status = 'Sending email...';
      break;
  }

  return ws;
}

function createDemoTools(enabledTools: string[]): ToolRegistry {
  const registry = new ToolRegistry();

  if (enabledTools.includes('telegram_send')) {
    registry.register({
      name: 'telegram_send',
      definition: {
        name: 'telegram_send',
        description: 'Send a message via Telegram bot to a chat or user.',
        parameters: {
          to: { type: 'string', description: 'Chat ID or username (e.g. @user or chat_id)' },
          text: { type: 'string', description: 'Message text to send' },
        },
      },
      async execute(args) {
        await delay(800);
        return {
          sent: true,
          to: args['to'],
          text: args['text'],
          messageId: Math.floor(Math.random() * 100000),
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  if (enabledTools.includes('telegram_read')) {
    registry.register({
      name: 'telegram_read',
      definition: {
        name: 'telegram_read',
        description: 'Read the latest messages from a Telegram chat.',
        parameters: {
          chat: { type: 'string', description: 'Chat ID or username' },
          limit: { type: 'number', description: 'Number of messages to read (default 5)' },
        },
      },
      async execute(args) {
        await delay(600);
        const chat = args['chat'] || 'general';
        return {
          chat,
          messages: [
            { from: 'Alice', text: 'Hey, did you check the weather?', time: '10:30' },
            { from: 'Bob', text: 'Not yet, can someone look it up?', time: '10:32' },
            { from: 'Alice', text: 'Also we need to plan the meeting', time: '10:35' },
          ],
        };
      },
    });
  }

  if (enabledTools.includes('browser_open')) {
    registry.register({
      name: 'browser_open',
      definition: {
        name: 'browser_open',
        description: 'Open a URL in Chrome and return the page title and excerpt.',
        parameters: {
          url: { type: 'string', description: 'Full URL to open (e.g. https://example.com)' },
        },
      },
      async execute(args) {
        await delay(1200);
        const url = String(args['url'] || 'https://example.com');
        return {
          url,
          title: `Page: ${new URL(url).hostname}`,
          status: 200,
          excerpt: `This is the content of ${url}. The page loaded successfully with relevant information.`,
          links: ['https://example.com/about', 'https://example.com/contact'],
        };
      },
    });
  }

  if (enabledTools.includes('browser_search')) {
    registry.register({
      name: 'browser_search',
      definition: {
        name: 'browser_search',
        description: 'Search the web and return top results.',
        parameters: {
          query: { type: 'string', description: 'Search query' },
        },
      },
      async execute(args) {
        await delay(900);
        const q = String(args['query'] || '');
        return {
          query: q,
          results: [
            { title: `${q} - Wikipedia`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`, snippet: `Comprehensive article about ${q}.` },
            { title: `${q} Guide - Medium`, url: `https://medium.com/${encodeURIComponent(q)}`, snippet: `A detailed guide on ${q}.` },
            { title: `${q} - Official Site`, url: `https://${q.replace(/\s/g, '')}.com`, snippet: `Official website for ${q}.` },
          ],
        };
      },
    });
  }

  if (enabledTools.includes('terminal_run')) {
    registry.register({
      name: 'terminal_run',
      definition: {
        name: 'terminal_run',
        description: 'Execute a shell command and return the output.',
        parameters: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
      },
      async execute(args) {
        await delay(1500);
        const cmd = String(args['command'] || 'echo hello');
        const outputs: Record<string, string> = {
          'ls': 'README.md\npackage.json\nsrc/\nweb/\nstart.bat',
          'pwd': '/home/user/project',
          'npm install': 'added 42 packages in 3.2s',
          'git status': 'On branch main\nnothing to commit, working tree clean',
          'node --version': 'v22.13.1',
        };
        return {
          command: cmd,
          exitCode: 0,
          stdout: outputs[cmd] || `Executed: ${cmd}\nDone.`,
          stderr: '',
        };
      },
    });
  }

  if (enabledTools.includes('create_task')) {
    registry.register({
      name: 'create_task',
      definition: {
        name: 'create_task',
        description: 'Create a new task in the task manager with title and optional steps.',
        parameters: {
          title: { type: 'string', description: 'Task title' },
          steps: { type: 'array', description: 'List of subtask steps', items: { type: 'string' } },
          priority: { type: 'string', description: 'Priority: low, medium, high' },
        },
      },
      async execute(args, context) {
        await delay(500);
        return {
          id: `task_${Date.now()}`,
          title: args['title'],
          steps: args['steps'] ?? [],
          priority: args['priority'] ?? 'medium',
          created: true,
          createdBy: context?.principal.id ?? 'web-user',
        };
      },
    });
  }

  if (enabledTools.includes('get_weather')) {
    registry.register({
      name: 'get_weather',
      definition: {
        name: 'get_weather',
        description: 'Get current weather for a city.',
        parameters: { city: { type: 'string', description: 'City name' } },
      },
      async execute(args) {
        await delay(700);
        const city = String(args['city'] ?? 'Unknown');
        const temps: Record<string, number> = { Moscow: -5, London: 8, Tokyo: 14, 'New York': 2, Berlin: 3, Paris: 6 };
        const temp = temps[city] ?? Math.floor(Math.random() * 30 - 5);
        const conditions = ['sunny', 'cloudy', 'rain', 'snow', 'windy', 'partly cloudy'];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];
        return { city, temp, condition, unit: 'C', humidity: Math.floor(Math.random() * 60 + 30) + '%' };
      },
    });
  }

  if (enabledTools.includes('send_email')) {
    registry.register({
      name: 'send_email',
      definition: {
        name: 'send_email',
        description: 'Send an email to a recipient.',
        parameters: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body text' },
        },
      },
      async execute(args) {
        await delay(600);
        return {
          sent: true,
          to: args['to'],
          subject: args['subject'],
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  return registry;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- API: Tool catalog ---
app.get('/api/tools', (_req, res) => {
  res.json(TOOL_CATALOG);
});

// --- API: Run agent with SSE ---
app.post('/api/run', async (req, res) => {
  const { baseUrl, apiKey, model, goal, tools: enabledTools, maxSteps, maxTokens } = req.body;

  if (!apiKey || !model || !goal) {
    return res.status(400).json({ error: 'apiKey, model and goal are required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sendSSE(event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const enabledToolNames: string[] = enabledTools || [];
  const toolRegistry = createDemoTools(enabledToolNames);

  // Send permissions
  const allTools = TOOL_CATALOG.map(t => ({
    name: t.name,
    description: t.description,
    platform: t.platform,
    platformLabel: t.platformLabel,
    icon: t.icon,
    enabled: enabledToolNames.includes(t.name),
  }));
  sendSSE('permissions', {
    principal: { id: 'web-user', roles: ['user'] },
    tools: allTools,
    limits: { maxSteps: maxSteps || 10, maxTokens: maxTokens || 0 },
    provider: { baseUrl, model },
  });

  const memory = new BufferMemory();
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

  // Real-time step callback with workspace enrichment
  function onStep(event: AgentStepEvent): void {
    // Enrich tool events with workspace info
    if ((event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'tool_denied') && event.tool) {
      const ws = getToolWorkspace(event.tool, event.args || {});
      if (event.type === 'tool_result') {
        ws.status = 'Done';
      }
      event.workspace = ws;
    }
    sendSSE('step', event);
  }

  try {
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
        onStep,
      }
    );

    sendSSE('done', {
      runId: state.runId,
      steps: state.currentStep,
      maxSteps: state.maxSteps,
      done: state.done,
      finalAnswer: state.finalAnswer,
      principalId: state.principalId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent error:', message);
    sendSSE('error', { error: message });
  }

  res.end();
});

import http from 'http';

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n  TaskPilot Web UI`);
  console.log(`  http://localhost:${PORT}\n`);
});

server.on('error', (err: Error) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
