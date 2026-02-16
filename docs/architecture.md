# Architecture — TaskPilot

## System Layers

```
┌──────────────────────────────────────────────────────┐
│                    Web UI (SPA)                       │
│  index.html + app.js + style.css                     │
│  Skills grid │ Approval modal │ Security feed        │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────▼───────────────────────────────┐
│                  Express Server                       │
│  web/server.ts                                       │
│  /api/run │ /api/skills │ /api/settings │ /api/...   │
└────────┬──────────┬──────────┬───────────────────────┘
         │          │          │
    ┌────▼────┐ ┌───▼───┐ ┌───▼────┐
    │  Agent  │ │ Skills│ │   DB   │
    │  Loop   │ │ System│ │ SQLite │
    └────┬────┘ └───┬───┘ └───┬────┘
         │          │          │
    ┌────▼──────────▼──────────▼───────────────────────┐
    │              Security Layer                       │
    │  ExecGuard → DangerousCommands → SafeBins         │
    │  ApprovalManager → BlockedPaths → ChainAnalyzer   │
    └──────────────────────┬───────────────────────────┘
                           │
    ┌──────────────────────▼───────────────────────────┐
    │              Tool Registry                        │
    │  ToolRegistry + AccessPolicy + ToolGuard          │
    │  terminal_run │ browser_* │ create_task │ ...     │
    └──────────────────────┬───────────────────────────┘
                           │
    ┌──────────────────────▼───────────────────────────┐
    │              LLM Adapter                          │
    │  OpenAIAdapter (15+ providers via baseUrl)        │
    └──────────────────────────────────────────────────┘
```

## Data Flow: Agent Run

1. **UI** sends POST `/api/run` with goal, skill, API key, channels
2. **Server** resolves skill → creates ExecGuard → sets AccessPolicy on ToolRegistry
3. **Agent Loop** starts: sends goal to LLM, gets tool_call or answer
4. **Tool Call** → ToolRegistry checks AccessPolicy:
   - If tool denied by skill → `tool_denied` event
   - If `terminal_run` → ExecGuard checks command:
     - Safe bin? → ALLOW
     - Blocked path? → BLOCK
     - Dangerous command? → BLOCK or WARN
     - WARN → ApprovalManager creates pending request → SSE `approval_needed`
     - User responds → ApprovalManager resolves → tool executes or denied
5. **Each step** saved to SQLite (run_steps table)
6. **Security events** saved to SQLite (security_events table)
7. **SSE events** streamed to UI in real-time
8. **Agent finishes** → run status updated in DB → SSE `done` event

## Module Dependencies

```
web/server.ts
  ├── src/security/ (ExecGuard, ApprovalManager)
  ├── src/skills/ (BUILTIN_SKILLS, skillToAccessPolicy)
  ├── src/db/ (initDatabase, Repository)
  ├── src/agent-loop.ts (runAgentLoop)
  ├── src/tools/ (ToolRegistry)
  ├── src/memory/ (BufferMemory)
  └── src/llm/ (OpenAIAdapter)

src/skills/skill-to-policy.ts
  ├── src/security/exec-guard.ts
  └── src/security/approval-manager.ts

src/security/exec-guard.ts
  ├── src/security/dangerous-commands.ts
  ├── src/security/safe-bins.ts
  ├── src/security/blocked-paths.ts
  └── src/security/command-chain-analyzer.ts
```

## Key Design Decisions

See [AGENTS.md](../AGENTS.md) for the decisions table.
See [golden-principles.md](../golden-principles.md) for code rules.
