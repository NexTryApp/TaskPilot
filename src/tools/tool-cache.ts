/**
 * Tool result cache: дедупликация повторных вызовов инструментов.
 * Ключ = tool name + JSON.stringify(args). TTL опционален.
 */

export interface CacheEntry {
  result: string | unknown;
  createdAt: number;
}

export interface ToolCacheOptions {
  /** TTL в миллисекундах; 0 = бессрочно (до конца ранна). По умолчанию 0. */
  ttlMs?: number;
}

export class ToolCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(options: ToolCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 0;
  }

  private key(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  get(toolName: string, args: Record<string, unknown>): CacheEntry | undefined {
    const k = this.key(toolName, args);
    const entry = this.cache.get(k);
    if (!entry) return undefined;
    if (this.ttlMs > 0 && Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(k);
      return undefined;
    }
    return entry;
  }

  set(toolName: string, args: Record<string, unknown>, result: string | unknown): void {
    const k = this.key(toolName, args);
    this.cache.set(k, { result, createdAt: Date.now() });
  }

  has(toolName: string, args: Record<string, unknown>): boolean {
    return this.get(toolName, args) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
