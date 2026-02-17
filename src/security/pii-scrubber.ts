/**
 * PII Scrubber — strips sensitive data from messages BEFORE they are sent to LLM APIs.
 *
 * Detects and redacts:
 * - API keys / tokens (sk-..., ghp_..., AKIA..., etc.)
 * - SSH private keys
 * - Credit card numbers
 * - Email addresses (optional — off by default)
 * - Crypto wallet addresses (BTC, ETH)
 * - JWT tokens
 * - AWS credentials
 * - Private IP addresses
 * - .env file contents (KEY=value patterns)
 * - Passwords in common patterns
 *
 * Redacted values are replaced with [REDACTED:type] so the LLM knows something was there.
 * Original values are NEVER sent to the API.
 */

export interface ScrubberOptions {
  /** Scrub email addresses. Default false (emails are often needed for context). */
  scrubEmails?: boolean;
  /** Scrub phone numbers. Default false. */
  scrubPhones?: boolean;
  /** Scrub private IP addresses. Default true. */
  scrubPrivateIPs?: boolean;
  /** Custom patterns to scrub (regex → label). */
  customPatterns?: Array<{ pattern: RegExp; label: string }>;
  /** Callback when PII is detected — for UI notifications. */
  onRedaction?: (event: RedactionEvent) => void;
}

export interface RedactionEvent {
  /** Type of PII detected */
  type: string;
  /** How many instances were redacted */
  count: number;
  /** Preview of what was redacted (first 4 chars + ...) */
  preview: string;
}

interface ScrubPattern {
  pattern: RegExp;
  label: string;
  /** If true, show first N chars in preview for debugging. */
  previewChars: number;
}

// ============================================================================
// Core patterns — ordered by priority (most critical first)
// ============================================================================

const CORE_PATTERNS: ScrubPattern[] = [
  // --- SSH Private Keys ---
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    label: 'SSH_PRIVATE_KEY',
    previewChars: 0,
  },
  // --- PGP Private Keys ---
  {
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    label: 'PGP_PRIVATE_KEY',
    previewChars: 0,
  },
  // --- JWT tokens ---
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    label: 'JWT_TOKEN',
    previewChars: 6,
  },
  // --- AWS Access Key IDs ---
  {
    pattern: /(?<!\w)(AKIA[0-9A-Z]{16})(?!\w)/g,
    label: 'AWS_ACCESS_KEY',
    previewChars: 4,
  },
  // --- AWS Secret Keys (40 chars base64-ish) ---
  {
    pattern: /(?<!\w)([A-Za-z0-9/+=]{40})(?=\s|$|"|')/g,
    label: 'AWS_SECRET_KEY',
    previewChars: 4,
  },
  // --- OpenAI API keys ---
  {
    pattern: /sk-[A-Za-z0-9_-]{20,}/g,
    label: 'OPENAI_API_KEY',
    previewChars: 5,
  },
  // --- Anthropic API keys ---
  {
    pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g,
    label: 'ANTHROPIC_API_KEY',
    previewChars: 8,
  },
  // --- GitHub tokens ---
  {
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    label: 'GITHUB_TOKEN',
    previewChars: 5,
  },
  // --- Stripe keys ---
  {
    pattern: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g,
    label: 'STRIPE_KEY',
    previewChars: 8,
  },
  // --- Slack tokens ---
  {
    pattern: /xox[bpras]-[A-Za-z0-9-]{10,}/g,
    label: 'SLACK_TOKEN',
    previewChars: 6,
  },
  // --- Discord tokens ---
  {
    pattern: /[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g,
    label: 'DISCORD_TOKEN',
    previewChars: 4,
  },
  // --- Telegram bot tokens ---
  {
    pattern: /\d{8,10}:[A-Za-z0-9_-]{35}/g,
    label: 'TELEGRAM_BOT_TOKEN',
    previewChars: 4,
  },
  // --- Generic "Bearer" tokens ---
  {
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
    label: 'BEARER_TOKEN',
    previewChars: 10,
  },
  // --- Generic long hex secrets (32+ chars of hex) ---
  {
    pattern: /(?<!\w)([0-9a-f]{32,})(?!\w)/gi,
    label: 'HEX_SECRET',
    previewChars: 6,
  },
  // --- Credit card numbers (Luhn-like: 13-19 digits with optional spaces/dashes) ---
  {
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    label: 'CREDIT_CARD',
    previewChars: 4,
  },
  // --- Bitcoin addresses ---
  {
    pattern: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
    label: 'BTC_ADDRESS',
    previewChars: 6,
  },
  // --- Ethereum addresses ---
  {
    pattern: /\b0x[0-9a-fA-F]{40}\b/g,
    label: 'ETH_ADDRESS',
    previewChars: 6,
  },
  // --- .env patterns: KEY=secret_value ---
  {
    pattern: /(?:^|\n)(?:export\s+)?([A-Z_]{2,}(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|CREDENTIAL|AUTH))\s*=\s*['"]?([^\s'"#\n]{8,})['"]?/gm,
    label: 'ENV_SECRET',
    previewChars: 0,
  },
  // --- password= or passwd= or pwd= patterns ---
  {
    pattern: /(?:password|passwd|pwd|pass)\s*[:=]\s*['"]?([^\s'"]{4,})['"]?/gi,
    label: 'PASSWORD',
    previewChars: 0,
  },
];

// Optional patterns (off by default)
const EMAIL_PATTERN: ScrubPattern = {
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  label: 'EMAIL',
  previewChars: 3,
};

const PHONE_PATTERN: ScrubPattern = {
  pattern: /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2,4}/g,
  label: 'PHONE',
  previewChars: 3,
};

const PRIVATE_IP_PATTERN: ScrubPattern = {
  pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
  label: 'PRIVATE_IP',
  previewChars: 4,
};

export class PIIScrubber {
  private patterns: ScrubPattern[];
  private onRedaction: ((event: RedactionEvent) => void) | null;
  private stats: Map<string, number> = new Map();

  constructor(options: ScrubberOptions = {}) {
    // Build pattern list
    this.patterns = [...CORE_PATTERNS];
    if (options.scrubEmails) this.patterns.push(EMAIL_PATTERN);
    if (options.scrubPhones) this.patterns.push(PHONE_PATTERN);
    if (options.scrubPrivateIPs !== false) this.patterns.push(PRIVATE_IP_PATTERN);
    if (options.customPatterns) {
      for (const cp of options.customPatterns) {
        this.patterns.push({ pattern: cp.pattern, label: cp.label, previewChars: 0 });
      }
    }
    this.onRedaction = options.onRedaction ?? null;
  }

  /**
   * Scrub PII from a string. Returns the cleaned string.
   * Original sensitive data is replaced with [REDACTED:TYPE].
   */
  scrub(text: string): string {
    let result = text;
    for (const { pattern, label, previewChars } of this.patterns) {
      // Reset global regex state
      const regex = new RegExp(pattern.source, pattern.flags);
      let matchCount = 0;
      let firstPreview = '';

      result = result.replace(regex, (match) => {
        matchCount++;
        if (matchCount === 1 && previewChars > 0) {
          firstPreview = match.slice(0, previewChars) + '...';
        }
        return `[REDACTED:${label}]`;
      });

      if (matchCount > 0) {
        this.stats.set(label, (this.stats.get(label) ?? 0) + matchCount);
        this.onRedaction?.({
          type: label,
          count: matchCount,
          preview: firstPreview || '[hidden]',
        });
      }
    }
    return result;
  }

  /**
   * Scrub PII from an array of messages (for LLM context).
   * System messages with pinned context marked [LOCAL-ONLY] are completely removed.
   * Returns new array — original messages are NOT modified.
   */
  scrubMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
    return messages.map((msg) => {
      let content = msg.content;

      // Strip [LOCAL-ONLY] sections from system prompts
      if (msg.role === 'system') {
        content = content.replace(
          /--- LOCAL-ONLY \(never send to LLM\) ---[\s\S]*?--- END LOCAL-ONLY ---/g,
          '[local context removed — not sent to API]'
        );
      }

      return {
        ...msg,
        content: this.scrub(content),
      };
    });
  }

  /**
   * Check if text contains any PII (without modifying it).
   * Returns list of detected types.
   */
  detect(text: string): string[] {
    const found: string[] = [];
    for (const { pattern, label } of this.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(text)) {
        found.push(label);
      }
    }
    return found;
  }

  /** Get accumulated stats (type → count). */
  getStats(): Map<string, number> {
    return new Map(this.stats);
  }

  /** Reset stats. */
  resetStats(): void {
    this.stats.clear();
  }
}
