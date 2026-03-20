/**
 * Simple long-term memory: in-memory store, no embeddings.
 * Can be replaced with vector DB (e.g. for semantic search).
 */

import type { LongTermMemory, MemoryEntry } from '../types.js';

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class SimpleLongTermMemory implements LongTermMemory {
  private entries: MemoryEntry[] = [];

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const q = query.toLowerCase();
    const scored = this.entries
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
    this.entries.push(full);
    return full;
  }
}
