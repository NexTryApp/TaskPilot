/**
 * Command chain analyzer: splits compound shell commands (&&, ||, ;, |)
 * and analyzes each segment for dangerous patterns.
 */

import { checkCommand, worstSeverity, type CommandCheckResult, type CommandSeverity, type Platform } from './dangerous-commands.js';

export interface ChainSegment {
  raw: string;
  operator: '&&' | '||' | ';' | '|' | null;
  checks: CommandCheckResult[];
  severity: CommandSeverity;
}

export interface ChainAnalysis {
  segments: ChainSegment[];
  worstSeverity: CommandSeverity;
  hasSubstitution: boolean;
  allChecks: CommandCheckResult[];
}

/**
 * Split a shell command string by chain operators (&&, ||, ;)
 * while respecting single quotes, double quotes, and escape chars.
 */
export function splitCommandChain(command: string): { raw: string; operator: '&&' | '||' | ';' | '|' | null }[] {
  const segments: { raw: string; operator: '&&' | '||' | ';' | '|' | null }[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let lastOperator: '&&' | '||' | ';' | '|' | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      current += ch;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    // Only split if not inside quotes
    if (!inSingle && !inDouble) {
      if (ch === '&' && next === '&') {
        if (current.trim()) {
          segments.push({ raw: current.trim(), operator: lastOperator });
        }
        lastOperator = '&&';
        current = '';
        i++; // skip next &
        continue;
      }

      if (ch === '|' && next === '|') {
        if (current.trim()) {
          segments.push({ raw: current.trim(), operator: lastOperator });
        }
        lastOperator = '||';
        current = '';
        i++; // skip next |
        continue;
      }

      if (ch === ';') {
        if (current.trim()) {
          segments.push({ raw: current.trim(), operator: lastOperator });
        }
        lastOperator = ';';
        current = '';
        continue;
      }

      if (ch === '|') {
        if (current.trim()) {
          segments.push({ raw: current.trim(), operator: lastOperator });
        }
        lastOperator = '|';
        current = '';
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push({ raw: current.trim(), operator: lastOperator });
  }

  return segments;
}

/**
 * Detect command substitution ($(...) or `...`) in a command string.
 */
export function hasCommandSubstitution(command: string): boolean {
  // Check for $(...) — skip $() inside single quotes
  let inSingle = false;
  for (let i = 0; i < command.length; i++) {
    if (command[i] === "'" && (i === 0 || command[i - 1] !== '\\')) {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle) {
      if (command[i] === '$' && command[i + 1] === '(') return true;
      if (command[i] === '`') return true;
    }
  }
  return false;
}

/**
 * Split and analyze a full command string.
 * Returns analysis with per-segment checks and overall worst severity.
 */
export function splitAndAnalyze(command: string, platform: Platform): ChainAnalysis {
  const rawSegments = splitCommandChain(command);
  const segments: ChainSegment[] = [];
  const allChecks: CommandCheckResult[] = [];

  for (const seg of rawSegments) {
    const checks = checkCommand(seg.raw, platform);
    allChecks.push(...checks);
    segments.push({
      raw: seg.raw,
      operator: seg.operator,
      checks,
      severity: checks.length > 0 ? worstSeverity(checks) : 'ALLOW',
    });
  }

  const hasSub = hasCommandSubstitution(command);

  // Command substitution is always a warning
  if (hasSub) {
    allChecks.push({
      severity: 'WARN',
      category: 'OBFUSCATION',
      pattern: 'command_substitution',
      explanation: 'Contains command substitution ($() or backticks) — embedded commands may be hidden',
      explanationRu: 'Содержит подстановку команд ($() или обратные кавычки) — скрытые команды внутри',
      command,
    });
  }

  return {
    segments,
    worstSeverity: worstSeverity(allChecks),
    hasSubstitution: hasSub,
    allChecks,
  };
}
