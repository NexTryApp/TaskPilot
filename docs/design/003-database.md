# Design: Database

**Status:** Implemented
**Files:** `src/db/`

## Problem

Need persistent storage for: run history, security audit trail, user settings (including encrypted API keys), and custom skills. Must be zero-config — no external database server.

## Solution

**SQLite** via `better-sqlite3`. Single file at `data/taskpilot.db`.

### Schema

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `runs` | Agent execution history | id, goal, skill, status, created_at, finished_at |
| `run_steps` | Steps within a run | run_id, step_number, event_type, tool_name, args, result |
| `security_events` | Blocked/warned commands | severity, action, command, explanation, user_decision |
| `settings` | Key-value config store | key, value (secrets prefixed with `secret:`) |
| `custom_skills` | User-created skills | name, content |

### Encryption

API keys stored as `secret:apiKey` — encrypted with AES-256-GCM.

Key: Random 32 bytes generated on first run, persisted in `data/.encryption-key` (file mode 0o600). Unique per installation, not guessable.

**Previous approach (removed Feb 16)**: `SHA-256(hostname + username)` — was deterministic and guessable by anyone knowing the machine name and username.

### Access Pattern

All DB operations go through `Repository` class. No raw SQL elsewhere.

WAL mode enabled for concurrent read performance.

## Trade-offs

- **SQLite vs Postgres**: Zero config wins for a desktop app. Can't scale to multi-user server, but that's not the use case.
- **Random encryption key on disk**: Unique per install, won't decrypt on a different machine. If `data/.encryption-key` is lost, encrypted settings must be re-entered.
- **No migrations framework**: `schema.ts` uses `CREATE TABLE IF NOT EXISTS`. Good enough for current scope.
