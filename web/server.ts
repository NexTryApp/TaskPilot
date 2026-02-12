/**
 * TaskPilot Web Server with SSE streaming and workspace tracking.
 * Run: npx tsx web/server.ts
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  OpenAIAdapter,
} from '../src/index.js';
import type { AuditEntry, AccessContext, AgentStepEvent, AgentWorkspace } from '../src/index.js';

const execAsync = promisify(execCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4242;

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

// Channel config passed from UI for real tool execution
let terminalCwd: string | undefined;
let terminalShell: string | undefined;

function createDemoTools(enabledTools: string[], channelConfig?: Record<string, unknown>): ToolRegistry {
  // Extract terminal config if provided
  const termCfg = channelConfig?.terminal as Record<string, string> | undefined;
  terminalCwd = termCfg?.cwd || undefined;
  const shellMap: Record<string, string> = { powershell: 'powershell.exe', cmd: 'cmd.exe', bash: 'bash' };
  terminalShell = termCfg?.shell ? (shellMap[termCfg.shell] || termCfg.shell) : undefined;

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
        description: 'Fetch a URL and return the page content as readable text (real HTTP request).',
        parameters: {
          url: { type: 'string', description: 'Full URL to fetch (e.g. https://example.com)' },
        },
      },
      async execute(args) {
        const url = String(args['url'] || 'https://example.com');
        const MAX_CHARS = 50_000;
        const TIMEOUT_MS = 15_000;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          const resp = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'TaskPilot/1.0' },
          });
          clearTimeout(timer);
          const contentType = resp.headers.get('content-type') || '';
          let text = await resp.text();
          // Strip HTML tags for readable text
          if (contentType.includes('html')) {
            // Extract title
            const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : '';
            // Remove script/style/nav/header/footer tags and their content
            text = text.replace(/<(script|style|nav|header|footer|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
            // Remove all HTML tags
            text = text.replace(/<[^>]+>/g, ' ');
            // Collapse whitespace
            text = text.replace(/\s+/g, ' ').trim();
            return {
              url,
              status: resp.status,
              title,
              content: text.slice(0, MAX_CHARS),
              contentLength: text.length,
              truncated: text.length > MAX_CHARS,
            };
          }
          return {
            url,
            status: resp.status,
            title: '',
            content: text.slice(0, MAX_CHARS),
            contentLength: text.length,
            truncated: text.length > MAX_CHARS,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { url, error: message, status: 0 };
        }
      },
    });
  }

  if (enabledTools.includes('browser_search')) {
    registry.register({
      name: 'browser_search',
      definition: {
        name: 'browser_search',
        description: 'Search the web using DuckDuckGo and return real results.',
        parameters: {
          query: { type: 'string', description: 'Search query' },
        },
      },
      async execute(args) {
        const q = String(args['query'] || '');
        if (!q) return { query: q, results: [], error: 'Empty query' };
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
          const resp = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'TaskPilot/1.0 (compatible; bot)',
              'Accept': 'text/html',
            },
          });
          clearTimeout(timer);
          const html = await resp.text();
          // Parse DuckDuckGo HTML results
          const results: { title: string; url: string; snippet: string }[] = [];
          const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          const titles: { url: string; title: string }[] = [];
          let match;
          while ((match = resultPattern.exec(html)) !== null && titles.length < 8) {
            let href = match[1];
            // DuckDuckGo wraps URLs in redirects
            const udMatch = href.match(/uddg=([^&]+)/);
            if (udMatch) href = decodeURIComponent(udMatch[1]);
            const title = match[2].replace(/<[^>]+>/g, '').trim();
            if (href.startsWith('http') && title) titles.push({ url: href, title });
          }
          const snippets: string[] = [];
          while ((match = snippetPattern.exec(html)) !== null && snippets.length < 8) {
            snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
          }
          for (let i = 0; i < titles.length; i++) {
            results.push({
              title: titles[i].title,
              url: titles[i].url,
              snippet: snippets[i] || '',
            });
          }
          return { query: q, results: results.slice(0, 5) };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { query: q, results: [], error: message };
        }
      },
    });
  }

  if (enabledTools.includes('terminal_run')) {
    registry.register({
      name: 'terminal_run',
      definition: {
        name: 'terminal_run',
        description: 'Execute a real shell command and return stdout/stderr. Use with caution.',
        parameters: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
      },
      async execute(args) {
        const cmd = String(args['command'] || 'echo hello');
        const MAX_OUTPUT = 64 * 1024; // 64KB max output
        const TIMEOUT_MS = 30_000;    // 30 seconds timeout

        // If SANDBOX_URL is set (Docker mode), route to the sandbox container
        const sandboxUrl = process.env.SANDBOX_URL;
        if (sandboxUrl) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 5_000);
            const resp = await fetch(`${sandboxUrl}/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command: cmd,
                timeout: TIMEOUT_MS,
                cwd: terminalCwd || '/app/data',
              }),
              signal: controller.signal,
            });
            clearTimeout(timer);
            const result = await resp.json() as Record<string, unknown>;
            return result;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              command: cmd,
              exitCode: 1,
              stdout: '',
              stderr: `Sandbox error: ${message}`,
            };
          }
        }

        // Local execution (non-Docker mode)
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT,
            cwd: terminalCwd || undefined,
            shell: terminalShell || undefined,
          });
          return {
            command: cmd,
            exitCode: 0,
            stdout: stdout.slice(0, MAX_OUTPUT),
            stderr: stderr.slice(0, MAX_OUTPUT),
          };
        } catch (err: unknown) {
          const e = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string; message?: string };
          return {
            command: cmd,
            exitCode: e.code ?? 1,
            killed: e.killed ?? false,
            stdout: (e.stdout || '').slice(0, MAX_OUTPUT),
            stderr: (e.stderr || e.message || 'Unknown error').slice(0, MAX_OUTPUT),
          };
        }
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
  const { baseUrl, apiKey, model, goal, channels, maxSteps, maxTokens, systemPrompt, agentName, accessPolicy } = req.body;

  // Derive enabled tools from channels
  const enabledTools: string[] = [];
  if (channels?.telegram) { enabledTools.push('telegram_send', 'telegram_read'); }
  if (channels?.discord) { enabledTools.push('telegram_send', 'telegram_read'); } // reuse demo tools
  if (channels?.whatsapp) { enabledTools.push('telegram_send'); }
  if (channels?.slack) { enabledTools.push('telegram_send'); }
  if (channels?.browser) { enabledTools.push('browser_open', 'browser_search'); }
  if (channels?.terminal) { enabledTools.push('terminal_run'); }
  if (channels?.email) { enabledTools.push('send_email'); }
  // Always include create_task and get_weather as utility tools
  enabledTools.push('create_task', 'get_weather');

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

  const enabledToolNames: string[] = [...new Set(enabledTools)]; // dedupe
  const toolRegistry = createDemoTools(enabledToolNames, channels);

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
    principal: { id: agentName || 'web-user', roles: ['user'] },
    tools: allTools,
    channels: channels || {},
    limits: { maxSteps: maxSteps || 15, maxTokens: maxTokens || 0 },
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
        maxSteps: maxSteps || 15,
        maxTokens: maxTokens || 0,
        auditHandler,
        toolCacheTtlMs: 0,
        systemPrompt: systemPrompt || 'You are a helpful autonomous agent. Use the available tools to achieve the goal. When done, give a final answer. Be concise.',
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
