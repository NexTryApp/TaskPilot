/**
 * Safe binaries whitelist.
 * Commands that are always allowed without any approval —
 * read-only text processing, info lookup, and dev tools.
 */

/** Set of safe executable names (lowercase). */
export const SAFE_BINS: Set<string> = new Set([
  // Text processing (read-only, stdin/stdout)
  'cat', 'head', 'tail', 'grep', 'egrep', 'fgrep',
  'awk', 'sed', 'sort', 'uniq', 'wc', 'cut', 'tr',
  'less', 'more', 'jq', 'yq',
  // REMOVED: 'tee' — writes to files, 'xargs' — can execute arbitrary commands

  // File info (read-only)
  'ls', 'dir', 'find', 'which', 'where', 'file',
  'stat', 'du', 'df', 'tree', 'realpath', 'basename', 'dirname',

  // System info (read-only)
  'pwd', 'whoami', 'hostname', 'uname', 'uptime', 'id',
  'locale', 'arch',
  // REMOVED: 'env', 'printenv' — leak all environment variables including secrets

  // Output
  'echo', 'printf', 'date', 'cal',

  // Dev tools (info/read-only)
  'node', 'python', 'python3', 'ruby', 'go',
  'tsc', 'npx', 'pnpm', 'yarn', 'bun',
  'type', 'help', 'man',

  // Windows PowerShell equivalents (read-only)
  'get-childitem', 'get-content', 'select-string',
  'get-location', 'get-process', 'get-service',
  'get-date', 'get-host', 'get-command',
  'measure-object', 'format-table', 'format-list',
  'out-string', 'convertto-json', 'convertfrom-json',
  'test-path', 'resolve-path',
]);

/** Flags on safe bins that make them dangerous. */
const DANGEROUS_FLAGS: Record<string, RegExp[]> = {
  find: [/-exec\b/, /-delete\b/, /-ok\b/],
  sed: [/-i\b/],   // in-place editing
  xargs: [/rm\b/, /del\b/, /rmdir\b/],
};

/** Git subcommands that are safe (read-only). */
const SAFE_GIT_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'branch', 'tag', 'show',
  'remote', 'config', 'stash', 'ls-files', 'ls-tree',
  'rev-parse', 'describe', 'shortlog', 'blame', 'reflog',
]);

/**
 * Check if a command uses only safe binaries.
 * Returns true if the command is safe to execute without approval.
 */
export function isSafeBinCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Extract the first token (executable)
  const tokens = trimmed.split(/\s+/);
  const executable = tokens[0].toLowerCase();

  // Special handling for git
  if (executable === 'git') {
    const subcommand = tokens[1]?.toLowerCase();
    if (!subcommand) return true; // just "git" = safe (shows help)
    return SAFE_GIT_SUBCOMMANDS.has(subcommand);
  }

  // Special handling for node/python with --version
  if (['node', 'python', 'python3', 'ruby', 'go', 'tsc', 'npx', 'pnpm', 'yarn', 'bun'].includes(executable)) {
    const arg = tokens[1]?.toLowerCase();
    if (!arg) return true; // just the binary name
    if (arg === '--version' || arg === '-v' || arg === '--help' || arg === '-h') return true;
    if (executable === 'npx' || executable === 'pnpm' || executable === 'yarn' || executable === 'bun') {
      // npx/pnpm/yarn can execute arbitrary code
      return false;
    }
    return false; // running scripts is not safe
  }

  // Check against safe bins set
  if (!SAFE_BINS.has(executable)) return false;

  // Check for dangerous flags on specific commands
  const dangerousFlags = DANGEROUS_FLAGS[executable];
  if (dangerousFlags) {
    const argsStr = trimmed.slice(executable.length);
    for (const flag of dangerousFlags) {
      if (flag.test(argsStr)) return false;
    }
  }

  return true;
}
