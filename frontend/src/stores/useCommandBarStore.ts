import { create } from 'zustand';
import { parseTimeframe } from '../core/TimeframeParser';
import { fetchCommandBarConfig, updateCommandBarConfig } from '../services/api';

export type TimeframeToken = string;

export interface CommandBarState {
  timeframe: TimeframeToken;
  trailLength: number;
  bookmarkedTrailLengths: number[];
  bookmarkedTimeframes: string[];
  recentTimeframes: string[];
  normalized: boolean;
  showTrails: boolean;

  hydrated: boolean;

  setTimeframe: (t: TimeframeToken) => void;
  setTrailLength: (l: number) => void;
  setBookmarkedTrailLengths: (l: number[]) => void;
  setBookmarkedTimeframes: (tfs: string[]) => void;
  addRecentTimeframe: (tf: string) => void;
  setNormalized: (v: boolean) => void;
  setShowTrails: (v: boolean) => void;

  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}

const DEFAULT_STATE = {
  timeframe: '15min',
  trailLength: 10,
  bookmarkedTrailLengths: [5, 10, 15, 20, 30],
  bookmarkedTimeframes: ['1min', '5min', '15min', '45min', '1h', '1d', '1w', '1mo'],
  recentTimeframes: [],
  normalized: true,
  showTrails: true,
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
  setBookmarkedTrailLengths: (l) => {
    set({ bookmarkedTrailLengths: l });
    get().saveConfig();
  },
  setBookmarkedTimeframes: (tfs) => {
    const sorted = tfs.map(t => {
      try { return parseTimeframe(t); } catch { return null; }
    }).filter(Boolean)
      .sort((a, b) => a!.sortWeight - b!.sortWeight)
      .map(p => p!.canonical);
    set({ bookmarkedTimeframes: Array.from(new Set(sorted)) });
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

  loadConfig: async () => {
    try {
      const config = await fetchCommandBarConfig();
      if (config) {
        set({
          timeframe: config.timeframes?.active || DEFAULT_STATE.timeframe,
          bookmarkedTimeframes: config.timeframes?.bookmarked || DEFAULT_STATE.bookmarkedTimeframes,
          trailLength: config.trailLengths?.active || DEFAULT_STATE.trailLength,
          bookmarkedTrailLengths: config.trailLengths?.bookmarked || DEFAULT_STATE.bookmarkedTrailLengths,
          normalized: config.toggles?.normalized ?? DEFAULT_STATE.normalized,
          showTrails: config.toggles?.trailsEnabled ?? DEFAULT_STATE.showTrails,
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
        timeframes: {
          active: state.timeframe,
          bookmarked: state.bookmarkedTimeframes
        },
        trailLengths: {
          active: state.trailLength,
          bookmarked: state.bookmarkedTrailLengths
        },
        toggles: {
          normalized: state.normalized,
          trailsEnabled: state.showTrails
        }
      };
      try {
        await updateCommandBarConfig(config);
      } catch (e) {
        console.error('Failed to save command bar config', e);
      }
    }, 500); // 500ms debounce
  }
}));
