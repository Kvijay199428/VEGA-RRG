/**
 * ReplayFrameCache — LRU cache for ReplayDataset instances.
 *
 * Does NOT own timestamp indexing (that's ReplayDataset's job).
 * Only manages storage, eviction, and memory budget enforcement.
 */

import type { ReplayDataset } from './ReplayDataset';
import { estimateMemoryBytes } from './ReplayDataset';

// ─── Configuration ─────────────────────────────────────────────────────

export interface ReplayFrameCacheConfig {
  maxMemoryMB: number;            // default 128
  maxConcurrentDatasets: number;  // default 3
  compression: boolean;           // default true (reserved for future use)
}

const DEFAULT_CONFIG: ReplayFrameCacheConfig = {
  maxMemoryMB: 128,
  maxConcurrentDatasets: 3,
  compression: true,
};

// ─── Cache Entry ───────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  dataset: ReplayDataset;
  memoryBytes: number;
  lastAccessed: number;  // for LRU eviction
}

// ─── Cache Implementation ──────────────────────────────────────────────

export class ReplayFrameCache {
  private entries = new Map<string, CacheEntry>();
  private config: ReplayFrameCacheConfig;

  constructor(config?: Partial<ReplayFrameCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Retrieve a cached dataset. Returns null on cache miss.
   * Updates LRU access time on hit.
   */
  get(cacheKey: string): ReplayDataset | null {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;

    // Check if dataset hash is still valid (staleness detection)
    entry.lastAccessed = Date.now();
    return entry.dataset;
  }

  /**
   * Store a dataset in the cache. Evicts LRU entries if memory
   * budget or concurrent dataset limit is exceeded.
   */
  put(cacheKey: string, dataset: ReplayDataset): void {
    const memBytes = estimateMemoryBytes(dataset);

    // Evict until we have room
    this.evictIfNeeded(memBytes);

    this.entries.set(cacheKey, {
      key: cacheKey,
      dataset,
      memoryBytes: memBytes,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(cacheKey: string): void {
    this.entries.delete(cacheKey);
  }

  /**
   * Invalidate all cache entries.
   */
  invalidateAll(): void {
    this.entries.clear();
  }

  /**
   * Returns the current total memory usage in bytes.
   */
  currentMemoryBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      total += entry.memoryBytes;
    }
    return total;
  }

  /**
   * Check whether adding a dataset of the given size would stay within budget.
   */
  isWithinBudget(additionalBytes: number): boolean {
    const budgetBytes = this.config.maxMemoryMB * 1024 * 1024;
    return this.currentMemoryBytes() + additionalBytes <= budgetBytes;
  }

  /**
   * Returns cache statistics for debugging / UI display.
   */
  stats(): { entries: number; memoryMB: number; budgetMB: number } {
    return {
      entries: this.entries.size,
      memoryMB: Math.round((this.currentMemoryBytes() / (1024 * 1024)) * 100) / 100,
      budgetMB: this.config.maxMemoryMB,
    };
  }

  /**
   * Update configuration (e.g. when user changes memory budget in settings).
   */
  updateConfig(config: Partial<ReplayFrameCacheConfig>): void {
    this.config = { ...this.config, ...config };
    // Re-evict if new budget is smaller
    this.evictIfNeeded(0);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private evictIfNeeded(additionalBytes: number): void {
    const budgetBytes = this.config.maxMemoryMB * 1024 * 1024;

    // Evict by count limit
    while (this.entries.size >= this.config.maxConcurrentDatasets) {
      this.evictLru();
    }

    // Evict by memory budget
    while (
      this.entries.size > 0 &&
      this.currentMemoryBytes() + additionalBytes > budgetBytes
    ) {
      this.evictLru();
    }
  }

  private evictLru(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.entries.delete(oldestKey);
    }
  }
}
