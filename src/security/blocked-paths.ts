/**
 * Blocked paths: sensitive system paths that commands should not access.
 * Prevents accidental or malicious access to critical system files.
 */

import type { Platform } from './dangerous-commands.js';

/** Sensitive paths by platform. */
const BLOCKED_PATHS: Record<Platform, string[]> = {
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
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.config/gcloud',
    '~/.kube',
  ],
  macos: [
    '/etc',
    '/System',
    '/Library',
    '/private/etc',
    '/private/var/run',
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.config/gcloud',
    '~/.kube',
  ],
  windows: [
    'C:\\Windows\\System32',
    'C:\\Windows\\SysWOW64',
    'C:\\Windows\\System32\\config',
    '%USERPROFILE%\\.ssh',
    '%USERPROFILE%\\.aws',
    '%APPDATA%',
    '%LOCALAPPDATA%',
    '%SystemRoot%',
  ],
};

/** Check whether a command references a blocked/sensitive path. */
export function containsBlockedPath(
  command: string,
  platform: Platform
): { blocked: boolean; path: string; explanation: string } | null {
  const paths = BLOCKED_PATHS[platform] || BLOCKED_PATHS.linux;
  const normalizedCmd = command.toLowerCase().replace(/\\/g, '/');

  for (const blockedPath of paths) {
    const normalizedPath = blockedPath.toLowerCase().replace(/\\/g, '/');
    // Replace ~ with generic home dir patterns
    const patterns = [normalizedPath];
    if (normalizedPath.startsWith('~')) {
      // Also check expanded home dirs
      patterns.push(normalizedPath.replace('~', '/home'));
      patterns.push(normalizedPath.replace('~', '/root'));
      patterns.push(normalizedPath.replace('~', '/users'));
      patterns.push(normalizedPath.replace('~', 'c:/users'));
    }
    if (normalizedPath.startsWith('%')) {
      // Windows env vars — just check the key part
      const inner = normalizedPath.replace(/%/g, '').toLowerCase();
      if (normalizedCmd.includes(inner)) {
        return {
          blocked: true,
          path: blockedPath,
          explanation: `Command accesses sensitive path: ${blockedPath}`,
        };
      }
      continue;
    }

    for (const p of patterns) {
      if (normalizedCmd.includes(p)) {
        return {
          blocked: true,
          path: blockedPath,
          explanation: `Command accesses sensitive path: ${blockedPath}`,
        };
      }
    }
  }

  return null;
}
