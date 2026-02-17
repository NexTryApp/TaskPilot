# TaskPilot

Secure AI agent framework with built-in safety system, skill-based access control, approval workflows, SQLite history, and one-click launch. TypeScript/Node.js.

---

## Quick Start

### One Click (Windows)

Double-click **`start.bat`** — browser opens at `http://localhost:4242`.

### One Click (Linux / macOS)

```bash
chmod +x start.sh && ./start.sh
```

### Manual

```bash
npm install
npx tsx web/server.ts
```

Then open **http://localhost:4242**.

### Docker (recommended for isolation)

```bash
docker compose up --build
```

Agent terminal commands run inside an **isolated sandbox container**, not on your host machine.

---

## How It Works

1. Pick a provider (OpenAI, Anthropic, DeepSeek, Gemini, Groq, xAI, Ollama, and 10+ more)
2. Paste your API key (saved encrypted in local DB — remembered between sessions)
3. **Choose a skill** — controls what the agent can and cannot do
4. Type a goal (e.g. "Search the web for latest AI news and summarize")
5. Click **Start Agent** — watch the agent work step by step
6. Dangerous commands are **blocked or require your approval** in real-time

---

## Security System

TaskPilot's core differentiator is the multi-layered security system that prevents AI agents from damaging your computer or leaking data.

### Three-Tier Command Classification

| Level | Action | Example |
|-------|--------|---------|
| **BLOCK** | Never allowed, automatic denial | `rm -rf /`, `format C:`, `shutdown`, crypto miners |
| **WARN** | Requires user approval (60s timeout) | `npm install -g`, `pip install`, `mv`, `chmod` |
| **ALLOW** | Automatically permitted | `ls`, `cat`, `grep`, `git status`, `node --version` |

### What Gets Blocked

- **Filesystem destruction**: `rm -rf`, `del /s /q`, `format`, `dd`, `shred`
- **System modification**: `shutdown`, `reboot`, `halt`, `reg delete`
- **Privilege escalation**: `sudo su`, `chmod 777`, `runas`
- **Network attacks**: `nmap`, `netcat`, `iptables -F`
- **Crypto/malware**: Mining software, ransomware patterns
- **Data exfiltration**: curl/wget targeting `.ssh`, `.env`, `/etc/passwd`
- **Obfuscation**: `base64 -d | bash`, `eval $(...)`, encoded PowerShell

### Approval Workflow

When a command triggers WARN level:
1. Agent pauses execution
2. UI shows a modal with the command and explanation (Russian + English)
3. 60-second countdown timer
4. User clicks **Approve** or **Deny**
5. If timeout — automatic denial

### API Security

- **Session auth**: All sensitive endpoints require `X-Session-Token` (issued at page load, CORS-protected)
- **SSRF filter**: `browser_open` blocks localhost, private IPs, cloud metadata, non-http(s) schemes
- **Rate limiting**: Max 10 agent runs per minute
- **Encrypted storage**: API keys encrypted with AES-256-GCM using a random key (`data/.encryption-key`)

### Security Advisor (LLM-Powered)

Every command the agent executes is explained in plain human language — both safe and dangerous. For WARN-level commands, the approval modal shows an LLM-generated risk analysis with consequences and safer alternatives.

- **Quick Explain**: ~30 common safe commands (ls, cat, grep, git) — instant, no LLM call
- **Full Explain**: All other commands — LLM analyzes risk, reversibility, and consequences
- **Bilingual**: Explanations in Russian and English
- **Non-blocking**: Safe command explanations run async, don't slow down the agent

### Security Audit

```bash
npx tsx scripts/security-audit.ts
```

Scans the project for hardcoded secrets, unsafe patterns, skill misconfigurations, and .env issues.

---

## Skills

Skills define what an agent can do. Each skill controls available tools and security level.

| Skill | Level | Tools | Description |
|-------|-------|-------|-------------|
| **Web Researcher** | Safe (green) | browser_open, browser_search | Only web search — no terminal, no files |
| **Task Manager** | Safe (green) | create_task, get_weather, browser_search | Tasks and information |
| **Safe Coder** | Moderate (yellow) | terminal_run (restricted), browser_* | Code without file deletion |
| **Sys Admin** | Full (red) | All tools (with warnings) | Full access for experienced users |

**Default: Web Researcher** — the safest option.

### Custom Skills

Create `.md` files in `skills/` directory with YAML frontmatter:

```yaml
---
name: My Custom Skill
description: What this skill does
descriptionRu: Описание на русском
icon: "🔧"
securityLevel: moderate
allowedTools: [browser_open, browser_search, terminal_run]
deniedTools: [send_email]
safeBinsOnly: true
safetyRules:
  - Never delete files
  - Always explain commands before running
---

# My Custom Skill

Additional instructions for the agent...
```

---

## Database

SQLite database (`data/taskpilot.db`) — zero configuration, single file.

| Table | Purpose |
|-------|---------|
| `runs` | Agent execution history (goal, skill, status, timestamps) |
| `run_steps` | Individual steps within each run (tool calls, results, thinking) |
| `security_events` | Blocked commands, warnings, user decisions |
| `settings` | Saved configuration (provider, model, encrypted API key) |
| `custom_skills` | User-created skills |

API key is **encrypted with AES-256-GCM** before storage.

---

## Supported Providers

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
| **OpenRouter** | 200+ models | `https://openrouter.ai/api/v1` |
| **Ollama (local)** | `llama3`, `mistral`, `qwen2.5`, `deepseek-r1` | `http://localhost:11434/v1` |

Any provider with an OpenAI-compatible API works out of the box.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/run` | POST | Start agent execution (SSE stream) |
| `/api/skills` | GET | List available skills |
| `/api/settings` | GET/POST | Load/save settings (API key encrypted) |
| `/api/history` | GET | Run history from database |
| `/api/history/:runId` | GET | Run details with steps |
| `/api/security-events` | GET | Security event log |
| `/api/stats` | GET | Aggregate statistics |
| `/api/approval/:id` | POST | Respond to approval request |
| `/api/tools` | GET | Available tool catalog |

---

## API Usage

```ts
import {
  runAgentLoop,
  ToolRegistry,
  BufferMemory,
  OpenAIAdapter,
  BUILTIN_SKILLS,
  skillToAccessPolicy,
} from './src/index.js';

const memory = new BufferMemory();
const tools = new ToolRegistry();

// Register tools...

const skill = BUILTIN_SKILLS.get('safe-coder')!;
const { policy } = skillToAccessPolicy(skill);
tools.setAccessPolicy(policy);

const llm = new OpenAIAdapter({ model: 'gpt-4o-mini' });
const state = await runAgentLoop(
  { goal: 'Create a hello.js file' },
  memory, tools, llm, null,
  { maxSteps: 10 }
);

console.log(state.finalAnswer);
```

---

## Project Structure

```
TaskPilot/
├── src/
│   ├── agent-loop.ts          # Core: goal → LLM → tool → result → repeat
│   ├── security/
│   │   ├── dangerous-commands.ts   # Blocklist (BLOCK/WARN/ALLOW)
│   │   ├── command-chain-analyzer.ts  # &&, ||, ;, | splitting
│   │   ├── safe-bins.ts           # Whitelist (ls, cat, grep...)
│   │   ├── blocked-paths.ts       # Sensitive paths protection
│   │   ├── exec-guard.ts          # Central security gate
│   │   ├── approval-manager.ts    # User approval workflow
│   │   └── security-audit.ts      # Project security scanner
│   ├── skills/
│   │   ├── builtin-skills.ts      # 4 built-in skills
│   │   ├── skill-loader.ts        # YAML frontmatter parser
│   │   └── skill-to-policy.ts     # Skill → AccessPolicy converter
│   ├── db/
│   │   ├── schema.ts             # SQLite tables + migrations
│   │   ├── repository.ts         # CRUD operations
│   │   └── crypto.ts             # AES-256-GCM encryption
│   ├── tools/                    # Tool registry + schemas
│   ├── memory/                   # Buffer + long-term memory
│   ├── llm/                      # OpenAI adapter + mock
│   └── index.ts                  # Public exports
├── skills/                       # Skill definition files (.md)
├── web/
│   ├── server.ts                 # Express server + SSE + all API endpoints
│   └── public/                   # Web UI (HTML/CSS/JS)
├── scripts/
│   └── security-audit.ts         # CLI security scanner
├── data/                         # SQLite database (auto-created)
├── start.bat                     # One-click Windows launcher
├── start.sh                      # One-click Linux/macOS launcher
└── docker-compose.yml            # Docker isolation setup
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Security System** | Three-tier command classification (BLOCK/WARN/ALLOW) |
| **Approval Workflow** | Real-time user confirmation for dangerous commands |
| **Skill-Based Access** | Skills define what tools agent can use |
| **Encrypted Settings** | API keys stored with AES-256-GCM in SQLite |
| **Run History** | All executions saved with steps and security events |
| **Security Audit** | CLI scanner for hardcoded secrets and misconfigurations |
| **Agent Loop** | goal → LLM → tool → result → repeat |
| **Access Control** | Principal, AccessPolicy, guard functions |
| **Audit Logging** | Every tool call, denial, and security event logged |
| **Tool Cache** | Deduplication of repeated calls with TTL |
| **Context Window** | Sliding window + auto-summary |
| **Token Budget** | Per-run token limit tracking |
| **Docker Sandbox** | Isolated container for terminal commands |
| **15+ LLM Providers** | Any OpenAI-compatible API |
| **Bilingual UI** | Russian + English interface |

---

## How TaskPilot Differs from OpenClaw

TaskPilot is built on the OpenClaw foundation but adds enterprise-grade security layers and a human-friendly experience.

| Feature | TaskPilot | OpenClaw |
|---------|-----------|----------|
| **Command Security** | 3-tier classification (BLOCK/WARN/ALLOW) + LLM Security Advisor + chain analysis | Basic safe-bins only, no LLM command analysis |
| **Prompt Injection Defense** | InputSanitizer: regex + heuristic detection on untrusted tool results, boundary markers | None |
| **Canary Word System** | Secret word injected in system prompt; every LLM response checked for leakage | None |
| **PII Scrubber** | 20+ patterns auto-redacted before LLM API calls (keys, tokens, cards, crypto) | None |
| **Outbound PII Guard** | Tool arguments scrubbed before send_email/telegram_send — LLM can't leak secrets | None |
| **SSRF Protection** | Blocks localhost, private IPs, cloud metadata + redirect bypass protection | None |
| **Output Leak Detection** | Canary word + system prompt fragment monitoring in every LLM response | None |
| **Command Explanations** | Every command explained in plain language — what it does, risk level, consequences | No explanations |
| **Approval Modal** | Modal with LLM risk analysis, 60s countdown, consequences, safer alternatives | Simple modal without analysis |
| **Context Compression** | 3-tier progressive compression + pinned context (user name never forgotten) | Simple truncation, forgets user after ~2 weeks |
| **Session Auth** | X-Session-Token on every request, CORS-protected | No session protection |
| **Encryption** | AES-256-GCM with random key | AES-256-GCM with deterministic key (hostname+username) — vulnerability |
| **Rate Limiting** | 10 agent runs per minute | None |
| **Security Audit** | `security-audit.ts` — project-wide scanner for secrets and misconfigurations | None |
| **Tool Filtering** | LLM only sees tools it can actually use (filtered by skill policy) | All tools visible regardless |
| **LLM Providers** | 15+ (OpenAI, Anthropic, Gemini, DeepSeek, xAI, Ollama, and more) | Same |
| **License** | Source Available + CLA + Patent Grant | MIT |
| **Codebase** | Independent code, own brand | Original |

**Key difference**: TaskPilot is designed for non-technical users. Every command is explained in plain human language. Data never leaves your machine unprotected — PII scrubber strips secrets before API calls, prompt injection is detected and blocked, and output is monitored for leaks.

---

## Docs

- **[AGENTS.md](./AGENTS.md)** — Agent-first development guide (Engineering Harness)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System architecture diagram
- **[SECURITY.md](./SECURITY.md)** — Security model details
- **[golden-principles.md](./golden-principles.md)** — Code quality rules
- **[docs/](./docs/)** — Design docs, plans, quality grades

---

## License

**TaskPilot Source Available License v1.0** — free use (including commercial) with mandatory visible attribution:

> Powered by TaskPilot (github.com/NexTryApp/TaskPilot)

Includes CLA (contributions licensed under same terms) and Patent Grant. Details: [LICENSE](./LICENSE).
