import { create } from 'zustand';
import { parseTimeframe } from '../core/TimeframeParser';
import { fetchPreferences, updatePreferences } from '../services/api';

export type TimeframeToken = string;

export interface TimeframeItem {
  id: string;
  label: string;
  minutes: number;
  bookmarked: boolean;
  supported: boolean;
  system: boolean;
  createdAt?: string;
}

export interface TrailItem {
  value: number;
  bookmarked: boolean;
  system: boolean;
  recommendedReplayRange?: string | null;
  createdAt?: string;
}

export interface CommandBarState {
  timeframe: TimeframeToken;
  trailLength: number;
  timeframeItems: TimeframeItem[];
  trailItems: TrailItem[];
  recentTimeframes: string[];
  normalized: boolean;
  showTrails: boolean;

  // Live mode toggles
  intradayEnabled: boolean;
  liveStreamingEnabled: boolean;
  replayModeEnabled: boolean;

  // Replay transport controls
  playState: 'playing' | 'paused';
  replaySpeed: 1 | 2 | 5 | 10;

  hydrated: boolean;

  setTimeframe: (t: TimeframeToken) => void;
  setTrailLength: (l: number) => void;
  setTimeframeItems: (items: TimeframeItem[]) => void;
  setTrailItems: (items: TrailItem[]) => void;
  addRecentTimeframe: (tf: string) => void;
  setNormalized: (v: boolean) => void;
  setShowTrails: (v: boolean) => void;
  setIntradayEnabled: (v: boolean) => void;
  setLiveStreamingEnabled: (v: boolean) => void;
  setReplayModeEnabled: (v: boolean) => void;
  setPlayState: (s: 'playing' | 'paused') => void;
  setReplaySpeed: (speed: 1 | 2 | 5 | 10) => void;
  applyState: (draft: Partial<CommandBarState>) => void;

  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}

const DEFAULT_STATE = {
  timeframe: '5min',
  trailLength: 5,
  timeframeItems: [
    { id: '1min', label: '1 MIN', minutes: 1, bookmarked: true, supported: true, system: true },
    { id: '5min', label: '5 MIN', minutes: 5, bookmarked: true, supported: true, system: true },
    { id: '15min', label: '15 MIN', minutes: 15, bookmarked: true, supported: true, system: true },
    { id: '45min', label: '45 MIN', minutes: 45, bookmarked: true, supported: true, system: true },
    { id: '1h', label: '1 HOUR', minutes: 60, bookmarked: true, supported: true, system: true },
    { id: '1d', label: '1 DAY', minutes: 1440, bookmarked: true, supported: true, system: true },
    { id: '1w', label: '1 WEEK', minutes: 10080, bookmarked: true, supported: true, system: true },
    { id: '1mo', label: '1 MONTH', minutes: 43200, bookmarked: true, supported: true, system: true }
  ],
  trailItems: [
    { value: 5, bookmarked: true, system: true },
    { value: 10, bookmarked: true, system: true },
    { value: 15, bookmarked: true, system: true },
    { value: 20, bookmarked: true, system: true },
    { value: 30, bookmarked: true, system: true }
  ],
  recentTimeframes: [],
  normalized: true,
  showTrails: true,
  intradayEnabled: false,
  liveStreamingEnabled: false,
  replayModeEnabled: false,
  playState: 'paused' as const,
  replaySpeed: 1 as const,
  hydrated: false,
};

let saveTimeout: any = null;

export const useCommandBarStore = create<CommandBarState>((set, get) => ({
  ...DEFAULT_STATE,

  setTimeframe: (t) => {
    try {
      const parsed = parseTimeframe(t);
      set({ timeframe: parsed.canonical });
      get().addRecentTimeframe(parsed.canonical);
      get().saveConfig();
    } catch (e) {
      console.warn('Invalid timeframe', e);
    }
  },
  setTrailLength: (l) => {
    set({ trailLength: l });
    get().saveConfig();
  },
  setTimeframeItems: (items) => {
    set({ timeframeItems: items });
    get().saveConfig();
  },
  setTrailItems: (items) => {
    set({ trailItems: items });
    get().saveConfig();
  },
  addRecentTimeframe: (tf) => {
    const recents = get().recentTimeframes.filter(t => t !== tf);
    set({ recentTimeframes: [tf, ...recents].slice(0, 5) });
  },
  setNormalized: (v) => {
    set({ normalized: v });
    get().saveConfig();
  },
  setShowTrails: (v) => {
    set({ showTrails: v });
    get().saveConfig();
  },
  setIntradayEnabled: (v) => {
    set({ intradayEnabled: v });
    get().saveConfig();
  },
  setLiveStreamingEnabled: (v) => {
    set({ liveStreamingEnabled: v });
    get().saveConfig();
  },
  setReplayModeEnabled: (v) => {
    set({ replayModeEnabled: v, playState: 'paused' });
    get().saveConfig();
  },
  setPlayState: (s) => set({ playState: s }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  applyState: (draft) => set(draft),

  loadConfig: async () => {
    try {
      const config = await fetchPreferences();
      if (config) {
        set({
          timeframe: config.activeTimeframe || DEFAULT_STATE.timeframe,
          timeframeItems: config.timeframes || DEFAULT_STATE.timeframeItems,
          trailLength: config.activeTrailLength || DEFAULT_STATE.trailLength,
          trailItems: config.trails || DEFAULT_STATE.trailItems,
          normalized: config.toggles?.normalized ?? DEFAULT_STATE.normalized,
          showTrails: config.toggles?.trailsEnabled ?? DEFAULT_STATE.showTrails,
          intradayEnabled: config.toggles?.intradayEnabled ?? DEFAULT_STATE.intradayEnabled,
          liveStreamingEnabled: config.toggles?.liveStreamingEnabled ?? DEFAULT_STATE.liveStreamingEnabled,
          replayModeEnabled: config.toggles?.replayModeEnabled ?? DEFAULT_STATE.replayModeEnabled,
          hydrated: true
        });
      }
    } catch (e) {
      console.error('Failed to load command bar config', e);
      set({ hydrated: true });
    }
  },

  saveConfig: () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const state = get();
      const config = {
        version: 1,
        activeTimeframe: state.timeframe,
        activeTrailLength: state.trailLength,
        timeframes: state.timeframeItems,
        trails: state.trailItems,
        toggles: {
          normalized: state.normalized,
          trailsEnabled: state.showTrails,
          intradayEnabled: state.intradayEnabled,
          liveStreamingEnabled: state.liveStreamingEnabled,
          replayModeEnabled: state.replayModeEnabled
        }
      };
      try {
        await updatePreferences(config);
      } catch (e) {
        console.error('Failed to save command bar config', e);
      }
    }, 500);
  }
}));
