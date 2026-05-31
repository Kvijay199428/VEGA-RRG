import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import { useCommandBarStore } from '../../stores/useCommandBarStore';
import { computeDomain, createScales } from '../../core/scales';
import { useViewportStore } from '../../stores/useViewportStore';
import { useShallow } from 'zustand/react/shallow';
import { getQuadrantColor } from '../../themes/bloomberg';

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
  const enrichedData = useMemo(() => {
    return (rawEnrichedData as unknown as EnrichedRrgPoint[]).filter(d => !hiddenSectors.includes(d.symbol));
  }, [rawEnrichedData, hiddenSectors]);

  const {
    selectedSector, hoveredSector, setHoveredSector, setSelectedSector, setCrosshair, watchlist
  } = useRrgStore(useShallow(s => ({
    selectedSector: s.selectedSector,
    hoveredSector: s.hoveredSector,
    setHoveredSector: s.setHoveredSector,
    setSelectedSector: s.setSelectedSector,
    setCrosshair: s.setCrosshair,
    watchlist: s.watchlist
  })));

  const showTrails = useCommandBarStore(s => s.showTrails);
  const normalized = useCommandBarStore(s => s.normalized);

  const {
    targetFitZoom, targetFitOffsetX, targetFitOffsetY,
    targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY,
    setDimensions: setViewportDimensions, startDrag, updateDrag, endDrag, screenToWorld
  } = useViewportStore(useShallow(s => ({
    targetFitZoom: s.targetFitZoom, targetFitOffsetX: s.targetFitOffsetX, targetFitOffsetY: s.targetFitOffsetY,
    targetInteractionZoom: s.targetInteractionZoom, targetInteractionOffsetX: s.targetInteractionOffsetX, targetInteractionOffsetY: s.targetInteractionOffsetY,
    setDimensions: s.setDimensions, startDrag: s.startDrag, updateDrag: s.updateDrag, endDrag: s.endDrag, screenToWorld: s.screenToWorld
  })));

  const { renderState, stateRef } = useCameraInterpolation(targetFitZoom, targetFitOffsetX, targetFitOffsetY, targetInteractionZoom, targetInteractionOffsetX, targetInteractionOffsetY);
  const finalZoom = renderState.fitZoom * renderState.intZoom;

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
    }
  }, [enrichedData, setContentBounds]);

  const marginTransform = `translate(${margin.left}, ${margin.top})`;

  const { onDoubleClick } = useViewportHandler(svgRef, dims);

  const mouseDownPos = useRef<{ x: number, y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    endDrag();
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx < 5 && dy < 5) {
        setSelectedSector(null);
      }
    }
    mouseDownPos.current = null;
  }, [endDrag, setSelectedSector]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;

    updateDrag(e.clientX, e.clientY);

    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left - margin.left;
    const sy = e.clientY - rect.top - margin.top;

    const { fitZoom, fitOffsetX, fitOffsetY, intZoom, intOffsetX, intOffsetY } = stateRef.current;
    const fitX = (sx - fitOffsetX) / fitZoom;
    const fitY = (sy - fitOffsetY) / fitZoom;

    const worldX = (fitX - intOffsetX) / intZoom;
    const worldY = (fitY - intOffsetY) / intZoom;

    const rawX = scales.xScale.invert(worldX);
    const rawY = scales.yScale.invert(worldY);
    setCrosshair(rawX, rawY);
  }, [scales, setCrosshair, margin.left, margin.top, updateDrag, screenToWorld, stateRef]);

  const handleMouseLeave = useCallback(() => {
    endDrag();
    setCrosshair(null, null);
  }, [setCrosshair, endDrag]);

  return (
    <div id="rrg-scene-container" ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <svg
        id="rrg-scene-svg"
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: renderState.intZoom > 1 ? 'grab' : 'crosshair', background: 'transparent', display: 'block' }}
        onDoubleClick={onDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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
                          <TrailLayer data={enrichedData} scales={scales} showTrail={showTrails} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} isStressed={renderState.isStressed} setHoveredSector={setHoveredSector} />
                          <PointLayer data={enrichedData} scales={scales} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} setHoveredSector={setHoveredSector} />
                        </g>
                      </g>
                    </g>
                  </g>
                  <LabelLayer data={enrichedData} scales={scales} selectedSector={selectedSector} hoveredSector={hoveredSector} zoom={finalZoom} isStressed={renderState.isStressed} renderState={renderState} setHoveredSector={setHoveredSector} setSelectedSector={setSelectedSector} />
                </g>

                {/* INTERACTION OVERLAYS */}
                <g className="overlay-layer">
                  <CrosshairLayer dims={dims} scales={scales} />
                  <TooltipLayer data={enrichedData} scales={scales} dims={dims} />
                </g>
              </>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
});
