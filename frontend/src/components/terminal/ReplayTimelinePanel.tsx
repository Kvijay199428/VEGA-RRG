import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChartSettingsStore } from '../../stores/useChartSettingsStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useReplayStore } from '../../stores/useReplayStore';
import type { RangePreset } from '../../stores/useReplayStore';
import BenchmarkTimelineComponent from './BenchmarkTimelineComponent';
import './ReplayTimelinePanel.css';

const REPLAY_RANGES: Array<Exclude<RangePreset, 'CUSTOM'>> = ['1W', '1M', '3M', '6M', '1Y', 'MAX'];

function formatDuration(ms: number): string {
  if (ms <= 0) return '0D';

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  if (days >= 1) return `${days}D${hours > 0 ? ` ${hours}h` : ''}`;
  if (hours >= 1) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${Math.max(1, minutes)}m`;
}

const ReplayTimelinePanel: React.FC = () => {
  const commandTimeframe = useCommandBarStore(s => s.timeframe);
  const commandTrailLength = useCommandBarStore(s => s.trailLength);
  const timeframeItems = useCommandBarStore(s => s.timeframeItems);
  const trailItems = useCommandBarStore(s => s.trailItems);
  const { benchmark } = useChartSettingsStore();
  const {
    selectedRangePreset,
    replayTimeframe,
    replayTrailLength,
    replayStartMs,
    replayEndMs,
    replayCursorMs,
    replayDataPoints,
    tailSpanLabel,
    playbackState,
    isPlaying,
    playbackSpeed,
    initializeFromCommandBar,
    setRangePreset,
    setReplayTimeframe,
    setReplayTrailLength,
    setReplayTimelineTimestamps,
    setReplayBounds,
    setReplayCursor,
    stepReplayCursor,
    jumpToPlaybackStart,
    jumpToPlaybackEnd,
    startPlayback,
    restartPlayback,
    setPlaybackState,
    setPlaybackSpeed,
    getSelectedReplayDate,
    datasetStatus,
  } = useReplayStore();

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initializeFromCommandBar(commandTimeframe, commandTrailLength);
  }, [commandTimeframe, commandTrailLength, initializeFromCommandBar]);

  const [timelineRangePreset, setTimelineRangePreset] = useState<Exclude<RangePreset, 'CUSTOM'>>(
    selectedRangePreset === 'CUSTOM' ? '3M' : selectedRangePreset,
  );

  useEffect(() => {
    if (selectedRangePreset !== 'CUSTOM') {
      setTimelineRangePreset(selectedRangePreset);
    }
  }, [selectedRangePreset]);

  const stepForward = useCallback((steps = 1) => {
    stepReplayCursor(steps);
  }, [stepReplayCursor]);

  const stepBack = useCallback(() => {
    stepReplayCursor(-1);
    setPlaybackState('PAUSED');
  }, [setPlaybackState, stepReplayCursor]);

  const jumpToStart = useCallback(() => {
    jumpToPlaybackStart();
  }, [jumpToPlaybackStart]);

  const jumpToEnd = useCallback(() => {
    jumpToPlaybackEnd();
  }, [jumpToPlaybackEnd]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      setPlaybackState('PAUSED');
    } else if (playbackState === 'FINISHED') {
      restartPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, playbackState, setPlaybackState, restartPlayback, startPlayback]);

  const windowDurationMs = (replayEndMs || 0) - (replayStartMs || 0);

  return (
    <div className="replay-timeline" onPointerDown={event => event.stopPropagation()}>
      <div className="replay-timeline__header">
        <div className="replay-timeline__header-info">
          <label className="replay-timeline__field">
            <span>Timeframe</span>
            <select
              className="replay-timeline__select"
              value={replayTimeframe}
              onChange={event => setReplayTimeframe(event.target.value)}
            >
              {timeframeItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="replay-timeline__field">
            <span>Trail</span>
            <select
              className="replay-timeline__select"
              value={replayTrailLength}
              onChange={event => setReplayTrailLength(Number(event.target.value))}
            >
              {trailItems.map(item => (
                <option key={item.value} value={item.value}>{item.value}</option>
              ))}
            </select>
          </label>

          <span>Span: <strong className="replay-timeline__header-value">{tailSpanLabel}</strong></span>
          <span>Window: <strong className="replay-timeline__header-value">{replayTrailLength} candles</strong></span>
          <span>State: <strong className="replay-timeline__header-value">{playbackState}</strong></span>
        </div>

        <div className="replay-timeline__controls-group">
          {REPLAY_RANGES.map(range => (
            <button
              key={range}
              className={`replay-timeline__btn ${selectedRangePreset === range ? 'replay-timeline__btn--active' : ''}`}
              onClick={() => setRangePreset(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <BenchmarkTimelineComponent
        benchmark={benchmark}
        timeframe={replayTimeframe}
        rangePreset={timelineRangePreset}
        trailLength={replayTrailLength}
        replayStartMs={replayStartMs}
        replayEndMs={replayEndMs}
        replayCursorMs={replayCursorMs}
        timelineData={replayDataPoints}
        onTimelineLoaded={setReplayTimelineTimestamps}
        onReplayBoundsChange={setReplayBounds}
        onReplayCursorChange={setReplayCursor}
      />

      {datasetStatus === 'loading' && (
        <div className="replay-timeline__overlay">
          <span className="replay-timeline__loading">Building replay dataset…</span>
        </div>
      )}
      {datasetStatus === 'error' && (
        <div className="replay-timeline__overlay replay-timeline__overlay--error">
          <span>Failed to load replay dataset</span>
        </div>
      )}

      {replayStartMs && replayEndMs && (
        <div className="replay-timeline__footer">
          <div className="replay-timeline__footer-left">
            <span>
              Duration:
              <strong>{formatDuration(windowDurationMs)}</strong>
            </span>
            <span>
              Candles:
              <strong>{replayTrailLength}</strong>
            </span>
          </div>

          <div className="replay-timeline__footer-center">
            Replay Cursor:
            <strong>{getSelectedReplayDate() || '-'}</strong>
          </div>

          <div className="replay-timeline__footer-right">
            <button className="replay-timeline__playback-btn" onClick={jumpToStart} title="Jump to start">|&lt;</button>
            <button className="replay-timeline__playback-btn" onClick={stepBack} title="Previous candle">&lt;</button>
            <button className="replay-timeline__playback-btn" onClick={togglePlayback} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="replay-timeline__playback-btn" onClick={() => stepForward(1)} title="Next candle">&gt;&gt;</button>
            <button className="replay-timeline__playback-btn" onClick={jumpToEnd} title="Jump to end">&gt;|</button>

            <div className="replay-timeline__speed-group">
              {/* <span>Speed</span> */}
              {[1, 2, 5, 10].map(speed => (
                <button
                  key={speed}
                  className={`replay-timeline__btn ${playbackSpeed === speed ? 'replay-timeline__btn--active' : ''}`}
                  onClick={() => setPlaybackSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReplayTimelinePanel;
