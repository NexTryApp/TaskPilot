# TaskPilot Architecture

**TaskPilot** is a self-contained framework for autonomous AI agents (TypeScript/Node). Your own code and your own stack.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     runAgentLoop(goal, ...)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐           │
│  │ ShortTerm   │   │ Agent Loop   │   │ Tool        │           │
│  │ Memory      │◄──│ (prompt →   │──►│ Registry    │           │
│  │ (buffer)    │   │  LLM → tool) │   │ + execute   │           │
│  └─────────────┘   └──────┬───────┘   └─────────────┘           │
│         ▲                 │                      │              │
│         │                 ▼                      │              │
│  ┌──────┴──────┐   ┌──────────────┐   ┌─────────▼─────────┐     │
│  │ LongTerm    │   │ LLM Adapter  │   │ Tools (HTTP,      │     │
│  │ Memory      │   │ (OpenAI /    │   │ create_task, …)  │     │
│  │ (optional)  │   │  Mock)       │   └──────────────────┘     │
│  └─────────────┘   └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

- **Input:** goal, options (maxSteps, systemPrompt), optionally **accessContext** (principal + runId) for access control and data isolation.
- **Output:** run state (AgentRunState): messages, finalAnswer, done, currentStep, principalId.

---

## 2. Agent Loop (core)

File: `src/agent-loop.ts`

The loop:

1. Build prompt: system + goal (+ relevant long-term memory).
2. Call LLM with current history and tool list (schemas).
3. Parse response:
   - **finalAnswer** → finish, return state.
   - **action** (tool + arguments) → execute tool, add result to memory, repeat step 2.
4. Step limit: `maxSteps` (default 15).

Run state is not stored inside the framework — it is only returned from `runAgentLoop`. Persisting runs (Postgres, Redis, etc.) is the responsibility of the calling code.

---

## 3. Components

### 3.1 LLM Adapter (`src/llm/`)

- **Interface:** `LLMAdapter.chat(messages, tools) → LLMActionResponse`.
- **Response:** either `{ thought?, finalAnswer? }`, or `{ thought?, action: { tool, arguments } }`.
- **Implementations:**
  - `OpenAIAdapter` — OpenAI API with function calling (tool_choice: auto).
  - `MockLLMAdapter` — for tests and demos without API key.

Connecting Claude or other providers — via a new `LLMAdapter` implementation.

### 3.2 Tools (`src/tools/`)

- **ToolRegistry** — register tools, get definitions for LLM, execute with optional access check.
- **AccessPolicy** (setAccessPolicy): allowedTools, deniedTools, guard — full control over who can call which tool.
- **ToolExecutor:** `name`, `definition`, `execute(args, context?)` — context receives AccessContext (principal, runId) for checks and API substitution.

Before each call: check denied/allowed, then guard; on denial — AccessDeniedError.

### 3.3 Memory (`src/memory/`)

- **ShortTerm (BufferMemory):** list of messages for the current run. One buffer per run — isolation by default.
- **LongTerm:**
  - `SimpleLongTermMemory` — in-memory substring search, no user isolation.
  - **ScopedLongTermMemoryImpl** — scoped isolation; in the loop scope = principal.id, so one user's data is not visible to another.

Long-term memory is fed into the loop when building the goal; for ScopedLongTermMemory, setScope(principal.id) is called before search.

---

## 4. Data Flow

1. **Input:** `AgentGoal` (goal, runId?, accessContext?, metadata?), instances of memory, tools, llm, options.
2. **Initialization:** clear short-term memory; if accessContext and ScopedLongTermMemory exist — setScope(principal.id). Write system prompt and user message (goal + context from long-term if present).
3. **Iteration:**
   - messages = memory.getMessages()
   - response = llm.chat(messages, tools.getDefinitions())
   - if finalAnswer → write answer to memory, exit.
   - if action → append assistant message with tool_calls; **access check** (policy + guard); tools.execute(tool, args, accessContext); appendToolResult(...); next iteration.
4. **Output:** `AgentRunState` (runId, goal, messages, currentStep, maxSteps, done, finalAnswer?, principalId?, metadata?).

---

## 5. Data Security and Access Control

- **Principal** — who runs the agent (id, tenantId, roles, scopes). Passed in `goal.accessContext.principal`.
- **AccessContext** — run context (principal + runId), passed to access checks and to each tool call.
- **AccessPolicy** on ToolRegistry — allowedTools, deniedTools, guard; full control over which tools are available to whom.
- **Memory isolation** — ScopedLongTermMemory by scope = principal.id; one user does not see another's data.
- **Tools** receive `context?: AccessContext` in execute; can substitute principal.id in requests to your API and check permissions.

Details: [SECURITY.md](./SECURITY.md). Common agent system problems and solutions: [docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md).

## 6. Extension

- **New LLM providers:** implement `LLMAdapter`, pass to `runAgentLoop`.
- **New tools:** register in `ToolRegistry`, optionally use `context.principal` in execute.
- **Long-term memory with embeddings:** implement `LongTermMemory` or `ScopedLongTermMemory` with vector search.
- **Channels and gateway:** on top of `runAgentLoop` — HTTP API, Telegram bot, queue; each request with its own accessContext and memory.

---

## 7. File Structure

```
src/
  index.ts          # Public API
  types.ts          # Interfaces and types (Principal, AccessContext, AccessPolicy)
  agent-loop.ts     # Agent loop + access control + audit + cache + budget
  tools/
    tool-registry.ts   # setAccessPolicy, access check, AccessDeniedError
    tool-cache.ts      # Tool result cache
    index.ts
  memory/
    buffer-memory.ts
    simple-long-term.ts
    scoped-long-term.ts   # Scope isolation (principal.id)
    index.ts
  llm/
    openai-adapter.ts
    mock-adapter.ts
    index.ts
  audit/
    audit-logger.ts    # Call logging
    index.ts
  validation/
    output-validator.ts  # Response validation by schema
    index.ts
  context/
    context-manager.ts   # Sliding window + summary
    index.ts
  budget/
    token-tracker.ts     # Token budget
    index.ts
example/
  run-agent.ts     # Run example
SECURITY.md        # Data security and full access control
```

Authentication (who the principal is), payments, fraud, audit — are on the platform side; the framework provides access control over tools and data isolation by principal.
