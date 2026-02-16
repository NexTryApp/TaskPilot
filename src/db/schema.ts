/**
 * SQLite database schema and initialization.
 * Uses better-sqlite3 for zero-config, single-file persistence.
 * File: data/taskpilot.db
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

/** Default database path. */
export const DEFAULT_DB_PATH = 'data/taskpilot.db';

/** Initialize database with all tables. */
export function initDatabase(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Ensure data directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // --- Runs table: agent execution history ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      skill TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      steps INTEGER DEFAULT 0,
      final_answer TEXT,
      principal_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    )
  `);

  // --- Run steps table: individual steps within a run ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES runs(id),
      step_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      args TEXT,
      result TEXT,
      content TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Security events table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      command TEXT,
      tool_name TEXT,
      severity TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT,
      explanation TEXT,
      explanation_ru TEXT,
      user_decision TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Settings table (key-value) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Custom skills table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_skills (
      name TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Indexes ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_run_id ON security_events(run_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC)`);

  return db;
}
