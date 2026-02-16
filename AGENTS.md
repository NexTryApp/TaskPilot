# AGENTS.md — TaskPilot Engineering Harness

> This file is the **map** for AI agents working in this repo.
> Keep it under 100 lines. Point to `docs/` for details.

## Repository Overview

TaskPilot is a secure AI agent framework. TypeScript/Node.js, SQLite, Express, SSE streaming.

**Entry point:** `npx tsx web/server.ts` (port 4242)

## Architecture

- `src/agent-loop.ts` — Core loop: goal → LLM → tool → result → repeat
- `src/security/` — Three-tier safety: BLOCK / WARN / ALLOW + approval workflow + LLM advisor
- `src/skills/` — Skill definitions that control tool access per agent run
- `src/db/` — SQLite persistence (runs, steps, security events, encrypted settings)
- `src/tools/` — Tool registry with AccessPolicy enforcement
- `src/memory/` — Buffer (short-term) + long-term context
- `src/llm/` — OpenAI-compatible adapter (15+ providers)
- `web/server.ts` — Express server, all API endpoints, SSE streaming
- `web/public/` — Single-page app (HTML/CSS/JS)
- `skills/` — Skill `.md` files with YAML frontmatter

See: [docs/architecture.md](docs/architecture.md)

## Golden Principles

**Read before making any change:** [golden-principles.md](golden-principles.md)

Key rules:
1. Security checks in `src/security/` — never bypass, never weaken
2. All tool calls go through ToolRegistry → AccessPolicy → ExecGuard
3. API keys encrypted (AES-256-GCM) — never store plaintext
4. Commands classified: BLOCK (never), WARN (ask user), ALLOW (safe)
5. Skills define boundaries — respect `allowedTools` / `deniedTools`

## Testing

```bash
npx tsc --noEmit          # Type check
npx tsx scripts/security-audit.ts  # Security scan
```

## Key Decisions

| Decision | Why |
|----------|-----|
| SQLite (not Postgres) | Zero-config, single file, no Docker needed |
| AES-256-GCM for secrets | Random key in `data/.encryption-key`, prevents plaintext in DB |
| Skill → AccessPolicy | Reuses existing ToolRegistry, no engine changes |
| YAML frontmatter in .md | Human-readable, easy to create custom skills |
| SSE (not WebSocket) | Simpler, one-directional, sufficient for streaming |
| Express (not Fastify) | Already in use, stable, well-known |

## File Naming

- TypeScript: `kebab-case.ts` (e.g. `dangerous-commands.ts`)
- Skills: `kebab-case.md` (e.g. `web-researcher.md`)
- Exports: re-exported via `index.ts` in each module directory

## Docs Index

| Document | What |
|----------|------|
| [docs/architecture.md](docs/architecture.md) | System layers and data flow |
| [docs/design/001-security-system.md](docs/design/001-security-system.md) | Security classification design |
| [docs/design/002-skill-system.md](docs/design/002-skill-system.md) | Skill definition and loading |
| [docs/design/003-database.md](docs/design/003-database.md) | SQLite schema and encryption |
| [docs/design/004-approval-flow.md](docs/design/004-approval-flow.md) | User approval workflow |
| [docs/design/005-security-advisor.md](docs/design/005-security-advisor.md) | LLM-powered command explanations |
| [docs/quality.md](docs/quality.md) | Quality grades per module |
| [golden-principles.md](golden-principles.md) | Code rules for agents and humans |
| [SECURITY.md](SECURITY.md) | Security model overview |

## Common Tasks

**Add a new built-in skill:** Edit `src/skills/builtin-skills.ts`, add entry to `BUILTIN_SKILLS` map.

**Add a new dangerous command pattern:** Edit `src/security/dangerous-commands.ts`, add to appropriate category.

**Add a new safe binary:** Edit `src/security/safe-bins.ts`, add to `SAFE_BINS` set.

**Add a new API endpoint:** Edit `web/server.ts`, follow existing patterns.

**Add a new tool:** Edit `web/server.ts` → `createDemoTools()`, add to `TOOL_CATALOG`.
