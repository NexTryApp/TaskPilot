# Design: Skill System

**Status:** Implemented
**Files:** `src/skills/`, `skills/`

## Problem

Different users need different levels of agent capability. A researcher needs only web search. A developer needs terminal. An admin needs everything. One-size-fits-all is either too restrictive or too dangerous.

## Solution

**Skills** — named configurations that control:
- Which tools the agent can use (`allowedTools` / `deniedTools`)
- Security level (safe / moderate / full)
- Whether only safe binaries are allowed (`safeBinsOnly`)
- Command pattern restrictions (`allowedCommands` / `deniedCommands`)
- Safety rules injected into the system prompt

### Built-in Skills

| Skill | Level | Tools |
|-------|-------|-------|
| web-researcher | safe | browser_open, browser_search |
| task-manager | safe | create_task, get_weather, browser_search |
| safe-coder | moderate | terminal_run (restricted), browser_* |
| sys-admin | full | * (all, with warnings) |

### Custom Skills

Users create `.md` files in `skills/` with YAML frontmatter. Parsed by `skill-loader.ts` (custom parser, no YAML dependency).

### Integration

`skillToAccessPolicy()` converts a SkillDefinition into an AccessPolicy + ExecGuard (ToolGuard). This plugs directly into the existing ToolRegistry without any changes to the agent loop.

## Trade-offs

- **No runtime skill switching**: Skill is fixed for the entire run. Simpler, more predictable.
- **Frontmatter parser is simple**: Doesn't handle all YAML edge cases. Sufficient for skill definitions.
- **Safety rules are advisory**: Added to system prompt but LLM may ignore them. Hard enforcement via ExecGuard compensates.
