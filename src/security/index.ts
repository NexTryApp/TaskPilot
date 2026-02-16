/**
 * Security module — centralized exports.
 */

export {
  checkCommand,
  worstSeverity,
  detectPlatform,
  type CommandSeverity,
  type CommandCheckResult,
  type Platform,
} from './dangerous-commands.js';

export {
  splitCommandChain,
  splitAndAnalyze,
  hasCommandSubstitution,
  type ChainSegment,
  type ChainAnalysis,
} from './command-chain-analyzer.js';

export {
  SAFE_BINS,
  isSafeBinCommand,
} from './safe-bins.js';

export {
  containsBlockedPath,
} from './blocked-paths.js';

export {
  ExecGuard,
  type ExecDecision,
  type ExecGuardOptions,
  type ApprovalCallback,
} from './exec-guard.js';

export {
  ApprovalManager,
} from './approval-manager.js';

export {
  runSecurityAudit,
  type AuditFinding,
  type Severity,
} from './security-audit.js';

export {
  SecurityAdvisor,
  type CommandExplanation,
  type AdvisorContext,
} from './security-advisor.js';
