#!/usr/bin/env tsx
/**
 * CLI: Run security audit on TaskPilot project.
 * Usage: npx tsx scripts/security-audit.ts
 */

import path from 'path';
import { runSecurityAudit, type AuditFinding, type Severity } from '../src/security/security-audit.js';

const rootDir = path.resolve(path.dirname(import.meta.url.replace('file:///', '')), '..');

console.log('\n  TaskPilot Security Audit');
console.log('  =======================\n');
console.log(`  Scanning: ${rootDir}\n`);

const findings = runSecurityAudit(rootDir);

if (findings.length === 0) {
  console.log('  \u2705 No security issues found!\n');
  process.exit(0);
}

// Group by severity
const groups: Record<Severity, AuditFinding[]> = {
  CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [], INFO: [],
};
for (const f of findings) {
  groups[f.severity].push(f);
}

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: '\x1b[41m\x1b[97m',
  HIGH: '\x1b[31m',
  MEDIUM: '\x1b[33m',
  LOW: '\x1b[36m',
  INFO: '\x1b[90m',
};
const RESET = '\x1b[0m';

let total = 0;
for (const [severity, items] of Object.entries(groups) as [Severity, AuditFinding[]][]) {
  if (items.length === 0) continue;
  total += items.length;

  console.log(`  ${SEVERITY_COLORS[severity]}${severity}${RESET} (${items.length})\n`);
  for (const f of items) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`    ${SEVERITY_COLORS[severity]}\u25cf${RESET} [${f.category}] ${loc}`);
    console.log(`      ${f.message}`);
    console.log(`      ${f.messageRu}\n`);
  }
}

console.log(`  Total: ${total} finding(s)`);
console.log(`  CRITICAL: ${groups.CRITICAL.length} | HIGH: ${groups.HIGH.length} | MEDIUM: ${groups.MEDIUM.length} | LOW: ${groups.LOW.length}\n`);

if (groups.CRITICAL.length > 0) {
  console.log('  \u{1F6A8} CRITICAL issues found! Fix immediately.\n');
  process.exit(2);
} else if (groups.HIGH.length > 0) {
  console.log('  \u26a0\ufe0f HIGH severity issues found. Review recommended.\n');
  process.exit(1);
} else {
  console.log('  \u2705 No critical or high issues.\n');
  process.exit(0);
}
