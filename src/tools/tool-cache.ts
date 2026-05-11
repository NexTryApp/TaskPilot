/**
 * Tool result cache: deduplication of repeated tool invocations.
 * Key = principalId + tool name + JSON.stringify(args). TTL is optional.
 *
 * SECURITY: cache is scoped per principal — one user's results cannot leak to another.
 * Only side-effect-free tools are cacheable (read-only). Mutating tools (send_email,
 * telegram_send, create_task, etc.) MUST NOT be cached — re-invocation would skip
 * the side effect by returning stale data.
 */

export interface CacheEntry {
  result: string | unknown;
  createdAt: number;
}

export interface ToolCacheOptions {
  /** TTL in milliseconds; 0 = indefinite (until end of run). Default 0. */
  ttlMs?: number;
  /**
   * Whitelist of tool names that are safe to cache (read-only / idempotent).
   * If undefined — uses DEFAULT_CACHEABLE_TOOLS.
   * Pass an empty array to disable caching entirely (useful for tests).
   */
  cacheableTools?: string[];
}

/**
 * Default whitelist: tools that are read-only and safe to cache within a run.
 * Conservative — when in doubt, leave a tool OUT. The cost of a duplicate
 * cache miss is far smaller than a duplicate side effect (double-sent email).
 */
export const DEFAULT_CACHEABLE_TOOLS: ReadonlyArray<string> = [
  // Web read-only
  'browser_search',
  'browser_open',
  'browser_screenshot',
  'open_url',
  // Info lookups
  'get_weather',
  // Messaging READS are cacheable; sends are NOT
  'telegram_read',
  'discord_read',
  'slack_read',
];

export class ToolCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;
  private cacheable: Set<string>;

  constructor(options: ToolCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 0;
    this.cacheable = new Set(options.cacheableTools ?? DEFAULT_CACHEABLE_TOOLS);
  }

  /** True if this tool name is on the cacheable whitelist. */
  isCacheable(toolName: string): boolean {
    return this.cacheable.has(toolName);
  }

  /**
   * Build a cache key scoped by principal.
   * Without principal isolation, one user's cached tool results could leak to another.
   */
  private key(toolName: string, args: Record<string, unknown>, principalId?: string): string {
    const scope = principalId || '__global__';
    return `${scope}::${toolName}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  get(toolName: string, args: Record<string, unknown>, principalId?: string): CacheEntry | undefined {
    if (!this.isCacheable(toolName)) return undefined;
    const k = this.key(toolName, args, principalId);
    const entry = this.cache.get(k);
    if (!entry) return undefined;
    if (this.ttlMs > 0 && Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(k);
      return undefined;
    }
    return entry;
  }

  set(toolName: string, args: Record<string, unknown>, result: string | unknown, principalId?: string): void {
    if (!this.isCacheable(toolName)) return;
    const k = this.key(toolName, args, principalId);
    this.cache.set(k, { result, createdAt: Date.now() });
  }

  has(toolName: string, args: Record<string, unknown>, principalId?: string): boolean {
    return this.get(toolName, args, principalId) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
