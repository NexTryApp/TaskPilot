/**
 * TaskPilot Sandbox — isolated command execution server.
 * Runs inside a Docker container to provide a safe environment
 * for agent terminal commands, fully isolated from the host.
 *
 * Endpoints:
 *   POST /exec   — execute a shell command
 *   GET  /health — healthcheck
 */

import express from 'express';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { timingSafeEqual } from 'crypto';

const execAsync = promisify(execCb);

const app = express();
const PORT = 3001;
const MAX_OUTPUT = 64 * 1024; // 64 KB
const DEFAULT_TIMEOUT = 30_000; // 30 seconds

// SECURITY: shared-secret authentication between the main TaskPilot server and
// this sandbox. Both must read SANDBOX_SECRET from env. Without it, anyone with
// network access to port 3001 could execute arbitrary shell commands (the whole
// point of this sandbox is to BE the place where untrusted commands run — so
// outside its own isolation, nothing else should be able to drive it).
const SANDBOX_SECRET = process.env['SANDBOX_SECRET'] || '';

function requireSandboxAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!SANDBOX_SECRET) {
    // Fail-closed if no secret was configured at startup — the sandbox shouldn't
    // run in an unauthenticated state, even briefly.
    res.status(503).json({ error: 'Sandbox not configured: SANDBOX_SECRET env var missing' });
    return;
  }
  const provided = String(req.headers['x-sandbox-token'] || '');
  const expected = SANDBOX_SECRET;
  if (provided.length !== expected.length) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    if (timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      next();
      return;
    }
  } catch {
    // timingSafeEqual throws if buffer lengths differ — already handled above.
  }
  res.status(401).json({ error: 'Unauthorized' });
}

app.use(express.json());

// --- Healthcheck (unauthenticated — used by docker-compose healthcheck) ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Execute command ---
app.post('/exec', requireSandboxAuth, async (req, res) => {
  const { command, timeout, cwd } = req.body as {
    command?: string;
    timeout?: number;
    cwd?: string;
  };

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command is required (string)' });
  }

  const timeoutMs = typeof timeout === 'number' && timeout > 0
    ? Math.min(timeout, 120_000) // cap at 2 minutes
    : DEFAULT_TIMEOUT;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT,
      cwd: cwd || '/app/data',
      shell: '/bin/bash',
    });

    res.json({
      command,
      exitCode: 0,
      stdout: stdout.slice(0, MAX_OUTPUT),
      stderr: stderr.slice(0, MAX_OUTPUT),
    });
  } catch (err: unknown) {
    const e = err as {
      code?: number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    res.json({
      command,
      exitCode: e.code ?? 1,
      killed: e.killed ?? false,
      stdout: (e.stdout || '').slice(0, MAX_OUTPUT),
      stderr: (e.stderr || e.message || 'Unknown error').slice(0, MAX_OUTPUT),
    });
  }
});

// SECURITY: inside the docker-compose stack the sandbox needs to be reachable
// from the `taskpilot` service over the docker bridge network, so `0.0.0.0` is
// expected there. Outside docker-compose (`tsx sandbox/server.ts` run directly)
// that would open port 3001 on the host. Default to 127.0.0.1 in that case and
// require explicit `SANDBOX_BIND=0.0.0.0` to allow the docker pattern.
const SANDBOX_BIND = process.env['SANDBOX_BIND'] || '127.0.0.1';
app.listen(PORT, SANDBOX_BIND, () => {
  console.log(`  TaskPilot Sandbox`);
  console.log(`  Listening on ${SANDBOX_BIND}:${PORT}`);
  console.log(`  CWD: /app/data`);
  if (!SANDBOX_SECRET) {
    console.warn(`  WARNING: SANDBOX_SECRET not set — /exec requests will be rejected with 503.`);
  }
});
