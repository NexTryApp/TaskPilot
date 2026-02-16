/**
 * Security Advisor — LLM-powered command analysis layer.
 * Explains EVERY command in human language before execution.
 * For WARN commands: provides risk assessment, consequences, and safer alternatives.
 * Inspired by OpenAI Aardvark's contextual security analysis approach.
 */

import type { LLMAdapter, Message } from '../types.js';

export interface CommandExplanation {
  /** What the command does in plain Russian */
  whatItDoes: string;
  /** What the command does in plain English */
  whatItDoesEn: string;
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
  "whatItDoes": "Что делает команда — простым русским языком, 1-2 предложения",
  "whatItDoesEn": "What the command does — plain English, 1-2 sentences",
  "risk": "safe | low | medium | high | critical",
  "reversible": true/false,
  "consequences": "Что может пойти не так (по-русски)",
  "saferAlternative": "Более безопасная альтернатива (или null если нет)",
  "recommendation": "Короткая рекомендация пользователю (по-русски)"
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

  constructor(llm: LLMAdapter) {
    this.llm = llm;
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

    const messages: Message[] = [
      { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
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
    const trimmed = command.trim();
    const tokens = trimmed.split(/\s+/);
    const bin = tokens[0]?.toLowerCase();

    const quickMap: Record<string, { ru: string; en: string }> = {
      ls:       { ru: 'Показывает список файлов в директории', en: 'Lists files in directory' },
      dir:      { ru: 'Показывает список файлов в директории', en: 'Lists files in directory' },
      cat:      { ru: `Показывает содержимое файла ${tokens[1] || ''}`, en: `Shows contents of file ${tokens[1] || ''}` },
      head:     { ru: `Показывает первые строки файла ${tokens[1] || ''}`, en: `Shows first lines of file ${tokens[1] || ''}` },
      tail:     { ru: `Показывает последние строки файла ${tokens[1] || ''}`, en: `Shows last lines of file ${tokens[1] || ''}` },
      grep:     { ru: `Ищет текст "${tokens[1] || ''}" в файлах`, en: `Searches for "${tokens[1] || ''}" in files` },
      pwd:      { ru: 'Показывает текущую директорию', en: 'Shows current directory' },
      whoami:   { ru: 'Показывает имя текущего пользователя', en: 'Shows current username' },
      echo:     { ru: `Выводит текст: ${tokens.slice(1).join(' ')}`, en: `Prints text: ${tokens.slice(1).join(' ')}` },
      date:     { ru: 'Показывает текущую дату и время', en: 'Shows current date and time' },
      hostname: { ru: 'Показывает имя компьютера', en: 'Shows computer name' },
      uname:    { ru: 'Показывает информацию об операционной системе', en: 'Shows OS information' },
      uptime:   { ru: 'Показывает время работы компьютера', en: 'Shows system uptime' },
      wc:       { ru: 'Считает строки/слова/символы', en: 'Counts lines/words/characters' },
      sort:     { ru: 'Сортирует строки', en: 'Sorts lines' },
      uniq:     { ru: 'Удаляет повторяющиеся строки', en: 'Removes duplicate lines' },
      tree:     { ru: 'Показывает структуру директорий в виде дерева', en: 'Shows directory structure as tree' },
      find:     { ru: `Ищет файлы по заданному критерию`, en: 'Finds files by criteria' },
      which:    { ru: `Показывает расположение программы ${tokens[1] || ''}`, en: `Shows location of program ${tokens[1] || ''}` },
      stat:     { ru: `Показывает информацию о файле ${tokens[1] || ''}`, en: `Shows file info for ${tokens[1] || ''}` },
      df:       { ru: 'Показывает свободное место на дисках', en: 'Shows disk space usage' },
      du:       { ru: 'Показывает размер файлов/папок', en: 'Shows file/folder sizes' },
    };

    // Git read-only commands
    if (bin === 'git') {
      const sub = tokens[1]?.toLowerCase();
      const gitMap: Record<string, { ru: string; en: string }> = {
        status:  { ru: 'Показывает состояние git-репозитория (изменённые файлы)', en: 'Shows git repository status (modified files)' },
        log:     { ru: 'Показывает историю коммитов', en: 'Shows commit history' },
        diff:    { ru: 'Показывает изменения в файлах', en: 'Shows file changes' },
        branch:  { ru: 'Показывает список веток', en: 'Shows branch list' },
        remote:  { ru: 'Показывает удалённые репозитории', en: 'Shows remote repositories' },
        show:    { ru: 'Показывает детали коммита', en: 'Shows commit details' },
        blame:   { ru: 'Показывает кто и когда менял каждую строку', en: 'Shows who changed each line and when' },
      };
      if (sub && gitMap[sub]) {
        return {
          whatItDoes: gitMap[sub].ru,
          whatItDoesEn: gitMap[sub].en,
          risk: 'safe',
          reversible: true,
          consequences: 'Нет — это команда только для чтения',
          saferAlternative: null,
          recommendation: 'Безопасно',
        };
      }
    }

    // Node/Python --version
    if (['node', 'python', 'python3', 'ruby', 'go', 'tsc'].includes(bin || '')) {
      const arg = tokens[1]?.toLowerCase();
      if (!arg || arg === '--version' || arg === '-v') {
        return {
          whatItDoes: `Показывает версию ${bin}`,
          whatItDoesEn: `Shows ${bin} version`,
          risk: 'safe',
          reversible: true,
          consequences: 'Нет — это команда только для чтения',
          saferAlternative: null,
          recommendation: 'Безопасно',
        };
      }
    }

    const match = quickMap[bin || ''];
    if (match) {
      return {
        whatItDoes: match.ru,
        whatItDoesEn: match.en,
        risk: 'safe',
        reversible: true,
        consequences: 'Нет — это команда только для чтения',
        saferAlternative: null,
        recommendation: 'Безопасно',
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
        whatItDoesEn: String(parsed.whatItDoesEn || ''),
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
        whatItDoesEn: '',
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
      whatItDoes: `Выполняет команду: ${bin}`,
      whatItDoesEn: `Executes command: ${bin}`,
      risk: 'medium',
      reversible: true,
      consequences: 'Не удалось проанализировать — проверьте вручную',
      saferAlternative: null,
      recommendation: 'Проверьте команду перед одобрением',
    };
  }

  /** Clear the explanation cache */
  clearCache(): void {
    this.cache.clear();
  }
}
