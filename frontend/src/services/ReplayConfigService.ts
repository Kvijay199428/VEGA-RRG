import { ConfigService } from './ConfigService';
import { getTimeframeMs } from '../core/TimeframeParser';
import { formatTailSpanLabel } from '../core/ReplayWindowCalculator';

export const ReplayConfigService = {
  load: async () => {
    try {
      const config = await ConfigService.fetchReplayConfig();
      const prefs = await ConfigService.fetchPreferences();

      // Validate and fallback
      const replayPrefs = prefs?.replay || {};

      const rangePreset = config.ranges.bookmarked.includes(replayPrefs.selectedRangePreset)
        ? replayPrefs.selectedRangePreset
        : config.ranges.active;

      const timeframe = config.timeframes.bookmarked.includes(replayPrefs.selectedTimeframe)
        ? replayPrefs.selectedTimeframe
        : config.timeframes.active;

      const trailLength = config.trailLengths.bookmarked.includes(replayPrefs.selectedTrailLength)
        ? replayPrefs.selectedTrailLength
        : config.trailLengths.active;

      const playbackSpeed = config.playback.availableSpeeds.includes(replayPrefs.playbackSpeed)
        ? replayPrefs.playbackSpeed
        : config.playback.defaultSpeed;

      const loopPlayback = replayPrefs.loopPlayback ?? config.playback.defaultLoop;

      return {
        config,
        prefs: {
          ...replayPrefs,
          selectedRangePreset: rangePreset,
          selectedTimeframe: timeframe,
          selectedTrailLength: trailLength,
          playbackSpeed,
          loopPlayback,
        }
      };
    } catch (error) {
      console.error('Failed to load replay config or preferences:', error);
      throw error;
    }
  },

  buildTailState: (timeframe: string, trailLength: number) => {
    const tailSpanMs = getTimeframeMs(timeframe) * trailLength;
    return {
      tailSpanMs,
      bufferNeededMs: tailSpanMs,
      tailSpanLabel: formatTailSpanLabel(tailSpanMs),
    };
  },

  initialize: async () => {
    const { config, prefs } = await ReplayConfigService.load();
    const tailState = ReplayConfigService.buildTailState(prefs.selectedTimeframe, prefs.selectedTrailLength);

    return {
      selectedRangePreset: prefs.selectedRangePreset,
      replayTimeframe: prefs.selectedTimeframe,
      replayTrailLength: prefs.selectedTrailLength,
      replayTimestamps: [],
      replayDataPoints: [],
      ...tailState,

      replayStartMs: prefs.lastStartTimestamp || null,
      replayEndMs: prefs.lastEndTimestamp || null,
      replayCursorMs: prefs.lastCursorTimestamp || null,

      playbackState: 'STOPPED',
      isPlaying: false,
      playbackSpeed: prefs.playbackSpeed,
      datasetStatus: 'idle' as const,
      datasetHash: null,
      
      // Store the config capabilities for runtime reference if needed
      _config: config
    };
  }
};
