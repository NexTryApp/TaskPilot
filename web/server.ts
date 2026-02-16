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
  CommandExplanation,
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

// --- Security: Session token (generated on startup, required for API write operations) ---
const SESSION_TOKEN = randomBytes(32).toString('hex');

/** Middleware: require session token for sensitive endpoints */
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = String(req.headers['x-session-token'] || '');
  if (token === SESSION_TOKEN) { next(); return; }
  res.status(401).json({ error: 'Unauthorized — missing or invalid session token' });
}

// --- Session handshake: UI fetches token on load (same-origin protected by CORS) ---
app.get('/api/session', (_req, res) => {
  res.json({ token: SESSION_TOKEN });
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

// --- Rate Limiting ---
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 runs per minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

// Channel config passed from UI for real tool execution
let terminalCwd: string | undefined;
let terminalShell: string | undefined;

function createDemoTools(enabledTools: string[], channelConfig?: Record<string, unknown>): ToolRegistry {
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

        // --- SSRF Protection: block internal/private URLs ---
        const ssrfError = checkSsrf(url);
        if (ssrfError) return { url, error: ssrfError, status: 0 };

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
    descriptionRu: skill.descriptionRu,
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
  // Save other settings as plain text
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'string') {
      repo.setSetting(key, value);
    }
  }
  res.json({ ok: true });
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
  if (!checkRateLimit('run')) {
    return res.status(429).json({ error: 'Rate limit exceeded — max 10 runs per minute' });
  }

  const {
    baseUrl, apiKey, model, goal,
    channels, maxSteps, maxTokens, systemPrompt,
    agentName,
    // REMOVED: accessPolicy (replaced by skill-based policy)
    skill: skillName,  // NEW: skill selection
  } = req.body;

  // Resolve skill (default: web-researcher)
  const selectedSkillName = skillName || 'web-researcher';
  const selectedSkill = allSkills.get(selectedSkillName) || getBuiltinSkill('web-researcher')!;

  // Derive enabled tools from skill (not from channels anymore — skill controls this)
  const enabledToolNames: string[] = [];
  if (selectedSkill.allowedTools.includes('*')) {
    // All tools allowed by skill — but still filter by what channels are enabled
    if (channels?.telegram) { enabledToolNames.push('telegram_send', 'telegram_read'); }
    if (channels?.discord) { enabledToolNames.push('telegram_send', 'telegram_read'); }
    if (channels?.whatsapp) { enabledToolNames.push('telegram_send'); }
    if (channels?.slack) { enabledToolNames.push('telegram_send'); }
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
        reasonRu: approval.decision.reasonRu,
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
        explanationRu: approval.decision.reasonRu,
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
      descriptionRu: selectedSkill.descriptionRu,
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

  // --- Security Advisor: LLM-powered command explanations ---
  const advisor = new SecurityAdvisor(llm);
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
// SERVER STARTUP
// ============================================================================

import http from 'http';

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n  TaskPilot Web UI`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Skills: ${Array.from(allSkills.keys()).join(', ')}`);
  console.log(`  Database: ${dbPath}\n`);
});

server.on('error', (err: Error) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
