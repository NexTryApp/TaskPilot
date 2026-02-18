/**
 * ExecGuard: central security gating layer.
 * Intercepts ALL tool executions before they happen.
 * Integrates: dangerous commands, safe bins, blocked paths, skill restrictions.
 * Produces a ToolGuard compatible with the existing AccessPolicy system.
 */

import type { AccessContext, ToolGuard } from '../types.js';
import type { SkillDefinition } from '../skills/skill-types.js';
import { splitAndAnalyze, type ChainAnalysis } from './command-chain-analyzer.js';
import { isSafeBinCommand } from './safe-bins.js';
import { containsBlockedPath } from './blocked-paths.js';
import { detectPlatform, type CommandCheckResult, type Platform } from './dangerous-commands.js';
import { ApprovalManager, type PendingApproval } from './approval-manager.js';

export type ExecDecision = {
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  reason: string;
  checks: CommandCheckResult[];
  requiresApproval: boolean;
  approvalId?: string;
};

export type ApprovalCallback = (
  approval: PendingApproval
) => void;

export interface ExecGuardOptions {
  skill?: SkillDefinition;
  platform?: Platform;
  onApprovalNeeded?: ApprovalCallback;
  approvalManager?: ApprovalManager;
}

export class ExecGuard {
  private skill: SkillDefinition | undefined;
  private platform: Platform;
  private onApprovalNeeded: ApprovalCallback | undefined;
  private approvalManager: ApprovalManager;

  constructor(options: ExecGuardOptions = {}) {
    this.skill = options.skill;
    this.platform = options.platform ?? detectPlatform();
    this.onApprovalNeeded = options.onApprovalNeeded;
    this.approvalManager = options.approvalManager ?? new ApprovalManager();
  }

  /**
   * Check a shell command and return a decision.
   */
  checkCommand(command: string): ExecDecision {
    // 1. Blocked paths check FIRST — even "safe" commands must not touch sensitive paths
    const blockedPath = containsBlockedPath(command, this.platform);
    if (blockedPath) {
      return {
        action: 'BLOCK',
        reason: blockedPath.explanation,
        checks: [{
          severity: 'BLOCK',
          category: 'BLOCKED_PATH',
          pattern: blockedPath.path,
          explanation: blockedPath.explanation,
          command,
        }],
        requiresApproval: false,
      };
    }

    // 3. Safe bin check — allow read-only utilities (after path check)
    if (isSafeBinCommand(command)) {
      return {
        action: 'ALLOW',
        reason: 'Safe command (read-only utility)',
        checks: [],
        requiresApproval: false,
      };
    }

    // 4. Chain analysis — check each segment for dangerous patterns
    const analysis: ChainAnalysis = splitAndAnalyze(command, this.platform);

    // 5. Skill-specific command restrictions
    if (this.skill) {
      // Check denied command patterns
      if (this.skill.deniedCommands?.length) {
        for (const pattern of this.skill.deniedCommands) {
          const re = new RegExp(pattern, 'i');
          if (re.test(command)) {
            return {
              action: 'BLOCK',
              reason: `Blocked by skill "${this.skill.name}" — denied pattern: ${pattern}`,
              checks: [{
                severity: 'BLOCK',
                category: 'SKILL_DENIED',
                pattern,
                explanation: `Skill "${this.skill.name}" denies this command pattern`,
                command,
              }],
              requiresApproval: false,
            };
          }
        }
      }

      // Check allowed command patterns (if specified, only matching commands pass)
      if (this.skill.allowedCommands?.length) {
        const allowed = this.skill.allowedCommands.some(pattern => {
          const re = new RegExp(pattern, 'i');
          return re.test(command);
        });
        if (!allowed) {
          return {
            action: 'BLOCK',
            reason: `Blocked by skill "${this.skill.name}" — command not in allowed list`,
            checks: [{
              severity: 'BLOCK',
              category: 'SKILL_NOT_ALLOWED',
              pattern: 'allowedCommands',
              explanation: `Skill "${this.skill.name}" only allows specific command patterns`,
              command,
            }],
            requiresApproval: false,
          };
        }
      }

      // safeBinsOnly mode
      if (this.skill.safeBinsOnly) {
        return {
          action: 'BLOCK',
          reason: `Blocked by skill "${this.skill.name}" — only safe read-only commands allowed`,
          checks: [{
            severity: 'BLOCK',
            category: 'SKILL_SAFE_BINS_ONLY',
            pattern: 'safeBinsOnly',
            explanation: `Skill "${this.skill.name}" restricts to safe read-only commands`,
            command,
          }],
          requiresApproval: false,
        };
      }
    }

    // 6. Return based on worst severity from chain analysis
    if (analysis.worstSeverity === 'BLOCK') {
      const blockChecks = analysis.allChecks.filter(c => c.severity === 'BLOCK');
      return {
        action: 'BLOCK',
        reason: blockChecks[0]?.explanation ?? 'Command blocked by security policy',
        checks: analysis.allChecks,
        requiresApproval: false,
      };
    }

    if (analysis.worstSeverity === 'WARN') {
      const warnChecks = analysis.allChecks.filter(c => c.severity === 'WARN');
      return {
        action: 'WARN',
        reason: warnChecks[0]?.explanation ?? 'Command requires user approval',
        checks: analysis.allChecks,
        requiresApproval: true,
      };
    }

    // Default: allow
    return {
      action: 'ALLOW',
      reason: 'Command passed all security checks',
      checks: [],
      requiresApproval: false,
    };
  }

  /**
   * Check any tool invocation (not just terminal_run).
   */
  checkToolCall(toolName: string, args: Record<string, unknown>): ExecDecision {
    // For terminal_run, analyze the command
    if (toolName === 'terminal_run') {
      const command = String(args['command'] || '');
      return this.checkCommand(command);
    }

    // For other tools, check if they require approval per skill config
    if (this.skill?.requireApprovalFor?.includes(toolName)) {
      return {
        action: 'WARN',
        reason: `Tool "${toolName}" requires user approval for skill "${this.skill.name}"`,
        checks: [],
        requiresApproval: true,
      };
    }

    return {
      action: 'ALLOW',
      reason: 'Tool allowed',
      checks: [],
      requiresApproval: false,
    };
  }

  /**
   * Create a ToolGuard function compatible with AccessPolicy.
   * This is the main integration point with the existing ToolRegistry.
   */
  createToolGuard(): ToolGuard {
    return async (
      _context: AccessContext,
      toolName: string,
      args: Record<string, unknown>
    ): Promise<boolean | void> => {
      const decision = this.checkToolCall(toolName, args);

      if (decision.action === 'BLOCK') {
        // Throw with detailed message so the agent gets feedback
        throw new Error(
          `[SECURITY BLOCK] ${decision.reason}\n` +
          decision.checks.map(c => `  - ${c.category}: ${c.explanation}`).join('\n')
        );
      }

      if (decision.action === 'WARN' && decision.requiresApproval) {
        // Request user approval via the approval manager
        const { promise, approval } = this.approvalManager.requestApproval(
          decision,
          toolName,
          args
        );

        // Notify the UI
        this.onApprovalNeeded?.(approval);

        // Wait for user response (blocks the agent loop)
        const approved = await promise;

        if (!approved) {
          throw new Error(
            `[SECURITY DENIED] User denied execution.\n` +
            `Tool: ${toolName}\n` +
            `Reason: ${decision.reason}`
          );
        }

        // User approved — continue execution
        return true;
      }

      // ALLOW — no action needed
      return true;
    };
  }

  /** Get the approval manager for external control (e.g., REST API). */
  getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }
}
