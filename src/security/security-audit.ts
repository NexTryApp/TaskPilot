/**
 * Security Audit: scans the TaskPilot project for common security issues.
 * Checks for hardcoded keys, open bindings, unsafe skill configs, etc.
 * Run: npx tsx scripts/security-audit.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

// --- Types ---

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AuditFinding {
  severity: Severity;
  category: string;
  file: string;
  line?: number;
  message: string;
}

// --- Patterns ---

const SECRET_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API Key' },
  { pattern: /sk-ant-[a-zA-Z0-9-]{20,}/, name: 'Anthropic API Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Token' },
  { pattern: /glpat-[a-zA-Z0-9_-]{20}/, name: 'GitLab Token' },
  { pattern: /xoxb-[0-9]{10,}-[a-zA-Z0-9-]+/, name: 'Slack Bot Token' },
  { pattern: /AIzaSy[a-zA-Z0-9_-]{33}/, name: 'Google API Key' },
  { pattern: /AKIA[A-Z0-9]{16}/, name: 'AWS Access Key' },
  { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, name: 'Private Key' },
];

const UNSAFE_PATTERNS = [
  { pattern: /0\.0\.0\.0/, category: 'NETWORK', message: 'Open binding (0.0.0.0) — accessible from network' },
  { pattern: /eval\s*\(/, category: 'CODE_INJECTION', message: 'eval() usage detected' },
  { pattern: /child_process.*exec\b(?!Async)/, category: 'COMMAND_INJECTION', message: 'Direct exec() without safety checks' },
  { pattern: /password\s*[:=]\s*['"][^'"]{3,}['"]/, category: 'HARDCODED_CREDS', message: 'Possible hardcoded password' },
  { pattern: /TODO.*security|FIXME.*security|HACK.*security/i, category: 'TODO', message: 'Security TODO/FIXME found' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'data', 'openclaw', '.next', 'venv', '__pycache__']);
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.json', '.env', '.md', '.yaml', '.yml', '.sh', '.bat']);

// --- Scanner ---

function scanDirectory(dirPath: string): string[] {
  const files: string[] = [];

  if (!existsSync(dirPath)) return files;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function checkFile(filePath: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let content: string;

  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return findings;
  }

  const lines = content.split('\n');
  const relPath = path.relative(process.cwd(), filePath);

  // Check for hardcoded secrets
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and test data
    if (line.trim().startsWith('//') && line.includes('example')) continue;
    if (line.trim().startsWith('#') && line.includes('example')) continue;

    for (const sp of SECRET_PATTERNS) {
      if (sp.pattern.test(line)) {
        findings.push({
          severity: 'CRITICAL',
          category: 'HARDCODED_SECRET',
          file: relPath,
          line: i + 1,
          message: `Hardcoded ${sp.name} detected`,
        });
      }
    }

    for (const up of UNSAFE_PATTERNS) {
      if (up.pattern.test(line)) {
        // Skip test files, comments, docs (.md), and the audit file itself
        if (relPath.includes('.test.') || relPath.includes('.spec.')) continue;
        if (relPath.endsWith('.md')) continue;  // docs only describe patterns, not use them
        if (relPath.includes('security-audit')) continue;  // skip self-references

        findings.push({
          severity: up.category === 'CODE_INJECTION' ? 'HIGH' : 'MEDIUM',
          category: up.category,
          file: relPath,
          line: i + 1,
          message: up.message,
        });
      }
    }
  }

  return findings;
}

function checkSkillSecurity(skillsDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!existsSync(skillsDir)) return findings;

  const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const fullPath = path.join(skillsDir, file);
    const content = readFileSync(fullPath, 'utf8');

    // Check for 'full' security level skills
    if (/securityLevel:\s*full/i.test(content)) {
      // Check if it has any safety rules
      if (!/safetyRules:/i.test(content)) {
        findings.push({
          severity: 'HIGH',
          category: 'SKILL_CONFIG',
          file: `skills/${file}`,
          message: 'Full-access skill without safety rules',
        });
      }
    }

    // Check for wildcard allowed tools
    if (/allowedTools:\s*\[?\s*['"]?\*['"]?\s*\]?/i.test(content)) {
      findings.push({
        severity: 'MEDIUM',
        category: 'SKILL_CONFIG',
        file: `skills/${file}`,
        message: 'Skill allows all tools (wildcard *)',
      });
    }
  }

  return findings;
}

function checkEnvFiles(rootDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const envFiles = ['.env', '.env.local', '.env.production'];

  for (const envFile of envFiles) {
    const fullPath = path.join(rootDir, envFile);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Check for non-empty secret values
      const match = line.match(/^([A-Z_]+(?:KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Z_]*)=(.+)$/i);
      if (match && match[2].length > 5 && !match[2].includes('your_') && !match[2].includes('xxx')) {
        findings.push({
          severity: 'HIGH',
          category: 'ENV_SECRET',
          file: envFile,
          line: i + 1,
          message: `Secret in .env file: ${match[1]} (ensure not committed to git)`,
        });
      }
    }
  }

  // Check .gitignore
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.env')) {
      findings.push({
        severity: 'HIGH',
        category: 'GITIGNORE',
        file: '.gitignore',
        message: '.env not in .gitignore — secrets may be committed',
      });
    }
  }

  return findings;
}

// --- Main Export ---

export function runSecurityAudit(rootDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Scan all code files
  const files = scanDirectory(rootDir);
  for (const file of files) {
    findings.push(...checkFile(file));
  }

  // Check skill configurations
  findings.push(...checkSkillSecurity(path.join(rootDir, 'skills')));

  // Check .env files
  findings.push(...checkEnvFiles(rootDir));

  // Sort by severity
  const severityOrder: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}
