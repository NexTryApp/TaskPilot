# 006 — SEC-AUDIT-001: Security Chain Audit & Fixes

**Date**: 2026-02-17
**Status**: Complete
**Commit**: `32f4573` (fixes) + `97f58b3` (README)

---

## Context

Full security chain analysis revealed 9 gaps (3 CRITICAL, 2 HIGH, 4 MEDIUM) in the data flow from user input to LLM API and back. Two modules (`InputSanitizer`, `OutputLeakCheck`) were written but not integrated into the agent loop.

## Data Flow (Before Fixes)

```
User Goal → Server → Agent Loop → [PII Scrub] → LLM API
                                        ↓
                            LLM wants tool call
                                        ↓
                    [ExecGuard: paths/bins/patterns/skill]
                                        ↓
                              Tool executes
                                        ↓
                     Result → memory (NO SANITIZATION) ← GAP
                                        ↓
                         Next LLM call (with injected data)
                                        ↓
                     LLM response (NO LEAK CHECK) ← GAP
```

## Fixes Applied

### CRITICAL

| # | Gap | Fix | File |
|---|-----|-----|------|
| C1 | Tool results from `browser_open`, `telegram_read` enter LLM context unsanitized | `InputSanitizer.sanitize()` on untrusted tool results; wrap with `EXTERNAL DATA` boundary markers | `agent-loop.ts` |
| C2 | No output leak detection — LLM can leak system prompt | Canary word injected into system prompt; `checkOutputLeak()` on every LLM response | `agent-loop.ts` |
| C3 | LLM can send secrets via `send_email`/`telegram_send` | PII scrub all string args of outbound tools before execution | `agent-loop.ts` |

### HIGH

| # | Gap | Fix | File |
|---|-----|-----|------|
| H1 | SSRF bypass via HTTP redirect (302 → internal IP) | `redirect: 'manual'` + `checkSsrf()` on redirect target | `server.ts` |
| H2 | Canary word not injected | Auto-generated per run, appended to system prompt | `agent-loop.ts` |

### MEDIUM

| # | Gap | Fix | File |
|---|-----|-----|------|
| M1 | `checkAccess()` skipped when no `accessContext` | Removed early return — policy ALWAYS applies | `tool-registry.ts` |
| M2 | LLM sees all tools including denied ones | `getDefinitions()` filters by `allowedTools`/`deniedTools` | `tool-registry.ts` |
| M3 | Single-bucket rate limit | Per-IP rate limiting with `getClientIP()` | `server.ts` |
| M4 | Session token never rotates | 30-minute TTL rotation + UI auto-refresh at 25 min | `server.ts`, `app.js` |

### LOW (also fixed)

| # | Gap | Fix | File |
|---|-----|-----|------|
| L1 | Rate limit cleanup | `setInterval` cleanup of stale entries every 5 min | `server.ts` |

## Data Flow (After Fixes)

```
User Goal → Server → Agent Loop
                        ↓
           [Context Compress: tier1/2/3 + pinned]
           [PII Scrub: 20+ patterns → [REDACTED:TYPE]]
           [LOCAL-ONLY sections stripped]
           [Canary word in system prompt]
                        ↓
                    LLM API call
                        ↓
           [Output Leak Check: canary + fragments]  ← NEW
                        ↓
               LLM wants tool call
                        ↓
           [Outbound PII scrub on args]  ← NEW
           [ExecGuard: paths/bins/patterns/skill]
           [Approval Manager if WARN]
                        ↓
               Tool executes
                        ↓
           [InputSanitizer on untrusted results]  ← NEW
           [Boundary markers: EXTERNAL DATA]  ← NEW
                        ↓
               Sanitized result → memory
                        ↓
               Next iteration ↑
```

## License Updates

- **Section 2**: Strengthened — attribution with visible active hyperlink is MANDATORY for ALL use (personal + commercial). Commercial use without attribution is explicitly prohibited.
- **Section 3**: Anti-circumvention clause (CSS hiding, display:none, etc.)
- **Section 5**: CLA — contributions licensed under same terms.
- **Section 6**: Patent Grant.

## Files Changed

| File | Lines Changed | What |
|------|--------------|------|
| `src/agent-loop.ts` | +89 | InputSanitizer, OutputLeakCheck, outbound PII scrub, canary |
| `src/security/input-sanitizer.ts` | +336 (new) | Prompt injection detection + canary word system |
| `src/tools/tool-registry.ts` | +17 | Policy always applies, filtered definitions |
| `web/server.ts` | +80 | SSRF redirect fix, per-IP rate limit, token rotation, SSE events |
| `web/public/app.js` | +57 | Injection/leak UI, token auto-refresh |
| `web/public/style.css` | +14 | Injection/leak entry styles |
| `src/index.ts` | +5 | Type exports |
| `src/security/index.ts` | +8 | InputSanitizer exports |
| `LICENSE` | +17 | CLA, patent, attribution enforcement |

## Remaining (LOW risk, acceptable)

- Regex evasion in dangerous-commands (mitigated by multiple layers)
- Encryption key co-located with data (acceptable for local dev tool)
- `git clone` via safe-bins (mitigated by skill access policy)
