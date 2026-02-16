/**
 * Skill type definitions.
 * A skill defines what an agent CAN and CANNOT do.
 */

export interface SkillDefinition {
  /** Unique skill name (slug). */
  name: string;
  /** English description. */
  description: string;
  /** Russian description. */
  descriptionRu: string;
  /** Icon emoji or name. */
  icon: string;
  /** Security level determines UI color indicator. */
  securityLevel: 'safe' | 'moderate' | 'full';

  // --- Tool access control ---
  /** Allowed tool names (['*'] = all). */
  allowedTools: string[];
  /** Explicitly denied tool names. */
  deniedTools: string[];

  // --- Command restrictions (for terminal_run) ---
  /** Regex patterns for allowed shell commands (if set, only matching commands pass). */
  allowedCommands?: string[];
  /** Regex patterns for denied shell commands. */
  deniedCommands?: string[];
  /** If true, only safe text-processing commands allowed in terminal. */
  safeBinsOnly?: boolean;

  // --- Safety rules (injected into system prompt) ---
  safetyRules: string[];

  // --- Approval settings ---
  /** Tool names that need user confirmation before execution. */
  requireApprovalFor?: string[];

  // --- Markdown body (from skill file) ---
  /** Additional instructions from the markdown body of the skill file. */
  body?: string;
}
