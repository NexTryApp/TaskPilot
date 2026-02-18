/**
 * TaskPilot Web Server with SSE streaming, security, skills, and database.
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
  // Security
  ApprovalManager,
  SecurityAdvisor,
  PIIScrubber,
  // Skills
  BUILTIN_SKILLS,
  getBuiltinSkill,
  loadSkillsDirectory,
  skillToAccessPolicy,
  skillToSystemPromptAddition,
  // Database
  initDatabase,
  Repository,
} from '../src/index.js';
import type {
  AuditEntry,
  AccessContext,
  AgentStepEvent,
  AgentWorkspace,
  SkillDefinition,
  // REMOVED: CommandExplanation — used implicitly via SecurityAdvisor
  CompressionEvent,
  RedactionEvent,
} from '../src/index.js';

const execAsync = promisify(execCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { randomBytes } from 'crypto';

const app = express();
const PORT = 4242;

// --- Security: CORS restriction (only allow same-origin) ---
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// --- Security: Session token with rotation ---
const SESSION_TOKEN_TTL_MS = 30 * 60_000; // 30 minutes
let sessionToken = randomBytes(32).toString('hex');
let sessionTokenCreatedAt = Date.now();

function getSessionToken(): string {
  const now = Date.now();
  if (now - sessionTokenCreatedAt > SESSION_TOKEN_TTL_MS) {
    // Rotate token every 30 minutes
    sessionToken = randomBytes(32).toString('hex');
    sessionTokenCreatedAt = now;
    console.log('  Session token rotated');
  }
  return sessionToken;
}

/** Middleware: require session token for sensitive endpoints */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = String(req.headers['x-session-token'] || '');
  if (token === getSessionToken()) { next(); return; }
  res.status(401).json({ error: 'Unauthorized — missing or invalid session token' });
}

// --- Session handshake: UI fetches token on load (same-origin protected by CORS) ---
app.get('/api/session', (_req, res) => {
  res.json({ token: getSessionToken() });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Initialize Database ---
const dbPath = path.join(path.dirname(__dirname), 'data', 'taskpilot.db');
const db = initDatabase(dbPath);
const repo = new Repository(db);
console.log('  Database initialized:', dbPath);

// --- Load skills (builtin + custom from skills/ directory) ---
const skillsDir = path.join(path.dirname(__dirname), 'skills');
const customSkills = loadSkillsDirectory(skillsDir);
const allSkills = new Map<string, SkillDefinition>([...BUILTIN_SKILLS, ...customSkills]);
console.log(`  Skills loaded: ${Array.from(allSkills.keys()).join(', ')}`);

// --- Global approval manager (shared across requests for SSE communication) ---
const globalApprovalManager = new ApprovalManager(60_000);

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
  { name: 'discord_send', description: 'Send a message to a Discord channel', platform: 'discord', platformLabel: 'Discord', icon: 'discord' },
  { name: 'discord_read', description: 'Read messages from a Discord channel', platform: 'discord', platformLabel: 'Discord', icon: 'discord' },
  { name: 'whatsapp_send', description: 'Send a WhatsApp message', platform: 'whatsapp', platformLabel: 'WhatsApp', icon: 'whatsapp' },
  { name: 'slack_send', description: 'Send a message to Slack', platform: 'slack', platformLabel: 'Slack', icon: 'slack' },
  { name: 'slack_read', description: 'Read messages from a Slack channel', platform: 'slack', platformLabel: 'Slack', icon: 'slack' },
  { name: 'browser_open', description: 'Open a URL in the browser and get page content', platform: 'chrome', platformLabel: 'Chrome Browser', icon: 'chrome' },
  { name: 'browser_search', description: 'Search the web via browser', platform: 'chrome', platformLabel: 'Chrome Browser', icon: 'chrome' },
  { name: 'terminal_run', description: 'Execute a command in the terminal', platform: 'terminal', platformLabel: 'Terminal', icon: 'terminal' },
  { name: 'create_task', description: 'Create a task in the task manager', platform: 'task-manager', platformLabel: 'Task Manager', icon: 'tasks' },
  { name: 'get_weather', description: 'Get current weather for a city', platform: 'weather-api', platformLabel: 'Weather API', icon: 'api' },
  { name: 'send_email', description: 'Send an email via SMTP', platform: 'email', platformLabel: 'Email', icon: 'email' },
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

// --- SSRF Protection ---
/** Block requests to internal/private networks and cloud metadata endpoints. */
function checkSsrf(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);

    // Block non-http(s) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `Blocked: only http/https URLs allowed (got ${parsed.protocol})`;
    }

    const host = parsed.hostname.toLowerCase();

    // Block cloud metadata endpoints
    if (host === '169.254.169.254' || host === 'metadata.google.internal') {
      return 'Blocked: cloud metadata endpoint (SSRF protection)';
    }

    // Block localhost / loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      return 'Blocked: localhost/loopback address (SSRF protection)';
    }

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return 'Blocked: private network 10.0.0.0/8 (SSRF protection)';
      if (a === 172 && b >= 16 && b <= 31) return 'Blocked: private network 172.16.0.0/12 (SSRF protection)';
      if (a === 192 && b === 168) return 'Blocked: private network 192.168.0.0/16 (SSRF protection)';
      if (a === 169 && b === 254) return 'Blocked: link-local 169.254.0.0/16 (SSRF protection)';
    }

    return null; // URL is safe
  } catch {
    return `Blocked: invalid URL "${urlStr}"`;
  }
}

// --- Rate Limiting (per-IP) ---
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 runs per minute per IP

function getClientIP(req: express.Request): string {
  // Trust X-Forwarded-For only behind a reverse proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const active = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, active);
  }
}, 5 * 60_000);

// Channel config passed from UI for real tool execution
let terminalCwd: string | undefined;
let terminalShell: string | undefined;

function createDemoTools(enabledTools: string[], channelConfig?: Record<string, unknown>): ToolRegistry {
  const termCfg = channelConfig?.terminal as Record<string, string> | undefined;
  terminalCwd = termCfg?.cwd || undefined;
  const shellMap: Record<string, string> = { powershell: 'powershell.exe', cmd: 'cmd.exe', bash: 'bash' };
  terminalShell = termCfg?.shell ? (shellMap[termCfg.shell] || termCfg.shell) : undefined;

  const registry = new ToolRegistry();

  // --- Telegram: real Bot API integration ---
  const tgCfg = channelConfig?.telegram as Record<string, string> | undefined;
  const tgBotToken = tgCfg?.botToken || '';
  const TG_API = tgBotToken ? `https://api.telegram.org/bot${tgBotToken}` : '';

  if (enabledTools.includes('telegram_send')) {
    registry.register({
      name: 'telegram_send',
      definition: {
        name: 'telegram_send',
        description: 'Send a message via Telegram bot to a chat or user. Use chat_id (number) or @username.',
        parameters: {
          to: { type: 'string', description: 'Chat ID (number) or @username to send message to' },
          text: { type: 'string', description: 'Message text to send (supports Markdown)' },
        },
      },
      async execute(args) {
        if (!TG_API) return { error: 'Telegram bot token not configured. Enter it in the Telegram channel settings.' };
        const chatId = args['to'];
        const text = args['text'];
        if (!chatId || !text) return { error: 'Both "to" (chat_id) and "text" are required.' };

        try {
          const resp = await fetch(`${TG_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: 'Markdown',
            }),
          });
          const data = await resp.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
          if (!data.ok) return { error: `Telegram API error: ${data.description || 'Unknown error'}` };
          return {
            sent: true,
            to: chatId,
            text,
            messageId: data.result?.message_id,
            timestamp: new Date().toISOString(),
          };
        } catch (err: unknown) {
          return { error: `Telegram send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  if (enabledTools.includes('telegram_read')) {
    // Track last update_id to avoid duplicates
    let lastUpdateId = 0;

    registry.register({
      name: 'telegram_read',
      definition: {
        name: 'telegram_read',
        description: 'Read the latest incoming messages to this Telegram bot.',
        parameters: {
          limit: { type: 'number', description: 'Number of messages to read (default 10, max 100)' },
        },
      },
      async execute(args) {
        if (!TG_API) return { error: 'Telegram bot token not configured. Enter it in the Telegram channel settings.' };
        const limit = Math.min(Number(args['limit']) || 10, 100);

        try {
          const params = new URLSearchParams({
            limit: String(limit),
            allowed_updates: JSON.stringify(['message']),
          });
          if (lastUpdateId > 0) params.set('offset', String(lastUpdateId + 1));

          const resp = await fetch(`${TG_API}/getUpdates?${params}`);
          const data = await resp.json() as {
            ok?: boolean;
            result?: Array<{
              update_id: number;
              message?: {
                message_id: number;
                from?: { id: number; first_name?: string; username?: string };
                chat: { id: number; type: string; title?: string };
                date: number;
                text?: string;
              };
            }>;
            description?: string;
          };

          if (!data.ok) return { error: `Telegram API error: ${data.description || 'Unknown error'}` };

          const updates = data.result || [];
          if (updates.length > 0) {
            lastUpdateId = updates[updates.length - 1].update_id;
          }

          const messages = updates
            .filter(u => u.message?.text)
            .map(u => ({
              updateId: u.update_id,
              messageId: u.message!.message_id,
              from: u.message!.from?.first_name || u.message!.from?.username || 'Unknown',
              fromId: u.message!.from?.id,
              chatId: u.message!.chat.id,
              chatType: u.message!.chat.type,
              text: u.message!.text,
              date: new Date(u.message!.date * 1000).toISOString(),
            }));

          return { count: messages.length, messages };
        } catch (err: unknown) {
          return { error: `Telegram read failed: ${err instanceof Error ? err.message : String(err)}` };
        }
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

        // --- SSRF Protection: block internal/private URLs ---
        const ssrfError = checkSsrf(url);
        if (ssrfError) return { url, error: ssrfError, status: 0 };

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          // redirect: 'manual' prevents automatic redirect following (SSRF bypass via 302)
          const resp = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'TaskPilot/1.0' },
            redirect: 'manual',
          });
          clearTimeout(timer);

          // --- SSRF: check redirect target before following ---
          if (resp.status >= 300 && resp.status < 400) {
            const location = resp.headers.get('location') || '';
            const redirectError = checkSsrf(location);
            if (redirectError) return { url, error: `Redirect blocked: ${redirectError}`, status: resp.status, redirectTo: location };
            // Safe redirect — follow manually
            const controller2 = new AbortController();
            const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);
            const resp2 = await fetch(location, {
              signal: controller2.signal,
              headers: { 'User-Agent': 'TaskPilot/1.0' },
              redirect: 'manual',
            });
            clearTimeout(timer2);
            // Use the redirected response
            const contentType2 = resp2.headers.get('content-type') || '';
            let text2 = await resp2.text();
            if (contentType2.includes('html')) {
              const titleMatch2 = text2.match(/<title[^>]*>([^<]*)<\/title>/i);
              const title2 = titleMatch2 ? titleMatch2[1].trim() : '';
              text2 = text2.replace(/<(script|style|nav|header|footer|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
              text2 = text2.replace(/<[^>]+>/g, ' ');
              text2 = text2.replace(/\s+/g, ' ').trim();
              return { url: location, status: resp2.status, title: title2, content: text2.slice(0, MAX_CHARS), contentLength: text2.length, truncated: text2.length > MAX_CHARS };
            }
            return { url: location, status: resp2.status, title: '', content: text2.slice(0, MAX_CHARS), contentLength: text2.length, truncated: text2.length > MAX_CHARS };
          }

          const contentType = resp.headers.get('content-type') || '';
          let text = await resp.text();
          if (contentType.includes('html')) {
            const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : '';
            text = text.replace(/<(script|style|nav|header|footer|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
            text = text.replace(/<[^>]+>/g, ' ');
            text = text.replace(/\s+/g, ' ').trim();
            return {
              url, status: resp.status, title,
              content: text.slice(0, MAX_CHARS),
              contentLength: text.length,
              truncated: text.length > MAX_CHARS,
            };
          }
          return {
            url, status: resp.status, title: '',
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
          const results: { title: string; url: string; snippet: string }[] = [];
          const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          const titles: { url: string; title: string }[] = [];
          let match;
          while ((match = resultPattern.exec(html)) !== null && titles.length < 8) {
            let href = match[1];
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
        description: 'Execute a real shell command and return stdout/stderr. Security-gated by ExecGuard.',
        parameters: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
      },
      async execute(args) {
        const cmd = String(args['command'] || 'echo hello');
        const MAX_OUTPUT = 64 * 1024;
        const TIMEOUT_MS = 30_000;

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
            return { command: cmd, exitCode: 1, stdout: '', stderr: `Sandbox error: ${message}` };
          }
        }

        try {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT,
            cwd: terminalCwd || undefined,
            shell: terminalShell || undefined,
          });
          return {
            command: cmd, exitCode: 0,
            stdout: stdout.slice(0, MAX_OUTPUT),
            stderr: stderr.slice(0, MAX_OUTPUT),
          };
        } catch (err: unknown) {
          const e = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string; message?: string };
          return {
            command: cmd, exitCode: e.code ?? 1, killed: e.killed ?? false,
            stdout: (e.stdout || '').slice(0, MAX_OUTPUT),
            stderr: (e.stderr || e.message || 'Unknown error').slice(0, MAX_OUTPUT),
          };
        }
      },
    });
  }

  // --- Task Manager: real SQLite storage ---
  if (enabledTools.includes('create_task')) {
    registry.register({
      name: 'create_task',
      definition: {
        name: 'create_task',
        description: 'Create a new task in the task manager with title and optional steps. Tasks are persisted in the database.',
        parameters: {
          title: { type: 'string', description: 'Task title' },
          steps: { type: 'array', description: 'List of subtask steps', items: { type: 'string' } },
          priority: { type: 'string', description: 'Priority: low, medium, high' },
        },
      },
      async execute(args, context) {
        const taskId = `task_${Date.now()}`;
        const title = String(args['title'] || 'Untitled');
        const steps = (args['steps'] as string[]) ?? [];
        const priority = String(args['priority'] || 'medium');
        const createdBy = context?.principal.id ?? 'web-user';

        // Store in DB as a setting (lightweight task storage)
        const task = { id: taskId, title, steps, priority, createdBy, createdAt: new Date().toISOString(), done: false };
        const tasks = JSON.parse(repo.getSetting('tasks') || '[]');
        tasks.push(task);
        repo.setSetting('tasks', JSON.stringify(tasks));

        return { ...task, created: true, totalTasks: tasks.length };
      },
    });
  }

  // --- Weather: real API via wttr.in (free, no API key needed) ---
  if (enabledTools.includes('get_weather')) {
    registry.register({
      name: 'get_weather',
      definition: {
        name: 'get_weather',
        description: 'Get current weather for a city. Uses real weather data.',
        parameters: { city: { type: 'string', description: 'City name (e.g. Moscow, London, Tokyo)' } },
      },
      async execute(args) {
        const city = String(args['city'] ?? 'London');
        try {
          const resp = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) return { error: `Weather API returned ${resp.status}` };
          const data = await resp.json() as {
            current_condition?: Array<{
              temp_C?: string; humidity?: string; weatherDesc?: Array<{ value?: string }>;
              windspeedKmph?: string; FeelsLikeC?: string;
            }>;
          };
          const cc = data.current_condition?.[0];
          if (!cc) return { error: 'No weather data available' };
          return {
            city,
            temp: Number(cc.temp_C),
            feelsLike: Number(cc.FeelsLikeC),
            condition: cc.weatherDesc?.[0]?.value || 'unknown',
            humidity: `${cc.humidity}%`,
            wind: `${cc.windspeedKmph} km/h`,
            unit: 'C',
          };
        } catch (err: unknown) {
          return { error: `Weather fetch failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  // --- Email: real SMTP via Nodemailer ---
  const emailCfg = channelConfig?.email as Record<string, unknown> | undefined;

  if (enabledTools.includes('send_email')) {
    registry.register({
      name: 'send_email',
      definition: {
        name: 'send_email',
        description: 'Send a real email via SMTP. Requires email channel credentials (host, port, user, password).',
        parameters: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body text (plain text or HTML)' },
        },
      },
      async execute(args) {
        if (!emailCfg?.host || !emailCfg?.user || !emailCfg?.pass) {
          return { error: 'Email not configured. Enter SMTP credentials in the Email channel settings.' };
        }
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.createTransport({
            host: String(emailCfg.host),
            port: Number(emailCfg.port) || 587,
            secure: Number(emailCfg.port) === 465,
            auth: { user: String(emailCfg.user), pass: String(emailCfg.pass) },
          });
          const info = await transporter.sendMail({
            from: String(emailCfg.user),
            to: String(args['to']),
            subject: String(args['subject'] || ''),
            text: String(args['body'] || ''),
          });
          return { sent: true, to: args['to'], subject: args['subject'], messageId: info.messageId, timestamp: new Date().toISOString() };
        } catch (err: unknown) {
          return { error: `Email send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  // --- Discord: real Bot API ---
  const dcCfg = channelConfig?.discord as Record<string, string> | undefined;
  const DC_TOKEN = dcCfg?.botToken || '';
  const DC_API = 'https://discord.com/api/v10';

  if (enabledTools.includes('discord_send')) {
    registry.register({
      name: 'discord_send',
      definition: {
        name: 'discord_send',
        description: 'Send a message to a Discord channel via Bot API.',
        parameters: {
          channelId: { type: 'string', description: 'Discord channel ID (number)' },
          text: { type: 'string', description: 'Message text to send' },
        },
      },
      async execute(args) {
        if (!DC_TOKEN) return { error: 'Discord bot token not configured. Enter it in the Discord channel settings.' };
        try {
          const resp = await fetch(`${DC_API}/channels/${args['channelId']}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${DC_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: String(args['text']) }),
          });
          const data = await resp.json() as { id?: string; content?: string; message?: string };
          if (!resp.ok) return { error: `Discord API error: ${data.message || resp.status}` };
          return { sent: true, channelId: args['channelId'], messageId: data.id, text: data.content };
        } catch (err: unknown) {
          return { error: `Discord send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  if (enabledTools.includes('discord_read')) {
    registry.register({
      name: 'discord_read',
      definition: {
        name: 'discord_read',
        description: 'Read recent messages from a Discord channel.',
        parameters: {
          channelId: { type: 'string', description: 'Discord channel ID' },
          limit: { type: 'number', description: 'Number of messages (default 10, max 50)' },
        },
      },
      async execute(args) {
        if (!DC_TOKEN) return { error: 'Discord bot token not configured.' };
        const limit = Math.min(Number(args['limit']) || 10, 50);
        try {
          const resp = await fetch(`${DC_API}/channels/${args['channelId']}/messages?limit=${limit}`, {
            headers: { Authorization: `Bot ${DC_TOKEN}` },
          });
          const data = await resp.json() as Array<{ id: string; content: string; author: { username: string }; timestamp: string }> | { message?: string };
          if (!resp.ok) return { error: `Discord API error: ${(data as { message?: string }).message || resp.status}` };
          return {
            count: (data as Array<unknown>).length,
            messages: (data as Array<{ id: string; content: string; author: { username: string }; timestamp: string }>).map(m => ({
              id: m.id, author: m.author.username, text: m.content, timestamp: m.timestamp,
            })),
          };
        } catch (err: unknown) {
          return { error: `Discord read failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  // --- WhatsApp: real Cloud API ---
  const waCfg = channelConfig?.whatsapp as Record<string, string> | undefined;
  const WA_PHONE_ID = waCfg?.phoneNumberId || '';
  const WA_TOKEN = waCfg?.accessToken || '';

  if (enabledTools.includes('whatsapp_send')) {
    registry.register({
      name: 'whatsapp_send',
      definition: {
        name: 'whatsapp_send',
        description: 'Send a WhatsApp message via Meta Cloud API.',
        parameters: {
          to: { type: 'string', description: 'Recipient phone number with country code (e.g. 15551234567)' },
          text: { type: 'string', description: 'Message text' },
        },
      },
      async execute(args) {
        if (!WA_PHONE_ID || !WA_TOKEN) return { error: 'WhatsApp not configured. Enter Phone Number ID and Access Token in WhatsApp channel settings.' };
        try {
          const resp = await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: String(args['to']),
              type: 'text',
              text: { body: String(args['text']) },
            }),
          });
          const data = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
          if (!resp.ok) return { error: `WhatsApp API error: ${data.error?.message || resp.status}` };
          return { sent: true, to: args['to'], messageId: data.messages?.[0]?.id, timestamp: new Date().toISOString() };
        } catch (err: unknown) {
          return { error: `WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  // --- Slack: real Web API ---
  const slCfg = channelConfig?.slack as Record<string, string> | undefined;
  const SL_TOKEN = slCfg?.botToken || '';

  if (enabledTools.includes('slack_send')) {
    registry.register({
      name: 'slack_send',
      definition: {
        name: 'slack_send',
        description: 'Send a message to a Slack channel via Bot API.',
        parameters: {
          channel: { type: 'string', description: 'Slack channel ID (e.g. C01234567) or channel name (#general)' },
          text: { type: 'string', description: 'Message text' },
        },
      },
      async execute(args) {
        if (!SL_TOKEN) return { error: 'Slack bot token not configured. Enter it in the Slack channel settings.' };
        try {
          const resp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { Authorization: `Bearer ${SL_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: String(args['channel']), text: String(args['text']) }),
          });
          const data = await resp.json() as { ok: boolean; ts?: string; channel?: string; error?: string };
          if (!data.ok) return { error: `Slack API error: ${data.error}` };
          return { sent: true, channel: data.channel, ts: data.ts, text: args['text'] };
        } catch (err: unknown) {
          return { error: `Slack send failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  if (enabledTools.includes('slack_read')) {
    registry.register({
      name: 'slack_read',
      definition: {
        name: 'slack_read',
        description: 'Read recent messages from a Slack channel.',
        parameters: {
          channel: { type: 'string', description: 'Slack channel ID (e.g. C01234567)' },
          limit: { type: 'number', description: 'Number of messages (default 10)' },
        },
      },
      async execute(args) {
        if (!SL_TOKEN) return { error: 'Slack bot token not configured.' };
        const limit = Math.min(Number(args['limit']) || 10, 50);
        try {
          const resp = await fetch(`https://slack.com/api/conversations.history?channel=${args['channel']}&limit=${limit}`, {
            headers: { Authorization: `Bearer ${SL_TOKEN}` },
          });
          const data = await resp.json() as { ok: boolean; messages?: Array<{ text: string; user?: string; ts: string }>; error?: string };
          if (!data.ok) return { error: `Slack API error: ${data.error}` };
          return {
            count: data.messages?.length || 0,
            messages: (data.messages || []).map(m => ({ user: m.user, text: m.text, ts: m.ts })),
          };
        } catch (err: unknown) {
          return { error: `Slack read failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
  }

  return registry;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// --- Tool catalog ---
app.get('/api/tools', (_req, res) => {
  res.json(TOOL_CATALOG);
});

// --- Skills catalog ---
app.get('/api/skills', (_req, res) => {
  const catalog = Array.from(allSkills.entries()).map(([key, skill]) => ({
    key,
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    securityLevel: skill.securityLevel,
    allowedTools: skill.allowedTools,
    deniedTools: skill.deniedTools,
  }));
  res.json(catalog);
});

// --- Approval response ---
app.post('/api/approval/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;
  const found = globalApprovalManager.respond(id, approved === true);

  // Log security event
  repo.addSecurityEvent(
    'WARN',
    approved ? 'APPROVED' : 'DENIED',
    { userDecision: approved ? 'approved' : 'denied' }
  );

  res.json({ ok: found, approved });
});

// --- Settings ---
app.get('/api/settings', requireAuth, (_req, res) => {
  const settings = repo.getAllSettings();
  // Also try to get saved API key (decrypted)
  const apiKey = repo.getSecret('apiKey');
  res.json({ ...settings, apiKey: apiKey || '' });
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { apiKey, ...rest } = req.body;
  // Save API key encrypted
  if (apiKey) {
    repo.setSecret('apiKey', apiKey);
  }
  // Save other settings (strings as-is, objects as JSON)
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'string') {
      repo.setSetting(key, value);
    } else if (value !== null && value !== undefined) {
      repo.setSetting(key, JSON.stringify(value));
    }
  }
  res.json({ ok: true });
});

// --- Test API Key ---
app.post('/api/test-key', requireAuth, async (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });

  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const chatUrl = `${base}/chat/completions`;
  const testModel = model || 'gpt-4o-mini';

  // DEBUG: log what we're sending
  console.log('[test-key] URL:', chatUrl);
  console.log('[test-key] Model:', testModel);
  console.log('[test-key] Key length:', apiKey.length);
  console.log('[test-key] Key preview:', `${apiKey.slice(0, 10)}...${apiKey.slice(-6)}`);
  console.log('[test-key] Key hex (first 20 chars):', Buffer.from(apiKey.slice(0, 20)).toString('hex'));

  try {
    const reqBody = {
      model: testModel,
      messages: [{ role: 'user', content: 'Say "ok"' }],
      max_tokens: 3,
    };
    console.log('[test-key] Request body:', JSON.stringify(reqBody));

    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(15000),
    });

    console.log('[test-key] Response status:', resp.status);
    console.log('[test-key] Response headers:', Object.fromEntries(resp.headers.entries()));

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.log('[test-key] Error body:', body);
      let errorMsg = `API returned ${resp.status}: ${body.slice(0, 500)}`;
      if (resp.status === 401) errorMsg = `401 Unauthorized. Raw response: ${body.slice(0, 300)}`;
      if (resp.status === 429) errorMsg = 'Rate limit or quota exceeded (429). Check your billing and usage limits.';
      if (resp.status === 404) errorMsg = `Model "${testModel}" not found (404). Try a different model.`;
      return res.json({
        ok: false,
        status: resp.status,
        error: errorMsg,
        rawKey: `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`,
        keyLength: apiKey.length,
        url: chatUrl,
      });
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const reply = data.choices?.[0]?.message?.content || '';
    return res.json({
      ok: true,
      model: data.model || testModel,
      reply: reply.trim(),
      rawKey: `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[test-key] Exception:', msg);
    return res.json({ ok: false, error: `Connection failed: ${msg}` });
  }
});

// --- History ---
app.get('/api/history', (req, res) => {
  const limit = Math.min(Number(req.query['limit']) || 50, 200);
  const offset = Number(req.query['offset']) || 0;
  const runs = repo.getRuns(limit, offset);
  res.json(runs);
});

app.get('/api/history/:runId', (req, res) => {
  const run = repo.getRun(req.params['runId']);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const steps = repo.getSteps(req.params['runId']);
  res.json({ run, steps });
});

// --- Security events ---
app.get('/api/security-events', (req, res) => {
  const limit = Math.min(Number(req.query['limit']) || 100, 500);
  const events = repo.getSecurityEvents(limit);
  res.json(events);
});

// --- Stats ---
app.get('/api/stats', (_req, res) => {
  res.json(repo.getStats());
});

// ============================================================================
// MAIN: Run agent with SSE + security + skills
// ============================================================================

app.post('/api/run', requireAuth, async (req, res) => {
  // Rate limit: max 10 agent runs per minute
  if (!checkRateLimit(getClientIP(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded — max 10 runs per minute' });
  }

  const {
    baseUrl, apiKey, model, goal,
    channels, maxSteps, maxTokens, systemPrompt,
    agentName,
    // REMOVED: accessPolicy (replaced by skill-based policy)
    skill: skillName,  // NEW: skill selection
    explanationLanguage,  // Language for Security Advisor explanations
  } = req.body;

  // Resolve skill (default: web-researcher)
  const selectedSkillName = skillName || 'web-researcher';
  const selectedSkill = allSkills.get(selectedSkillName) || getBuiltinSkill('web-researcher')!;

  // Derive enabled tools from skill (not from channels anymore — skill controls this)
  const enabledToolNames: string[] = [];
  if (selectedSkill.allowedTools.includes('*')) {
    // All tools allowed by skill — but still filter by what channels are enabled
    if (channels?.telegram) { enabledToolNames.push('telegram_send', 'telegram_read'); }
    if (channels?.discord) { enabledToolNames.push('discord_send', 'discord_read'); }
    if (channels?.whatsapp) { enabledToolNames.push('whatsapp_send'); }
    if (channels?.slack) { enabledToolNames.push('slack_send', 'slack_read'); }
    if (channels?.browser) { enabledToolNames.push('browser_open', 'browser_search'); }
    if (channels?.terminal) { enabledToolNames.push('terminal_run'); }
    if (channels?.email) { enabledToolNames.push('send_email'); }
    enabledToolNames.push('create_task', 'get_weather');
  } else {
    // Only tools allowed by skill
    enabledToolNames.push(...selectedSkill.allowedTools);
  }

  const uniqueTools = [...new Set(enabledToolNames)];

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

  // Create tool registry
  const toolRegistry = createDemoTools(uniqueTools, channels);

  // --- MCP: register tools from connected MCP servers ---
  registerMcpTools(toolRegistry);

  // --- Security: Create ExecGuard with selected skill ---
  const { policy } = skillToAccessPolicy(selectedSkill, {
    approvalManager: globalApprovalManager,
    onApprovalNeeded: (approval) => {
      // Send approval request to the UI via SSE
      sendSSE('approval_needed', {
        id: approval.id,
        toolName: approval.toolName,
        args: approval.args,
        reason: approval.decision.reason,
        checks: approval.decision.checks,
        expiresAt: approval.expiresAt,
      });

      // --- Security Advisor: deep LLM analysis for WARN commands ---
      const warnCmd = String(approval.args?.['command'] || '');
      if (warnCmd && advisor) {
        advisor.explain(warnCmd, advisorContext).then(explanation => {
          sendSSE('approval_analysis', {
            id: approval.id,
            command: warnCmd,
            explanation,
          });
        }).catch(() => { /* ignore advisor failures */ });
      }

      // Log security event
      repo.addSecurityEvent('WARN', 'PENDING', {
        command: warnCmd,
        toolName: approval.toolName,
        explanation: approval.decision.reason,
        category: approval.decision.checks[0]?.category,
      });
    },
  });

  // Apply security policy to tool registry
  toolRegistry.setAccessPolicy(policy);

  // Build system prompt with skill safety rules
  const basePrompt = systemPrompt || 'You are a helpful autonomous agent. Use the available tools to achieve the goal. When done, give a final answer. Be concise.';
  const skillPromptAddition = skillToSystemPromptAddition(selectedSkill);
  const fullSystemPrompt = basePrompt + skillPromptAddition;

  // Send permissions to UI
  const allTools = TOOL_CATALOG.map(t => ({
    name: t.name,
    description: t.description,
    platform: t.platform,
    platformLabel: t.platformLabel,
    icon: t.icon,
    enabled: uniqueTools.includes(t.name),
    allowed: selectedSkill.allowedTools.includes('*') || selectedSkill.allowedTools.includes(t.name),
    denied: selectedSkill.deniedTools.includes(t.name),
  }));
  sendSSE('permissions', {
    principal: { id: agentName || 'web-user', roles: ['user'] },
    skill: {
      name: selectedSkill.name,
      description: selectedSkill.description,
      securityLevel: selectedSkill.securityLevel,
    },
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

  // --- Context window: progressive compression ---
  // Build pinned context from saved settings (user name, key facts)
  const userName = repo.getSetting('userName') || '';
  const userNotes = repo.getSetting('userNotes') || '';
  const pinnedParts: string[] = [];
  if (userName) pinnedParts.push(`User's name: ${userName}`);
  if (agentName && agentName !== 'web-user') pinnedParts.push(`Agent name: ${agentName}`);
  if (userNotes) pinnedParts.push(`User notes: ${userNotes}`);

  // Local-only section — sensitive data that should NEVER reach the LLM API.
  // The PII scrubber strips everything between LOCAL-ONLY markers before sending.
  const localOnlyNotes = repo.getSetting('localOnlyNotes') || '';
  if (localOnlyNotes) {
    pinnedParts.push(`\n--- LOCAL-ONLY (never send to LLM) ---\n${localOnlyNotes}\n--- END LOCAL-ONLY ---`);
  }

  const pinnedContext = pinnedParts.join('\n');

  const contextMaxMessages = Number(repo.getSetting('contextMaxMessages')) || 30;
  const contextKeepRecent = Number(repo.getSetting('contextKeepRecent')) || 8;
  const contextUseLLM = repo.getSetting('contextUseLLM') === 'true';

  // Compression callback — emits SSE with reasoning + consequences
  const onCompression = (event: CompressionEvent) => {
    sendSSE('context_compressed', {
      tier: event.tier,
      messagesCompressed: event.messagesCompressed,
      reasoning: event.reasoning,
      consequences: event.consequences,
    });
  };

  // --- Security Advisor: LLM-powered command explanations ---
  const advisor = new SecurityAdvisor(llm, explanationLanguage || 'English');
  const advisorContext = { goal, skill: selectedSkillName, previousCommands: [] as string[], cwd: terminalCwd };

  const runId = `web_${Date.now()}`;
  const accessContext: AccessContext = {
    principal: { id: agentName || 'web-user', roles: ['user'] },
    runId,
  };

  // Save run to database
  repo.createRun(runId, goal, selectedSkillName, accessContext.principal.id);

  const auditLog: AuditEntry[] = [];
  function auditHandler(entry: AuditEntry): void {
    auditLog.push(entry);
  }

  // Real-time step callback with workspace enrichment + DB persistence
  function onStep(event: AgentStepEvent): void {
    // Enrich tool events with workspace info
    if ((event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'tool_denied') && event.tool) {
      const ws = getToolWorkspace(event.tool, event.args || {});
      if (event.type === 'tool_result') {
        ws.status = 'Done';
      }
      event.workspace = ws;
    }

    // --- Security Advisor: explain terminal commands in human language ---
    if (event.type === 'tool_call' && event.tool === 'terminal_run') {
      const command = String(event.args?.['command'] || '');
      if (command) {
        advisorContext.previousCommands.push(command);
        // Try quick (free) explanation first
        const quick = advisor.quickExplain(command);
        if (quick) {
          sendSSE('command_explained', { command, explanation: quick, source: 'quick' });
        } else {
          // Full LLM analysis (async — don't block the agent loop)
          advisor.explain(command, advisorContext).then(explanation => {
            sendSSE('command_explained', { command, explanation, source: 'llm' });
          }).catch(() => { /* ignore advisor failures */ });
        }
      }
    }

    // Log security blocks
    if (event.type === 'tool_denied' && event.error?.includes('[SECURITY')) {
      repo.addSecurityEvent('BLOCK', 'BLOCKED', {
        runId,
        toolName: event.tool,
        command: String(event.args?.['command'] || ''),
        explanation: event.error,
      });
    }

    // --- Prompt injection detected in tool result ---
    if (event.type === 'injection_detected') {
      sendSSE('injection_detected', {
        tool: event.tool,
        detections: event.detections,
        content: event.content,
      });
      const firstDetection = event.detections?.[0];
      repo.addSecurityEvent('WARN', 'INJECTION_DETECTED', {
        runId,
        toolName: event.tool,
        category: firstDetection?.category,
        explanation: firstDetection?.reason,
      });
    }

    // --- LLM output leak detected (canary / system prompt) ---
    if (event.type === 'output_leak') {
      sendSSE('output_leak', {
        leak: event.leak,
        content: event.content,
      });
      repo.addSecurityEvent('BLOCK', 'OUTPUT_LEAK', {
        runId,
        category: event.leak?.type,
        explanation: event.leak?.reason,
      });
    }

    // Save step to database
    try {
      repo.addStep(
        runId,
        event.step,
        event.type,
        event.tool,
        event.args,
        event.result,
        event.content,
        event.error,
      );
    } catch {
      // DB error should not break the agent loop
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
        systemPrompt: fullSystemPrompt,
        onStep,
        contextWindow: {
          maxMessages: contextMaxMessages,
          keepRecent: contextKeepRecent,
          keepMedium: Math.max(4, Math.floor(contextKeepRecent)),
          useLLMSummary: contextUseLLM,
          pinnedContext,
          onCompression,
        },
        piiScrubber: {
          scrubEmails: repo.getSetting('scrubEmails') === 'true',
          scrubPhones: repo.getSetting('scrubPhones') === 'true',
          scrubPrivateIPs: true,
          onRedaction: (event: RedactionEvent) => {
            sendSSE('pii_redacted', {
              type: event.type,
              count: event.count,
              preview: event.preview,
            });
          },
        },
        // --- Input Sanitizer: detect prompt injection in external data ---
        inputSanitizer: {
          onDetection: (detection) => {
            sendSSE('injection_detected', {
              tool: 'sanitizer',
              detections: [detection],
              content: `Injection pattern: ${detection.category} — ${detection.reason}`,
            });
          },
        },
        // Tools whose results come from untrusted external sources
        untrustedTools: ['telegram_read', 'browser_open', 'browser_search'],
        // System prompt fragments to monitor for leakage
        systemPromptFragments: [
          'Security Skill:',
          'Safety Rules (MUST follow)',
          'You MUST NOT attempt to use these tools',
        ],
      }
    );

    // Update run in database
    repo.finishRun(runId, state.currentStep, state.finalAnswer);

    sendSSE('done', {
      runId: state.runId,
      steps: state.currentStep,
      maxSteps: state.maxSteps,
      done: state.done,
      finalAnswer: state.finalAnswer,
      principalId: state.principalId,
      skill: selectedSkillName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Agent error:', message);
    repo.failRun(runId, message);
    sendSSE('error', { error: message });
  }

  res.end();
});

// ============================================================================
// TELEGRAM AUTO-RESPONDER (background polling)
// ============================================================================

let tgPollingActive = false;
let tgPollingTimer: ReturnType<typeof setTimeout> | null = null;
let tgLastUpdateId = 0;

/**
 * Start Telegram polling loop.
 * Checks for new messages every 3 seconds, runs agent for each, sends reply.
 * Settings are reloaded from DB on each poll cycle so UI changes take effect immediately.
 */
function startTelegramPolling(): void {
  // Initial config check — log clearly what's missing
  const savedSettings = repo.getAllSettings();
  const channelsRaw = savedSettings['channels'];
  let channels: Record<string, unknown> | null = null;
  try { channels = channelsRaw ? JSON.parse(channelsRaw) : null; } catch { channels = null; }

  const tgConfig = channels?.telegram as Record<string, string> | undefined;
  const botToken = tgConfig?.botToken || '';
  if (!botToken) {
    console.log('  [TG] ⚠ Bot token not configured — go to Settings → Telegram and enter your bot token');
    tgPollingActive = false;
    return;
  }

  const apiKey = repo.getSecret('apiKey') || '';
  const model = savedSettings['model'] || '';
  if (!apiKey) {
    console.log('  [TG] ⚠ API key not configured — go to Settings and enter your LLM API key');
    tgPollingActive = false;
    return;
  }
  if (!model) {
    console.log('  [TG] ⚠ Model not selected — go to Settings and choose a model');
    tgPollingActive = false;
    return;
  }

  tgPollingActive = true;

  async function poll(): Promise<void> {
    if (!tgPollingActive) return;

    // Reload settings from DB on each cycle (so UI changes take effect)
    const settings = repo.getAllSettings();
    const chRaw = settings['channels'];
    let ch: Record<string, unknown> | null = null;
    try { ch = chRaw ? JSON.parse(chRaw) : null; } catch { ch = null; }

    const tgCfg = ch?.telegram as Record<string, string> | undefined;
    const token = tgCfg?.botToken || '';
    if (!token) {
      console.log('  [TG] Bot token removed from settings — stopping polling');
      tgPollingActive = false;
      return;
    }

    const key = repo.getSecret('apiKey') || '';
    const mdl = settings['model'] || '';
    const bUrl = settings['baseUrl'] || 'https://api.openai.com/v1';
    const skName = settings['tgSkill'] || settings['skill'] || 'web-researcher';
    const skill = allSkills.get(skName) || getBuiltinSkill('web-researcher')!;

    if (!key || !mdl) {
      console.log('  [TG] API key or model removed — pausing polling');
      tgPollingTimer = setTimeout(poll, 10000);
      return;
    }

    const TG_API = `https://api.telegram.org/bot${token}`;

    try {
      // Use POST with JSON body — cleaner than URL params for arrays
      const getUpdatesBody: Record<string, unknown> = {
        timeout: 5,
        allowed_updates: ['message'],
      };
      if (tgLastUpdateId > 0) getUpdatesBody.offset = tgLastUpdateId + 1;

      const resp = await fetch(`${TG_API}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getUpdatesBody),
      });
      const data = await resp.json() as {
        ok?: boolean;
        description?: string;
        result?: Array<{
          update_id: number;
          message?: { message_id: number; chat: { id: number; first_name?: string }; text?: string; date: number };
        }>;
      };

      if (!data.ok || !data.result) {
        console.error(`  [TG] getUpdates failed: ${data.description || 'unknown error'}`);
        tgPollingTimer = setTimeout(poll, 5000);
        return;
      }

      for (const update of data.result) {
        tgLastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg?.text) continue;

        const chatId = msg.chat.id;
        const userText = msg.text;
        const userName = msg.chat.first_name || 'User';

        console.log(`  [TG] Message from ${userName}: ${userText.slice(0, 80)}`);

        // Run agent with the message as goal
        try {
          const enabledToolNames: string[] = [];
          if (skill.allowedTools.includes('*')) {
            enabledToolNames.push('telegram_send', 'telegram_read', 'browser_open', 'browser_search', 'create_task', 'get_weather');
          } else {
            enabledToolNames.push(...skill.allowedTools);
          }

          const toolRegistry = createDemoTools(enabledToolNames, ch || undefined);
          const { policy } = skillToAccessPolicy(skill);
          toolRegistry.setAccessPolicy(policy);

          const memory = new BufferMemory();
          const llm = new OpenAIAdapter({
            model: mdl,
            baseUrl: bUrl.replace(/\/+$/, ''),
            apiKey: key,
          });

          const goalText = `User "${userName}" sent a Telegram message: "${userText}". Respond helpfully and concisely. Do NOT use telegram_send — your final answer will be sent automatically.`;
          const runId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

          repo.createRun(runId, goalText, skName);

          const state = await runAgentLoop(
            { goal: goalText, runId },
            memory, toolRegistry, llm, null,
            {
              maxSteps: 8,
              systemPrompt: 'You are a helpful AI assistant responding to Telegram messages. Be concise. CRITICAL RULE: You MUST ALWAYS reply in the SAME language the user writes in. If the user writes in Russian — reply in Russian. If in English — reply in English. Even if fetched content is in another language, translate your answer to the user\'s language. Never switch languages.',
            }
          );

          const reply = state.finalAnswer || 'Sorry, I could not process your request.';

          // Send reply — validate response
          const sendResp = await fetch(`${TG_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: reply,
              parse_mode: 'Markdown',
            }),
          });

          if (!sendResp.ok) {
            const sendErr = await sendResp.json().catch(() => ({})) as Record<string, unknown>;
            console.error(`  [TG] sendMessage failed: ${sendErr?.description || sendResp.statusText}`);
            // Retry without Markdown parse_mode (some chars break it)
            await fetch(`${TG_API}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: reply }),
            }).catch(() => {});
          }

          console.log(`  [TG] Reply sent to ${userName} (${reply.length} chars)`);
          repo.finishRun(runId, state.currentStep, reply);
        } catch (err) {
          console.error(`  [TG] Agent error for "${userText.slice(0, 40)}":`, err instanceof Error ? err.message : err);
          // Send error reply
          await fetch(`${TG_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: 'Sorry, an error occurred while processing your message.',
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('  [TG] Polling error:', err instanceof Error ? err.message : err);
    }

    tgPollingTimer = setTimeout(poll, 3000);
  }

  // Verify bot token with getMe before starting
  const TG_API_INIT = `https://api.telegram.org/bot${botToken}`;
  fetch(`${TG_API_INIT}/getMe`)
    .then(r => r.json())
    .then((me: Record<string, unknown>) => {
      if ((me as { ok?: boolean }).ok) {
        const bot = (me as { result?: { username?: string } }).result;
        console.log(`  [TG] ✓ Bot verified: @${bot?.username || 'unknown'}`);
        console.log(`  [TG] Polling started (skill: ${savedSettings['tgSkill'] || savedSettings['skill'] || 'web-researcher'}, model: ${model})`);
        poll();
      } else {
        console.error(`  [TG] ✗ Bot token invalid — getMe failed: ${JSON.stringify(me)}`);
        tgPollingActive = false;
      }
    })
    .catch(err => {
      console.error(`  [TG] ✗ Cannot reach Telegram API:`, err instanceof Error ? err.message : err);
      tgPollingActive = false;
    });
}

function stopTelegramPolling(): void {
  tgPollingActive = false;
  if (tgPollingTimer) { clearTimeout(tgPollingTimer); tgPollingTimer = null; }
  console.log('  [TG] Telegram polling stopped');
}

// --- API: start/stop Telegram polling ---
app.post('/api/telegram/start', requireAuth, (_req, res) => {
  if (tgPollingActive) return res.json({ ok: true, status: 'already_running' });
  startTelegramPolling();
  res.json({ ok: true, status: tgPollingActive ? 'started' : 'missing_config' });
});

app.post('/api/telegram/stop', requireAuth, (_req, res) => {
  stopTelegramPolling();
  res.json({ ok: true, status: 'stopped' });
});

app.get('/api/telegram/status', requireAuth, (_req, res) => {
  res.json({ active: tgPollingActive, lastUpdateId: tgLastUpdateId });
});

// ============================================================================
// DISCORD AUTO-RESPONDER (background polling)
// ============================================================================

let dcPollingActive = false;
let dcPollingTimer: ReturnType<typeof setTimeout> | null = null;
let dcLastMessageId = '';

function startDiscordPolling(): void {
  const savedSettings = repo.getAllSettings();
  const channelsRaw = savedSettings['channels'];
  let channels: Record<string, unknown> | null = null;
  try { channels = channelsRaw ? JSON.parse(channelsRaw) : null; } catch { channels = null; }

  const dcConfig = channels?.discord as Record<string, string> | undefined;
  const botToken = dcConfig?.botToken || '';
  const channelId = dcConfig?.channelId || '';
  if (!botToken || !channelId) {
    console.log('  [DC] ⚠ Discord bot token or channel ID not configured');
    dcPollingActive = false;
    return;
  }

  const apiKey = repo.getSecret('apiKey') || '';
  const model = savedSettings['model'] || '';
  if (!apiKey || !model) {
    console.log('  [DC] ⚠ API key or model not configured');
    dcPollingActive = false;
    return;
  }

  const DC_API = 'https://discord.com/api/v10';
  dcPollingActive = true;

  // Get bot's own user ID to ignore own messages
  let botUserId = '';
  fetch(`${DC_API}/users/@me`, { headers: { Authorization: `Bot ${botToken}` } })
    .then(r => r.json())
    .then((data: { id?: string; username?: string }) => {
      botUserId = data.id || '';
      console.log(`  [DC] ✓ Bot verified: ${data.username || 'unknown'}`);
    })
    .catch(err => { console.error('  [DC] ✗ Cannot verify bot:', err instanceof Error ? err.message : err); });

  async function poll(): Promise<void> {
    if (!dcPollingActive) return;

    // Reload settings from DB on each cycle
    const settings = repo.getAllSettings();
    const chRaw = settings['channels'];
    let ch: Record<string, unknown> | null = null;
    try { ch = chRaw ? JSON.parse(chRaw) : null; } catch { ch = null; }

    const dcCfg = ch?.discord as Record<string, string> | undefined;
    const token = dcCfg?.botToken || '';
    const chId = dcCfg?.channelId || '';
    if (!token || !chId) { dcPollingActive = false; return; }

    const key = repo.getSecret('apiKey') || '';
    const mdl = settings['model'] || '';
    const bUrl = settings['baseUrl'] || 'https://api.openai.com/v1';
    const skName = settings['dcSkill'] || settings['skill'] || 'web-researcher';
    const skill = allSkills.get(skName) || getBuiltinSkill('web-researcher')!;
    if (!key || !mdl) { dcPollingTimer = setTimeout(poll, 10000); return; }

    try {
      const url = dcLastMessageId
        ? `${DC_API}/channels/${chId}/messages?after=${dcLastMessageId}&limit=10`
        : `${DC_API}/channels/${chId}/messages?limit=1`;

      const resp = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
      if (!resp.ok) {
        console.error(`  [DC] API error: ${resp.status} ${resp.statusText}`);
        dcPollingTimer = setTimeout(poll, 5000);
        return;
      }

      const messages = (await resp.json()) as Array<{ id: string; content: string; author: { id: string; username: string; bot?: boolean }; timestamp: string }>;
      if (!Array.isArray(messages) || messages.length === 0) {
        dcPollingTimer = setTimeout(poll, 3000);
        return;
      }

      messages.reverse();

      if (!dcLastMessageId) {
        dcLastMessageId = messages[messages.length - 1].id;
        dcPollingTimer = setTimeout(poll, 3000);
        return;
      }

      for (const msg of messages) {
        dcLastMessageId = msg.id;
        if (msg.author.bot || msg.author.id === botUserId) continue;
        if (!msg.content) continue;

        console.log(`  [DC] Message from ${msg.author.username}: ${msg.content.slice(0, 80)}`);

        try {
          const enabledToolNames: string[] = skill.allowedTools.includes('*')
            ? ['browser_open', 'browser_search', 'create_task', 'get_weather']
            : [...skill.allowedTools];

          const toolRegistry = createDemoTools(enabledToolNames, ch || undefined);
          const { policy } = skillToAccessPolicy(skill);
          toolRegistry.setAccessPolicy(policy);

          const memory = new BufferMemory();
          const llm = new OpenAIAdapter({ model: mdl, baseUrl: bUrl.replace(/\/+$/, ''), apiKey: key });

          const goalText = `User "${msg.author.username}" sent a Discord message: "${msg.content}". Respond helpfully and concisely.`;
          const runId = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          repo.createRun(runId, goalText, skName);

          const state = await runAgentLoop(
            { goal: goalText, runId },
            memory, toolRegistry, llm, null,
            { maxSteps: 8, systemPrompt: 'You are a helpful AI assistant in a Discord channel. Be concise. Answer in the same language the user writes in.' }
          );

          const reply = state.finalAnswer || 'Sorry, I could not process your request.';
          const truncatedReply = reply.length > 1900 ? reply.slice(0, 1900) + '...' : reply;

          const sendResp = await fetch(`${DC_API}/channels/${chId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: truncatedReply }),
          });

          if (!sendResp.ok) {
            console.error(`  [DC] sendMessage failed: ${sendResp.status} ${sendResp.statusText}`);
          } else {
            console.log(`  [DC] Reply sent to ${msg.author.username} (${reply.length} chars)`);
          }
          repo.finishRun(runId, state.currentStep, reply);
        } catch (err) {
          console.error(`  [DC] Agent error:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('  [DC] Polling error:', err instanceof Error ? err.message : err);
    }
    dcPollingTimer = setTimeout(poll, 3000);
  }

  console.log(`  [DC] Discord polling started (channel: ${channelId})`);
  poll();
}

function stopDiscordPolling(): void {
  dcPollingActive = false;
  if (dcPollingTimer) { clearTimeout(dcPollingTimer); dcPollingTimer = null; }
  console.log('  [DC] Discord polling stopped');
}

app.post('/api/discord/start', requireAuth, (_req, res) => {
  if (dcPollingActive) return res.json({ ok: true, status: 'already_running' });
  startDiscordPolling();
  res.json({ ok: true, status: dcPollingActive ? 'started' : 'missing_config' });
});

app.post('/api/discord/stop', requireAuth, (_req, res) => {
  stopDiscordPolling();
  res.json({ ok: true, status: 'stopped' });
});

app.get('/api/discord/status', requireAuth, (_req, res) => {
  res.json({ active: dcPollingActive });
});

// ============================================================================
// SLACK AUTO-RESPONDER (background polling)
// ============================================================================

let slPollingActive = false;
let slPollingTimer: ReturnType<typeof setTimeout> | null = null;
let slLastTs = '';

function startSlackPolling(): void {
  const savedSettings = repo.getAllSettings();
  const channelsRaw = savedSettings['channels'];
  let channels: Record<string, unknown> | null = null;
  try { channels = channelsRaw ? JSON.parse(channelsRaw) : null; } catch { channels = null; }

  const slConfig = channels?.slack as Record<string, string> | undefined;
  const botToken = slConfig?.botToken || '';
  const channelId = slConfig?.channelId || '';
  if (!botToken || !channelId) {
    console.log('  [SL] ⚠ Slack bot token or channel ID not configured');
    slPollingActive = false;
    return;
  }

  const apiKey = repo.getSecret('apiKey') || '';
  const model = savedSettings['model'] || '';
  if (!apiKey || !model) {
    console.log('  [SL] ⚠ API key or model not configured');
    slPollingActive = false;
    return;
  }

  slPollingActive = true;

  // Get bot's own user ID
  let botUserId = '';
  fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
  }).then(r => r.json())
    .then((data: { ok?: boolean; user_id?: string; user?: string }) => {
      botUserId = data.user_id || '';
      if (data.ok) console.log(`  [SL] ✓ Bot verified: ${data.user || 'unknown'}`);
      else console.error('  [SL] ✗ Slack auth.test failed');
    })
    .catch(err => { console.error('  [SL] ✗ Cannot verify bot:', err instanceof Error ? err.message : err); });

  async function poll(): Promise<void> {
    if (!slPollingActive) return;

    // Reload settings from DB on each cycle
    const settings = repo.getAllSettings();
    const chRaw = settings['channels'];
    let ch: Record<string, unknown> | null = null;
    try { ch = chRaw ? JSON.parse(chRaw) : null; } catch { ch = null; }

    const slCfg = ch?.slack as Record<string, string> | undefined;
    const token = slCfg?.botToken || '';
    const chId = slCfg?.channelId || '';
    if (!token || !chId) { slPollingActive = false; return; }

    const key = repo.getSecret('apiKey') || '';
    const mdl = settings['model'] || '';
    const bUrl = settings['baseUrl'] || 'https://api.openai.com/v1';
    const skName = settings['slSkill'] || settings['skill'] || 'web-researcher';
    const skill = allSkills.get(skName) || getBuiltinSkill('web-researcher')!;
    if (!key || !mdl) { slPollingTimer = setTimeout(poll, 10000); return; }

    try {
      const params = new URLSearchParams({ channel: chId, limit: '10' });
      if (slLastTs) params.set('oldest', slLastTs);

      const resp = await fetch(`https://slack.com/api/conversations.history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as {
        ok?: boolean;
        error?: string;
        messages?: Array<{ ts: string; text: string; user?: string; bot_id?: string; subtype?: string }>;
      };

      if (!data.ok || !data.messages || data.messages.length === 0) {
        if (data.error) console.error(`  [SL] API error: ${data.error}`);
        slPollingTimer = setTimeout(poll, 3000);
        return;
      }

      const msgs = [...data.messages].reverse();

      if (!slLastTs) {
        slLastTs = msgs[msgs.length - 1].ts;
        slPollingTimer = setTimeout(poll, 3000);
        return;
      }

      for (const msg of msgs) {
        if (parseFloat(msg.ts) <= parseFloat(slLastTs)) continue;
        slLastTs = msg.ts;

        if (msg.bot_id || msg.subtype || msg.user === botUserId) continue;
        if (!msg.text) continue;

        console.log(`  [SL] Message from ${msg.user}: ${msg.text.slice(0, 80)}`);

        try {
          const enabledToolNames: string[] = skill.allowedTools.includes('*')
            ? ['browser_open', 'browser_search', 'create_task', 'get_weather']
            : [...skill.allowedTools];

          const toolRegistry = createDemoTools(enabledToolNames, ch || undefined);
          const { policy } = skillToAccessPolicy(skill);
          toolRegistry.setAccessPolicy(policy);

          const memory = new BufferMemory();
          const llm = new OpenAIAdapter({ model: mdl, baseUrl: bUrl.replace(/\/+$/, ''), apiKey: key });

          const goalText = `User sent a Slack message: "${msg.text}". Respond helpfully and concisely.`;
          const runId = `sl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          repo.createRun(runId, goalText, skName);

          const state = await runAgentLoop(
            { goal: goalText, runId },
            memory, toolRegistry, llm, null,
            { maxSteps: 8, systemPrompt: 'You are a helpful AI assistant in a Slack channel. Be concise. Answer in the same language the user writes in.' }
          );

          const reply = state.finalAnswer || 'Sorry, I could not process your request.';

          const sendResp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chId, text: reply, thread_ts: msg.ts }),
          });
          const sendData = await sendResp.json().catch(() => ({})) as Record<string, unknown>;

          if (sendData?.ok) {
            console.log(`  [SL] Reply sent in thread (${reply.length} chars)`);
          } else {
            console.error(`  [SL] sendMessage failed: ${sendData?.error || 'unknown'}`);
          }
          repo.finishRun(runId, state.currentStep, reply);
        } catch (err) {
          console.error(`  [SL] Agent error:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('  [SL] Polling error:', err instanceof Error ? err.message : err);
    }
    slPollingTimer = setTimeout(poll, 3000);
  }

  console.log(`  [SL] Slack polling started (channel: ${channelId})`);
  poll();
}

function stopSlackPolling(): void {
  slPollingActive = false;
  if (slPollingTimer) { clearTimeout(slPollingTimer); slPollingTimer = null; }
  console.log('  [SL] Slack polling stopped');
}

app.post('/api/slack/start', requireAuth, (_req, res) => {
  if (slPollingActive) return res.json({ ok: true, status: 'already_running' });
  startSlackPolling();
  res.json({ ok: true, status: slPollingActive ? 'started' : 'missing_config' });
});

app.post('/api/slack/stop', requireAuth, (_req, res) => {
  stopSlackPolling();
  res.json({ ok: true, status: 'stopped' });
});

app.get('/api/slack/status', requireAuth, (_req, res) => {
  res.json({ active: slPollingActive });
});

// ============================================================================
// MCP (Model Context Protocol) INTEGRATION
// ============================================================================

import { McpClient } from '../src/mcp/index.js';
import type { McpServerConfig } from '../src/mcp/index.js';
import fs from 'fs';

const mcpClients = new Map<string, McpClient>();

// Load MCP server configs from data/mcp.json
function loadMcpConfig(): McpServerConfig[] {
  const configPath = path.join(path.dirname(__dirname), 'data', 'mcp.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.servers) ? parsed.servers : [];
  } catch {
    return [];
  }
}

// Save MCP config
function saveMcpConfig(servers: McpServerConfig[]): void {
  const configPath = path.join(path.dirname(__dirname), 'data', 'mcp.json');
  fs.writeFileSync(configPath, JSON.stringify({ servers }, null, 2));
}

// Connect to all configured MCP servers and register their tools
async function initMcpServers(): Promise<void> {
  const servers = loadMcpConfig();
  if (servers.length === 0) return;

  console.log(`  [MCP] Connecting to ${servers.length} server(s)...`);

  for (const config of servers) {
    try {
      const client = new McpClient(config);
      await client.connect();
      const tools = await client.listTools();
      mcpClients.set(config.name, client);
      console.log(`  [MCP] ${config.name}: connected, ${tools.length} tools (${tools.map(t => t.name).join(', ')})`);
    } catch (err) {
      console.error(`  [MCP] ${config.name}: connection failed —`, err instanceof Error ? err.message : err);
    }
  }
}

// Register MCP tools into a ToolRegistry for a specific agent run
function registerMcpTools(registry: ToolRegistry): void {
  for (const [serverName, client] of mcpClients) {
    if (!client.isConnected) continue;

    // Use cached tools from listTools
    client.listTools().then(tools => {
      for (const tool of tools) {
        const fullName = `mcp_${serverName}_${tool.name}`;
        registry.register({
          name: fullName,
          definition: {
            name: fullName,
            description: `[MCP: ${serverName}] ${tool.description}`,
            parameters: tool.inputSchema as Record<string, { type: string; description?: string }>,
          },
          async execute(args) {
            try {
              return await client.callTool(tool.name, args);
            } catch (err) {
              return { error: `MCP tool error: ${err instanceof Error ? err.message : String(err)}` };
            }
          },
        });
      }
    }).catch(() => {});
  }
}

// --- MCP API endpoints ---
app.get('/api/mcp/servers', requireAuth, (_req, res) => {
  const servers = loadMcpConfig();
  const statuses = servers.map(s => ({
    ...s,
    connected: mcpClients.has(s.name) && mcpClients.get(s.name)!.isConnected,
  }));
  res.json(statuses);
});

app.post('/api/mcp/servers', requireAuth, (req, res) => {
  const { servers } = req.body;
  if (!Array.isArray(servers)) return res.status(400).json({ error: 'servers array required' });
  saveMcpConfig(servers);
  res.json({ ok: true, count: servers.length });
});

app.post('/api/mcp/connect', requireAuth, async (_req, res) => {
  // Disconnect existing
  for (const [, client] of mcpClients) { client.disconnect(); }
  mcpClients.clear();
  // Reconnect
  await initMcpServers();
  const status = Array.from(mcpClients.entries()).map(([name, c]) => ({ name, connected: c.isConnected }));
  res.json({ ok: true, servers: status });
});

app.get('/api/mcp/tools', requireAuth, async (_req, res) => {
  const allMcpTools: Array<{ server: string; name: string; description: string }> = [];
  for (const [serverName, client] of mcpClients) {
    if (!client.isConnected) continue;
    try {
      const tools = await client.listTools();
      for (const t of tools) {
        allMcpTools.push({ server: serverName, name: t.name, description: t.description });
      }
    } catch { /* skip */ }
  }
  res.json(allMcpTools);
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

import http from 'http';

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n  TaskPilot Web UI`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Skills: ${Array.from(allSkills.keys()).join(', ')}`);
  console.log(`  Database: ${dbPath}`);

  // Auto-start channel polling if configured
  console.log('  Channels:');
  try { startTelegramPolling(); } catch (e) { console.error('  [TG] Auto-start error:', e instanceof Error ? e.message : e); }
  try { startDiscordPolling(); } catch (e) { console.error('  [DC] Auto-start error:', e instanceof Error ? e.message : e); }
  try { startSlackPolling(); } catch (e) { console.error('  [SL] Auto-start error:', e instanceof Error ? e.message : e); }

  // Auto-connect MCP servers
  initMcpServers().catch(e => console.log('  [MCP] Auto-connect skipped:', e));

  console.log('');
});

server.on('error', (err: Error) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
