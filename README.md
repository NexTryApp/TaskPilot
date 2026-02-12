# TaskPilot

Framework for autonomous AI agents with built-in agent loop, tools, memory, access control, and audit logging. TypeScript/Node.js.

---

## Quick Start

### Option 1: Web UI (recommended)

Double-click **`start.bat`** in the project root — the browser interface opens at `http://localhost:3000`.

Or from the command line:

```powershell
.\venv\Scripts\Activate.ps1
npx tsx web/server.ts
```

Then open **http://localhost:3000** in your browser.

**How to use:**

1. Pick a provider (OpenAI, DeepSeek, Groq, Gemini, Anthropic, Mistral, Together, OpenRouter, Ollama)
2. Paste your API key
3. Choose a model
4. Toggle the tools you want the agent to use
5. Type the goal (e.g. "Find weather in London and create a task")
6. Click **Start agent** — watch the agent work step by step

### Option 2: Command line

```powershell
.\venv\Scripts\Activate.ps1

# Run with mock LLM (no API key needed)
npx tsx example/run-agent.ts

# Run with a real LLM
$env:OPENAI_API_KEY = "sk-..."
npx tsx example/run-agent.ts
```

### First-time installation

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install nodeenv
nodeenv --python-virtualenv --node=22.13.1
.\venv\Scripts\Activate.ps1
npm install
npx tsc
```

Full step-by-step guide: **[docs/QUICKSTART.md](./docs/QUICKSTART.md)**

---

## How It Works

- **Agent loop** — goal → think → choose action → call tool → get result → repeat
- **Brain (LLM)** — any model via `OpenAIAdapter` with configurable `baseUrl`
- **Tools** — API calls, task creation, HTTP requests, etc. The agent decides which tool to call
- **Memory** — short-term (message buffer) and optional long-term (context search)

### Supported Providers

| Provider | Models | baseUrl |
|----------|--------|---------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o3-mini` | `https://api.openai.com/v1` (default) |
| **Anthropic** | `claude-sonnet-4`, `claude-3.5-haiku` | `https://api.anthropic.com/v1` |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-2.5-pro` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| **DeepSeek** | `deepseek-chat`, `deepseek-reasoner` | `https://api.deepseek.com/v1` |
| **Groq** | `llama-3.3-70b`, `mixtral-8x7b` | `https://api.groq.com/openai/v1` |
| **Together** | `Llama-3.3-70B`, `Qwen2.5-72B` | `https://api.together.xyz/v1` |
| **Mistral** | `mistral-large`, `mistral-small` | `https://api.mistral.ai/v1` |
| **OpenRouter** | 200+ models | `https://openrouter.ai/api/v1` |
| **Ollama (local)** | `llama3`, `mistral`, `qwen2.5` | `http://localhost:11434/v1` |

Any provider with an OpenAI-compatible API works out of the box.

---

## API Usage

```ts
import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  SimpleLongTermMemory,
  OpenAIAdapter,
} from './src/index.js';

const memory = new BufferMemory();
const longTerm = new SimpleLongTermMemory();
const tools = new ToolRegistry();

tools.register({
  name: 'create_task',
  definition: {
    name: 'create_task',
    description: 'Create a task',
    parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
  async execute(args) {
    return { id: '1', title: args.title };
  },
});

const llm = new OpenAIAdapter({ model: 'gpt-4o-mini' });
const state = await runAgentLoop(
  { goal: 'Create a task "Check the weather"' },
  memory,
  tools,
  llm,
  longTerm,
  { maxSteps: 10 }
);

console.log(state.finalAnswer);
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Agent Loop** | Loop: goal → LLM → tool → result → repeat |
| **Access Control** | Principal, AccessPolicy (allowed/denied tools, guard), AccessDeniedError |
| **Data Isolation** | ScopedLongTermMemory — memory scoped by principal.id |
| **Audit** | AuditLogger — each tool_call, tool_denied, run_start/end |
| **Tool Cache** | ToolCache — deduplication of repeated calls, TTL |
| **Context Window** | ContextManager — sliding window + auto-summary |
| **Token Budget** | TokenTracker — limit per run |
| **Output Validation** | validateFinalAnswer — validation by JSON schema |

**Data security and full access control:** [SECURITY.md](./SECURITY.md).

**Common agent system problems and solutions:** [docs/PROBLEMS_AND_SOLUTIONS.md](./docs/PROBLEMS_AND_SOLUTIONS.md).

## Architecture

Details: [ARCHITECTURE.md](./ARCHITECTURE.md) — diagram, components, data flow, extension.

## Structure

- `src/agent-loop.ts` — loop: prompt → LLM → parse response → execute tool → repeat.
- `src/tools/` — tool registry and schema for function calling.
- `src/memory/` — buffer (short-term) and simple long-term memory.
- `src/llm/` — OpenAI adapter and mock for tests.
- `src/audit/` — call logging.
- `src/validation/` — output validation.
- `src/context/` — context window management.
- `src/budget/` — token budget.

Security, payments, fraud, legal liability — are not part of the framework; they belong to your platform and API layer.

## License

**TaskPilot Source Available License v1.0** — free use (including commercial) with mandatory visible attribution:

> Powered by TaskPilot (github.com/NexTryApp/TaskPilot)

Details: [LICENSE](./LICENSE).
