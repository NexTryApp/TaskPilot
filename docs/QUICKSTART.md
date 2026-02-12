# TaskPilot — Quick Start

Complete guide: how to install, build, run, and verify the framework.

---

## 1. Requirements

- **Windows 10/11** (or Linux/macOS)
- **Python 3.10+** (for venv)
- **Git** (optional)

Everything else (Node.js, npm, TypeScript) is installed inside venv.

---

## 2. Installation (from scratch)

Open a terminal (PowerShell) in the project folder `G:\TaskPilot`:

```powershell
# 1. Create Python venv
py -m venv venv

# 2. Activate venv
.\venv\Scripts\Activate.ps1

# 3. Install nodeenv (Node.js inside venv)
pip install nodeenv

# 4. Install Node.js 22 inside venv
nodeenv --python-virtualenv --node=22.13.1

# 5. Reactivate venv (to pick up node/npm)
.\venv\Scripts\Activate.ps1

# 6. Verify node and npm are available
node --version      # → v22.13.1
npm --version       # → 10.x

# 7. Install npm dependencies (TypeScript, tsx, etc.)
npm install

# 8. Build the project (TypeScript → JavaScript)
npx tsc
```

If everything completed without errors — installation is done.

---

## 3. Running the Example

```powershell
# Make sure venv is activated
.\venv\Scripts\Activate.ps1

# Run (without OPENAI_API_KEY — mock agent runs)
npx tsx example/run-agent.ts
```

Or via npm script:

```powershell
npm run example
```

### Expected Output

```
[audit] run_start     | - | principal=user_42
[audit] tool_call     | get_weather | principal=user_42
[audit] tool_result   | get_weather | principal=user_42
[audit] tool_call     | create_task | principal=user_42
[audit] tool_result   | create_task | principal=user_42
[audit] tool_call     | delete_task | principal=user_42
[audit] tool_denied   | delete_task | principal=user_42
[audit] run_end       | - | principal=user_42

=== Agent Result ===
Done: true
Steps: 4
Principal: user_42
Final: Done: weather in Moscow — 18°C, sunny. Task "Check the weather" created.
Messages: 6

Output valid: true

=== Audit Log ===
  run_start   | tool=- | error=-
  tool_call   | tool=get_weather | error=-
  tool_result | tool=get_weather | error=-
  tool_call   | tool=create_task | error=-
  tool_result | tool=create_task | error=-
  tool_call   | tool=delete_task | error=-
  tool_denied | tool=delete_task | error=Tool denied by policy: delete_task
  run_end     | tool=- | error=-
```

**What happened here:**
1. Agent called `get_weather` → got result (18°C, sunny).
2. Agent called `create_task` → task created on behalf of `user_42`.
3. Agent tried to call `delete_task` → **blocked by policy** (AccessPolicy → deniedTools).
4. Agent produced the final answer.
5. Audit log recorded each action with principalId.

---

## 4. Running with a Real LLM (OpenAI)

```powershell
# Set the key before running
$env:OPENAI_API_KEY = "sk-your-key-here"

# Run
npx tsx example/run-agent.ts
```

The agent will use `gpt-4o-mini` via the OpenAI API. Everything else (tools, memory, audit, access control) works the same.

---

## 5. Rebuild After Changes

```powershell
# Activate venv
.\venv\Scripts\Activate.ps1

# Rebuild
npx tsc

# Run
npx tsx example/run-agent.ts
```

---

## 6. One-Line Commands (Cheat Sheet)

| Command | What it does |
|---------|--------------|
| `.\venv\Scripts\Activate.ps1` | Activate venv (Node + Python) |
| `npm install` | Install/update npm dependencies |
| `npx tsc` | Build TypeScript → dist/ |
| `npx tsx example/run-agent.ts` | Run the agent example |
| `npm run example` | Same (via npm script) |
| `npm run build` | Same as `npx tsc` (via npm script) |
| `deactivate` | Exit venv |

---

## 7. Project Structure

```
G:\TaskPilot\
├── venv\                    ← Python venv + Node.js (nodeenv)
├── node_modules\            ← npm dependencies (TypeScript, tsx)
├── dist\                    ← compiled JS (after npx tsc)
├── src\                     ← framework source code
│   ├── index.ts             ← public API (all exports)
│   ├── types.ts             ← types: Principal, AccessContext, Tool, Memory…
│   ├── agent-loop.ts        ← agent loop (core)
│   ├── tools\
│   │   ├── tool-registry.ts ← tool registry + access control
│   │   └── tool-cache.ts    ← tool result cache
│   ├── memory\
│   │   ├── buffer-memory.ts      ← short-term (buffer)
│   │   ├── simple-long-term.ts   ← long-term (no isolation)
│   │   └── scoped-long-term.ts   ← long-term with principal isolation
│   ├── llm\
│   │   ├── openai-adapter.ts     ← OpenAI API (tool calling)
│   │   └── mock-adapter.ts       ← Mock for tests without API key
│   ├── audit\
│   │   └── audit-logger.ts       ← log of tool calls and runs
│   ├── validation\
│   │   └── output-validator.ts   ← agent response validation by schema
│   ├── context\
│   │   └── context-manager.ts    ← sliding window + summary
│   └── budget\
│       └── token-tracker.ts      ← token budget per run
├── example\
│   └── run-agent.ts         ← full working example
├── docs\
│   ├── QUICKSTART.md        ← THIS PAGE
│   └── PROBLEMS_AND_SOLUTIONS.md ← agent system problems and solutions
├── ARCHITECTURE.md          ← architecture and diagram
├── SECURITY.md              ← security and access control
├── README.md                ← project description
├── package.json
├── tsconfig.json
└── requirements.txt         ← Python dependencies (nodeenv)
```

---

## 8. Verification: Everything Works

Quick checklist after installation:

```powershell
.\venv\Scripts\Activate.ps1

# 1. Is Node available?
node --version
# Expected: v22.13.1

# 2. Does TypeScript build?
npx tsc
# Expected: no errors (empty output)

# 3. Does the example run?
npx tsx example/run-agent.ts
# Expected: output with [audit] and "Done: true"

# 4. Was dist/ created?
dir dist
# Expected: .js and .d.ts files
```

If all 4 pass — the framework is fully working.

---

## 9. Web UI (Browser Interface)

TaskPilot includes a built-in web interface for running agents through the browser.

### Option A: Double-click `start.bat`

Just double-click `start.bat` in the project root. It activates the venv and starts the server. The browser opens at:

```
http://localhost:3000
```

### Option B: Command line

```powershell
.\venv\Scripts\Activate.ps1
npx tsx web/server.ts
```

Then open `http://localhost:3000` in your browser.

### How to use the Web UI

1. **Choose a provider** — click one of the provider cards (OpenAI, DeepSeek, Groq, Gemini, Anthropic, Mistral, Together, OpenRouter, Ollama). The model field auto-fills with the default model for that provider.

2. **Enter your API key** — paste your provider's API key. For Ollama (local), it fills automatically.

3. **Pick a model** — change the model name if needed (e.g. `gpt-4o` instead of `gpt-4o-mini`).

4. **Set limits** — max steps (default 10) and token limit (0 = unlimited).

5. **Toggle tools** — check/uncheck the tools the agent can use:
   - `get_weather` — returns demo weather data
   - `create_task` — creates a demo task
   - `search_web` — returns demo search results
   - `send_message` — simulates sending a message

6. **Type the goal** — describe what the agent should do (e.g. "Find the weather in London and create a task to pack an umbrella").

7. **Click "Start agent"** — the agent runs on the server and results appear in real time:
   - **Log** — every tool call, result, and denial
   - **Agent's answer** — the final response
   - **Meta** — steps taken, run ID, principal

### Customizing tools

The demo tools are defined in `web/server.ts` → `createDemoTools()`. To add your own:

1. Add a new tool in `createDemoTools()` (or register it separately).
2. Add a checkbox in `web/public/index.html` inside `#toolsList`.
3. Restart the server.

---

## 10. Next Steps

- **Add your own tools** — register in `ToolRegistry` (see example in `example/run-agent.ts`).
- **Connect a real LLM** — set `OPENAI_API_KEY` or implement your own `LLMAdapter` for Claude/others.
- **Integrate into your backend** — call `runAgentLoop()` from your API handler, passing `accessContext` with authenticated user data.
- **Documentation:**
  - [ARCHITECTURE.md](../ARCHITECTURE.md) — diagram, components, data flow
  - [SECURITY.md](../SECURITY.md) — security and access control
  - [PROBLEMS_AND_SOLUTIONS.md](./PROBLEMS_AND_SOLUTIONS.md) — agent system problems and solutions
