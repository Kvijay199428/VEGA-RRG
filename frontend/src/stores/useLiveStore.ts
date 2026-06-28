import { create } from 'zustand';
import type { RrgPoint, TrailPoint } from '../types';

/**
 * Live trail point with provisional flag.
 */
export interface LiveTrailPoint extends TrailPoint {
  provisional: boolean;
}

/**
 * Per-sector live position from PATCH messages.
 */
export interface LiveSectorPosition {
  x: number;
  y: number;
  quadrant: string;
  provisional: boolean;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

/**
 * Zustand store for live mode state.
 *
 * Key design decisions:
 * - Canonical trails: stores FULL-length trails per sector per timeframe.
 *   Trail length is VIEW STATE — consumers slice locally (correction #5).
 * - Frame coalescing: incoming PATCH updates are buffered and merged
 *   before triggering a re-render (correction #14).
 * - Persistent trail buffers: trails are incrementally mutated,
 *   never fully replaced (correction #13).
 */

interface LiveState {
  // Connection
  liveConnectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  lastLiveUpdate: number | null;

  // Per-sector positions: timeframe → sector → position
  positions: Record<string, Record<string, LiveSectorPosition>>;

  // Canonical trails: timeframe → sector → trail points (full hybrid trail)
  canonicalTrails: Record<string, Record<string, LiveTrailPoint[]>>;

  // Trail boundary: timeframe → sector → index where historical ends and live begins
  // Points at index < boundaryIndex are historical (render dimmer)
  // Points at index >= boundaryIndex are live (render normal)
  trailBoundaryIndex: Record<string, Record<string, number>>;

  // Warmup sufficiency: timeframe → sector → { requested, available }
  trailSufficiency: Record<string, Record<string, { requested: number; available: number }>>;

  // Sequence tracking: timeframe → last seq
  lastSeq: Record<string, number>;

  // Buffered updates for frame coalescing (correction #14)
  pendingPatches: PatchMessage[];

  // Actions
  onSnapshot: (timeframe: string, points: any[]) => void;
  onPatch: (msg: PatchMessage) => void;
  onFallback: (reason: string) => void;
  flushPendingPatches: () => void;
  getTrail: (timeframe: string, sector: string, trailLength: number) => LiveTrailPoint[];
  getLiveRrgPoints: (timeframe: string, trailLength: number) => RrgPoint[];
  setConnectionStatus: (status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void;
  clearLiveData: () => void;
}

export interface PatchMessage {
  timeframe: string;
  seq: number;
  timestamp: number;
  changes: PatchChange[];
}

export interface PatchChange {
  symbol: string;
  x: number;
  y: number;
  q?: string;
  provisional?: boolean;
  vx?: number;
  vy?: number;
  ax?: number;
  ay?: number;
  trailPoint?: { t: number; x: number; y: number; p: boolean };
}

export const useLiveStore = create<LiveState>((set, get) => ({
  liveConnectionStatus: 'DISCONNECTED',
  lastLiveUpdate: null,
  positions: {},
  canonicalTrails: {},
  trailBoundaryIndex: {},
  trailSufficiency: {},
  lastSeq: {},
  pendingPatches: [],

  /**
   * Handle full SNAPSHOT — replaces all data for a timeframe.
   * Only sent on initial connect or reconnect.
   */
  onSnapshot: (timeframe, points) => {
    const newPositions: Record<string, LiveSectorPosition> = {};
    const newTrails: Record<string, LiveTrailPoint[]> = {};
    const newBoundaries: Record<string, number> = {};
    const newSufficiency: Record<string, { requested: number; available: number }> = {};

    for (const point of points) {
      newPositions[point.symbol] = {
        x: point.x,
        y: point.y,
        quadrant: point.quadrant || 'LAGGING',
        provisional: point.provisional || false,
        vx: point.vx || 0,
        vy: point.vy || 0,
        ax: point.ax || 0,
        ay: point.ay || 0,
      };

      if (point.trail) {
        newTrails[point.symbol] = point.trail.map((tp: any) => ({
          epochMillis: tp.epochMillis,
          x: tp.x,
          y: tp.y,
          provisional: tp.provisional || false,
        }));
      }

      // Store boundary index from SNAPSHOT metadata (correction #6)
      // historicalCount tells us where historical ends and live begins
      const historicalCount = point.historicalCount ?? 0;
      newBoundaries[point.symbol] = historicalCount;

      // Warmup sufficiency metadata (correction #5)
      newSufficiency[point.symbol] = {
        requested: point.requestedLength ?? 0,
        available: point.availableLength ?? 0,
      };
    }

    set(state => ({
      positions: { ...state.positions, [timeframe]: newPositions },
      canonicalTrails: { ...state.canonicalTrails, [timeframe]: newTrails },
      trailBoundaryIndex: { ...state.trailBoundaryIndex, [timeframe]: newBoundaries },
      trailSufficiency: { ...state.trailSufficiency, [timeframe]: newSufficiency },
      lastLiveUpdate: Date.now(),
      liveConnectionStatus: 'CONNECTED',
    }));
  },

  /**
   * Handle PATCH — buffer for frame coalescing (correction #14).
   * Actual application happens in flushPendingPatches.
   */
  onPatch: (msg) => {
    set(state => ({
      pendingPatches: [...state.pendingPatches, msg],
    }));
  },

  /**
   * Flush all buffered patches — called once per animation frame.
   * Merges multiple updates into a single state transition (correction #14).
   */
  flushPendingPatches: () => {
    const { pendingPatches, positions, canonicalTrails, lastSeq } = get();
    if (pendingPatches.length === 0) return;

    const newPositions = { ...positions };
    const newTrails = { ...canonicalTrails };
    const newSeq = { ...lastSeq };

    for (const patch of pendingPatches) {
      const tf = patch.timeframe;
      newSeq[tf] = patch.seq;

      if (!newPositions[tf]) newPositions[tf] = {};
      if (!newTrails[tf]) newTrails[tf] = {};

      for (const change of patch.changes) {
        // Update position (correction #13 — incremental mutation)
        newPositions[tf] = {
          ...newPositions[tf],
          [change.symbol]: {
            x: change.x,
            y: change.y,
            quadrant: change.q || 'LAGGING',
            provisional: change.provisional || false,
            vx: change.vx || 0,
            vy: change.vy || 0,
            ax: change.ax || 0,
            ay: change.ay || 0,
          },
        };

        // Append or replace trail point (correction #13 — persistent trail buffer)
        if (change.trailPoint) {
          const tp: LiveTrailPoint = {
            epochMillis: change.trailPoint.t,
            x: change.trailPoint.x,
            y: change.trailPoint.y,
            provisional: change.trailPoint.p,
          };

          const existingTrail = newTrails[tf][change.symbol] || [];
          let updatedTrail: LiveTrailPoint[];

          if (tp.provisional && existingTrail.length > 0) {
            // Replace last provisional point
            const lastPoint = existingTrail[existingTrail.length - 1];
            if (lastPoint.provisional) {
              updatedTrail = [...existingTrail.slice(0, -1), tp];
            } else {
              updatedTrail = [...existingTrail, tp];
            }
          } else {
            updatedTrail = [...existingTrail, tp];
          }

          // Cap at 120 points
          if (updatedTrail.length > 120) {
            updatedTrail = updatedTrail.slice(updatedTrail.length - 120);
          }

          newTrails[tf] = { ...newTrails[tf], [change.symbol]: updatedTrail };
        }
      }
    }

    set({
      positions: newPositions,
      canonicalTrails: newTrails,
      lastSeq: newSeq,
      pendingPatches: [],
      lastLiveUpdate: Date.now(),
    });
  },

  /**
   * Get trail for a sector sliced to requested length (correction #5).
   * Trail length is VIEW STATE — instant, zero-cost.
   */
  getTrail: (timeframe, sector, trailLength) => {
    const trails = get().canonicalTrails[timeframe];
    if (!trails) return [];
    const trail = trails[sector];
    if (!trail) return [];
    return trail.slice(Math.max(0, trail.length - trailLength));
  },

  /**
   * Convert live state to RrgPoint[] compatible with existing rendering.
   */
  getLiveRrgPoints: (timeframe, trailLength) => {
    const pos = get().positions[timeframe];
    const trails = get().canonicalTrails[timeframe];
    const boundaries = get().trailBoundaryIndex[timeframe];
    if (!pos) return [];

    return Object.entries(pos).map(([symbol, p]) => {
      const trail = trails?.[symbol] || [];
      const slicedTrail = trail.slice(Math.max(0, trail.length - trailLength));
      const boundaryIndex = boundaries?.[symbol] ?? 0;

      return {
        symbol,
        x: p.x,
        y: p.y,
        quadrant: p.quadrant as any,
        trail: slicedTrail.map(tp => ({
          epochMillis: tp.epochMillis,
          x: tp.x,
          y: tp.y,
        })),
        stale: false,
        computedAt: Date.now(),
        boundaryIndex, // index where historical → live transition occurs
      };
    });
  },

  onFallback: (_reason) => {
    set({ liveConnectionStatus: 'DISCONNECTED' });
  },

  setConnectionStatus: (status) => set({ liveConnectionStatus: status }),

  clearLiveData: () => set({
    positions: {},
    canonicalTrails: {},
    trailBoundaryIndex: {},
    trailSufficiency: {},
    lastSeq: {},
    pendingPatches: [],
    lastLiveUpdate: null,
    liveConnectionStatus: 'DISCONNECTED',
  }),
}));
