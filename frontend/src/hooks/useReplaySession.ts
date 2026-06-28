/**
 * useReplaySession — orchestration hook.
 *
 * Wires all replay core modules together:
 *   ReplayDataset + ReplayFrameCache + SnapshotBuilder + ReplayAnalytics
 *   + ReplayClock + PlaybackController → useRrgStore
 *
 * Data flow:
 *   1. Parameter change → fetchReplayDataset → parse → cache
 *   2. Cursor change   → buildReplaySnapshot → analyzeSnapshot → setReplaySnapshot
 *   3. Clock tick      → PlaybackController.stepForward → triggers cursor change
 *
 * The existing live-mode fetchData() path is completely untouched.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useCommandBarStore } from '../stores/useCommandBarStore';
import { useChartSettingsStore } from '../stores/useChartSettingsStore';
import { useReplayStore } from '../stores/useReplayStore';
import { useRrgStore } from '../stores/useRrgStore';
import { fetchReplayDataset } from '../services/api';
import {
  type ReplayDataset,
  parseReplayDatasetResponse,
  buildCacheKey,
  estimateMemoryBytes,
  nearestIndex,
} from '../core/ReplayDataset';
import { ReplayFrameCache } from '../core/ReplayFrameCache';
import { buildReplaySnapshot, clearSnapshotCache } from '../core/SnapshotBuilder';
import { analyzeSnapshot } from '../core/ReplayAnalytics';
import { ReplayClock, type ReplaySpeed } from '../core/ReplayClock';
import { PlaybackController } from '../core/PlaybackController';

// ─── Memory Budget Defaults ────────────────────────────────────────────

const DEFAULT_MAX_MEMORY_MB = 128;

// ─── Singleton Instances (survive re-renders) ──────────────────────────

const frameCache = new ReplayFrameCache({
  maxMemoryMB: DEFAULT_MAX_MEMORY_MB,
  maxConcurrentDatasets: 3,
});

// ─── Helper: resolve replay range from preset ──────────────────────────

function resolveRangeMs(
  preset: string,
  anchorMs: number,
): { fromMs: number; toMs: number } {
  const toMs = anchorMs || Date.now();
  const d = new Date(toMs);
  let from: Date;

  switch (preset) {
    case '1W': from = new Date(d.getTime() - 7 * 86400000); break;
    case '1M': from = new Date(d); from.setMonth(from.getMonth() - 1); break;
    case '3M': from = new Date(d); from.setMonth(from.getMonth() - 3); break;
    case '6M': from = new Date(d); from.setMonth(from.getMonth() - 6); break;
    case '1Y': from = new Date(d); from.setFullYear(from.getFullYear() - 1); break;
    case 'MAX': from = new Date(0); break;
    default: from = new Date(d); from.setMonth(from.getMonth() - 3); break;
  }

  return { fromMs: from.getTime(), toMs };
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useReplaySession() {
  const replayModeEnabled = useCommandBarStore(s => (s as any).replayModeEnabled);
  const normalized = useCommandBarStore(s => s.normalized);
  const benchmark = useChartSettingsStore(s => s.benchmark);

  const replayTimeframe = useReplayStore(s => s.replayTimeframe);
  const replayTrailLength = useReplayStore(s => s.replayTrailLength);
  const selectedRangePreset = useReplayStore(s => s.selectedRangePreset);
  const replayCursorMs = useReplayStore(s => s.replayCursorMs);
  const playbackSpeed = useReplayStore(s => s.playbackSpeed);
  const isPlaying = useReplayStore(s => s.isPlaying);
  const setDatasetStatus = useReplayStore(s => s.setDatasetStatus);
  const setDatasetHash = useReplayStore(s => s.setDatasetHash);

  // Read stable array references from the store — do NOT derive inside selectors
  const watchlist = useRrgStore(s => s.watchlist);
  const hiddenSectors = useRrgStore(s => s.hiddenSectors);
  const setReplaySnapshot = useRrgStore(s => s.setReplaySnapshot);

  // Derive sector list and a stable string key via useMemo (avoids infinite loop)
  const watchlistSectors = useMemo(
    () => watchlist.filter(w => w.enabled).map(w => w.symbol),
    [watchlist],
  );
  const watchlistKey = useMemo(
    () => watchlistSectors.join(','),
    [watchlistSectors],
  );

  // Refs for mutable instances and abort controllers
  const datasetRef = useRef<ReplayDataset | null>(null);
  const clockRef = useRef<ReplayClock>(new ReplayClock());
  const controllerRef = useRef<PlaybackController>(new PlaybackController());
  const abortRef = useRef<AbortController | null>(null);
  const lastCacheKeyRef = useRef<string>('');

  // ─── Snapshot Pipeline ─────────────────────────────────────────────

  const runSnapshotPipeline = useCallback(
    (cursorIndex: number) => {
      const dataset = datasetRef.current;
      if (!dataset || dataset.frameCount === 0) return;

      const snapshot = buildReplaySnapshot(
        dataset,
        cursorIndex,
        replayTrailLength,
        hiddenSectors,
      );

      const analyzed = analyzeSnapshot(snapshot, normalized);

      setReplaySnapshot({
        rawData: analyzed.sectors,
        enrichedData: analyzed.enrichedSectors,
        quadrantDistribution: analyzed.quadrants,
      });

      // Sync cursor timestamp back to replay store for timeline display
      const cursorMs = dataset.timestamps[cursorIndex];
      if (cursorMs) {
        useReplayStore.getState().setReplayCursor(cursorMs);
      }
    },
    [replayTrailLength, hiddenSectors, normalized, setReplaySnapshot],
  );

  // ─── PlaybackController Change Handler ─────────────────────────────

  useEffect(() => {
    const controller = controllerRef.current;
    controller.onChange((state) => {
      runSnapshotPipeline(state.cursorIndex);

      // Sync playback state to store
      const replayStore = useReplayStore.getState();
      if (state.state === 'FINISHED' && replayStore.isPlaying) {
        replayStore.setIsPlaying(false);
        replayStore.setPlaybackState('FINISHED');
        clockRef.current.stop();
      }
    });
  }, [runSnapshotPipeline]);

  // ─── Initialize + Render First Frame ─────────────────────────────────

  /**
   * After a dataset loads (or cache hit), this function:
   *   1. Resets PlaybackController to minPlayableIndex
   *   2. Renders the first snapshot (so the RRG graph shows immediately)
   *   3. Syncs cursor timestamp to the replay store (so the timeline marker moves)
   *
   * This ensures cursor, timeline marker, trail window, and graph all start together.
   */
  const initializeAndRenderFirst = useCallback(
    (dataset: ReplayDataset, trailLength: number) => {
      if (dataset.frameCount === 0) return;

      const controller = controllerRef.current;
      controller.initialize(dataset.frameCount, trailLength);

      // Render the initial frame immediately
      const startIdx = controller.cursorIndex;
      runSnapshotPipeline(startIdx);

      // Sync cursor to the first playable timestamp
      const cursorMs = dataset.timestamps[startIdx];
      if (cursorMs) {
        useReplayStore.getState().setReplayCursor(cursorMs);
      }

      console.log('[ReplaySession] Initialized at frame', startIdx,
        'of', dataset.frameCount, '| timestamp:', cursorMs);
    },
    [runSnapshotPipeline],
  );

  // ─── Dataset Loading (triggers on parameter changes) ───────────────

  useEffect(() => {
    if (!replayModeEnabled) {
      // Clean up when leaving replay mode
      clockRef.current.stop();
      datasetRef.current = null;
      lastCacheKeyRef.current = '';
      setDatasetStatus('idle');
      setDatasetHash(null);
      return;
    }

    if (watchlistSectors.length === 0) return;

    // Fix 1: Always stop playback when parameters change (timeline preset, timeframe, etc.)
    clockRef.current.stop();
    const replayStore = useReplayStore.getState();
    if (replayStore.isPlaying) {
      replayStore.setIsPlaying(false);
      replayStore.setPlaybackState('STOPPED');
    }

    // Derive anchor timestamp from timeline bounds or live data (fixes MAX -> 1W missing history)
    let anchorMs = Date.now();
    const replayTimestamps = useReplayStore.getState().replayTimestamps;
    if (replayTimestamps.length > 0) {
      anchorMs = replayTimestamps[replayTimestamps.length - 1]; // Use timeline end, not the cursor
    } else {
      const liveData = useRrgStore.getState().rawData;
      if (liveData.length > 0) {
        const benchmarkPoint = liveData.find((p) => p.symbol === benchmark) || liveData[0];
        if (benchmarkPoint && benchmarkPoint.trail.length > 0) {
          anchorMs = benchmarkPoint.trail[benchmarkPoint.trail.length - 1].epochMillis;
        }
      }
    }

    const { fromMs, toMs } = resolveRangeMs(selectedRangePreset, anchorMs);
    const cacheKey = buildCacheKey(
      benchmark, replayTimeframe, normalized, watchlistSectors, fromMs, toMs,
    );

    // Skip if same cache key (no parameter change)
    if (cacheKey === lastCacheKeyRef.current && datasetRef.current) return;
    lastCacheKeyRef.current = cacheKey;

    // Check client-side cache
    const cached = frameCache.get(cacheKey);
    if (cached) {
      console.log('[ReplaySession] Cache hit:', cacheKey);
      datasetRef.current = cached;
      clearSnapshotCache();
      setDatasetStatus('ready');
      setDatasetHash(cached.metadata.hash);

      // Fix 2+3+4: Initialize controller + render first frame + sync cursor
      initializeAndRenderFirst(cached, replayTrailLength);
      return;
    }

    // Fetch new dataset
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setDatasetStatus('loading');
    console.log('[ReplaySession] Fetching dataset:', {
      benchmark, replayTimeframe, normalized, sectors: watchlistSectors.length, fromMs, toMs,
    });

    fetchReplayDataset(
      benchmark, replayTimeframe, normalized, watchlistSectors, fromMs, toMs, abort.signal,
    )
      .then((json) => {
        if (abort.signal.aborted) return;

        const dataset = parseReplayDatasetResponse(json);
        const memBytes = estimateMemoryBytes(dataset);
        const memMB = Math.round(memBytes / (1024 * 1024) * 100) / 100;

        console.log('[ReplaySession] Dataset loaded:', {
          frameCount: dataset.frameCount,
          sectors: dataset.sectorSeries.length,
          memoryMB: memMB,
        });

        // Fix 5: Guard against empty datasets
        if (dataset.frameCount === 0) {
          console.warn('[ReplaySession] Empty dataset — no replay data for this range');
          datasetRef.current = null;
          setDatasetStatus('ready');
          setDatasetHash(null);
          // Clear the RRG graph
          setReplaySnapshot({
            rawData: [],
            enrichedData: [],
            quadrantDistribution: { leading: 0, weakening: 0, lagging: 0, improving: 0 },
          });
          return;
        }

        if (memMB > DEFAULT_MAX_MEMORY_MB) {
          console.warn(`[ReplaySession] Dataset exceeds memory budget: ${memMB}MB > ${DEFAULT_MAX_MEMORY_MB}MB`);
        }

        frameCache.put(cacheKey, dataset);
        datasetRef.current = dataset;
        clearSnapshotCache();
        setDatasetStatus('ready');
        setDatasetHash(dataset.metadata.hash);

        // Set timeline timestamps for the ReplayTimelinePanel
        useReplayStore.getState().setReplayTimelineTimestamps(
          Array.from(dataset.timestamps),
        );

        // Also set the precise benchmark close data for the timeline graph
        if (dataset.referenceSeries.length > 0) {
          const points = Array.from(dataset.timestamps).map((ts, i) => ({
            timestamp: ts,
            close: dataset.referenceSeries[0].closes[i]
          }));
          useReplayStore.getState().setReplayTimelineData(points);
        }

        // Fix 2+3+4: Initialize controller + render first frame + sync cursor
        initializeAndRenderFirst(dataset, replayTrailLength);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        console.error('[ReplaySession] Failed to fetch dataset:', err);
        setDatasetStatus('error');
      });

    return () => {
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    replayModeEnabled, benchmark, replayTimeframe, normalized,
    selectedRangePreset, watchlistKey,
  ]);

  // ─── Cursor-driven snapshot updates ────────────────────────────────

  useEffect(() => {
    if (!replayModeEnabled || !datasetRef.current) return;

    // When cursor changes externally (e.g. manual drag on timeline),
    // resolve to nearest index and run snapshot pipeline
    if (replayCursorMs != null) {
      const dataset = datasetRef.current;
      const idx = nearestIndex(dataset, replayCursorMs);
      if (idx >= 0 && idx !== controllerRef.current.cursorIndex) {
        controllerRef.current.jumpToIndex(idx);
        // jumpToIndex triggers onChange which calls runSnapshotPipeline
      }
    }
  }, [replayModeEnabled, replayCursorMs]);

  // ─── Trail length changes (instant, no re-fetch) ──────────────────

  useEffect(() => {
    if (!replayModeEnabled || !datasetRef.current) return;

    controllerRef.current.updateTrailLength(replayTrailLength);
    clearSnapshotCache();

    // Re-run snapshot with new trail length at current cursor
    runSnapshotPipeline(controllerRef.current.cursorIndex);
  }, [replayModeEnabled, replayTrailLength, runSnapshotPipeline]);

  // ─── Hidden sectors changes (instant, no re-fetch) ─────────────────

  useEffect(() => {
    if (!replayModeEnabled || !datasetRef.current) return;
    runSnapshotPipeline(controllerRef.current.cursorIndex);
  }, [replayModeEnabled, hiddenSectors, runSnapshotPipeline]);

  // ─── Playback clock control ────────────────────────────────────────

  useEffect(() => {
    const clock = clockRef.current;
    const controller = controllerRef.current;

    if (!replayModeEnabled) {
      clock.stop();
      return;
    }

    if (isPlaying && datasetRef.current) {
      clock.setSpeed(playbackSpeed as ReplaySpeed);
      clock.start(() => {
        controller.stepForward(1);
      });
    } else {
      clock.stop();
    }

    return () => {
      clock.stop();
    };
  }, [replayModeEnabled, isPlaying, playbackSpeed]);

  // ─── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clockRef.current.destroy();
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);
}
