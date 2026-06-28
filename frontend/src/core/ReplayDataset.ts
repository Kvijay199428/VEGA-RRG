/**
 * ReplayDataset — self-indexing, series-oriented replay data structure.
 *
 * Owns the timestamp index (binary search) so lookup responsibility stays
 * with the data, not the cache. Uses Float64Array for memory efficiency.
 */



// ─── Metadata & Capabilities ───────────────────────────────────────────

export interface ReplayDatasetMetadata {
  generation: number;
  hash: string;
  createdAt: number;
  instrumentRevision: string;
}

export interface ReplayDatasetCapabilities {
  supportsReplay: boolean;
  supportsNormalization: boolean;
  supportsIntraday: boolean;
  maxTrailLength: number;
  minTimestamp: number;
  maxTimestamp: number;
}

// ─── Series Types ──────────────────────────────────────────────────────

export interface SectorSeries {
  symbol: string;
  rsRatio: Float64Array;
  rsMomentum: Float64Array;
}

export interface ReferenceSeries {
  symbol: string;
  closes: Float64Array;
}

// ─── Dataset ───────────────────────────────────────────────────────────

export interface ReplayDataset {
  metadata: ReplayDatasetMetadata;
  capabilities: ReplayDatasetCapabilities;
  benchmark: string;
  timeframe: string;
  normalized: boolean;
  frameCount: number;
  timestamps: Float64Array;
  referenceSeries: ReferenceSeries[];
  sectorSeries: SectorSeries[];
}

// ─── Self-Indexing Operations ──────────────────────────────────────────

/**
 * Binary search for the nearest timestamp index — O(log n).
 * Returns the index of the timestamp closest to the query.
 */
export function nearestIndex(dataset: ReplayDataset, timestamp: number): number {
  const ts = dataset.timestamps;
  if (ts.length === 0) return -1;
  if (ts.length === 1) return 0;
  if (timestamp <= ts[0]) return 0;
  if (timestamp >= ts[ts.length - 1]) return ts.length - 1;

  let low = 0;
  let high = ts.length - 1;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ts[mid] < timestamp) low = mid + 1;
    else high = mid;
  }

  // low is the first index >= timestamp; check if left neighbor is closer
  const leftIdx = Math.max(0, low - 1);
  return Math.abs(ts[leftIdx] - timestamp) <= Math.abs(ts[low] - timestamp)
    ? leftIdx
    : low;
}

/**
 * Direct array read — O(1). Returns {x, y} for a sector at a given index.
 * Returns null if the value is NaN (alignment gap).
 */
export function getPosition(
  series: SectorSeries,
  index: number,
): { x: number; y: number } | null {
  const x = series.rsRatio[index];
  const y = series.rsMomentum[index];
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

/**
 * Returns the reference (benchmark) close at the given index.
 */
export function getReferenceClose(
  dataset: ReplayDataset,
  refIndex: number,
  frameIndex: number,
): number {
  if (refIndex < 0 || refIndex >= dataset.referenceSeries.length) return 0;
  return dataset.referenceSeries[refIndex].closes[frameIndex] ?? 0;
}

// ─── Parsing ───────────────────────────────────────────────────────────

/**
 * Parse the JSON response from GET /api/rrg/replay-dataset into typed arrays.
 */
export function parseReplayDatasetResponse(json: any): ReplayDataset {
  const timestamps = Float64Array.from(json.timestamps ?? []);

  const referenceSeries: ReferenceSeries[] = (json.referenceSeries ?? []).map(
    (ref: any) => ({
      symbol: ref.symbol,
      closes: Float64Array.from(ref.closes ?? []),
    }),
  );

  const sectorSeries: SectorSeries[] = (json.sectorSeries ?? []).map(
    (s: any) => ({
      symbol: s.symbol,
      rsRatio: Float64Array.from(s.rsRatio ?? []),
      rsMomentum: Float64Array.from(s.rsMomentum ?? []),
    }),
  );

  return {
    metadata: {
      generation: json.metadata?.generation ?? 0,
      hash: json.metadata?.hash ?? '',
      createdAt: json.metadata?.createdAt ?? 0,
      instrumentRevision: json.metadata?.instrumentRevision ?? '',
    },
    capabilities: {
      supportsReplay: json.capabilities?.supportsReplay ?? false,
      supportsNormalization: json.capabilities?.supportsNormalization ?? false,
      supportsIntraday: json.capabilities?.supportsIntraday ?? false,
      maxTrailLength: json.capabilities?.maxTrailLength ?? 0,
      minTimestamp: json.capabilities?.minTimestamp ?? 0,
      maxTimestamp: json.capabilities?.maxTimestamp ?? 0,
    },
    benchmark: json.benchmark ?? '',
    timeframe: json.timeframe ?? '',
    normalized: json.normalized ?? true,
    frameCount: json.frameCount ?? 0,
    timestamps,
    referenceSeries,
    sectorSeries,
  };
}

// ─── Memory Estimation ─────────────────────────────────────────────────

/**
 * Estimates the memory footprint of a ReplayDataset in bytes.
 * Used for memory budget enforcement.
 *
 * Formula: N × (8 + R × 8 + S × 16) bytes
 *   N = timestamp count, R = reference series, S = sector count
 */
export function estimateMemoryBytes(dataset: ReplayDataset): number {
  const n = dataset.timestamps.length;
  const r = dataset.referenceSeries.length;
  const s = dataset.sectorSeries.length;
  // timestamps(8) + refCloses(R×8) + sector ratio+momentum(S×16) per frame
  return n * (8 + r * 8 + s * 16);
}

// ─── Cache Key ─────────────────────────────────────────────────────────

/**
 * Builds a deterministic cache key from replay parameters.
 */
export function buildCacheKey(
  benchmark: string,
  timeframe: string,
  normalized: boolean,
  sectors: string[],
  fromMs: number,
  toMs: number,
): string {
  const sortedSectors = [...sectors].sort().join(',');
  return `${benchmark}|${timeframe}|${normalized}|${sortedSectors}|${fromMs}|${toMs}`;
}
