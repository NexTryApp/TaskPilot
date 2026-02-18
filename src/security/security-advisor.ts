/**
 * Security Advisor — LLM-powered command analysis layer.
 * Explains EVERY command in human language before execution.
 * For WARN commands: provides risk assessment, consequences, and safer alternatives.
 * Inspired by OpenAI Aardvark's contextual security analysis approach.
 */

import type { LLMAdapter, Message } from '../types.js';

export interface CommandExplanation {
  /** What the command does in plain English */
  whatItDoes: string;
  /** Risk level: safe / low / medium / high / critical */
  risk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  /** Is the action reversible? */
  reversible: boolean;
  /** What can go wrong */
  consequences: string;
  /** Safer alternative command (if exists) */
  saferAlternative: string | null;
  /** Short recommendation for the user */
  recommendation: string;
}

export interface AdvisorContext {
  /** The agent's goal */
  goal: string;
  /** Current skill name */
  skill: string;
  /** Previous commands in this run (for context) */
  previousCommands?: string[];
  /** Current working directory */
  cwd?: string;
}

const ADVISOR_SYSTEM_PROMPT = `You are a Security Advisor for an AI agent framework called TaskPilot.
Your job: explain shell commands in SIMPLE HUMAN LANGUAGE. The user may not be technical.

For every command, you MUST return a JSON object with these exact fields:
{
  "whatItDoes": "What the command does — plain English, 1-2 sentences",
  "risk": "safe | low | medium | high | critical",
  "reversible": true/false,
  "consequences": "What can go wrong — plain English",
  "saferAlternative": "A safer alternative command (or null if none)",
  "recommendation": "Short recommendation for the user — plain English"
}

Risk levels:
- safe: read-only commands (ls, cat, grep, git status)
- low: creates/modifies files that can be easily restored (echo > file, mkdir)
- medium: installs packages, modifies config, network operations (npm install, curl)
- high: deletes files, changes permissions, modifies system (rm, chmod, mv important files)
- critical: irreversible destruction, system modification, data exfiltration

Rules:
- ALWAYS respond with ONLY the JSON object, no markdown, no backticks, no extra text
- Be concise — whatItDoes should be 1-2 sentences max
- Focus on CONSEQUENCES the user cares about
- If a command is safe, say so clearly — don't scare the user unnecessarily
- Consider the agent's GOAL when assessing risk (deleting temp files is less risky than deleting source code)
- saferAlternative should be a real working command, not a vague suggestion`;

export class SecurityAdvisor {
  private llm: LLMAdapter;
  private cache = new Map<string, CommandExplanation>();
  private maxCacheSize = 200;
  private language: string;

  constructor(llm: LLMAdapter, language?: string) {
    this.llm = llm;
    this.language = language || 'English';
  }

  /** Update the explanation language at runtime. */
  setLanguage(language: string): void {
    this.language = language;
    // Clear cache when language changes — explanations need regeneration
    this.cache.clear();
  }

  /**
   * Explain a command in human language.
   * Returns cached result if available.
   */
  async explain(
    command: string,
    context?: AdvisorContext,
  ): Promise<CommandExplanation> {
    // Check cache (command + goal as key)
    const cacheKey = `${command}::${context?.goal || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const userMessage = this.buildUserMessage(command, context);

    // Inject language preference into system prompt
    const langSuffix = this.language !== 'English'
      ? `\n\nIMPORTANT: Write ALL explanation text (whatItDoes, consequences, recommendation, saferAlternative) in ${this.language}. The JSON keys must stay in English, but all VALUES must be in ${this.language}.`
      : '';

    const messages: Message[] = [
      { role: 'system', content: ADVISOR_SYSTEM_PROMPT + langSuffix },
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.llm.chat(messages, []);
      const text = response.finalAnswer || response.thought || '';
      const explanation = this.parseResponse(text, command);

      // Cache the result
      if (this.cache.size >= this.maxCacheSize) {
        // Evict oldest entry
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, explanation);

      return explanation;
    } catch (err) {
      // If LLM fails, return a minimal fallback explanation
      return this.fallbackExplanation(command);
    }
  }

  /**
   * Quick explain for safe commands — no LLM call, pattern-based.
   * Used for ALLOW commands to avoid wasting API calls.
   */
  quickExplain(command: string): CommandExplanation | null {
    // Quick explain only works for English — other languages need LLM
    if (this.language !== 'English') return null;

    const trimmed = command.trim();
    const tokens = trimmed.split(/\s+/);
    const bin = tokens[0]?.toLowerCase();

    const quickMap: Record<string, string> = {
      ls:       'Lists files in directory',
      dir:      'Lists files in directory',
      cat:      `Shows contents of file ${tokens[1] || ''}`,
      head:     `Shows first lines of file ${tokens[1] || ''}`,
      tail:     `Shows last lines of file ${tokens[1] || ''}`,
      grep:     `Searches for "${tokens[1] || ''}" in files`,
      pwd:      'Shows current directory',
      whoami:   'Shows current username',
      echo:     `Prints text: ${tokens.slice(1).join(' ')}`,
      date:     'Shows current date and time',
      hostname: 'Shows computer name',
      uname:    'Shows OS information',
      uptime:   'Shows system uptime',
      wc:       'Counts lines/words/characters',
      sort:     'Sorts lines',
      uniq:     'Removes duplicate lines',
      tree:     'Shows directory structure as tree',
      find:     'Finds files by criteria',
      which:    `Shows location of program ${tokens[1] || ''}`,
      stat:     `Shows file info for ${tokens[1] || ''}`,
      df:       'Shows disk space usage',
      du:       'Shows file/folder sizes',
    };

    // Git read-only commands
    if (bin === 'git') {
      const sub = tokens[1]?.toLowerCase();
      const gitMap: Record<string, string> = {
        status:  'Shows git repository status (modified files)',
        log:     'Shows commit history',
        diff:    'Shows file changes',
        branch:  'Shows branch list',
        remote:  'Shows remote repositories',
        show:    'Shows commit details',
        blame:   'Shows who changed each line and when',
      };
      if (sub && gitMap[sub]) {
        return {
          whatItDoes: gitMap[sub],
          risk: 'safe',
          reversible: true,
          consequences: 'None — read-only command',
          saferAlternative: null,
          recommendation: 'Safe',
        };
      }
    }

    // Node/Python --version
    if (['node', 'python', 'python3', 'ruby', 'go', 'tsc'].includes(bin || '')) {
      const arg = tokens[1]?.toLowerCase();
      if (!arg || arg === '--version' || arg === '-v') {
        return {
          whatItDoes: `Shows ${bin} version`,
          risk: 'safe',
          reversible: true,
          consequences: 'None — read-only command',
          saferAlternative: null,
          recommendation: 'Safe',
        };
      }
    }

    const match = quickMap[bin || ''];
    if (match) {
      return {
        whatItDoes: match,
        risk: 'safe',
        reversible: true,
        consequences: 'None — read-only command',
        saferAlternative: null,
        recommendation: 'Safe',
      };
    }

    return null; // Not a quick-explain command — needs LLM
  }

  private buildUserMessage(command: string, context?: AdvisorContext): string {
    let msg = `Command: ${command}`;
    if (context?.goal) msg += `\nAgent goal: ${context.goal}`;
    if (context?.skill) msg += `\nSkill: ${context.skill}`;
    if (context?.cwd) msg += `\nWorking directory: ${context.cwd}`;
    if (context?.previousCommands?.length) {
      msg += `\nPrevious commands in this session:\n${context.previousCommands.slice(-5).map(c => `  - ${c}`).join('\n')}`;
    }
    return msg;
  }

  private parseResponse(text: string, command: string): CommandExplanation {
    try {
      // Try to extract JSON from the response (handle markdown fences)
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      const parsed = JSON.parse(jsonStr);
      return {
        whatItDoes: String(parsed.whatItDoes || ''),
        risk: this.validateRisk(parsed.risk),
        reversible: Boolean(parsed.reversible),
        consequences: String(parsed.consequences || ''),
        saferAlternative: parsed.saferAlternative ? String(parsed.saferAlternative) : null,
        recommendation: String(parsed.recommendation || ''),
      };
    } catch {
      // If JSON parsing fails, use the raw text as explanation
      return {
        whatItDoes: text.slice(0, 200),
        risk: 'medium',
        reversible: true,
        consequences: '',
        saferAlternative: null,
        recommendation: text.slice(0, 100),
      };
    }
  }

  private validateRisk(value: unknown): CommandExplanation['risk'] {
    const valid = ['safe', 'low', 'medium', 'high', 'critical'];
    const str = String(value || 'medium').toLowerCase();
    return valid.includes(str) ? str as CommandExplanation['risk'] : 'medium';
  }

  private fallbackExplanation(command: string): CommandExplanation {
    const bin = command.trim().split(/\s+/)[0] || 'unknown';
    return {
      whatItDoes: `Executes command: ${bin}`,
      risk: 'medium',
      reversible: true,
      consequences: 'Could not analyze — review manually',
      saferAlternative: null,
      recommendation: 'Review the command before approving',
    };
  }

  /** Clear the explanation cache */
  clearCache(): void {
    this.cache.clear();
  }
}
