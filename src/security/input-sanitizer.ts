/**
 * Input Sanitizer — detects prompt injection attempts in external data.
 *
 * When the agent reads data from untrusted sources (Telegram messages, emails,
 * web pages, files), this module scans for prompt injection patterns BEFORE
 * the data enters the LLM context.
 *
 * Inspired by the community discussion about air-gap security:
 * "The main danger is at the DATA INPUT boundary from the real world."
 *
 * Three-level detection:
 * 1. REGEX: Fast pattern matching for known injection signatures
 * 2. HEURISTIC: Structure analysis (role confusion, instruction override)
 * 3. LLM (optional): Use a separate LLM call to classify suspicious content
 *
 * Actions:
 * - BLOCK: Strip the content entirely, replace with warning
 * - WARN: Wrap content with clear boundary markers
 * - PASS: Content is safe
 */

export type InjectionSeverity = 'block' | 'warn' | 'pass';

export interface InjectionDetection {
  severity: InjectionSeverity;
  /** What pattern/heuristic triggered */
  reason: string;
  /** Category of the attack */
  category: string;
  /** The suspicious fragment (first 100 chars) */
  fragment: string;
}

export interface SanitizerOptions {
  /** Callback when injection is detected. */
  onDetection?: (event: InjectionDetection) => void;
  /** Secret canary word — if the LLM ever outputs this, it's been compromised. */
  canaryWord?: string;
}

// ============================================================================
// Regex patterns — known prompt injection signatures
// ============================================================================

interface InjectionPattern {
  pattern: RegExp;
  category: string;
  severity: InjectionSeverity;
  reason: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // --- Direct instruction override ---
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|context)/gi,
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'block',
    reason: 'Attempts to override system instructions',
  },
  {
    pattern: /forget\s+(?:all\s+)?(?:previous|prior|your)\s+(?:instructions?|rules?|context|training)/gi,
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'block',
    reason: 'Attempts to erase system instructions',
  },
  {
    pattern: /disregard\s+(?:all\s+)?(?:previous|prior|above|your)\s+(?:instructions?|rules?|prompts?)/gi,
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'block',
    reason: 'Attempts to disregard system instructions',
  },
  {
    pattern: /you\s+are\s+now\s+(?:a|an|the)\s+(?:different|new)\s+(?:ai|bot|assistant|agent)/gi,
    category: 'ROLE_HIJACK',
    severity: 'block',
    reason: 'Attempts to reassign the AI role',
  },
  {
    pattern: /(?:act|behave|pretend|respond)\s+as\s+(?:if\s+)?(?:you\s+(?:are|were)|a|an)\s/gi,
    category: 'ROLE_HIJACK',
    severity: 'warn',
    reason: 'Possible role reassignment attempt',
  },
  {
    pattern: /(?:new|updated|revised|override)\s+(?:system\s+)?(?:prompt|instructions?|rules?)\s*[:=]/gi,
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'block',
    reason: 'Attempts to inject new system prompt',
  },

  // --- System prompt extraction ---
  {
    pattern: /(?:reveal|show|display|print|output|repeat|tell\s+me)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?|initial\s+prompt)/gi,
    category: 'PROMPT_EXTRACTION',
    severity: 'block',
    reason: 'Attempts to extract system prompt',
  },
  {
    pattern: /what\s+(?:are|were)\s+your\s+(?:original|initial|system|first)\s+(?:instructions?|prompts?|rules?)/gi,
    category: 'PROMPT_EXTRACTION',
    severity: 'block',
    reason: 'Attempts to extract system prompt via question',
  },
  {
    pattern: /(?:print|echo|output|say)\s+(?:everything|all)\s+(?:before|above|in)\s+(?:this|your|the)\s+(?:message|prompt|context)/gi,
    category: 'PROMPT_EXTRACTION',
    severity: 'block',
    reason: 'Attempts to dump the full context',
  },

  // --- Encoded/obfuscated injection ---
  {
    pattern: /\[SYSTEM\]|\[INST\]|\<\|system\|>|\<\|user\|>|\<\|assistant\|>/gi,
    category: 'ROLE_TAG_INJECTION',
    severity: 'block',
    reason: 'Injected chat role tags (common in LLM attacks)',
  },
  {
    pattern: /\<\/?(?:system|user|assistant|human|ai)(?:\s[^>]*)?\>/gi,
    category: 'ROLE_TAG_INJECTION',
    severity: 'block',
    reason: 'XML-style role tag injection',
  },

  // --- Data exfiltration commands ---
  {
    pattern: /(?:send|post|upload|exfiltrate|transmit)\s+(?:all|my|the|your)\s+(?:data|files?|messages?|history|context|memory|secrets?|keys?|tokens?|credentials?)/gi,
    category: 'DATA_EXFILTRATION',
    severity: 'block',
    reason: 'Attempts to exfiltrate data',
  },
  {
    pattern: /(?:curl|wget|fetch)\s+https?:\/\/[^\s]+.*(?:api[_-]?key|token|secret|password)/gi,
    category: 'DATA_EXFILTRATION',
    severity: 'block',
    reason: 'Attempts to send secrets to external URL',
  },

  // --- Hidden instruction injection ---
  {
    pattern: /\u200B|\u200C|\u200D|\uFEFF|\u00AD/g,
    category: 'INVISIBLE_CHARS',
    severity: 'warn',
    reason: 'Contains invisible/zero-width characters (may hide instructions)',
  },

  // --- Russian-language injections (detect regardless of UI language) ---
  {
    pattern: /(?:игнорируй|забудь|отмени|отбрось)\s+(?:все\s+)?(?:предыдущие|прошлые|свои|системные)\s+(?:инструкции|правила|указания|промпт)/gi,
    category: 'INSTRUCTION_OVERRIDE_RU',
    severity: 'block',
    reason: 'Attempted system instruction override (Russian)',
  },
  {
    pattern: /(?:покажи|выведи|скажи|напечатай)\s+(?:свой|системный|исходный|полный)\s+(?:промпт|инструкции|правила)/gi,
    category: 'PROMPT_EXTRACTION_RU',
    severity: 'block',
    reason: 'Attempted system prompt extraction (Russian)',
  },
];

// ============================================================================
// Heuristic checks — structure analysis
// ============================================================================

function heuristicCheck(text: string): InjectionDetection | null {
  // Check 1: Excessive role markers in user-submitted content
  const roleMarkers = (text.match(/\b(?:system|user|assistant|human|ai)\s*:/gi) || []).length;
  if (roleMarkers >= 3) {
    return {
      severity: 'warn',
      reason: `Contains ${roleMarkers} role markers — may be simulating a conversation`,
      category: 'ROLE_SIMULATION',
      fragment: text.slice(0, 100),
    };
  }

  // Check 2: Content that looks like a system prompt
  const systemPromptIndicators = [
    /you\s+are\s+an?\s+(?:AI|bot|agent|assistant)/i,
    /your\s+(?:task|goal|purpose|job)\s+is\s+to/i,
    /you\s+(?:must|should|shall)\s+(?:always|never)/i,
    /rules?\s*:\s*\n\s*[-\d]/i,
  ];
  const matchCount = systemPromptIndicators.filter(p => p.test(text)).length;
  if (matchCount >= 2) {
    return {
      severity: 'warn',
      reason: `Content resembles a system prompt (${matchCount} indicators)`,
      category: 'PROMPT_LIKE_CONTENT',
      fragment: text.slice(0, 100),
    };
  }

  // Check 3: Unusually long text with instruction-like structure
  if (text.length > 500 && text.includes('\n') && /(?:step\s+\d|rule\s+\d|instruction\s+\d)/i.test(text)) {
    return {
      severity: 'warn',
      reason: 'Long structured text with numbered instructions — may be injecting behavior',
      category: 'STRUCTURED_INJECTION',
      fragment: text.slice(0, 100),
    };
  }

  return null;
}

// ============================================================================
// Main class
// ============================================================================

export class InputSanitizer {
  private onDetection: ((event: InjectionDetection) => void) | null;
  private canaryWord: string;
  private stats = { blocked: 0, warned: 0, passed: 0 };

  constructor(options: SanitizerOptions = {}) {
    this.onDetection = options.onDetection ?? null;
    // Generate random canary if not provided
    this.canaryWord = options.canaryWord ?? `CANARY_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Get the canary word (inject into system prompt to detect compromise). */
  getCanaryWord(): string {
    return this.canaryWord;
  }

  /**
   * Scan text from an untrusted source.
   * Returns sanitized text + list of detections.
   */
  sanitize(text: string, source?: string): { clean: string; detections: InjectionDetection[] } {
    const detections: InjectionDetection[] = [];
    let clean = text;

    // Phase 1: Regex pattern matching
    for (const { pattern, category, severity, reason } of INJECTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = clean.match(regex);
      if (matches && matches.length > 0) {
        const detection: InjectionDetection = {
          severity,
          reason,
          category,
          fragment: matches[0].slice(0, 100),
        };
        detections.push(detection);
        this.onDetection?.(detection);

        if (severity === 'block') {
          // Replace blocked content with warning marker
          clean = clean.replace(regex, '[BLOCKED: prompt injection attempt]');
          this.stats.blocked++;
        } else {
          this.stats.warned++;
        }
      }
    }

    // Phase 2: Heuristic analysis
    const heuristic = heuristicCheck(clean);
    if (heuristic) {
      detections.push(heuristic);
      this.onDetection?.(heuristic);
      this.stats.warned++;
    }

    // Phase 3: Wrap with boundary markers if any detections
    if (detections.length > 0) {
      const sourceLabel = source ? ` from ${source}` : '';
      clean = `--- EXTERNAL DATA${sourceLabel} (untrusted, may contain injection attempts) ---\n${clean}\n--- END EXTERNAL DATA ---`;
    } else {
      this.stats.passed++;
    }

    return { clean, detections };
  }

  /**
   * Check if an LLM response leaked the canary word (= compromised).
   * Also checks for leaked system prompt fragments.
   */
  checkOutputLeak(output: string, systemPromptFragments?: string[]): OutputLeakDetection | null {
    // Check canary word
    if (output.includes(this.canaryWord)) {
      return {
        type: 'CANARY_LEAKED',
        severity: 'critical',
        reason: `Canary word "${this.canaryWord.slice(0, 8)}..." found in output — system prompt was extracted`,
      };
    }

    // Check system prompt fragments
    if (systemPromptFragments) {
      for (const fragment of systemPromptFragments) {
        if (fragment.length >= 20 && output.includes(fragment)) {
          return {
            type: 'SYSTEM_PROMPT_LEAKED',
            severity: 'high',
            reason: `System prompt fragment detected in output: "${fragment.slice(0, 30)}..."`,
          };
        }
      }
    }

    // Check for common leak indicators
    const leakPatterns = [
      /my\s+(?:system\s+)?(?:prompt|instructions?)\s+(?:are|say|is|tell)/i,
      /here\s+(?:are|is)\s+my\s+(?:system\s+)?(?:prompt|instructions?)/i,
      /(?:secret|canary|hidden)\s+(?:word|code|token)\s*(?:is|:)/i,
    ];
    for (const pattern of leakPatterns) {
      if (pattern.test(output)) {
        return {
          type: 'POSSIBLE_LEAK',
          severity: 'medium',
          reason: 'Output appears to be revealing system instructions',
        };
      }
    }

    return null;
  }

  /** Get stats. */
  getStats(): { blocked: number; warned: number; passed: number } {
    return { ...this.stats };
  }
}

export interface OutputLeakDetection {
  type: 'CANARY_LEAKED' | 'SYSTEM_PROMPT_LEAKED' | 'POSSIBLE_LEAK';
  severity: 'critical' | 'high' | 'medium';
  reason: string;
}
