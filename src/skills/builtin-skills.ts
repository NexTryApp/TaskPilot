/**
 * Built-in skill definitions.
 * These are always available even without a skills/ directory.
 */

import type { SkillDefinition } from './skill-types.js';

export const BUILTIN_SKILLS: Map<string, SkillDefinition> = new Map([

  // --- WEB RESEARCHER (safest) ---
  ['web-researcher', {
    name: 'web-researcher',
    description: 'Web browsing and search only — no terminal, no email, no messaging',
    icon: 'search',
    securityLevel: 'safe',
    allowedTools: ['browser_open', 'browser_search', 'open_url', 'browser_go', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_close', 'create_task', 'get_weather'],
    deniedTools: ['terminal_run', 'send_email', 'telegram_send', 'telegram_read', 'discord_send', 'discord_read', 'whatsapp_send', 'slack_send', 'slack_read'],
    safeBinsOnly: true,
    safetyRules: [
      'You can browse the web, search, and automate the browser (click buttons, fill forms, navigate).',
      'Use browser_go to open a page, browser_click to click, browser_type to fill inputs, browser_screenshot to see the page.',
      'You have NO access to the terminal, email, or messaging.',
      'If the user asks to run a command or send a message, explain that this skill does not allow it.',
    ],
    requireApprovalFor: [],
    body: '',
  }],

  // --- TASK MANAGER (safe) ---
  ['task-manager', {
    name: 'task-manager',
    description: 'Create tasks, check weather, search — no terminal or messaging',
    icon: 'tasks',
    securityLevel: 'safe',
    allowedTools: ['create_task', 'get_weather', 'browser_search', 'browser_open', 'open_url', 'browser_go', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_close'],
    deniedTools: ['terminal_run', 'send_email', 'telegram_send', 'telegram_read', 'discord_send', 'discord_read', 'whatsapp_send', 'slack_send', 'slack_read'],
    safeBinsOnly: true,
    safetyRules: [
      'You can create tasks, look up weather, and search the web.',
      'You can open URLs in the user\'s local browser using open_url.',
      'You have NO access to the terminal or messaging systems.',
    ],
    requireApprovalFor: [],
    body: '',
  }],

  // --- SAFE CODER (moderate) ---
  ['safe-coder', {
    name: 'safe-coder',
    description: 'Code editing and analysis — terminal with restrictions, no file deletion',
    icon: 'code',
    securityLevel: 'moderate',
    allowedTools: ['terminal_run', 'browser_open', 'browser_search', 'open_url', 'browser_go', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_close', 'create_task', 'get_weather'],
    deniedTools: ['send_email', 'telegram_send', 'telegram_read', 'discord_send', 'discord_read', 'whatsapp_send', 'slack_send', 'slack_read'],
    allowedCommands: [
      '^(cat|head|tail|grep|find|ls|dir|tree|pwd)\\b',
      '^(git|node|npm|npx|python|python3|pip|tsc|pnpm|yarn|bun)\\b',
      '^echo\\b',
      '^mkdir\\b',
      '^touch\\b',
      '^code\\b',
      '^type\\b',
    ],
    deniedCommands: [
      '\\brm\\b',
      '\\bdel\\b',
      '\\brmdir\\b',
      '\\bformat\\b',
      '\\bshutdown\\b',
      '\\breboot\\b',
    ],
    safeBinsOnly: false,
    safetyRules: [
      'You can read, create, and edit code files but NEVER delete them.',
      'Always inspect a file before modifying it.',
      'Use git to track changes and show diffs.',
      'If asked to delete files, explain that this skill does not allow deletion.',
    ],
    requireApprovalFor: ['terminal_run'],
    body: '',
  }],

  // --- SYS ADMIN (full access with warnings) ---
  ['sys-admin', {
    name: 'sys-admin',
    description: 'Full system access with danger warnings — for experienced users',
    icon: 'terminal',
    securityLevel: 'full',
    allowedTools: ['*'],
    deniedTools: [],
    safeBinsOnly: false,
    safetyRules: [
      'You have full system access but MUST warn the user before ANY destructive operation.',
      'Always explain what a command does BEFORE running it.',
      'Prefer non-destructive alternatives (e.g., mv to trash instead of rm).',
      'Never run commands that could damage the system without explicit user confirmation.',
    ],
    requireApprovalFor: ['terminal_run', 'send_email', 'whatsapp_send'],
    body: '',
  }],

]);

/**
 * Get all built-in skill names.
 */
export function getBuiltinSkillNames(): string[] {
  return Array.from(BUILTIN_SKILLS.keys());
}

/**
 * Get a built-in skill by name.
 */
export function getBuiltinSkill(name: string): SkillDefinition | undefined {
  return BUILTIN_SKILLS.get(name);
}
