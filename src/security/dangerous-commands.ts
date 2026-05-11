/**
 * Dangerous command detection system.
 * Comprehensive blocklist of dangerous shell commands for Windows, Linux, and macOS.
 * Three severity levels: BLOCK (never), WARN (ask user), ALLOW (ok).
 */

export type CommandSeverity = 'BLOCK' | 'WARN' | 'ALLOW';
export type Platform = 'windows' | 'linux' | 'macos';

export interface CommandCheckResult {
  severity: CommandSeverity;
  category: string;
  pattern: string;
  explanation: string;
  command: string;
}

interface DangerousPattern {
  pattern: RegExp;
  severity: CommandSeverity;
  category: string;
  explanation: string;
  platforms: Platform[];
}

// ============================================================================
// DANGEROUS PATTERNS DATABASE
// ============================================================================

const DANGEROUS_PATTERNS: DangerousPattern[] = [

  // --- FILESYSTEM DESTRUCTION (BLOCK) ---

  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f)?|(-[a-zA-Z]*f[a-zA-Z]*\s+)?-[a-zA-Z]*r)/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive force delete — can wipe entire directories permanently',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\brm\s+.*[\/~*]/,
    severity: 'WARN',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'File deletion command — verify the target path',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bdel\s+.*\/[sS]\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive file deletion on Windows — can wipe entire directories',
    platforms: ['windows'],
  },
  {
    pattern: /\b(rd|rmdir)\s+.*\/[sS]\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive directory removal on Windows',
    platforms: ['windows'],
  },
  {
    pattern: /\bRemove-Item\b.*-Recurse/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'PowerShell recursive deletion — can wipe directories permanently',
    platforms: ['windows'],
  },
  {
    pattern: /\bformat\s+[a-zA-Z]:/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Disk format command — will destroy ALL data on the drive',
    platforms: ['windows'],
  },
  {
    pattern: /\bdd\s+.*if=\/dev\/(zero|urandom|random)/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Low-level disk write — can overwrite entire disk or partition',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bmkfs\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Create filesystem command — equivalent to formatting a drive',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bshred\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Secure file erasure — permanently destroys file data',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bwipefs\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Wipe filesystem signatures — can make partitions unrecoverable',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bdiskpart\b/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Windows disk partition manager — can destroy partitions',
    platforms: ['windows'],
  },
  {
    pattern: /\bcipher\s+.*\/[wW]/i,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Wipe free disk space — slow and irreversible',
    platforms: ['windows'],
  },

  // --- SYSTEM MODIFICATION (BLOCK) ---

  {
    pattern: /\b(shutdown|poweroff|halt)\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System shutdown/halt command — will turn off the computer',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\breboot\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System reboot — will restart the computer, interrupting all work',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\binit\s+[06]\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'System runlevel change — shutdown (0) or reboot (6)',
    platforms: ['linux'],
  },
  {
    pattern: /\breg\s+(delete|add)\b/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Windows registry modification — can break system configuration',
    platforms: ['windows'],
  },
  {
    pattern: /\bbcdedit\b/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Boot configuration editor — can make system unbootable',
    platforms: ['windows'],
  },
  {
    pattern: /\bsystemctl\s+(stop|disable)\s+(ssh|sshd|networking|firewall|ufw|iptables)\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Stopping critical system service — may lose network/SSH access',
    platforms: ['linux'],
  },
  {
    pattern: /\bkill\s+(-9\s+)?1\b/,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Killing PID 1 (init/systemd) — will crash the system',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\btaskkill\s+.*\/(im|pid)\s+(csrss|winlogon|lsass|svchost|smss|services)/i,
    severity: 'BLOCK',
    category: 'SYSTEM_MODIFICATION',
    explanation: 'Killing critical Windows process — will crash or blue-screen the system',
    platforms: ['windows'],
  },

  // --- PRIVILEGE ESCALATION (BLOCK) ---

  {
    pattern: /\bsudo\s+(su|bash|sh|-i|-s|--login)\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Escalation to root shell — full system access, extremely dangerous',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\s+[247]77\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Setting world-writable permissions — security vulnerability',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\s+[u+]*s\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Setting SUID bit — allows running as owner (privilege escalation)',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\brunas\s+.*\/user:\s*(administrator|admin|system)/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Running as Administrator — full system access',
    platforms: ['windows'],
  },
  {
    pattern: /\bSet-ExecutionPolicy\s+(Unrestricted|Bypass)\b/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Removing PowerShell script execution restrictions',
    platforms: ['windows'],
  },
  {
    pattern: /\bpasswd\s+root\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Changing root password — system administration action',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bnet\s+user\s+administrator\b/i,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Modifying administrator account on Windows',
    platforms: ['windows'],
  },

  // --- NETWORK ATTACKS (BLOCK) ---

  {
    pattern: /\bnmap\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Network port scanner — used for reconnaissance attacks',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(netcat|nc)\s+(-[a-zA-Z]*l)/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Network listener — can be used as backdoor',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\biptables\s+-F\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Flushing firewall rules — removes all network protection',
    platforms: ['linux'],
  },
  {
    pattern: /\bufw\s+disable\b/,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Disabling firewall — removes network protection',
    platforms: ['linux'],
  },
  {
    pattern: /\bnetsh\s+advfirewall\s+set\s+.*state\s+off/i,
    severity: 'BLOCK',
    category: 'NETWORK_ATTACKS',
    explanation: 'Disabling Windows Firewall — removes network protection',
    platforms: ['windows'],
  },

  // --- CRYPTO / MALWARE (BLOCK) ---

  {
    pattern: /\b(xmrig|coinhive|cryptonight|stratum\+tcp|minergate)\b/i,
    severity: 'BLOCK',
    category: 'CRYPTO_MALWARE',
    explanation: 'Cryptocurrency mining software detected — uses system resources',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(ransomware|encrypt.*all|lock.*files)\b/i,
    severity: 'BLOCK',
    category: 'CRYPTO_MALWARE',
    explanation: 'Ransomware-like pattern detected',
    platforms: ['linux', 'macos', 'windows'],
  },

  // --- DATA EXFILTRATION (BLOCK) ---

  {
    pattern: /\b(curl|wget)\b.*(\.(ssh|aws|env|gnupg)|\/etc\/(passwd|shadow)|credentials|\.pem|\.key)\b/i,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'Sending sensitive files over network — potential data leak',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\bcat\s+.*\.ssh\/(id_rsa|id_ed25519|authorized_keys)\b/,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'Reading SSH private keys — potential security breach',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bcat\s+.*\.env\b/,
    severity: 'WARN',
    category: 'DATA_EXFILTRATION',
    explanation: 'Reading .env file — may contain API keys and secrets',
    platforms: ['linux', 'macos', 'windows'],
  },

  // --- OBFUSCATION (BLOCK) ---

  {
    pattern: /\bbase64\b.*\|\s*(bash|sh|python|perl|ruby|node)\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Base64 encoded command piped to interpreter — obfuscated execution',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\beval\s*\$\(/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Evaluating command substitution output — obfuscated execution',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /powershell.*-[eE](nc|ncodedCommand)\b/i,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'PowerShell encoded command — hidden/obfuscated script execution',
    platforms: ['windows'],
  },
  {
    pattern: /\b(python|python3|node)\s+-[ce]\s+["'].*exec\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Inline code execution with exec — potentially obfuscated',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(curl|wget)\b.*\|\s*(bash|sh|sudo)\b/,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'Downloading and executing remote script — extremely dangerous',
    platforms: ['linux', 'macos'],
  },

  // --- EMBEDDED COMMANDS: find -exec, xargs, etc. (BLOCK/WARN) ---

  {
    pattern: /\bfind\b.*-exec\s+(rm|shred|dd|mkfs|wipefs)\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Destructive command embedded in find -exec — can delete/destroy matched files',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bfind\b.*-execdir\s+(rm|shred|dd|mkfs|wipefs)\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Destructive command embedded in find -execdir — can delete/destroy matched files',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bfind\b.*-delete\b/,
    severity: 'WARN',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'find -delete removes all matched files — verify the filter is correct',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bxargs\s+(rm|shred|dd|mkfs|wipefs)\b/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Destructive command via xargs — can delete/destroy piped file list',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bxargs\s+rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*)/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Recursive/force delete via xargs — can wipe entire directory trees',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bfind\b.*-exec\s+chmod\s+[247]77\b/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Setting world-writable permissions on matched files via find -exec',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bfind\b.*-exec\s+(mv|cp|chmod|chown)\b/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'File modification command embedded in find -exec — verify the filter is correct',
    platforms: ['linux', 'macos'],
  },

  // --- ADDITIONAL DANGEROUS TOOLS (BLOCK) ---

  {
    pattern: /\btruncate\s+/,
    severity: 'BLOCK',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'Truncate command — can zero out file contents irreversibly',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bcertutil\s+.*-urlcache/i,
    severity: 'BLOCK',
    category: 'DATA_EXFILTRATION',
    explanation: 'certutil URL download — often used to download malicious payloads',
    platforms: ['windows'],
  },
  {
    pattern: /\bwmic\s+.*process\s+call\s+create/i,
    severity: 'BLOCK',
    category: 'OBFUSCATION',
    explanation: 'WMIC process creation — can execute arbitrary programs covertly',
    platforms: ['windows'],
  },
  {
    pattern: /\bdocker\s+run\b.*--privileged/,
    severity: 'BLOCK',
    category: 'PRIVILEGE_ESCALATION',
    explanation: 'Docker privileged mode — disables container isolation, full host access',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\brsync\b.*--delete/,
    severity: 'WARN',
    category: 'FILESYSTEM_DESTRUCTION',
    explanation: 'rsync with --delete — may remove files on destination that do not exist on source',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bscp\b/,
    severity: 'WARN',
    category: 'DATA_EXFILTRATION',
    explanation: 'Secure copy — transferring files to/from remote server',
    platforms: ['linux', 'macos'],
  },

  // --- PACKAGE INSTALL (WARN) ---

  {
    pattern: /\bnpm\s+install\s+(-g|--global)\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing global npm package — modifies system Node.js installation',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\bnpm\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing npm packages — downloads code from the internet',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\bpip3?\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Python package — downloads code from the internet',
    platforms: ['linux', 'macos', 'windows'],
  },
  {
    pattern: /\b(apt|apt-get|yum|dnf|pacman)\s+(install|update|upgrade)\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'System package management — modifies installed software',
    platforms: ['linux'],
  },
  {
    pattern: /\b(choco|winget)\s+install\b/i,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Windows package — downloads and installs software',
    platforms: ['windows'],
  },
  {
    pattern: /\bbrew\s+install\b/,
    severity: 'WARN',
    category: 'PACKAGE_INSTALL',
    explanation: 'Installing Homebrew package — downloads and installs software',
    platforms: ['macos'],
  },

  // --- FILE MODIFICATION (WARN) ---

  {
    pattern: /\bmv\s+/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Moving/renaming files — verify source and destination',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchmod\b/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Changing file permissions',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: /\bchown\b/,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Changing file ownership',
    platforms: ['linux', 'macos'],
  },
  {
    pattern: />\s*\//,
    severity: 'WARN',
    category: 'FILE_MODIFICATION',
    explanation: 'Redirecting output to an absolute path — may overwrite important file',
    platforms: ['linux', 'macos'],
  },
];

// ============================================================================
// MAIN CHECK FUNCTION
// ============================================================================

/**
 * Normalize a command for matching against dangerous patterns.
 *
 * Without normalization, many bypasses are trivial:
 *   - `RM -RF /`           — case differs from `rm`
 *   - `\rm -rf /`          — leading backslash defeats shell alias resolution AND defeats our regex
 *   - `'rm' -rf /`         — quoted command name
 *   - `command rm -rf /`   — bypass via the `command` builtin
 *   - `рм -rf /`           — Cyrillic homoglyphs (looks like ASCII)
 *
 * This function:
 *   1. Strips leading whitespace
 *   2. Applies Unicode NFKC normalization (catches compat ligatures)
 *   3. Lowercases ASCII (DANGEROUS_PATTERNS use lowercase forms)
 *   4. Strips leading obfuscation wrappers: \, ', ", `command`, `exec`, `eval`
 *
 * Note: Cyrillic/Greek homoglyphs survive NFKC. They are caught by the separate
 * `hasNonAsciiCommandName` check in the caller.
 */
function normalizeForMatch(command: string): string {
  let s = command.trim().normalize('NFKC').toLowerCase();
  // Strip leading shell-builtin wrappers used to defeat aliases / our matcher
  // (loop because they can chain: `command exec rm -rf /`).
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/^[\\'"`]+/, '');
    s = s.replace(/^(?:command|exec|eval|builtin)\s+/, '');
    if (s === before) break;
  }
  // Within the FIRST token only, strip all single/double quotes and backticks.
  // Catches `'rm' -rf /`, `"rm" -rf /`, `r'm' -rf /` (bash quote-concatenation).
  // We don't touch later tokens — paths like `'/etc/foo bar'` legitimately use quotes.
  const firstSpace = s.search(/\s/);
  if (firstSpace === -1) {
    s = s.replace(/['"`]/g, '');
  } else {
    s = s.slice(0, firstSpace).replace(/['"`]/g, '') + s.slice(firstSpace);
  }
  return s;
}

/**
 * Detect a command whose first token contains non-ASCII chars — likely a homoglyph
 * attack (e.g. Cyrillic `рм` rendering as Latin `rm`). Legitimate shell commands
 * have ASCII-only names on Windows, macOS, and Linux.
 */
function hasNonAsciiCommandName(command: string): boolean {
  const firstToken = command.trim().split(/\s+/)[0] ?? '';
  // Strip the obfuscation wrappers used in normalizeForMatch before checking
  const stripped = firstToken.replace(/^[\\'"`]+/, '');
  return /[^\x00-\x7F]/.test(stripped);
}

/**
 * Check a single command segment against all dangerous patterns.
 * Returns all matching results (a command can match multiple categories).
 */
export function checkCommand(command: string, platform: Platform): CommandCheckResult[] {
  const results: CommandCheckResult[] = [];
  const trimmed = command.trim();

  if (!trimmed) return results;

  // SECURITY: non-ASCII in the command name is almost always a homoglyph bypass
  // attempt (no real shell binary is named in Cyrillic / Greek / Han). Block it.
  if (hasNonAsciiCommandName(trimmed)) {
    results.push({
      severity: 'BLOCK',
      category: 'HOMOGLYPH_BYPASS',
      pattern: 'non-ascii-command-name',
      explanation: 'Command name contains non-ASCII characters — likely a homoglyph attack attempting to bypass security checks',
      command: trimmed,
    });
    return results;
  }

  const normalizedCmd = normalizeForMatch(trimmed);

  for (const dp of DANGEROUS_PATTERNS) {
    // Filter by platform
    if (!dp.platforms.includes(platform) && !dp.platforms.includes('linux' as Platform)) {
      const isAll = dp.platforms.length === 3;
      if (!isAll) continue;
    }

    if (dp.pattern.test(normalizedCmd)) {
      results.push({
        severity: dp.severity,
        category: dp.category,
        pattern: dp.pattern.source,
        explanation: dp.explanation,
        command: trimmed,
      });
    }
  }

  return results;
}

/**
 * Get the worst severity from a list of check results.
 */
export function worstSeverity(results: CommandCheckResult[]): CommandSeverity {
  if (results.some(r => r.severity === 'BLOCK')) return 'BLOCK';
  if (results.some(r => r.severity === 'WARN')) return 'WARN';
  return 'ALLOW';
}

/**
 * Detect current platform.
 */
export function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}
