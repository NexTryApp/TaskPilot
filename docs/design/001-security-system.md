# Design: Security System

**Status:** Implemented
**Files:** `src/security/`

## Problem

AI agents with terminal access can execute destructive commands (`rm -rf /`, `format C:`, `shutdown`). Users need protection without losing agent utility.

## Solution

Three-tier classification of all shell commands:

| Tier | Action | Timeout |
|------|--------|---------|
| BLOCK | Automatic deny, logged | Instant |
| WARN | Pause agent, show modal, user decides | 60 seconds |
| ALLOW | Execute immediately | N/A |

### Components

1. **dangerous-commands.ts** — Pattern matching for 9 categories of dangerous commands across Windows/Linux/macOS
2. **safe-bins.ts** — Whitelist of read-only commands (ls, cat, grep, git status, etc.)
3. **blocked-paths.ts** — Sensitive system paths that must not be accessed
4. **command-chain-analyzer.ts** — Splits `&&`, `||`, `;`, `|` chains and checks each segment
5. **exec-guard.ts** — Central decision engine combining all checks
6. **approval-manager.ts** — Promise-based approval queue with timeout

### Decision Flow (updated Feb 16 — security fix)

```
Command → Blocked path? → YES → BLOCK (even "safe" commands can't touch sensitive paths)
                         → NO  → Safe bin? → YES → ALLOW
                                            → NO  → Skill restrictions check
                                                     → Denied pattern? → BLOCK
                                                     → Not in allowed list? → BLOCK
                                                     → safeBinsOnly? → BLOCK
                                                     → Chain analysis
                                                       → Any BLOCK segment? → BLOCK
                                                       → Any WARN segment?  → WARN (ask user)
                                                       → All safe?          → ALLOW
```

**Critical fix**: Blocked paths are checked BEFORE safe bins. Previously, `cat /etc/shadow` would pass as a "safe bin" and bypass path protection. Now blocked paths always take priority.

### Additional Security Layers (added Feb 16)

- **Session auth**: All sensitive API endpoints require `X-Session-Token` header (token issued via `GET /api/session`, same-origin CORS protection)
- **SSRF filter**: `browser_open` tool blocks localhost, private IPs (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), cloud metadata endpoints, and non-http(s) schemes
- **Rate limiting**: `/api/run` limited to 10 requests per minute per key
- **Encryption**: API keys encrypted with random 32-byte key (persisted in `data/.encryption-key`), not deterministic machine-derived key

## Trade-offs

- **False positives**: Some safe commands containing keywords like "kill" may trigger WARN. Acceptable — user can approve.
- **False negatives**: Novel attack patterns not in blocklist. Mitigated by blockedPaths and safeBinsOnly skill option.
- **No sandboxing of individual commands**: Rely on Docker sandbox for full isolation. Local mode trusts the classification.
- **Session token via same-origin**: Relies on CORS for protection. Not suitable for multi-user deployment without proper auth layer.
