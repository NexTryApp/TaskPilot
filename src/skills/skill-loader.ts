/**
 * Skill loader: parses .md files with YAML frontmatter into SkillDefinition.
 * Format compatible with OpenClaw SKILL.md style.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { SkillDefinition } from './skill-types.js';

/**
 * Parse YAML-like frontmatter from a markdown string.
 * Simple parser — handles strings, arrays, booleans. No external dep needed.
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return { data: {}, body: content };
  }

  const yamlStr = fmMatch[1];
  const body = content.slice(fmMatch[0].length).trim();
  const data: Record<string, unknown> = {};

  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item (indented "- value")
    if (trimmed.startsWith('- ') && currentArray !== null) {
      let val = trimmed.slice(2).trim();
      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      currentArray.push(val);
      continue;
    }

    // Save previous array
    if (currentArray !== null) {
      data[currentKey] = currentArray;
      currentArray = null;
    }

    // Key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)?$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let rawValue = (kvMatch[2] ?? '').trim();

      // Empty value = start of array or empty string
      if (!rawValue) {
        currentArray = [];
        continue;
      }

      // Remove quotes
      if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
        rawValue = rawValue.slice(1, -1);
      }

      // Booleans
      if (rawValue === 'true') { data[currentKey] = true; continue; }
      if (rawValue === 'false') { data[currentKey] = false; continue; }

      // Inline array: [a, b, c]
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inner = rawValue.slice(1, -1);
        data[currentKey] = inner.split(',').map(s => {
          let v = s.trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          return v;
        }).filter(Boolean);
        continue;
      }

      data[currentKey] = rawValue;
    }
  }

  // Save last array
  if (currentArray !== null) {
    data[currentKey] = currentArray;
  }

  return { data, body };
}

/**
 * Parse a skill file content into a SkillDefinition.
 */
export function parseSkillFile(content: string): SkillDefinition {
  const { data, body } = parseFrontmatter(content);

  return {
    name: String(data['name'] ?? 'unnamed'),
    description: String(data['description'] ?? ''),
    // REMOVED: descriptionRu
    icon: String(data['icon'] ?? 'default'),
    securityLevel: (['safe', 'moderate', 'full'].includes(String(data['securityLevel']))
      ? String(data['securityLevel']) as 'safe' | 'moderate' | 'full'
      : 'moderate'),
    allowedTools: Array.isArray(data['allowedTools']) ? data['allowedTools'] as string[] : ['*'],
    deniedTools: Array.isArray(data['deniedTools']) ? data['deniedTools'] as string[] : [],
    allowedCommands: Array.isArray(data['allowedCommands']) ? data['allowedCommands'] as string[] : undefined,
    deniedCommands: Array.isArray(data['deniedCommands']) ? data['deniedCommands'] as string[] : undefined,
    safeBinsOnly: data['safeBinsOnly'] === true,
    safetyRules: Array.isArray(data['safetyRules']) ? data['safetyRules'] as string[] : [],
    requireApprovalFor: Array.isArray(data['requireApprovalFor']) ? data['requireApprovalFor'] as string[] : undefined,
    body,
  };
}

/**
 * Load a skill from a file path.
 */
export function loadSkillFromFile(filePath: string): SkillDefinition {
  const content = readFileSync(filePath, 'utf-8');
  return parseSkillFile(content);
}

/**
 * Load all skills from a directory.
 * Looks for .md files in the directory (non-recursive).
 */
export function loadSkillsDirectory(dirPath: string): Map<string, SkillDefinition> {
  const skills = new Map<string, SkillDefinition>();

  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (extname(entry) !== '.md') continue;
      const fullPath = join(dirPath, entry);
      if (!statSync(fullPath).isFile()) continue;
      try {
        const skill = loadSkillFromFile(fullPath);
        skills.set(skill.name, skill);
      } catch {
        // Skip malformed skill files
      }
    }
  } catch {
    // Directory does not exist or not readable
  }

  return skills;
}
