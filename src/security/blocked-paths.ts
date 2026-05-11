/**
 * Blocked paths: sensitive system paths that commands should not access.
 * Prevents accidental or malicious access to critical system files.
 *
 * SECURITY notes:
 *   - We normalize the command (NFKC + lowercase + backslashes → forward slashes)
 *     before matching, so `C:\Windows\System32` and `c:/windows/system32` are equal.
 *   - For home-directory items (`~/.ssh`, `%USERPROFILE%\.ssh`), we match the
 *     SENSITIVE LEAF (e.g. `.ssh`, `.aws`, `.gnupg`) as a path component anywhere
 *     in the command. This catches every form:
 *         ~/.ssh, $HOME/.ssh, ${HOME}/.ssh, %USERPROFILE%\.ssh,
 *         /home/alice/.ssh, /Users/alice/.ssh, C:\Users\Alice\.ssh
 *     Previously only `/users/.ssh` (with no username) would have matched — every
 *     real path (which includes the username) slipped through.
 */

import type { Platform } from './dangerous-commands.js';

/** Absolute system paths blocked regardless of user. */
const ABSOLUTE_BLOCKED_PATHS: Record<Platform, string[]> = {
  linux: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/proc',
    '/sys',
    '/dev',
    '/boot',
    '/var/run/docker.sock',
    '/run/docker.sock',
  ],
  macos: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/system',
    '/library/keychains',
    '/private/etc',
    '/private/var/run',
  ],
  windows: [
    'c:/windows/system32',
    'c:/windows/syswow64',
    'c:/windows/system32/config',
  ],
};

/**
 * Sensitive directory names that should be blocked anywhere under a user home.
 * These are matched as path components (e.g. `/anything/.ssh/anything` matches).
 */
const SENSITIVE_HOME_LEAVES = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
  '.config/gcloud',
  '.docker/config.json',
  '.netrc',
];

/** Normalize a command string for path matching. */
function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\\/g, '/');
}

/** Check whether a command references a blocked/sensitive path. */
export function containsBlockedPath(
  command: string,
  platform: Platform
): { blocked: boolean; path: string; explanation: string } | null {
  const normalizedCmd = normalize(command);

  // 1. Absolute system paths (always blocked regardless of user).
  const absolutePaths = ABSOLUTE_BLOCKED_PATHS[platform] || ABSOLUTE_BLOCKED_PATHS.linux;
  for (const blockedPath of absolutePaths) {
    const normalizedPath = normalize(blockedPath);
    if (normalizedCmd.includes(normalizedPath)) {
      return {
        blocked: true,
        path: blockedPath,
        explanation: `Command accesses sensitive system path: ${blockedPath}`,
      };
    }
  }

  // 2. Sensitive home-directory leaves (matched anywhere).
  // We DON'T try to compute the user's actual home dir — we look for the leaf
  // name as a path component, which catches ALL forms of home expansion:
  //   ~/.ssh, $HOME/.ssh, ${HOME}/.ssh, %USERPROFILE%\.ssh,
  //   /home/alice/.ssh, /Users/alice/.ssh, C:\Users\Alice\.ssh, etc.
  for (const leaf of SENSITIVE_HOME_LEAVES) {
    const normalizedLeaf = normalize(leaf);
    // Match as a path component: preceded by '/' or start, ending at '/' or non-path char.
    // E.g. for '.ssh': matches '/.ssh', '/.ssh/', '/.ssh ', '/.ssh"', but NOT '.ssh-key'.
    const re = new RegExp(`(^|[/\\s'"\`])${escapeRegex(normalizedLeaf)}(?=[/\\s'"\`]|$)`);
    if (re.test(normalizedCmd)) {
      return {
        blocked: true,
        path: leaf,
        explanation: `Command references sensitive user directory: ${leaf} (matches ~/${leaf}, $HOME/${leaf}, %USERPROFILE%\\${leaf}, etc.)`,
      };
    }
  }

  // 3. Environment-variable-style home references — block if combined with sensitive intent
  //    (catches stuff like `$HOME` referenced even without a known leaf, e.g. brace expansion).
  //    This is conservative: we only block when one of $HOME / %USERPROFILE% / %APPDATA% appears
  //    AS a token, not when it merely appears as part of an explanatory string.
  const envVarMatch = /\$\{?(home|userprofile|appdata|localappdata|systemroot)\}?|%(userprofile|appdata|localappdata|systemroot|programdata|systemroot)%/i.test(command);
  if (envVarMatch) {
    // Combined with any of the sensitive leaves OR a redirect into config dirs — block.
    for (const leaf of SENSITIVE_HOME_LEAVES) {
      if (normalizedCmd.includes(leaf.toLowerCase())) {
        return {
          blocked: true,
          path: leaf,
          explanation: `Command uses environment-variable home expansion to reach sensitive directory: ${leaf}`,
        };
      }
    }
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
