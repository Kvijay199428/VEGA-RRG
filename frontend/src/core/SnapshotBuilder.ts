/**
 * SnapshotBuilder — pure function, no internal state.
 *
 * Takes a ReplayDataset + cursorIndex + trailLength → produces RrgPoint[].
 * Does NOT compute quadrants or analytics — that's ReplayAnalytics's job.
 *
 * Trail-length changes are instant: just re-invoke with a different trailLength.
 * No re-fetch, no cache rebuild, no side effects.
 */

import type { RrgPoint, TrailPoint } from '../types';
import type { ReplayDataset } from './ReplayDataset';
import { getPosition } from './ReplayDataset';

// ─── Output Type ───────────────────────────────────────────────────────

export interface BuiltSnapshot {
  cursorIndex: number;
  timestamp: number;
  referenceCloses: Array<{ symbol: string; close: number }>;
  sectors: RrgPoint[];  // with trails, ready for enrichAll() + analytics
}

// ─── LRU Snapshot Cache ────────────────────────────────────────────────

const SNAPSHOT_CACHE_SIZE = 64;

interface SnapshotCacheEntry {
  key: string;
  snapshot: BuiltSnapshot;
}

const snapshotCache: SnapshotCacheEntry[] = [];

function snapshotCacheKey(cursorIndex: number, trailLength: number, hiddenKey: string): string {
  return `${cursorIndex}|${trailLength}|${hiddenKey}`;
}

function getCachedSnapshot(key: string): BuiltSnapshot | null {
  const idx = snapshotCache.findIndex(e => e.key === key);
  if (idx < 0) return null;
  // Move to end (most recently used)
  const entry = snapshotCache.splice(idx, 1)[0];
  snapshotCache.push(entry);
  return entry.snapshot;
}

function putCachedSnapshot(key: string, snapshot: BuiltSnapshot): void {
  // Evict oldest if at capacity
  if (snapshotCache.length >= SNAPSHOT_CACHE_SIZE) {
    snapshotCache.shift();
  }
  snapshotCache.push({ key, snapshot });
}

/**
 * Clear the snapshot cache. Called when the underlying dataset changes.
 */
export function clearSnapshotCache(): void {
  snapshotCache.length = 0;
}

// ─── Core Builder ──────────────────────────────────────────────────────

/**
 * Builds a render-ready snapshot from a ReplayDataset at the given cursor index.
 *
 * Pure function: no internal state, no side effects.
 * The only caching is the lightweight LRU for scrub-back-and-forth optimization.
 *
 * @param dataset      The replay dataset (series-oriented)
 * @param cursorIndex  Current cursor position (integer index into timestamps)
 * @param trailLength  Number of historical points to include in trails
 * @param hiddenSectors Sectors to exclude from the snapshot
 * @returns BuiltSnapshot with RrgPoint[] (without quadrant — analytics adds that)
 */
export function buildReplaySnapshot(
  dataset: ReplayDataset,
  cursorIndex: number,
  trailLength: number,
  hiddenSectors: string[],
): BuiltSnapshot {
  // Validate cursor bounds
  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, dataset.frameCount - 1));
  if (dataset.frameCount === 0) {
    return {
      cursorIndex: 0,
      timestamp: 0,
      referenceCloses: [],
      sectors: [],
    };
  }

  // Check snapshot cache (for scrub-back-and-forth optimization)
  const hiddenKey = hiddenSectors.length > 0 ? hiddenSectors.sort().join(',') : '';
  const cacheKey = snapshotCacheKey(safeCursorIndex, trailLength, hiddenKey);
  const cached = getCachedSnapshot(cacheKey);
  if (cached) return cached;

  const timestamp = dataset.timestamps[safeCursorIndex];
  const startIdx = Math.max(0, safeCursorIndex - trailLength + 1);

  // Build reference closes
  const referenceCloses = dataset.referenceSeries.map(ref => ({
    symbol: ref.symbol,
    close: ref.closes[safeCursorIndex] ?? 0,
  }));

  // Build sector RrgPoints with trails
  const hiddenSet = new Set(hiddenSectors);
  const sectors: RrgPoint[] = [];

  for (const series of dataset.sectorSeries) {
    if (hiddenSet.has(series.symbol)) continue;

    // Current position
    const currentPos = getPosition(series, safeCursorIndex);
    if (!currentPos) continue; // NaN gap — skip this sector at this timestamp

    // Build trail from series arrays (pure array slicing)
    const trail: TrailPoint[] = [];
    for (let i = startIdx; i <= safeCursorIndex; i++) {
      const pos = getPosition(series, i);
      if (pos) {
        trail.push({
          epochMillis: dataset.timestamps[i],
          x: pos.x,
          y: pos.y,
        });
      }
    }

    // Build RrgPoint — quadrant intentionally left as '' (derived by ReplayAnalytics)
    sectors.push({
      symbol: series.symbol,
      x: currentPos.x,
      y: currentPos.y,
      quadrant: '' as any,  // Will be set by ReplayAnalytics
      trail,
    });
  }

  const snapshot: BuiltSnapshot = {
    cursorIndex: safeCursorIndex,
    timestamp,
    referenceCloses,
    sectors,
  };

  // Cache the snapshot for scrub optimization
  putCachedSnapshot(cacheKey, snapshot);

  return snapshot;
}
