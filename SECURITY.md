# Data Security and Access Control (TaskPilot)

The framework provides **full access control** at the run and tool level: who can call what and what data they see.

---

## 1. Access Model

### Principal (subject)

Who runs the agent. Set when calling `runAgentLoop` via `goal.accessContext.principal`.

```ts
interface Principal {
  id: string;           // identifier (userId, apiKeyId, etc.)
  tenantId?: string;   // tenant for multi-tenancy
  roles?: string[];    // roles (admin, user, …)
  scopes?: string[];   // scopes (tasks:read, tasks:write, …)
  metadata?: Record<string, unknown>;
}
```

- **id** — required; used to isolate long-term memory (ScopedLongTermMemory).
- **tenantId, roles, scopes** — for policies and guards (allowed tools, argument checks).

### AccessContext (run context)

For the duration of one run: `{ principal, runId }`. The context is passed to access checks and to each tool call, so the tool can know who invoked it.

---

## 2. Tool Access Control

### AccessPolicy on ToolRegistry

Policy is set via `tools.setAccessPolicy(policy)`.

| Field | Purpose |
|-------|---------|
| **allowedTools** | List of allowed tool names. `['*']` — all. Empty array without `*` — nothing allowed. |
| **deniedTools** | Explicit restriction by name (takes precedence over allowedTools). |
| **guard** | Function `(context, toolName, args) => boolean | Promise<boolean>`. Called before each execution; `false` — access denied (AccessDeniedError). |

Check order: `deniedTools` → `allowedTools` → `guard`. If no policy is set, there are no tool restrictions (as before).

### Example

```ts
const tools = new ToolRegistry();
tools.register(createTaskTool);
tools.register(deleteTaskTool);

tools.setAccessPolicy({
  allowedTools: ['get_weather', 'create_task'],
  deniedTools: ['delete_task'],
  guard: async (ctx, name, args) => {
    if (name === 'create_task' && ctx.principal.tenantId !== 'acme') return false;
    return true;
  },
});

const state = await runAgentLoop(
  { goal: '...', accessContext: { principal: user, runId: 'run_1' } },
  memory, tools, llm, longTerm, {}
);
```

---

## 3. Data Isolation (memory)

### Short-term memory (BufferMemory)

One instance — one run. Data does not overlap between runs if each run gets its own buffer (recommended).

### Long-term memory with isolation (ScopedLongTermMemory)

`ScopedLongTermMemoryImpl` stores entries by **scope**. Before search/add, call `setScope(scope)`. In the agent, scope is set to `principal.id` (or, if needed, `tenantId`), so one user does not see another's data.

```ts
const longTerm = new ScopedLongTermMemoryImpl();
// In agent-loop, when accessContext exists, setScope(principal.id) is called
await runAgentLoop(
  { goal: '...', accessContext: { principal: { id: 'user_123' }, runId: 'r1' } },
  memory, tools, llm, longTerm, {}
);
```

If long-term memory has no scope (e.g. `SimpleLongTermMemory`) — user isolation is not enforced; use it only for shared/non-personal data or set scope yourself in your wrapper.

---

## 4. Passing Context to Tools

Tool signature: `execute(args, context?: AccessContext)`. Inside the tool you can:

- check `context.principal.id` / `tenantId` before calling API or DB;
- substitute `principal.id` in requests (e.g. "create task on behalf of user_123");
- not return other users' data if your API/DB returns it by principal.

The framework does not substitute principal in external APIs — the tool implementation does that.

---

## 5. What Stays on the Platform Side

- **Authentication** — who the principal is (JWT, API key, session), and where `Principal` comes from before calling `runAgentLoop`.
- **Secrets** — do not log keys and tokens; do not pass them in the goal or in messages unless needed.
- **Payments, limits, fraud** — outside the framework; you can use `principal` and `runId` in your billing and limit logic.
- **Audit** — optionally log `principalId`, `runId`, called tool names (without sensitive args) yourself.

---

## 6. Recommendations

1. Always set **accessContext** for user runs and use **ScopedLongTermMemory** for personal memory.
2. Create a **new BufferMemory** for each run (do not reuse between users).
3. Set **AccessPolicy** on the shared ToolRegistry (or per-role registries) and use **guard** when needed (e.g. to ensure the user does not pass other users' ids).
4. In tools that call your backend, pass **principal.id** (and tenantId if needed) in headers or body and verify permissions on the backend.
5. Do not include secrets and PII in **goal** and **systemPrompt** if they are logged; mask them in your wrapper if needed.
6. **Untrusted content** (pages, emails, third-party messages) — pass **only in user message**, never in system or as instruction; use Tools firewall (AccessPolicy) and preferably a separate block in the prompt ("External content: …").

With this, the framework provides **data security and full access control** at the agent level; the trust boundary is your authentication and your backend.

---

## 7. Common Agent System Problems

Prompt injection, supply-chain plugins, exposed gateway, privacy, session instability, output unpredictability, performance — and how TaskPilot addresses them: **[docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md)**.
