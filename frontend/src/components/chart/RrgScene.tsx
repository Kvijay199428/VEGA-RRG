import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { useLiveStore } from '../../stores/useLiveStore';
import { computeDomain, createScales } from '../../core/scales';
import { useViewportStore } from '../../stores/useViewportStore';
import { useShallow } from 'zustand/react/shallow';
import { getQuadrantColor } from '../../themes/bloomberg';
import { enrichAll } from '../../core/math';

import { GridLayer } from './layers/GridLayer';
import { QuadrantBackgrounds } from './layers/QuadrantBackgrounds';
import { QuadrantLabels } from './layers/QuadrantLabels';
import { CrosshairCenterLayer } from './layers/CrosshairCenterLayer';
import { AxisLayer } from './layers/AxisLayer';
import { TrailLayer } from './layers/TrailLayer';
import { PointLayer } from './layers/PointLayer';
import { LabelLayer } from './layers/LabelLayer';
import { CrosshairLayer } from './layers/CrosshairLayer';
import { TooltipLayer } from './layers/TooltipLayer';
import { HoverLayer } from './layers/HoverLayer';
import { InteractionLayer } from './layers/InteractionLayer';
import { hoverEngine } from '../../core/HoverEngine';
import type { ChartDimensions, EnrichedRrgPoint } from '../../types';

function useViewportHandler(svgRef: React.RefObject<SVGSVGElement | null>, dims: ChartDimensions) {
  const { zoomBy, resetToFit } = useViewportStore(useShallow(s => ({ zoomBy: s.zoomBy, resetToFit: s.resetToFit })));

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - dims.margin.left;
      const mouseY = e.clientY - rect.top - dims.margin.top;

      zoomBy(e.deltaY, mouseX, mouseY);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [svgRef, zoomBy, dims.margin.left, dims.margin.top]);

  return {
    onDoubleClick: resetToFit
  };
}

function useCameraInterpolation(targetFitZoom: number, targetFitOffsetX: number, targetFitOffsetY: number, targetInteractionZoom: number, targetInteractionOffsetX: number, targetInteractionOffsetY: number) {
  const [renderState, setRenderState] = useState({
    fitZoom: targetFitZoom, fitOffsetX: targetFitOffsetX, fitOffsetY: targetFitOffsetY,
    intZoom: targetInteractionZoom, intOffsetX: targetInteractionOffsetX, intOffsetY: targetInteractionOffsetY,
    isStressed: false
  });

  const stateRef = useRef(renderState);

  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const current = stateRef.current;
      const lerp = (start: number, end: number, factor = 0.25) => {
        const diff = end - start;
        if (Math.abs(diff) < 0.001) return end;
        return start + diff * factor;
      };

      const nFitZoom = lerp(current.fitZoom, targetFitZoom);
      const nFitOffsetX = lerp(current.fitOffsetX, targetFitOffsetX);
      const nFitOffsetY = lerp(current.fitOffsetY, targetFitOffsetY);
      const nIntZoom = lerp(current.intZoom, targetInteractionZoom);
      const nIntOffsetX = lerp(current.intOffsetX, targetInteractionOffsetX);
      const nIntOffsetY = lerp(current.intOffsetY, targetInteractionOffsetY);

      const quantZoom = (z: number) => Math.round(z * 1000) / 1000;
      const quantPos = (p: number) => Math.round(p * 100) / 100;

      const sanitize = (v: number, fallback: number) => Number.isFinite(v) ? v : fallback;

      const newState = {
        fitZoom: sanitize(quantZoom(nFitZoom), 1),
        fitOffsetX: sanitize(quantPos(nFitOffsetX), 0),
        fitOffsetY: sanitize(quantPos(nFitOffsetY), 0),
        intZoom: sanitize(quantZoom(nIntZoom), 1),
        intOffsetX: sanitize(quantPos(nIntOffsetX), 0),
        intOffsetY: sanitize(quantPos(nIntOffsetY), 0),
        isStressed: dt > 16 // Frame budget guard
      };

      const changed =
        newState.fitZoom !== current.fitZoom || newState.fitOffsetX !== current.fitOffsetX || newState.fitOffsetY !== current.fitOffsetY ||
        newState.intZoom !== current.intZoom || newState.intOffsetX !== current.intOffsetX || newState.intOffsetY !== current.intOffsetY ||
        newState.isStressed !== current.isStressed;

      if (changed) {
        stateRef.current = newState;
        setRenderState(newState);
        rafId = requestAnimationFrame(loop);
      } else if (newState.isStressed) {
        stateRef.current.isStressed = false;
        setRenderState({ ...newState, isStressed: false });
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY]);

  return { renderState, stateRef };
}

export const RrgScene: React.FC = React.memo(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const margin = { top: 30, right: 30, bottom: 48, left: 56 };
  const dims: ChartDimensions = useMemo(() => ({
    width: dimensions.width,
    height: dimensions.height,
    margin,
    innerWidth: dimensions.width - margin.left - margin.right,
    innerHeight: dimensions.height - margin.top - margin.bottom
  }), [dimensions.width, dimensions.height]);

  const rawEnrichedData = useRrgStore(s => s.enrichedData);
  const hiddenSectors = useRrgStore(s => s.hiddenSectors);

  // Live mode integration
  const liveStreamingEnabled = useCommandBarStore(s => (s as any).liveStreamingEnabled);
  const liveConnectionStatus = useLiveStore(s => s.liveConnectionStatus);
  const timeframe = useCommandBarStore(s => s.timeframe);
  const trailLength = useCommandBarStore(s => s.trailLength);
  const getLiveRrgPoints = useLiveStore(s => s.getLiveRrgPoints);
  const liveLastUpdate = useLiveStore(s => s.lastLiveUpdate);

  const isLiveActive = liveStreamingEnabled && liveConnectionStatus === 'CONNECTED';

  const enrichedData = useMemo(() => {
    if (isLiveActive) {
      // Read from live store — canonical trail sliced to trailLength
      const livePoints = getLiveRrgPoints(timeframe, trailLength);
      return enrichAll(livePoints).filter((d: any) => !hiddenSectors.includes(d.symbol)) as unknown as EnrichedRrgPoint[];
    }
    return (rawEnrichedData as unknown as EnrichedRrgPoint[]).filter(d => !hiddenSectors.includes(d.symbol));
  }, [isLiveActive, rawEnrichedData, hiddenSectors, liveLastUpdate, timeframe, trailLength, getLiveRrgPoints]);

  const {
    selectedSector, setSelectedSector, watchlist
  } = useRrgStore(useShallow(s => ({
    selectedSector: s.selectedSector,
    setSelectedSector: s.setSelectedSector,
    watchlist: s.watchlist
  })));

  const showTrails = useCommandBarStore(s => s.showTrails);
  const normalized = useCommandBarStore(s => s.normalized);

  const {
    targetFitZoom, targetFitOffsetX, targetFitOffsetY,
    targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY,
    setDimensions: setViewportDimensions, isDragging
  } = useViewportStore(useShallow(s => ({
    targetFitZoom: s.targetFitZoom, targetFitOffsetX: s.targetFitOffsetX, targetFitOffsetY: s.targetFitOffsetY,
    targetInteractionZoom: s.targetInteractionZoom, targetInteractionOffsetX: s.targetInteractionOffsetX, targetInteractionOffsetY: s.targetInteractionOffsetY,
    setDimensions: s.setDimensions, isDragging: s.isDragging
  })));

  const { renderState, stateRef } = useCameraInterpolation(targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY);
  const finalZoom = renderState.fitZoom * renderState.intZoom;

  useEffect(() => {
    hoverEngine.updateCamera(renderState, dims.innerWidth, dims.innerHeight);
  }, [renderState, dims.innerWidth, dims.innerHeight]);

  useEffect(() => {
    setViewportDimensions(dims.innerWidth, dims.innerHeight, dims.innerWidth, dims.innerHeight);
  }, [dims, setViewportDimensions]);

  const enabledCount = useMemo(() => watchlist.filter(w => w.enabled).length, [watchlist]);

  const { xDomain, yDomain, step } = useMemo(() => {
    const allX: number[] = [];
    const allY: number[] = [];
    enrichedData.forEach(d => {
      allX.push(d.x);
      allY.push(d.y);
      if (d.trail) {
        d.trail.forEach(t => {
          allX.push(t.x);
          allY.push(t.y);
        });
      }
    });
    if (allX.length === 0) return { xDomain: [90, 110] as [number, number], yDomain: [90, 110] as [number, number], step: 1 };
    return computeDomain(allX, allY, 0.001); // 12.5% proportional margin
  }, [enrichedData]);

  const scales = useMemo(() => {
    const center = normalized ? 100 : 1.0;
    return createScales(xDomain, yDomain, dims, center);
  }, [xDomain, yDomain, dims, normalized]);

  const setContentBounds = useViewportStore(s => s.setContentBounds);

  useEffect(() => {
    if (enrichedData.length > 0) {
      import('../../core/math').then(({ computeDataBounds }) => {
        const bounds = computeDataBounds(enrichedData as any);
        setContentBounds(bounds);
      });
      // Update HoverEngine data
      hoverEngine.updateData(enrichedData as any, scales, stateRef.current);
    }
  }, [enrichedData, setContentBounds, scales]);

  const marginTransform = `translate(${margin.left}, ${margin.top})`;

  const { onDoubleClick } = useViewportHandler(svgRef, dims);

  return (
    <div id="rrg-scene-container" ref={containerRef} style={{ width: '100%', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <svg
        id="rrg-scene-svg"
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: isDragging ? 'grabbing' : 'crosshair', background: 'transparent', display: 'block' }}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <clipPath id="plot-clip">
            <rect x={0} y={0} width={dims.innerWidth} height={dims.innerHeight} />
          </clipPath>
          {['LEADING', 'WEAKENING', 'LAGGING', 'IMPROVING'].map((quad) => {
            const color = getQuadrantColor(quad as any).text;
            return (
              <marker key={`arrow-${quad}`} id={`arrowhead-${quad}`} viewBox="0 -5 10 10" refX="8" refY="0" markerUnits="strokeWidth" orient="auto" markerWidth="6" markerHeight="6">
                <path d="M 0,-5 L 10,0 L 0,5" fill={color} style={{ stroke: 'none' }} />
              </marker>
            );
          })}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <g transform={marginTransform}>
          <g className="export-layer">
            {enabledCount === 0 ? (
              <text
                x={dims.innerWidth / 2}
                y={dims.innerHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                fontSize="24px"
                fontWeight="bold"
              >
                NO SECTORS SELECTED
              </text>
            ) : (
              <>
                {/* STATIC LAYERS - NEVER SCALED */}
                <g className="ui-layer">
                  <QuadrantLabels dims={dims} />
                  <AxisLayer scales={scales} dims={dims} />
                </g>

                {/* CLIPPED PLOT - ZOOMED */}
                <g clipPath="url(#plot-clip)">
                  {/* Explicit Camera Matrix Composition Rule */}
                  <g transform={`translate(${renderState.fitOffsetX}, ${renderState.fitOffsetY})`}>
                    <g transform={`scale(${renderState.fitZoom})`}>
                      <g transform={`translate(${renderState.intOffsetX}, ${renderState.intOffsetY})`}>
                        <g transform={`scale(${renderState.intZoom})`}>
                          <QuadrantBackgrounds scales={scales} />
                          <GridLayer scales={scales} dims={dims} xDomain={xDomain} yDomain={yDomain} step={step} />
                          <CrosshairCenterLayer scales={scales} />
                          <TrailLayer data={enrichedData} scales={scales} showTrail={showTrails} selectedSector={selectedSector} zoom={finalZoom} isStressed={renderState.isStressed} />
                          <PointLayer data={enrichedData} scales={scales} selectedSector={selectedSector} zoom={finalZoom} />
                          <HoverLayer data={enrichedData} scales={scales} zoom={finalZoom} />
                        </g>
                      </g>
                    </g>
                  </g>
                  <LabelLayer data={enrichedData} scales={scales} selectedSector={selectedSector} zoom={finalZoom} isStressed={renderState.isStressed} renderState={renderState} setSelectedSector={setSelectedSector} />
                </g>

                {/* INTERACTION OVERLAYS */}
                <g className="overlay-layer">
                  <CrosshairLayer dims={dims} />
                  <InteractionLayer width={dims.innerWidth} height={dims.innerHeight} scales={scales} />
                </g>
              </>
            )}
          </g>
        </g>
      </svg>
      {enabledCount > 0 && (
        <div style={{ position: 'absolute', top: margin.top, left: margin.left, width: dims.innerWidth, height: dims.innerHeight, pointerEvents: 'none' }}>
          <TooltipLayer />
        </div>
      )}
    </div>
  );
});
