import { create } from 'zustand';
import { fetchSettingsConfig, updateSettingsConfig } from '../services/api';

// Mirrors SettingsConfig.TrailReplayConfig from backend
export interface TimeframeReplayConfig {
  rangeType: 'WEEK' | 'MONTH' | 'YEAR';
  rangeValue: number;
  defaultTrailLength: number;
  maxTrailLength: number;
  autoApplyDefaultTrail: boolean;
}

export interface TrailReplayConfig {
  enabled: boolean;
  timeframeDateRanges: Record<string, TimeframeReplayConfig>;
  replayDefaults: {
    restoreLastReplayDate: boolean;
    rememberLastTrailLength: boolean;
    rememberPlaybackSpeed: boolean;
  };
}

const DEFAULT_TRAIL_REPLAY_CONFIG: TrailReplayConfig = {
  enabled: true,
  timeframeDateRanges: {
    MINUTE: { rangeType: 'WEEK',  rangeValue: 1,  defaultTrailLength: 30, maxTrailLength: 120, autoApplyDefaultTrail: true },
    HOUR:   { rangeType: 'WEEK',  rangeValue: 3,  defaultTrailLength: 20, maxTrailLength: 120, autoApplyDefaultTrail: true },
    DAY:    { rangeType: 'MONTH', rangeValue: 3,  defaultTrailLength: 15, maxTrailLength: 120, autoApplyDefaultTrail: true },
    WEEK:   { rangeType: 'MONTH', rangeValue: 9,  defaultTrailLength: 12, maxTrailLength: 120, autoApplyDefaultTrail: false },
    MONTH:  { rangeType: 'YEAR',  rangeValue: 10, defaultTrailLength: 10, maxTrailLength: 120, autoApplyDefaultTrail: false },
  },
  replayDefaults: {
    restoreLastReplayDate: true,
    rememberLastTrailLength: true,
    rememberPlaybackSpeed: true,
  },
};

export interface ChartSettingsState {
  // Benchmark
  benchmark: string;

  // Visual / Rendering
  showLabels: boolean;
  gridDensity: 'sparse' | 'normal' | 'dense';
  quadrantOpacity: number;
  semanticZoom: boolean;

  // Playback
  animationSpeed: number;
  playbackMode: boolean;

  // Camera / Viewport sensitivity
  zoomSensitivity: number;
  panSensitivity: number;
  minZoom: number;
  maxZoom: number;

  // Optimizations
  minimalWindowResampling: boolean;
  watchlistOnlyResampling: boolean;
  backgroundSnapshotRefresh: boolean;

  // Trail Replay config (from bootstrap, persisted via PATCH)
  trailReplayConfig: TrailReplayConfig;

  // Hydration guard
  hydrated: boolean;

  // Actions
  setBenchmark: (b: string) => void;
  setShowLabels: (v: boolean) => void;
  setGridDensity: (d: 'sparse' | 'normal' | 'dense') => void;
  setQuadrantOpacity: (v: number) => void;
  setSemanticZoom: (v: boolean) => void;
  setAnimationSpeed: (s: number) => void;
  setPlaybackMode: (v: boolean) => void;
  setZoomSensitivity: (v: number) => void;
  setPanSensitivity: (v: number) => void;
  setMinZoom: (v: number) => void;
  setMaxZoom: (v: number) => void;
  setMinimalWindowResampling: (v: boolean) => void;
  setWatchlistOnlyResampling: (v: boolean) => void;
  setBackgroundSnapshotRefresh: (v: boolean) => void;
  setTrailReplayConfig: (config: TrailReplayConfig) => void;
  resetDefaults: () => void;
  applyState: (draft: Partial<ChartSettingsState>) => void;
  
  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}

const DEFAULT_STATE = {
  benchmark: 'NSE_INDEX_Nifty 50',
  showLabels: true,
  gridDensity: 'normal' as const,
  quadrantOpacity: 0.22,
  semanticZoom: true,
  animationSpeed: 1,
  playbackMode: false,
  zoomSensitivity: 0.1,
  panSensitivity: 1.0,
  minZoom: 0.8,
  maxZoom: 6.0,
  minimalWindowResampling: false,
  watchlistOnlyResampling: false,
  backgroundSnapshotRefresh: true,
  trailReplayConfig: DEFAULT_TRAIL_REPLAY_CONFIG,
  hydrated: false,
};

let saveTimeout: any = null;

export const useChartSettingsStore = create<ChartSettingsState>((set, get) => ({
  ...DEFAULT_STATE,

  setBenchmark: (b) => { set({ benchmark: b }); get().saveConfig(); },
  setShowLabels: (v) => { set({ showLabels: v }); get().saveConfig(); },
  setGridDensity: (d) => { set({ gridDensity: d }); get().saveConfig(); },
  setQuadrantOpacity: (v) => { set({ quadrantOpacity: v }); get().saveConfig(); },
  setSemanticZoom: (v) => { set({ semanticZoom: v }); get().saveConfig(); },
  setAnimationSpeed: (s) => set({ animationSpeed: s }), // Transient
  setPlaybackMode: (v) => set({ playbackMode: v }),     // Transient
  setZoomSensitivity: (v) => { set({ zoomSensitivity: v }); get().saveConfig(); },
  setPanSensitivity: (v) => { set({ panSensitivity: v }); get().saveConfig(); },
  setMinZoom: (v) => { set({ minZoom: v }); get().saveConfig(); },
  setMaxZoom: (v) => { set({ maxZoom: v }); get().saveConfig(); },
  setMinimalWindowResampling: (v) => { set({ minimalWindowResampling: v }); get().saveConfig(); },
  setWatchlistOnlyResampling: (v) => { set({ watchlistOnlyResampling: v }); get().saveConfig(); },
  setBackgroundSnapshotRefresh: (v) => { set({ backgroundSnapshotRefresh: v }); get().saveConfig(); },
  setTrailReplayConfig: (config) => { set({ trailReplayConfig: config }); get().saveConfig(); },
  resetDefaults: () => {
    set({ ...DEFAULT_STATE, hydrated: true });
    get().saveConfig();
  },

  applyState: (draft) => {
    set(draft);
  },

  loadConfig: async () => {
    try {
      const config = await fetchSettingsConfig();
      if (config) {
        set({
          minimalWindowResampling: config.optimization?.minimalWindowResampling ?? DEFAULT_STATE.minimalWindowResampling,
          watchlistOnlyResampling: config.optimization?.watchlistOnlyResampling ?? DEFAULT_STATE.watchlistOnlyResampling,
          backgroundSnapshotRefresh: config.optimization?.backgroundSnapshotRefresh ?? DEFAULT_STATE.backgroundSnapshotRefresh,
          
          showLabels: config.rendering?.labelsEnabled ?? DEFAULT_STATE.showLabels,
          semanticZoom: config.rendering?.semanticZoom ?? DEFAULT_STATE.semanticZoom,
          
          minZoom: config.camera?.minInteractionZoom ?? DEFAULT_STATE.minZoom,
          maxZoom: config.camera?.maxZoom ?? DEFAULT_STATE.maxZoom,
          
          hydrated: true,
          trailReplayConfig: config.trailReplay ?? DEFAULT_TRAIL_REPLAY_CONFIG,
        });
      }
    } catch (e) {
      console.error('Failed to load settings config', e);
      set({ hydrated: true });
    }
  },

  saveConfig: () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const state = get();
      const config = {
        optimization: {
          minimalWindowResampling: state.minimalWindowResampling,
          watchlistOnlyResampling: state.watchlistOnlyResampling,
          backgroundSnapshotRefresh: state.backgroundSnapshotRefresh,
          snapshotCacheEnabled: true,
          snapshotCacheTtlEnabled: true
        },
        rendering: {
          trailsEnabled: true, // Controlled by CommandBar Store now, but we keep structure
          trailArrowsEnabled: true,
          trailGlowEnabled: true,
          labelsEnabled: state.showLabels,
          adaptiveLabels: true,
          semanticZoom: state.semanticZoom
        },
        camera: {
          autoFitEnabled: true,
          fitPadding: 0.5,
          smoothInterpolation: true,
          maxZoom: state.maxZoom,
          minInteractionZoom: state.minZoom
        },
        interaction: {
          hoverHighlight: true,
          selectionHighlight: true,
          tooltipEnabled: true
        },
        trailReplay: state.trailReplayConfig,
      };
      try {
        await updateSettingsConfig(config);
      } catch (e) {
        console.error('Failed to save settings config', e);
      }
    }, 500); // 500ms debounce
  }
}));
