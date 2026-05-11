<p align="center">If this project helps you, you can support it <a href="https://www.buymeacoffee.com/civitaisaml">here</a> or simply ⭐ the repo</p>

<p align="center">
  <h1 align="center">TaskPilot</h1>
  <p align="center">Security-first AI agent framework</p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.3+-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/LLM_Providers-16+-orange" alt="16+ LLM Providers">
  <a href="https://www.buymeacoffee.com/civitaisaml"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee"></a>
</p>

AI agents that **can't** nuke your system. Built-in command security, LLM-powered explanations, skill-based access control, approval workflows, encrypted settings, and one-click launch.

**~2,000 lines of TypeScript** — small enough to read in an afternoon. Small enough to audit.

<!-- TODO: Add GIF demo here before launch -->
<!-- ![TaskPilot Demo](docs/demo.gif) -->

### Who is this for?

- **Developers** who want AI agents but don't trust them with `rm -rf /`
- **Teams** evaluating AI coding assistants and need a security layer
- **Students** learning about AI agents — small codebase, easy to understand
- **Self-hosters** who want everything local, no cloud, no telemetry
- **Anyone** who doesn't want to learn Rust or Go just to run an AI agent

> Unlike infrastructure-heavy frameworks (Rust binaries, Docker daemons, CLI wizards), TaskPilot is a **single TypeScript project** you can read, modify, and deploy in minutes.

### Highlights

- **Command Security** — dangerous commands (rm -rf, format, shutdown) are blocked before execution
- **LLM Explanations** — every command is explained in plain language before you approve it
- **Skill-Based Access** — 4 tiers from read-only web search to full system access
- **16+ LLM Providers** — OpenAI, Anthropic, Groq, Ollama (local), and more
- **Zero Config** — SQLite database, one-click launch, encrypted API key storage
- **Localhost Only** — no cloud, no telemetry, your data stays on your machine

---

## Quick Start

```bash
git clone https://github.com/NexTryApp/TaskPilot.git
cd TaskPilot
npm install
npx tsx web/server.ts
# Open http://localhost:4242
```

Or double-click `start.bat` (Windows) / `./start.sh` (Linux/macOS).

---

## Installation

### Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| **Node.js** | 18+ (recommended 20 LTS) | `node --version` |
| **npm** | comes with Node.js | `npm --version` |
| **Git** | any | `git --version` |

> **Don't have Node.js?** Download from [nodejs.org](https://nodejs.org/) — choose "LTS" version. Install with default settings.

---

### Option A: One Click

The easiest way. The launcher checks Node.js, installs dependencies automatically, and opens the browser.

**Windows:**
```
1. Download or clone the repository
2. Double-click start.bat
3. Browser opens at http://localhost:4242
```

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
# Browser opens at http://localhost:4242
```

The launcher will:
- Check that Node.js is installed
- Run `npm install` on first launch (if `node_modules/` doesn't exist)
- Create `data/` directory for the database
- Start the server and open your browser

---

### Option B: Step by Step

#### Windows

```powershell
# 1. Clone the repository
git clone https://github.com/NexTryApp/TaskPilot.git
cd TaskPilot

# 2. Install dependencies
npm install

# 3. Start the server
npx tsx web/server.ts

# 4. Open in browser
# http://localhost:4242
```

#### Linux / macOS

```bash
# 1. Clone the repository
git clone https://github.com/NexTryApp/TaskPilot.git
cd TaskPilot

# 2. Install dependencies
npm install

# 3. Start the server
npx tsx web/server.ts

# 4. Open in browser
# http://localhost:4242
```

---

### Option C: Docker (recommended for isolation)

```bash
git clone https://github.com/NexTryApp/TaskPilot.git
cd TaskPilot
docker compose up --build
# Open http://localhost:4242
```

Agent terminal commands run inside an **isolated sandbox container**, not on your host machine.

---

### After Launch

1. **Page 1 — Setup**: Choose an LLM provider (OpenAI, Anthropic, Gemini, etc.), paste your API key, optionally enable channels (Telegram, Browser, Terminal)
2. **Page 2 — Agent**: Pick a skill (Web Researcher = safest), set a goal, click "Start Agent"
3. **Page 3 — Dashboard**: Watch the agent work in real time — activity feed, security log, approval modals

Your API key is **saved encrypted** locally in `data/taskpilot.db` — you only need to enter it once.

> **No API key?** Use **Ollama** provider with a local model — completely free, no internet needed. Install [Ollama](https://ollama.com/), run `ollama pull llama3`, select "Ollama" in TaskPilot.

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

| Category | Commands | Level |
|----------|----------|-------|
| **Filesystem destruction** | `rm -rf`, `del /s /q`, `format C:`, `dd if=/dev/zero`, `shred`, `mkfs`, `wipefs`, `diskpart`, `truncate`, `Remove-Item -Recurse` | BLOCK |
| **Embedded destructive** | `find -exec rm`, `find -execdir shred`, `xargs rm`, `xargs rm -rf` | BLOCK |
| **System modification** | `shutdown`, `reboot`, `halt`, `poweroff`, `init 0/6`, `reg delete`, `bcdedit`, `kill 1`, `taskkill csrss/lsass` | BLOCK |
| **Privilege escalation** | `sudo su`, `sudo bash`, `chmod 777`, `chmod +s`, `runas /administrator`, `Set-ExecutionPolicy Bypass`, `docker run --privileged` | BLOCK |
| **Network attacks** | `nmap`, `netcat -l`, `iptables -F`, `ufw disable`, `netsh firewall off` | BLOCK |
| **Crypto/malware** | `xmrig`, `coinhive`, `stratum+tcp`, ransomware patterns | BLOCK |
| **Data exfiltration** | `curl/wget` + `.ssh`, `.env`, `/etc/passwd`, `.pem`, `.key`; `cat ~/.ssh/id_rsa`; `certutil -urlcache` | BLOCK |
| **Obfuscation** | `base64 \| bash`, `eval $(...)`, `curl \| sudo bash`, `powershell -EncodedCommand`, `python -c "exec"`, `wmic process call create` | BLOCK |
| **find -delete** | `find . -delete` | WARN |
| **Embedded file ops** | `find -exec mv/cp/chmod/chown` | WARN |
| **Package install** | `npm install`, `pip install`, `apt install`, `brew install`, `choco install` | WARN |
| **File modification** | `mv`, `chmod`, `chown`, `> /path`, `rsync --delete`, `scp` | WARN |
| **Env files** | `cat .env` | WARN |

### Approval Workflow

When a command triggers WARN level:
1. Agent pauses execution
2. UI shows a modal with the command and LLM-generated explanation
3. 60-second countdown timer
4. User clicks **Approve** or **Deny**
5. If timeout — automatic denial

### API Security

- **Session auth**: All sensitive endpoints require `X-Session-Token` (issued at page load, CORS-protected)
- **SSRF filter**: `browser_open` blocks localhost, private IPs, cloud metadata, non-http(s) schemes
- **Rate limiting**: Max 10 agent runs per minute (per IP)
- **Encrypted storage**: API keys encrypted with AES-256-GCM using a random key (`data/.encryption-key`)

### Security Advisor (LLM-Powered)

Every command the agent executes is explained in plain human language — both safe and dangerous. For WARN-level commands, the approval modal shows an LLM-generated risk analysis with consequences and safer alternatives.

- **Quick Explain**: ~30 common safe commands (ls, cat, grep, git) — instant, no LLM call
- **Full Explain**: All other commands — LLM analyzes risk, reversibility, and consequences
- **Multilingual**: Explanations in 13 languages (English, Russian, Spanish, Chinese, etc.)
- **Non-blocking**: Safe command explanations run async, don't slow down the agent

### Security Audit

```bash
npx tsx scripts/security-audit.ts
```

Scans the project for hardcoded secrets, unsafe patterns, skill misconfigurations, and .env issues.

---

## Skills

Skills define what an agent can do. Each skill controls available tools and security level.

| Skill | Level | Description |
|-------|-------|-------------|
| **Web Researcher** | Safe (green) | Only web search — no terminal, no files |
| **Task Manager** | Safe (green) | Tasks and information — no terminal |
| **Safe Coder** | Moderate (yellow) | Code without file deletion |
| **Sys Admin** | Full (red) | Full access for experienced users |

**Default: Web Researcher** — the safest option. Each next level includes all tools from the previous level + adds new ones.

### Tool Access Matrix

| Tool | Web Researcher | Task Manager | Safe Coder | Sys Admin |
|------|:-:|:-:|:-:|:-:|
| `browser_open` | + | + | + | + |
| `browser_search` | + | + | + | + |
| `create_task` | + | + | + | + |
| `get_weather` | + | + | + | + |
| `terminal_run` | - | - | + (restricted) | + |
| `send_email` | - | - | - | + |
| `telegram_send` | - | - | - | + |
| `telegram_read` | - | - | - | + |

**Safe Coder** terminal restrictions: only `cat`, `ls`, `grep`, `git`, `node`, `npm`, `python`, `mkdir`, `touch`, `echo`. Blocked: `rm`, `del`, `rmdir`, `format`, `shutdown`.

### Custom Skills

Create `.md` files in `skills/` directory with YAML frontmatter:

```yaml
---
name: My Custom Skill
description: What this skill does
icon: "wrench"
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
| **Moonshot (Kimi)** | `kimi-k2`, `moonshot-v1-128k` | `https://api.moonshot.ai/v1` |
| **Groq** | `llama-3.3-70b-versatile`, `mistral-saba-24b`, `gemma2-9b-it` | `https://api.groq.com/openai/v1` |
| **Mistral** | `mistral-large`, `mistral-small`, `codestral` | `https://api.mistral.ai/v1` |
| **Together** | `Llama-3.3-70B`, `Qwen2.5-72B` | `https://api.together.xyz/v1` |
| **MiniMax** | `MiniMax-M2.1`, `MiniMax-Text-01` | `https://api.minimax.chat/v1` |
| **Venice AI** | Dynamic model list | `https://api.venice.ai/api/v1` |
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
| **16+ LLM Providers** | Any OpenAI-compatible API |
| **Multilingual** | Command explanations in 13 languages |

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
| **Rate Limiting** | 10 agent runs per minute (per IP) | None |
| **Security Audit** | `security-audit.ts` — project-wide scanner for secrets and misconfigurations | None |
| **Tool Filtering** | LLM only sees tools it can actually use (filtered by skill policy) | All tools visible regardless |
| **LLM Providers** | 15+ (OpenAI, Anthropic, Gemini, DeepSeek, xAI, Ollama, and more) | Same |
| **License** | MIT | MIT |
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

## Bugs & Fixes (audit May 2026)

A multi-agent security and code audit was run in May 2026 and the issues below
were addressed. **Read this before upgrading or deploying** — some changes
affect default behavior (bind address, cache scope, model defaults).

### Critical fixes (behavior-changing)

| # | Area | What was wrong | What changed |
|---|---|---|---|
| C4 | `src/llm/openai-adapter.ts` | Default model was `'gpt-5.2'` (does not exist) — every run without an explicit `model` failed. | Default → `'gpt-4o-mini'`. Set `model` explicitly in `OpenAIAdapterOptions` for production. |
| C7 | `web/server.ts` | Server called `listen(PORT)` with no bind — Node defaulted to `0.0.0.0`, exposing the UI on the LAN. | Now binds to `127.0.0.1` by default. Override with `TASKPILOT_BIND=0.0.0.0` env var **only** behind firewall + auth. |
| C8 | `docker-compose.yml` | Port mapping `"4242:4242"` was bound to `0.0.0.0`. | Now `"127.0.0.1:4242:4242"`. Change explicitly for LAN exposure. |
| C2 | `src/tools/tool-cache.ts` | Cache key was `toolName + args` — one principal's cached results could leak to another. | Key now includes principal id (`scope::tool::args`). Pass `principalId` when getting/setting. |
| C3 | `src/tools/tool-cache.ts` | All tools were cacheable, including mutating ones (`send_email`, `telegram_send`) — re-invocation skipped the side effect. | Only read-only tools are cached (`DEFAULT_CACHEABLE_TOOLS`). Mutating calls are never cached. |
| C9 | `src/security/approval-manager.ts` | Approval IDs were `approval_${Date.now()}_${Math.random().slice(2,7)}` — ~5 chars of base36 entropy, brute-forceable. | IDs now use `crypto.randomUUID()` (122-bit CSPRNG). |
| C10 | `src/tools/tool-registry.ts` | `policy.guard` was silently skipped when `AccessContext` was missing — fail-open if a caller forgot to pass context. | Now fail-closed: guard configured + no context → `AccessDeniedError`. |

### High-severity fixes (security)

| # | Area | What was wrong | What changed |
|---|---|---|---|
| H1 | `src/security/dangerous-commands.ts` | Patterns were case-sensitive without `/i`, so `RM -RF /` slipped through; `\rm`, `'rm'`, `command rm`, `eval rm` defeated regex; Cyrillic homoglyphs (`рм`) passed unchecked. | `checkCommand` now NFKC-normalizes + lowercases + strips leading obfuscation wrappers; non-ASCII command names are blocked as homoglyph attacks. |
| H2 | `src/security/safe-bins.ts` | `python3 -c"..."` (no space), `node-e ...`, and `--eval`/`--exec` forms passed as safe — bare `python3`/`node` already covered, but compact forms were not. | `isSafeBinCommand` rejects `-c`/`-e`/`-m`/`--command`/`--eval`/`--exec` in any whitespace form, and applies the same normalization as H1. |
| H3 | `src/security/blocked-paths.ts` | `~/.ssh` was expanded only to `/users/.ssh` — but real paths are `/Users/<name>/.ssh`. Also `$HOME/.ssh`, `${HOME}/.ssh`, `%USERPROFILE%\.ssh` were not recognized. | Sensitive home leaves (`.ssh`, `.aws`, `.gnupg`, `.kube`, etc.) are matched as path components anywhere — catches every home-expansion form. |
| H4 | `src/llm/openai-adapter.ts` | No retry on 429/5xx/network errors → one rate-limit failure killed the run; no timeout; tool_calls beyond the first were dropped; provider error envelope `{error:{message}}` not parsed; no temperature/top_p/max_tokens config; `usage` ignored. | Added 3-attempt exponential backoff with jitter for 429/408/5xx/network; 60s `AbortController` timeout; provider error JSON parsed; `temperature`/`topP`/`maxTokens`/`timeoutMs`/`maxRetries` are now options; parallel `tool_calls` collected into `actions` (first one in `action` for back-compat); real `usage.{prompt,completion,total}_tokens` returned and used by `TokenTracker` when present. |
| H5 | `src/agent-loop.ts` | Token budget used a char-based estimate (~10–20% off real billing) even when the provider reported real `usage`. | Real `usage.totalTokens` is now preferred; char estimate is the fallback for adapters that don't return usage (mocks, some local servers). |

### Architectural notes

- `AccessPolicy` now carries an informational `skillName` marker (set by
  `skillToAccessPolicy`). When you build a policy by hand (without going
  through `skillToAccessPolicy`), the skill-level command restrictions
  (`safeBinsOnly`, `allowedCommands`, `deniedCommands`, `requireApprovalFor`)
  are NOT enforced — they live inside the guard closure. Build policies via
  `skillToAccessPolicy` whenever a SkillDefinition exists.

### Known limitations (not yet fixed)

- **Anthropic prompt caching / extended thinking**: the `OpenAIAdapter` uses
  the OpenAI-compat shim at `https://api.anthropic.com/v1`. This works for
  basic chat + tool calls but loses Anthropic-native features (~90% cost
  savings from prompt caching, extended thinking). A native `AnthropicAdapter`
  is on the roadmap.
- **Parallel tool_calls in the agent loop**: the OpenAI adapter now collects
  all parallel tool calls into `response.actions`, but the agent loop still
  processes only the first one (via `response.action`). Multi-action turns
  fall back to sequential execution.
- **Token estimator without `usage`**: when an adapter doesn't return usage
  (mock, some local servers), the char-based estimate is approximate.
  Use a real tokenizer (`tiktoken`) for production billing.
- **Windows file permissions**: `data/.encryption-key` is written with
  `{ mode: 0o600 }` — that's a no-op on NTFS. Protect the key file via
  Windows ACLs if running on Windows.
- **Custom YAML parser**: `skill-loader.ts` does not parse multi-line YAML
  values (`|`, `>`). Use single-line strings, or replace the parser with
  `js-yaml` if you need richer skill definitions.
- **`16+ LLM providers` claim**: only `OpenAIAdapter` and `MockLLMAdapter`
  ship as concrete classes. Other providers work via OpenAI-compat by
  passing `baseUrl` — but providers without true OpenAI-compat (Bedrock with
  AWS signing, native Anthropic features, Vertex AI) need dedicated adapters.

---

## Contributing

Contributions are welcome! Feel free to open issues or pull requests.

Please check the [Good First Issues](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) for a place to start.

---

## Support

If TaskPilot helps your work, consider supporting development:

<a href="https://www.buymeacoffee.com/civitaisaml" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

---

## License

[MIT](./LICENSE) — free to use, modify, and distribute.
