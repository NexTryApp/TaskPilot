# Quality Grades — TaskPilot

Updated: 2026-02-16

## Module Quality

| Module | Grade | Notes |
|--------|-------|-------|
| `src/agent-loop.ts` | B | Stable, well-tested. Could use better error recovery. |
| `src/security/dangerous-commands.ts` | A | Comprehensive blocklist, cross-platform. |
| `src/security/exec-guard.ts` | A | Central gate, clean decision flow. |
| `src/security/approval-manager.ts` | B+ | Works well. Could add "remember choice" feature. |
| `src/security/safe-bins.ts` | A | Conservative whitelist, dangerous flag detection. |
| `src/security/command-chain-analyzer.ts` | B+ | Handles common cases. Edge cases with nested quotes possible. |
| `src/security/blocked-paths.ts` | B | Good coverage. Could expand Windows paths. |
| `src/security/security-audit.ts` | B | Scans for common issues. Could add more patterns. |
| `src/skills/builtin-skills.ts` | A | 4 well-defined skills with clear boundaries. |
| `src/skills/skill-loader.ts` | B | Custom YAML parser. Handles common cases, not full YAML spec. |
| `src/skills/skill-to-policy.ts` | A | Clean skill → AccessPolicy conversion. |
| `src/db/schema.ts` | A | Clean schema, WAL mode, proper indexes. |
| `src/db/repository.ts` | A | Full CRUD, no raw SQL leaks. |
| `src/db/crypto.ts` | B+ | Random key on disk (was B: deterministic machine-derived key). |
| `web/server.ts` | B+ | Session auth, CORS, SSRF filter, rate limiting added. Still large — could split. |
| `web/public/app.js` | B- | Works but growing. Could benefit from module splitting. |
| `web/public/style.css` | B+ | Clean dark theme. Good component styles. |
| `web/public/index.html` | B+ | Clean structure. Bilingual labels. |

## Grade Scale

- **A** — Production-ready, well-documented, handles edge cases
- **B** — Working, tested, some improvement opportunities
- **C** — Functional but needs refactoring
- **D** — Technical debt, should be addressed soon

## Known Technical Debt

1. `web/server.ts` is 760 lines — should split into route modules
2. `web/public/app.js` — no module system, all in one file
3. No automated tests (unit or integration)
4. Skill loader doesn't handle full YAML spec (arrays in arrays, etc.)
5. No "remember approval choice" feature
6. Security audit could have more patterns
