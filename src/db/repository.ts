/**
 * Data repository: CRUD operations for all database tables.
 * Handles runs, steps, security events, settings, and custom skills.
 */

import type Database from 'better-sqlite3';
import { encrypt, decrypt } from './crypto.js';

// --- Types ---

export interface RunRecord {
  id: string;
  goal: string;
  skill: string | null;
  status: string;
  steps: number;
  final_answer: string | null;
  principal_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface RunStepRecord {
  id: number;
  run_id: string;
  step_number: number;
  event_type: string;
  tool_name: string | null;
  args: string | null;
  result: string | null;
  content: string | null;
  error: string | null;
  created_at: string;
}

export interface SecurityEventRecord {
  id: number;
  run_id: string | null;
  command: string | null;
  tool_name: string | null;
  severity: string;
  action: string;
  category: string | null;
  explanation: string | null;
  explanation_ru: string | null;
  user_decision: string | null;
  created_at: string;
}

// --- Repository class ---

export class Repository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ============ RUNS ============

  createRun(id: string, goal: string, skill?: string, principalId?: string): void {
    this.db.prepare(
      `INSERT INTO runs (id, goal, skill, status, principal_id) VALUES (?, ?, ?, 'running', ?)`
    ).run(id, goal, skill ?? null, principalId ?? null);
  }

  finishRun(id: string, steps: number, finalAnswer?: string): void {
    this.db.prepare(
      `UPDATE runs SET status = 'done', steps = ?, final_answer = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(steps, finalAnswer ?? null, id);
  }

  failRun(id: string, error: string): void {
    this.db.prepare(
      `UPDATE runs SET status = 'error', final_answer = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(error, id);
  }

  getRuns(limit = 50, offset = 0): RunRecord[] {
    return this.db.prepare(
      `SELECT * FROM runs ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as RunRecord[];
  }

  getRun(id: string): RunRecord | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRecord | undefined;
  }

  // ============ RUN STEPS ============

  addStep(
    runId: string,
    stepNumber: number,
    eventType: string,
    toolName?: string,
    args?: Record<string, unknown>,
    result?: unknown,
    content?: string,
    error?: string,
  ): void {
    this.db.prepare(
      `INSERT INTO run_steps (run_id, step_number, event_type, tool_name, args, result, content, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      stepNumber,
      eventType,
      toolName ?? null,
      args ? JSON.stringify(args) : null,
      result !== undefined ? (typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 10000) : null,
      content ?? null,
      error ?? null,
    );
  }

  getSteps(runId: string): RunStepRecord[] {
    return this.db.prepare(
      `SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_number, id`
    ).all(runId) as RunStepRecord[];
  }

  // ============ SECURITY EVENTS ============

  addSecurityEvent(
    severity: string,
    action: string,
    options?: {
      runId?: string;
      command?: string;
      toolName?: string;
      category?: string;
      explanation?: string;
      explanationRu?: string;
      userDecision?: string;
    }
  ): void {
    this.db.prepare(
      `INSERT INTO security_events (run_id, command, tool_name, severity, action, category, explanation, explanation_ru, user_decision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      options?.runId ?? null,
      options?.command ?? null,
      options?.toolName ?? null,
      severity,
      action,
      options?.category ?? null,
      options?.explanation ?? null,
      options?.explanationRu ?? null,
      options?.userDecision ?? null,
    );
  }

  getSecurityEvents(limit = 100, offset = 0): SecurityEventRecord[] {
    return this.db.prepare(
      `SELECT * FROM security_events ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as SecurityEventRecord[];
  }

  // ============ SETTINGS ============

  /** Set a setting (plain text). */
  setSetting(key: string, value: string): void {
    this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  }

  /** Get a setting (plain text). */
  getSetting(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** Set a secret (encrypted). */
  setSecret(key: string, value: string): void {
    const encrypted = encrypt(value);
    this.setSetting(`secret:${key}`, encrypted);
  }

  /** Get a secret (decrypted). */
  getSecret(key: string): string | null {
    const encrypted = this.getSetting(`secret:${key}`);
    if (!encrypted) return null;
    try {
      return decrypt(encrypted);
    } catch {
      return null;
    }
  }

  /** Get all settings (excludes secrets). */
  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare(
      `SELECT key, value FROM settings WHERE key NOT LIKE 'secret:%'`
    ).all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  // ============ CUSTOM SKILLS ============

  saveCustomSkill(name: string, content: string): void {
    this.db.prepare(
      `INSERT INTO custom_skills (name, content, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    ).run(name, content);
  }

  getCustomSkill(name: string): string | null {
    const row = this.db.prepare(`SELECT content FROM custom_skills WHERE name = ?`).get(name) as { content: string } | undefined;
    return row?.content ?? null;
  }

  getAllCustomSkills(): { name: string; content: string }[] {
    return this.db.prepare(`SELECT name, content FROM custom_skills ORDER BY name`).all() as { name: string; content: string }[];
  }

  deleteCustomSkill(name: string): boolean {
    const result = this.db.prepare(`DELETE FROM custom_skills WHERE name = ?`).run(name);
    return result.changes > 0;
  }

  // ============ STATS ============

  getStats(): { totalRuns: number; totalBlocked: number; totalWarned: number; totalAllowed: number } {
    const runs = this.db.prepare(`SELECT COUNT(*) as count FROM runs`).get() as { count: number };
    const blocked = this.db.prepare(`SELECT COUNT(*) as count FROM security_events WHERE action = 'BLOCK'`).get() as { count: number };
    const warned = this.db.prepare(`SELECT COUNT(*) as count FROM security_events WHERE action = 'WARN'`).get() as { count: number };
    const allowed = this.db.prepare(`SELECT COUNT(*) as count FROM security_events WHERE action = 'ALLOW'`).get() as { count: number };
    return {
      totalRuns: runs.count,
      totalBlocked: blocked.count,
      totalWarned: warned.count,
      totalAllowed: allowed.count,
    };
  }
}
