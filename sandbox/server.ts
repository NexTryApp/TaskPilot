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

const execAsync = promisify(execCb);

const app = express();
const PORT = 3001;
const MAX_OUTPUT = 64 * 1024; // 64 KB
const DEFAULT_TIMEOUT = 30_000; // 30 seconds

app.use(express.json());

// --- Healthcheck ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Execute command ---
app.post('/exec', async (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`  TaskPilot Sandbox`);
  console.log(`  Listening on port ${PORT}`);
  console.log(`  CWD: /app/data`);
});
