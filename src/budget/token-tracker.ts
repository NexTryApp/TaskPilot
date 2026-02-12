/**
 * Token budget tracker: считает примерное количество токенов и следит за лимитом.
 * Простая оценка: 1 токен ≈ 4 символа (English) / 2 символа (CJK/Cyrillic).
 * Для точного подсчёта — подключить tiktoken или tokenizer провайдера.
 */

export interface TokenBudgetOptions {
  /** Максимум токенов на ран. 0 = без лимита. По умолчанию 0. */
  maxTokens?: number;
}

export class TokenTracker {
  private maxTokens: number;
  private used = 0;

  constructor(options: TokenBudgetOptions = {}) {
    this.maxTokens = options.maxTokens ?? 0;
  }

  /** Примерная оценка количества токенов в тексте. */
  estimate(text: string): number {
    // Грубая оценка: латиница ~4 chars/token, кириллица/CJK ~2 chars/token
    const nonAscii = text.replace(/[\x00-\x7F]/g, '').length;
    const ascii = text.length - nonAscii;
    return Math.ceil(ascii / 4 + nonAscii / 2);
  }

  /** Добавить использованные токены (от промпта или ответа). */
  add(tokens: number): void {
    this.used += tokens;
  }

  /** Добавить по тексту (примерная оценка). */
  addFromText(text: string): void {
    this.add(this.estimate(text));
  }

  /** Проверить, не превышен ли бюджет. */
  get isExceeded(): boolean {
    return this.maxTokens > 0 && this.used >= this.maxTokens;
  }

  /** Сколько использовано. */
  get tokensUsed(): number {
    return this.used;
  }

  /** Сколько осталось (0 если без лимита). */
  get tokensRemaining(): number {
    if (this.maxTokens <= 0) return Infinity;
    return Math.max(0, this.maxTokens - this.used);
  }

  /** Бюджет. */
  get budget(): number {
    return this.maxTokens;
  }

  reset(): void {
    this.used = 0;
  }
}
