/**
 * Token budget tracker: estimates approximate token count and monitors the limit.
 * Simple estimate: 1 token ≈ 4 chars (English) / 2 chars (CJK/Cyrillic).
 * For accurate counting — use tiktoken or provider tokenizer.
 */

export interface TokenBudgetOptions {
  /** Max tokens per run. 0 = unlimited. Default 0. */
  maxTokens?: number;
}

export class TokenTracker {
  private maxTokens: number;
  private used = 0;

  constructor(options: TokenBudgetOptions = {}) {
    this.maxTokens = options.maxTokens ?? 0;
  }

  /** Approximate token count estimate for text. */
  estimate(text: string): number {
    // Rough estimate: Latin ~4 chars/token, Cyrillic/CJK ~2 chars/token
    const nonAscii = text.replace(/[\x00-\x7F]/g, '').length;
    const ascii = text.length - nonAscii;
    return Math.ceil(ascii / 4 + nonAscii / 2);
  }

  /** Add used tokens (from prompt or response). */
  add(tokens: number): void {
    this.used += tokens;
  }

  /** Add from text (approximate estimate). */
  addFromText(text: string): void {
    this.add(this.estimate(text));
  }

  /** Check if budget is exceeded. */
  get isExceeded(): boolean {
    return this.maxTokens > 0 && this.used >= this.maxTokens;
  }

  /** How many used. */
  get tokensUsed(): number {
    return this.used;
  }

  /** How many remaining (0 if unlimited). */
  get tokensRemaining(): number {
    if (this.maxTokens <= 0) return Infinity;
    return Math.max(0, this.maxTokens - this.used);
  }

  /** Budget. */
  get budget(): number {
    return this.maxTokens;
  }

  reset(): void {
    this.used = 0;
  }
}
