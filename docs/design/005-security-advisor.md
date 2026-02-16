# Design: Security Advisor

**Status:** Implemented
**Files:** `src/security/security-advisor.ts`, `web/server.ts`, `web/public/app.js`, `web/public/style.css`

## Problem

The existing security system (ExecGuard) classifies commands with regex patterns — fast and reliable, but it can only say BLOCK/WARN/ALLOW. It cannot explain *why* a command is dangerous, *what* might happen, or suggest a *safer alternative*. Non-technical users see a scary modal with a raw shell command and have no context to make a decision.

Additionally, safe commands (ALLOW) execute silently — the user has no idea what the agent is doing behind the scenes.

## Solution

**Security Advisor** — an LLM-powered layer that explains every command in plain human language (Russian + English).

Inspired by [OpenAI Aardvark](https://openai.com/index/introducing-aardvark/) — contextual security analysis using AI rather than static rules alone.

### Two Modes

| Mode | When | LLM Call? | Latency |
|------|------|-----------|---------|
| **Quick Explain** | Safe/known commands (`ls`, `cat`, `git status`, etc.) | No | ~0ms |
| **Full Explain** | All other commands (WARN, unknown) | Yes | ~1-3s |

### Quick Explain (Pattern-Based)

For ~30 common safe commands, `quickExplain()` returns a pre-built explanation without calling the LLM. Covers: `ls`, `cat`, `head`, `tail`, `grep`, `pwd`, `whoami`, `echo`, `date`, `git status/log/diff/branch`, `node --version`, `python --version`, `find`, `which`, `tree`, `df`, `du`, etc.

### Full Explain (LLM-Powered)

For all other commands, the advisor sends the command + context to the LLM with a specialized system prompt. The LLM returns a structured JSON response:

```typescript
interface CommandExplanation {
  whatItDoes: string;           // Russian, 1-2 sentences
  whatItDoesEn: string;         // English, 1-2 sentences
  risk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  reversible: boolean;
  consequences: string;         // What can go wrong (Russian)
  saferAlternative: string | null;  // Real working command
  recommendation: string;       // Short recommendation (Russian)
}
```

Context provided to the LLM for better analysis:
- Agent's goal
- Current skill
- Working directory
- Previous commands in this run (last 5)

### Architecture

```
Agent loop → onStep(tool_call, terminal_run)
  → quickExplain(command)
    → Match found? → SSE: command_explained → UI: security feed entry
    → No match?   → async explain(command, context)
                     → SSE: command_explained → UI: security feed entry

ExecGuard → WARN decision
  → async explain(command, context)
    → SSE: approval_analysis → UI: enriched approval modal
```

### SSE Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `command_explained` | CommandExplanation + command | Show explanation in security feed |
| `approval_analysis` | CommandExplanation + approvalId | Enrich approval modal with risk analysis |

### LRU Cache

Explanations are cached in memory (key = `command::goal`, max 200 entries). Prevents duplicate LLM calls for repeated commands within a run.

### Fallback

If the LLM fails (timeout, error, invalid JSON), the advisor returns a minimal fallback:
- `whatItDoes`: "Executes command: {binary name}"
- `risk`: "medium"
- `recommendation`: "Check the command before approving"

### UI Integration

**Security feed** — every command gets a colored entry:
- Green left border = safe
- Yellow = low/medium
- Orange = high
- Red = critical

Entry shows: command, Russian explanation, risk badge, reversibility icon.

**Approval modal** — when WARN is triggered, the modal starts with the command + standard explanation. After ~1-3s the LLM analysis arrives via `approval_analysis` SSE event and enriches the modal with:
- What the command does (detailed)
- Risk level with icon
- Consequences
- Safer alternative (if available)
- Recommendation

## Trade-offs

- **LLM cost**: Every non-safe command costs one LLM call. Mitigated by quickExplain (free for ~30 commands) and caching.
- **Latency**: Full explain adds 1-3s. For ALLOW commands, this runs async and doesn't block execution. For WARN commands, the user is already waiting for the modal, so the delay is acceptable.
- **LLM accuracy**: The advisor might misclassify risk. It's advisory only — ExecGuard makes the actual BLOCK/WARN/ALLOW decision. Advisor just explains.
- **No persistent cache**: Cache is per-run (in-memory). Cross-run caching could be added via SQLite, but the LLM's analysis depends on context (goal, previous commands), so caching across runs is less useful.
- **Same LLM for agent and advisor**: Both use the user's configured LLM. Could use a separate cheaper model for advisor, but adds complexity.
