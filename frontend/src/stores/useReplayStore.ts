import { create } from 'zustand';
import { ReplayConfigService } from '../services/ReplayConfigService';
import { ConfigService } from '../services/ConfigService';

export type RangePreset = string;
export type PlaybackState = string;

export interface ReplayState {
  selectedRangePreset: RangePreset;
  replayTimeframe: string;
  replayTrailLength: number;
  replayTimestamps: number[];
  replayDataPoints: { timestamp: number; close: number }[];
  tailSpanMs: number;
  bufferNeededMs: number;
  tailSpanLabel: string;

  replayStartMs: number | null;
  replayEndMs: number | null;
  replayCursorMs: number | null;

  playbackState: PlaybackState;
  isPlaying: boolean;
  playbackSpeed: number;

  // Replay dataset status (for replay engine)
  datasetStatus: 'idle' | 'loading' | 'ready' | 'error';
  datasetHash: string | null;
  hydrated: boolean;
  _config: any; // Store the config capabilities

  initializeFromCommandBar: (timeframe: string, trailLength: number) => void;
  setRangePreset: (preset: RangePreset) => void;
  setReplayTimeframe: (timeframe: string) => void;
  setReplayTrailLength: (trailLength: number) => void;
  setReplayTimelineTimestamps: (timestamps: number[]) => void;
  setReplayTimelineData: (points: { timestamp: number; close: number }[]) => void;
  setReplayBounds: (startMs: number, endMs: number, isCustom?: boolean) => void;
  setReplayCursor: (cursorMs: number | null) => void;
  stepReplayCursor: (steps: number) => void;
  jumpToPlaybackStart: () => void;
  jumpToPlaybackEnd: () => void;
  startPlayback: () => void;
  restartPlayback: () => void;
  setPlaybackState: (state: PlaybackState) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setDatasetStatus: (status: 'idle' | 'loading' | 'ready' | 'error') => void;
  setDatasetHash: (hash: string | null) => void;

  loadConfig: () => Promise<void>;
  saveConfig: () => void;

  getSelectedReplayDate: () => string | null;
}



function nearestTimestampIndex(timestamps: number[], timestamp: number): number {
  if (timestamps.length === 0) return -1;

  let low = 0;
  let high = timestamps.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (timestamps[mid] < timestamp) low = mid + 1;
    else high = mid;
  }

  const rightIndex = low;
  const leftIndex = Math.max(0, rightIndex - 1);
  return Math.abs(timestamps[leftIndex] - timestamp) <= Math.abs(timestamps[rightIndex] - timestamp)
    ? leftIndex
    : rightIndex;
}

function getFirstPlayableIndex(timestamps: number[], trailLength: number): number {
  if (timestamps.length === 0) return -1;
  return Math.min(timestamps.length - 1, Math.max(0, trailLength - 1));
}

function patchForCursor(state: ReplayState, cursorMs: number | null): Partial<ReplayState> {
  if (cursorMs == null || state.replayTimestamps.length === 0) {
    return {
      replayCursorMs: cursorMs,
      replayStartMs: null,
      replayEndMs: null,
    };
  }

  const endIndex = nearestTimestampIndex(state.replayTimestamps, cursorMs);
  if (endIndex < 0) {
    return {
      replayCursorMs: cursorMs,
      replayStartMs: null,
      replayEndMs: null,
    };
  }

  const startIndex = Math.max(0, endIndex - state.replayTrailLength + 1);
  return {
    replayCursorMs: state.replayTimestamps[endIndex],
    replayStartMs: state.replayTimestamps[startIndex],
    replayEndMs: state.replayTimestamps[endIndex],
  };
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  selectedRangePreset: '1W', // Fallback defaults until loaded
  replayTimeframe: '5min',
  replayTrailLength: 5,
  replayTimestamps: [],
  replayDataPoints: [],
  ...ReplayConfigService.buildTailState('5min', 5),

  replayStartMs: null,
  replayEndMs: null,
  replayCursorMs: null,

  playbackState: 'STOPPED',
  isPlaying: false,
  playbackSpeed: 1,
  datasetStatus: 'idle',
  datasetHash: null,
  hydrated: false,
  _config: null,

  initializeFromCommandBar: (timeframe, trailLength) => set(state => {
    const nextTail = ReplayConfigService.buildTailState(timeframe, trailLength);
    if (
      state.replayTimeframe === timeframe &&
      state.replayTrailLength === trailLength &&
      state.tailSpanMs === nextTail.tailSpanMs
    ) {
      return state;
    }

    return {
      replayTimeframe: timeframe,
      replayTrailLength: trailLength,
      ...nextTail,
      playbackState: 'STOPPED',
      isPlaying: false,
    };
  }),

  setRangePreset: (preset) => {
    set(state => (state.selectedRangePreset === preset ? state : { selectedRangePreset: preset }));
    get().saveConfig();
  },

  setReplayTimeframe: (timeframe) => set(state => {
    if (state.replayTimeframe === timeframe) return state;
    return {
      replayTimeframe: timeframe,
      replayTimestamps: [],
      replayStartMs: null,
      replayEndMs: null,
      replayCursorMs: null,
      ...ReplayConfigService.buildTailState(timeframe, state.replayTrailLength),
      playbackState: 'STOPPED',
      isPlaying: false,
    };
  }),

  setReplayTrailLength: (trailLength) => {
    set(state => {
      const safeTrailLength = Math.max(1, trailLength);
      if (state.replayTrailLength === safeTrailLength) return state;
      const nextState = {
        ...state,
        replayTrailLength: safeTrailLength,
        ...ReplayConfigService.buildTailState(state.replayTimeframe, safeTrailLength),
      };
      return {
        replayTrailLength: safeTrailLength,
        ...ReplayConfigService.buildTailState(state.replayTimeframe, safeTrailLength),
        ...patchForCursor(nextState, state.replayCursorMs),
      };
    });
    get().saveConfig();
  },

  setReplayTimelineTimestamps: (timestamps) => set(state => {
    const sortedTimestamps = Array.from(new Set(timestamps))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const sameTimeline =
      sortedTimestamps.length === state.replayTimestamps.length &&
      sortedTimestamps.every((timestamp, index) => timestamp === state.replayTimestamps[index]);

    if (sortedTimestamps.length === 0) {
      return sameTimeline
        ? state
        : {
          replayTimestamps: [],
          replayStartMs: null,
          replayEndMs: null,
          replayCursorMs: null,
          playbackState: 'STOPPED',
          isPlaying: false,
        };
    }

    const firstPlayableIndex = getFirstPlayableIndex(sortedTimestamps, state.replayTrailLength);
    const currentIndex = state.replayCursorMs == null
      ? -1
      : nearestTimestampIndex(sortedTimestamps, state.replayCursorMs);
    const shouldResetCursor = currentIndex < firstPlayableIndex || currentIndex >= sortedTimestamps.length || !sameTimeline;
    const nextCursor = shouldResetCursor
      ? sortedTimestamps[firstPlayableIndex]
      : sortedTimestamps[currentIndex];
    const patch = patchForCursor({ ...state, replayTimestamps: sortedTimestamps }, nextCursor);

    return {
      replayTimestamps: sortedTimestamps,
      ...patch,
      playbackState: 'STOPPED',
      isPlaying: false,
    };
  }),

  setReplayTimelineData: (points) => set({ replayDataPoints: points }),

  setReplayBounds: (startMs, endMs, isCustom = true) => set(state => {
    const nextPreset = isCustom ? 'CUSTOM' : state.selectedRangePreset;
    if (
      state.replayStartMs === startMs &&
      state.replayEndMs === endMs &&
      state.selectedRangePreset === nextPreset
    ) {
      return state;
    }

    return {
      replayStartMs: startMs,
      replayEndMs: endMs,
      selectedRangePreset: nextPreset,
    };
  }),

  setReplayCursor: (cursorMs) => set(state => {
    const patch = patchForCursor(state, cursorMs);
    if (
      state.replayCursorMs === patch.replayCursorMs &&
      state.replayStartMs === patch.replayStartMs &&
      state.replayEndMs === patch.replayEndMs
    ) {
      return state;
    }
    return patch;
  }),

  stepReplayCursor: (steps) => set(state => {
    if (state.replayTimestamps.length === 0) return state;

    const firstPlayableIndex = getFirstPlayableIndex(state.replayTimestamps, state.replayTrailLength);
    const currentIndex = state.replayCursorMs == null
      ? firstPlayableIndex
      : nearestTimestampIndex(state.replayTimestamps, state.replayCursorMs);
    const nextIndex = Math.max(
      firstPlayableIndex,
      Math.min(state.replayTimestamps.length - 1, currentIndex + steps),
    );
    const patch = patchForCursor(state, state.replayTimestamps[nextIndex]);
    const finished = nextIndex >= state.replayTimestamps.length - 1;

    return {
      ...patch,
      playbackState: finished ? 'FINISHED' : state.playbackState,
      isPlaying: finished ? false : state.isPlaying,
    };
  }),

  jumpToPlaybackStart: () => set(state => {
    if (state.replayTimestamps.length === 0) return state;

    const firstPlayableIndex = getFirstPlayableIndex(state.replayTimestamps, state.replayTrailLength);
    const patch = patchForCursor(state, state.replayTimestamps[firstPlayableIndex]);

    return {
      ...patch,
      playbackState: 'STOPPED',
      isPlaying: false,
    };
  }),

  jumpToPlaybackEnd: () => set(state => {
    if (state.replayTimestamps.length === 0) return state;

    const lastIndex = state.replayTimestamps.length - 1;
    const patch = patchForCursor(state, state.replayTimestamps[lastIndex]);

    return {
      ...patch,
      playbackState: 'FINISHED',
      isPlaying: false,
    };
  }),

  startPlayback: () => set(state => {
    if (state.replayTimestamps.length === 0) {
      return { playbackState: 'STOPPED', isPlaying: false };
    }

    return {
      playbackState: 'PLAYING',
      isPlaying: true,
    };
  }),

  restartPlayback: () => set(state => {
    if (state.replayTimestamps.length === 0) return state;

    const firstPlayableIndex = getFirstPlayableIndex(state.replayTimestamps, state.replayTrailLength);
    const patch = patchForCursor(state, state.replayTimestamps[firstPlayableIndex]);

    return {
      ...patch,
      playbackState: 'PLAYING',
      isPlaying: true,
    };
  }),

  setPlaybackState: (playbackState) => set(state => (
    state.playbackState === playbackState
      ? state
      : { playbackState, isPlaying: playbackState === 'PLAYING' }
  )),

  setIsPlaying: (playing) => set(state => {
    const playbackState: PlaybackState = playing ? 'PLAYING' : 'PAUSED';
    if (state.isPlaying === playing && state.playbackState === playbackState) return state;
    return { isPlaying: playing, playbackState };
  }),

  setPlaybackSpeed: (speed) => {
    set(state => (state.playbackSpeed === speed ? state : { playbackSpeed: speed }));
    get().saveConfig();
  },

  setDatasetStatus: (status) => set({ datasetStatus: status }),
  setDatasetHash: (hash) => set({ datasetHash: hash }),

  getSelectedReplayDate: () => {
    const ms = get().replayCursorMs;
    if (!ms) return null;
    const d = new Date(ms);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
    return `${date}T${time}`;
  },

  loadConfig: async () => {
    try {
      const initialState = await ReplayConfigService.initialize();
      set({ ...initialState, hydrated: true });
    } catch (e) {
      console.error('Failed to load replay config', e);
      set({ hydrated: true });
    }
  },

  saveConfig: () => {
    // We could debounce this, but keeping it simple for now
    const state = get();
    ConfigService.fetchPreferences().then(prefs => {
      const updatedPrefs = {
        ...prefs,
        replay: {
          ...prefs?.replay,
          selectedRangePreset: state.selectedRangePreset,
          selectedTimeframe: state.replayTimeframe,
          selectedTrailLength: state.replayTrailLength,
          playbackSpeed: state.playbackSpeed,
          loopPlayback: state._config?.playback?.defaultLoop,
          lastCursorTimestamp: state.replayCursorMs,
          lastStartTimestamp: state.replayStartMs,
          lastEndTimestamp: state.replayEndMs
        }
      };
      ConfigService.updatePreferences(updatedPrefs).catch(e => {
        console.error('Failed to save replay preferences', e);
      });
    });
  }
}));
