import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { RangePreset } from '../../stores/useReplayStore';
import { fetchBenchmarkTimeline } from '../../services/api';
import { TimelineTickBuilder } from './timeline/TimelineTickBuilder';

interface BenchmarkTimelinePoint {
  timestamp: number;
  close: number;
}

interface BenchmarkTimelineProps {
  benchmark: string;
  timeframe: string;
  rangePreset: Exclude<RangePreset, 'CUSTOM'>;
  trailLength: number;
  replayStartMs: number | null;
  replayEndMs: number | null;
  replayCursorMs: number | null;
  timelineData?: BenchmarkTimelinePoint[] | null;
  onTimelineLoaded: (timestamps: number[]) => void;
  onReplayBoundsChange: (startMs: number, endMs: number, isCustom?: boolean) => void;
  onReplayCursorChange: (cursorMs: number | null) => void;
}

interface TimelineScales {
  width: number;
  plotTop: number;
  plotBottom: number;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
}

interface ActiveTrailWindow {
  startIndex: number;
  endIndex: number;
  startX: number;
  endX: number;
  x: number;
  width: number;
  startPoint: BenchmarkTimelinePoint;
  endPoint: BenchmarkTimelinePoint;
}

interface HoverState {
  x: number;
  point: BenchmarkTimelinePoint;
  previousPoint: BenchmarkTimelinePoint | null;
}

const HEIGHT = 92;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 68;
const AXIS_HEIGHT = 18;
const MAX_RENDER_POINTS = 1200;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function displayBenchmarkName(benchmark: string): string {
  return benchmark
    .replace(/^NSE_INDEX_+/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateTime(timestamp: number, timeframe: string): string {
  const isIntraday = timeframe.includes('min') || timeframe.endsWith('m') || timeframe.endsWith('h');
  const options: Intl.DateTimeFormatOptions = isIntraday
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' };

  return new Intl.DateTimeFormat('en-IN', options).format(new Date(timestamp));
}

function formatClose(close: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(close);
}

function formatChange(point: BenchmarkTimelinePoint, previousPoint: BenchmarkTimelinePoint | null): string {
  if (!previousPoint || previousPoint.close === 0) return '0.00%';
  const change = ((point.close - previousPoint.close) / previousPoint.close) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function decimateByIndex(points: BenchmarkTimelinePoint[], maxPoints: number): Array<BenchmarkTimelinePoint & { index: number }> {
  if (points.length <= maxPoints) {
    return points.map((point, index) => ({ ...point, index }));
  }

  const step = Math.ceil(points.length / maxPoints);
  const sampled: Array<BenchmarkTimelinePoint & { index: number }> = [];

  for (let index = 0; index < points.length; index += step) {
    sampled.push({ ...points[index], index });
  }

  const lastIndex = points.length - 1;
  if (sampled[sampled.length - 1]?.index !== lastIndex) {
    sampled.push({ ...points[lastIndex], index: lastIndex });
  }

  return sampled;
}

function nearestIndexForTimestamp(points: BenchmarkTimelinePoint[], timestamp: number): number {
  if (points.length === 0) return 0;

  const index = d3.bisector<BenchmarkTimelinePoint, number>(d => d.timestamp).left(points, timestamp);
  const leftIndex = clamp(index - 1, 0, points.length - 1);
  const rightIndex = clamp(index, 0, points.length - 1);
  const left = points[leftIndex];
  const right = points[rightIndex];

  return Math.abs(left.timestamp - timestamp) <= Math.abs(right.timestamp - timestamp) ? leftIndex : rightIndex;
}

function findPreviousPoint(points: BenchmarkTimelinePoint[], index: number): BenchmarkTimelinePoint | null {
  return index > 0 ? points[index - 1] : null;
}

const BenchmarkTimelineComponent: React.FC<BenchmarkTimelineProps> = ({
  benchmark,
  timeframe,
  rangePreset,
  trailLength,
  replayStartMs,
  replayEndMs,
  replayCursorMs,
  timelineData,
  onTimelineLoaded,
  onReplayBoundsChange,
  onReplayCursorChange,
}) => {
  const [history, setHistory] = useState<BenchmarkTimelinePoint[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [containerWidth, setContainerWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chartAreaRef.current;
    if (!node) return;

    const observer = new ResizeObserver(entries => {
      setContainerWidth(Math.max(0, Math.floor(entries[0].contentRect.width)));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (timelineData != null) {
      setHistory(timelineData);
      setStatus(timelineData.length > 0 ? 'ready' : 'empty');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');

    fetchBenchmarkTimeline(benchmark, timeframe, rangePreset, controller.signal)
      .then(response => {
        const points = response.points
          .map(point => ({ timestamp: point.epochMillis, close: point.close }))
          .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.close))
          .sort((a, b) => a.timestamp - b.timestamp);

        setHistory(points);
        onTimelineLoaded(points.map(point => point.timestamp));
        setStatus(points.length > 0 ? 'ready' : 'empty');
      })
      .catch(error => {
        if (error?.name === 'CanceledError' || error?.name === 'AbortError') return;
        console.error('Failed to fetch benchmark timeline', error);
        setHistory([]);
        onTimelineLoaded([]);
        setStatus('error');
      });

    return () => controller.abort();
  }, [benchmark, timeframe, onTimelineLoaded, rangePreset, timelineData]);

  const effectiveTrailLength = useMemo(() => {
    if (history.length === 0) return Math.max(1, trailLength);
    return clamp(Math.max(1, trailLength), 1, history.length);
  }, [history.length, trailLength]);

  const minEndIndex = useMemo(() => {
    if (history.length === 0) return 0;
    return Math.min(history.length - 1, effectiveTrailLength - 1);
  }, [effectiveTrailLength, history.length]);

  const clampTrailEndIndex = useCallback((index: number) => {
    if (history.length === 0) return 0;
    return Math.round(clamp(index, minEndIndex, history.length - 1));
  }, [history.length, minEndIndex]);

  const trailWindowEndIndex = useMemo(() => {
    if (history.length === 0) return null;
    if (replayCursorMs == null) return minEndIndex;
    return clampTrailEndIndex(nearestIndexForTimestamp(history, replayCursorMs));
  }, [clampTrailEndIndex, history, minEndIndex, replayCursorMs]);

  const scales = useMemo<TimelineScales | null>(() => {
    if (history.length === 0 || containerWidth <= 0) return null;

    const closeExtent = d3.extent(history, point => point.close);
    const yMin = closeExtent[0] ?? 0;
    const yMax = closeExtent[1] ?? yMin + 1;
    const yPadding = Math.max((yMax - yMin) * 0.12, 1);

    return {
      width: containerWidth,
      plotTop: PLOT_TOP,
      plotBottom: PLOT_BOTTOM,
      xScale: d3.scaleLinear().domain([0, Math.max(1, history.length - 1)]).range([0, containerWidth]),
      yScale: d3.scaleLinear().domain([yMin - yPadding, yMax + yPadding]).range([PLOT_BOTTOM, PLOT_TOP]),
    };
  }, [containerWidth, history]);

  const activeTrailWindow = useMemo<ActiveTrailWindow | null>(() => {
    if (!scales || history.length === 0) return null;

    const endIndex = clampTrailEndIndex(trailWindowEndIndex ?? minEndIndex);
    const startIndex = Math.max(0, endIndex - effectiveTrailLength + 1);

    // Guard: during async state transitions history may be shorter than the
    // indices computed from the previous render cycle.
    if (startIndex >= history.length || endIndex >= history.length) return null;

    const startPoint = history[startIndex];
    const endPoint = history[endIndex];
    if (!startPoint || !endPoint) return null;

    const candleWidth = history.length > 1 ? scales.width / (history.length - 1) : scales.width;
    const startX = scales.xScale(startIndex);
    const endX = scales.xScale(endIndex);
    const x = clamp(startX - candleWidth / 2, 0, scales.width);
    const rightEdge = clamp(endX + candleWidth / 2, 0, scales.width);

    return {
      startIndex,
      endIndex,
      startX,
      endX,
      x,
      width: Math.max(0, rightEdge - x),
      startPoint,
      endPoint,
    };
  }, [clampTrailEndIndex, effectiveTrailLength, history, minEndIndex, scales, trailWindowEndIndex]);

  useEffect(() => {
    if (
      !activeTrailWindow ||
      !activeTrailWindow.startPoint ||
      !activeTrailWindow.endPoint
    ) return;

    const startMs = activeTrailWindow.startPoint.timestamp;
    const endMs = activeTrailWindow.endPoint.timestamp;

    if (replayStartMs !== startMs || replayEndMs !== endMs) {
      onReplayBoundsChange(startMs, endMs, false);
    }

  }, [activeTrailWindow, onReplayBoundsChange, replayEndMs, replayStartMs]);

  const renderedHistory = useMemo(() => decimateByIndex(history, MAX_RENDER_POINTS), [history]);

  const pathData = useMemo(() => {
    if (!scales) return '';

    const line = d3.line<BenchmarkTimelinePoint & { index: number }>()
      .x(point => scales.xScale(point.index))
      .y(point => scales.yScale(point.close))
      .curve(d3.curveMonotoneX);

    return line(renderedHistory) ?? '';
  }, [renderedHistory, scales]);

  const ticks = useMemo(() => {
    if (!scales || history.length === 0) return [];
    return TimelineTickBuilder.build(history, containerWidth);
  }, [containerWidth, history, scales]);

  const getLocalX = useCallback((clientX: number) => {
    const rect = chartAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp(clientX - rect.left, 0, rect.width);
  }, []);

  const beginTrailWindowDrag = useCallback((event: React.PointerEvent<SVGRectElement>) => {
    if (!scales || !activeTrailWindow || history.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);

    const pointerStartX = getLocalX(event.clientX);
    const initialEndIndex = activeTrailWindow.endIndex;
    const candleWidth = history.length > 1 ? scales.width / (history.length - 1) : scales.width;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = getLocalX(moveEvent.clientX) - pointerStartX;
      const deltaCandles = candleWidth > 0 ? Math.round(deltaX / candleWidth) : 0;
      const nextEndIndex = clampTrailEndIndex(initialEndIndex + deltaCandles);
      onReplayCursorChange(history[nextEndIndex]?.timestamp ?? null);
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [activeTrailWindow, clampTrailEndIndex, getLocalX, history, scales, onReplayCursorChange]);

  const handleHoverMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!scales || history.length === 0 || isDragging) return;

    const x = getLocalX(event.clientX);
    const index = clamp(Math.round(scales.xScale.invert(x)), 0, history.length - 1);
    const point = history[index];

    setHover({
      x: scales.xScale(index),
      point,
      previousPoint: findPreviousPoint(history, index),
    });
  }, [getLocalX, history, isDragging, scales]);

  const clearHover = useCallback(() => {
    if (!isDragging) setHover(null);
  }, [isDragging]);

  const benchmarkLabel = displayBenchmarkName(benchmark);

  return (
    <div className="benchmark-timeline">
      <div
        className={`replay-timeline__chart-area replay-timeline__chart-area--${status}`}
        ref={chartAreaRef}
        onPointerMove={handleHoverMove}
        onPointerLeave={clearHover}
      >
        <svg
          className="replay-timeline__svg"
          viewBox={`0 0 ${Math.max(containerWidth, 1)} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${benchmarkLabel} benchmark timeline`}
        >
          <g className="benchmark-line">
            {pathData && <path className="benchmark-line__path" d={pathData} />}
          </g>

          <g className="trail-window">
            {activeTrailWindow && (
              <>
                <rect className="trail-window__dim" x="0" y="0" width={activeTrailWindow.x} height={PLOT_BOTTOM} />
                <rect
                  className="trail-window__viewport"
                  x={activeTrailWindow.x}
                  y="0"
                  width={activeTrailWindow.width}
                  height={PLOT_BOTTOM}
                  onPointerDown={beginTrailWindowDrag}
                />
                <rect
                  className="trail-window__dim"
                  x={activeTrailWindow.x + activeTrailWindow.width}
                  y="0"
                  width={Math.max(0, containerWidth - activeTrailWindow.x - activeTrailWindow.width)}
                  height={PLOT_BOTTOM}
                />
              </>
            )}
          </g>

          {hover && (
            <g className="hover-marker">
              <line x1={hover.x} x2={hover.x} y1={PLOT_TOP} y2={PLOT_BOTTOM} />
            </g>
          )}

          {activeTrailWindow && (
            <g className="cursor-marker" transform={`translate(${activeTrailWindow.endX},0)`}>
              <line className="cursor-marker__line" x1="0" x2="0" y1="0" y2={PLOT_BOTTOM} />
              <path className="cursor-marker__cap" d="M -5 0 L 5 0 L 0 7 Z" />
            </g>
          )}
        </svg>

        <div className="replay-timeline__axis" style={{ height: AXIS_HEIGHT }}>
          {ticks.map(tick => (
            <div
              key={tick.index}
              className={`replay-timeline__tick tick--${tick.alignment} tick--${tick.type}`}
              style={
                tick.alignment === 'start'
                  ? { left: 0 }
                  : tick.alignment === 'end'
                  ? { right: 0 }
                  : { left: `${tick.pixelX}px` }
              }
            >
              {tick.label}
            </div>
          ))}
        </div>

        <div className="replay-timeline__slider-container" aria-hidden="true">
          <div className="replay-timeline__track" />
        </div>

        <div className="benchmark-timeline__label">
          <span>{benchmarkLabel}</span>
          {history.length > 0 && <strong>{formatClose(history[history.length - 1].close)}</strong>}
        </div>

        {activeTrailWindow?.startPoint && activeTrailWindow?.endPoint && (
          <div className="trail-window__readout">
            {formatDateTime(activeTrailWindow.startPoint.timestamp, timeframe)}
            <span>to</span>
            {formatDateTime(activeTrailWindow.endPoint.timestamp, timeframe)}
          </div>
        )}

        {hover && (
          <div
            className="benchmark-timeline__tooltip"
            style={{ left: clamp(hover.x, 120, Math.max(120, containerWidth - 120)) }}
          >
            <span>{formatDateTime(hover.point.timestamp, timeframe)}</span>
            <strong>{benchmarkLabel}</strong>
            <span>{formatClose(hover.point.close)}</span>
            <span className={hover.previousPoint && hover.point.close >= hover.previousPoint.close ? 'is-positive' : 'is-negative'}>
              {formatChange(hover.point, hover.previousPoint)}
            </span>
          </div>
        )}

        {status === 'loading' && <div className="benchmark-timeline__state">Loading benchmark...</div>}
        {status === 'empty' && <div className="benchmark-timeline__state">No benchmark candles</div>}
        {status === 'error' && <div className="benchmark-timeline__state">Benchmark unavailable</div>}
      </div>
    </div>
  );
};

export default BenchmarkTimelineComponent;
