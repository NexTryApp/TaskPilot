# Common Agent System Problems and How TaskPilot Addresses Them

Overview of risks typical for agent frameworks and how they are handled or mitigated in this framework.

---

## 1) Prompt Injection and "Agent Hijacking" via Content

**Problem:** The agent reads external text (pages, emails, messages, skills) and starts following harmful instructions. Even "hardened" configs in tests often fail.

**General solutions:**
- **Tools firewall** — strict policy on which tools can be called in which context (allowlist).
- Output formats only via **JSON schema + server-side validation**.
- **Context separation:** keep "untrusted content" separate and **never** provide it as system/instruction.
- Ongoing security testing and red-teaming (not a one-time setup).

**In TaskPilot:**
- **AccessPolicy** — tool allowlist: `allowedTools`, `deniedTools`, `guard`. No policy — all tools available by default; set policy — only allowed tools that pass the guard.
- **Context separation:** system prompt and goal are set by the caller. Recommendation: pass untrusted content **only in user message** (e.g. a separate block "External content: …"), never mix into system. Isolate long-term memory by `principal.id` (ScopedLongTermMemory) so other users' data does not leak into context.
- **Output validation** — the framework does not parse the final answer for you. Solution: on the application side — contract (JSON schema) and validation of the response before use; when using tool calling, the model response is structured by the provider (OpenAI, etc.).

---

## 2) Skills/Plugins as Supply Chain: Malicious "Skills"

**Problem:** A skills marketplace becomes a delivery channel for malware/leaks (especially if a skill can run commands or read files).

**General solutions:**
- In production: only **curated registry** (signatures, review, version pinning).
- Scan skills before installation + forbid "download and execute remote".
- **Sandbox:** default deny access to FS/SSH/secrets.

**In TaskPilot:**
- **No marketplace.** Tools are registered in application code (`ToolRegistry.register(...)`). The supply chain is your repository and deploy; only what you explicitly add.
- Sandbox and access to FS/network — on the process side (container, user permissions, secrets via env/vault). The framework does not execute arbitrary external code; each tool is your implementation.

---

## 3) Exposed Gateway/Control Plane on the Internet

**Problem:** Users expose an agent gateway without protection → leaks/compromise.

**General solutions:**
- Default bind only to **localhost**.
- Mandatory **authN/authZ**, IP allowlist, mTLS/VPN.
- Separate service accounts, strict secrets (vault), audit and alerts.

**In TaskPilot:**
- **No built-in gateway.** TaskPilot is a library embedded in your backend. Network exposure is the application's responsibility: your HTTP API, your bind (localhost/0.0.0.0), your authN/authZ before calling `runAgentLoop`. Recommendation: before creating `accessContext` — authenticate and check permissions; secrets (API keys) — from env/vault, not from code.

---

## 4) Privacy: Media/File Confusion and Leaks

**Problem:** Agent systems often have bugs like "wrong file / wrong user" (chats, media). This is a typical class of privacy breach incidents.

**General solutions:**
- Strict **tenant isolation** on the server (owner/workspace checks on every request).
- **Signed URLs** for media, short TTL, access only after auth.
- **Audit log** for every read/issue of files.

**In TaskPilot:**
- **Principal** and **tenantId** are passed to every tool call (`context.principal`). Tools that work with files/media must check `context.principal.id` and `tenantId` and return only the user's own resources.
- **ScopedLongTermMemory** — isolation by scope (principal.id); other users' records do not enter context.
- Signed URLs, TTL, audit log — implemented in your tools and backend (when issuing URLs and when accessing files).

---

## 5) Session/Context Instability and "Route Hallucinations"

**Problem:** Sessions break, context is lost, the agent behaves unpredictably (e.g. session loss after idle).

**General solutions:**
- Explicit **run/session state** model in DB.
- **Auto-summary** + fixed context window.
- **Idempotent tools** — repeated call does not perform the action again.

**In TaskPilot:**
- **Run state** is returned from `runAgentLoop` (`AgentRunState`: messages, finalAnswer, runId, principalId). The framework does not persist it; the application can store it in DB by `runId` and restore context when needed (e.g. last N messages + summary).
- **One run = one buffer** (BufferMemory). For a "session" across multiple steps — your logic: keep history in DB, on the next request inject summary or a sliding window.
- **Idempotent tools** — recommended when designing tools: check if the action was already performed (by idempotency key, by state) and do not duplicate side effects.

---

## 6) Unpredictability: Direct API vs Agent Path

**Problem:** The same request to the model via direct API may work correctly, but via the agent pipeline — not (prompt noise, extra instructions, tool traces).

**General solutions:**
- Keep the system prompt minimal, remove "chatter".
- Log **full assembled prompt** (internally) and fix settings (temperature, top_p).
- **Output contract:** schema + checks.

**In TaskPilot:**
- **System prompt** is set by you (`options.systemPrompt`); keep it short and without extra instructions.
- Assembled messages are available as `memory.getMessages()` before and after the loop; the application can log them (without secrets) for debugging and red-teaming.
- **Model parameters** (temperature, top_p) — in the `LLMAdapter` implementation (e.g. OpenAIAdapter when calling the API). Recommendation: expose as options and fix where possible for reproducibility.
- Output contract — on the application side: validate final answer and tool results by your schema.

---

## 7) Performance and Cost (Agent Loop Overhead)

**Problem:** The agent loop can generate extra calls/processes; in issues — requests for daemon mode, caching.

**General solutions:**
- **Cache tool results**, deduplicate requests.
- One **long-lived worker (daemon)** instead of spawn per request.
- **Limits** on agent steps (max_steps) and token budget.

**In TaskPilot:**
- **maxSteps** — hard limit on the number of loop iterations (`AgentLoopOptions.maxSteps`, default 15). Exceeded — loop ends.
- **Tool result cache** and dedup — not built-in; implement in tools or in a wrapper over `ToolRegistry.execute` (e.g. key by tool name + hash(args), TTL).
- **Single worker** — application architecture: one process/worker handles requests and calls `runAgentLoop`; the framework does not spawn separate processes.
- **Token budget** — not set in the framework; if needed, pass to the LLM adapter (max_tokens, etc.) and/or count tokens on your side and stop the run when exceeded.

---

## Summary Table

| Problem | What TaskPilot provides | What to do on the application side |
|---------|------------------------|------------------------------------|
| 1. Prompt injection | AccessPolicy (allowlist, guard), context separation (system vs user) | Untrusted content only in user message; validate output by schema |
| 2. Malicious skills | No marketplace, tools only from code | Process sandbox, code review |
| 3. Gateway exposure | No built-in gateway | Bind, authN/authZ, secrets in vault |
| 4. Privacy/media | Principal, tenantId, ScopedLongTermMemory | Owner checks in tools, signed URLs, audit |
| 5. Session instability | AgentRunState, one buffer per run | Persistence in DB, summary, idempotent tools |
| 6. Output unpredictability | Short system prompt, access to messages | Log prompt, temperature/top_p in adapter, output contract |
| 7. Performance/cost | maxSteps | Cache tool results, single worker, token limit in adapter |
