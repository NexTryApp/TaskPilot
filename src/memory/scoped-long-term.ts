/**
 * Long-term memory with data isolation by scope (e.g. principalId, tenantId).
 * Each scope has its own bucket; search/add only see current scope.
 */

import type { LongTermMemory, MemoryEntry, ScopedLongTermMemory } from '../types.js';

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class ScopedLongTermMemoryImpl implements ScopedLongTermMemory {
  /** scope -> entries */
  private buckets = new Map<string, MemoryEntry[]>();
  private currentScope = '';

  setScope(scope: string): void {
    this.currentScope = scope;
  }

  private getBucket(): MemoryEntry[] {
    if (!this.currentScope) return [];
    let bucket = this.buckets.get(this.currentScope);
    if (!bucket) {
      bucket = [];
      this.buckets.set(this.currentScope, bucket);
    }
    return bucket;
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const entries = this.getBucket();
    const q = query.toLowerCase();
    const scored = entries
      .filter((e) => e.content.toLowerCase().includes(q))
      .map((e) => ({ entry: e, score: e.content.toLowerCase().split(q).length - 1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry }) => entry);
    return scored;
  }

  async add(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    const full: MemoryEntry = {
      ...entry,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    this.getBucket().push(full);
    return full;
  }
}
