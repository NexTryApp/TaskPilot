# Design: Approval Flow

**Status:** Implemented
**Files:** `src/security/approval-manager.ts`, `web/server.ts`, `web/public/app.js`

## Problem

Some commands are not clearly safe or dangerous — they depend on context. `npm install express` is probably fine. `npm install -g some-unknown-package` is risky. The agent should pause and ask the user.

## Solution

Real-time approval workflow via SSE:

```
Agent → ExecGuard → WARN decision
  → ApprovalManager.requestApproval() → creates Promise
  → Server sends SSE event: approval_needed
  → UI shows modal with command, explanation, 60s timer
  → User clicks Approve or Deny
  → POST /api/approval/:id (requires X-Session-Token header)
  → ApprovalManager.respond() → resolves Promise
  → ExecGuard returns ALLOW or BLOCK
  → Agent continues or gets denial
```

### Timeout

If user doesn't respond within 60 seconds → automatic DENY. This prevents the agent from hanging indefinitely.

### UI Components

- **Approval modal** (overlay): command display, bilingual explanation, countdown timer, Approve/Deny buttons
- **Security feed**: log of all security decisions (blocked, warned, approved, denied, timeout)

### Database Logging

Every approval request and response is logged in `security_events` table with `user_decision` column.

## Trade-offs

- **Blocking the agent loop**: While waiting for approval, the agent does nothing. This is intentional — better than executing a dangerous command.
- **Single approval at a time**: Only one pending approval per run. If agent tries multiple WARN commands, they queue.
- **No "remember my choice"**: Each WARN triggers a new approval. Could add an allowlist in the future.
