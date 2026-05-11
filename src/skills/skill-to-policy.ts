/**
 * Convert a SkillDefinition into an AccessPolicy for the existing ToolRegistry.
 * Also generates system prompt additions from safety rules.
 */

import type { AccessPolicy } from '../types.js';
import type { SkillDefinition } from './skill-types.js';
import { ExecGuard, type ExecGuardOptions } from '../security/exec-guard.js';

/**
 * Convert a skill definition into an AccessPolicy.
 *
 * The returned policy bundles ALL skill restrictions:
 *   - `allowedTools` / `deniedTools` are mirrored on the policy itself (ToolRegistry uses these).
 *   - `safeBinsOnly`, `allowedCommands`, `deniedCommands`, `requireApprovalFor` live INSIDE the
 *     guard closure (an ExecGuard instance) — they are enforced at every tool execution.
 *   - `skillName` is set on the policy as a marker.
 *
 * If you build an AccessPolicy by hand (without this function), the command-level and
 * approval-level restrictions are NOT enforced. Always go through this function when a
 * SkillDefinition exists.
 */
export function skillToAccessPolicy(
  skill: SkillDefinition,
  guardOptions?: Partial<ExecGuardOptions>
): { policy: AccessPolicy; guard: ExecGuard } {
  const execGuard = new ExecGuard({
    skill,
    ...guardOptions,
  });

  const policy: AccessPolicy = {
    allowedTools: skill.allowedTools,
    deniedTools: skill.deniedTools,
    guard: execGuard.createToolGuard(),
    skillName: skill.name,
  };

  return { policy, guard: execGuard };
}

/**
 * Generate system prompt additions from a skill's safety rules and body.
 */
export function skillToSystemPromptAddition(skill: SkillDefinition): string {
  const parts: string[] = [];

  parts.push(`\n\n## Security Skill: ${skill.name}`);
  parts.push(`Description: ${skill.description}`);
  parts.push(`Security Level: ${skill.securityLevel.toUpperCase()}`);

  if (skill.safetyRules.length > 0) {
    parts.push('\n### Safety Rules (MUST follow):');
    for (const rule of skill.safetyRules) {
      parts.push(`- ${rule}`);
    }
  }

  if (skill.deniedTools.length > 0) {
    parts.push(`\n### Denied Tools: ${skill.deniedTools.join(', ')}`);
    parts.push('You MUST NOT attempt to use these tools.');
  }

  if (skill.body) {
    parts.push(`\n### Additional Instructions:\n${skill.body}`);
  }

  return parts.join('\n');
}
