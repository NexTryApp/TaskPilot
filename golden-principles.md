# Golden Principles — TaskPilot

Opinionated, mechanical rules that keep the codebase consistent and agent-legible.
Every contributor (human or AI) must follow these.

---

## 1. Security Is Non-Negotiable

- **Never** weaken security checks in `src/security/`
- **Never** add a command to `SAFE_BINS` without verifying it's truly read-only
- **Never** store API keys, tokens, or passwords in plaintext — use `repo.setSecret()`
- **Never** expose `0.0.0.0` binding without explicit user consent
- **Never** use `eval()`, `Function()`, or `child_process.exec()` without guard
- All terminal commands go through ExecGuard — no exceptions

## 2. Skills Define Boundaries

- A skill's `allowedTools` / `deniedTools` are absolute — never override at runtime
- `securityLevel: safe` skills must not have `terminal_run` in allowedTools
- `securityLevel: full` skills must have explicit `safetyRules`
- Default skill is always `web-researcher` (safest)

## 3. Code Organization

- One module = one directory with `index.ts` re-exports
- File naming: `kebab-case.ts` (not camelCase, not PascalCase)
- Types: export interfaces from the module that owns them
- No circular imports — modules depend downward: `security` ← `skills` ← `db` ← `server`
- Shared types live in `src/types.ts`

## 4. Database

- All DB operations go through `Repository` class — no raw SQL outside `repository.ts` and `schema.ts`
- Secrets encrypted via `crypto.ts` — `setSecret()` / `getSecret()`
- Migrations in `schema.ts` — additive only (never drop tables in production)
- SQLite WAL mode always enabled

## 5. API Design

- REST endpoints: `GET` for reads, `POST` for writes
- SSE for real-time streaming (not WebSocket)
- All responses are JSON
- Error responses: `{ error: string }`
- Security events logged to DB on every BLOCK and WARN

## 6. UI

- Bilingual: Russian + English (Russian first for labels)
- Dark theme first, CSS variables for theming
- No external CSS frameworks — vanilla CSS only
- No external JS frameworks — vanilla JS only
- All DOM manipulation in `app.js`
- HTML structure in `index.html` — no dynamic HTML generation for layout

## 7. Error Handling

- Agent loop errors must not crash the server — catch and send SSE error event
- DB errors must not break the agent loop — catch and continue
- Network timeouts: 15s for browser_open, 10s for browser_search, 30s for terminal_run
- Approval timeout: 60s → automatic deny

## 8. Testing

- `npx tsc --noEmit` must pass with zero errors
- `npx tsx scripts/security-audit.ts` must report zero CRITICAL findings
- Every new security pattern needs a corresponding check in `dangerous-commands.ts`
- Every new skill needs `securityLevel`, `allowedTools`, and at least one `safetyRule`

## 9. Documentation

- `AGENTS.md` — navigational map, under 100 lines
- `README.md` — updated on every feature addition
- `docs/design/` — design docs for major features
- `docs/quality.md` — quality grades per module
- Code comments only where logic is non-obvious

## 10. Dependencies

- Minimize external dependencies
- `better-sqlite3` — only DB dependency
- No YAML parser dependency — custom frontmatter parser in `skill-loader.ts`
- No UI framework — vanilla HTML/CSS/JS
- `express` for server — already present, don't switch
