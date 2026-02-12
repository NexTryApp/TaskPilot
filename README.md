# TaskPilot

Framework for autonomous AI agents with built-in agent loop, tools, memory, access control, and audit logging. TypeScript/Node.js.

---

## Quick Start

### Option 1: Web UI (recommended)

Double-click **`start.bat`** in the project root — the browser interface opens at `http://localhost:4242`.

Or from the command line:

```powershell
.\venv\Scripts\Activate.ps1
npx tsx web/server.ts
```

Then open **http://localhost:4242** in your browser.

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

### Option 3: Docker (recommended for isolation)

```bash
docker compose up --build
```

Open **http://localhost:4242** — the web UI is identical, but agent terminal commands run inside an **isolated sandbox container** (not on your host machine).

**What's inside:**
- `taskpilot` container — web UI + agent loop (port 4242)
- `sandbox` container — isolated shell for agent commands (internal, not exposed)
- `taskpilot-data` volume — persistent storage for sessions and memory

To stop: `Ctrl+C` or `docker compose down`. Data persists in the Docker volume.

On Windows, you can also double-click **`start-docker.bat`**.

---

### First-time installation (without Docker)

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
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3-mini`, `o4-mini` | `https://api.openai.com/v1` |
| **Anthropic** | `claude-opus-4`, `claude-sonnet-4`, `claude-3.5-haiku` | `https://api.anthropic.com/v1` |
| **Google Gemini** | `gemini-2.5-pro`, `gemini-2.0-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| **DeepSeek** | `deepseek-chat`, `deepseek-reasoner` | `https://api.deepseek.com/v1` |
| **xAI** | `grok-3`, `grok-3-mini`, `grok-2` | `https://api.x.ai/v1` |
| **Moonshot (Kimi)** | `kimi-k2`, `moonshot-v1-128k` | `https://api.moonshot.cn/v1` |
| **Groq** | `llama-3.3-70b`, `mixtral-8x7b` | `https://api.groq.com/openai/v1` |
| **Mistral** | `mistral-large`, `mistral-small`, `codestral` | `https://api.mistral.ai/v1` |
| **Together** | `Llama-3.3-70B`, `Qwen2.5-72B` | `https://api.together.xyz/v1` |
| **MiniMax** | `MiniMax-M2.1`, `MiniMax-Text-01` | `https://api.minimax.chat/v1` |
| **Venice AI** | `llama-3.3-70b`, `claude-opus-45` | `https://api.venice.ai/api/v1` |
| **Qwen (Alibaba)** | `qwen-plus`, `qwen-turbo`, `qwen-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| **GLM (Zhipu)** | `glm-4-plus`, `glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` |
| **Amazon Bedrock** | `claude-sonnet-4`, `llama3-70b` | `https://bedrock-runtime.*.amazonaws.com` |
| **OpenRouter** | 200+ models from all providers | `https://openrouter.ai/api/v1` |
| **Ollama (local)** | `llama3`, `mistral`, `qwen2.5`, `deepseek-r1` | `http://localhost:11434/v1` |

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
