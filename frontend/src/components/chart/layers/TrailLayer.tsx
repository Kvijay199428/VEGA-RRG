import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { getQuadrantColor } from '../../../themes/bloomberg';
import { catmullRomPath, trailOpacities, trailWidths } from '../../../core/animation';
import type { Quadrant } from '../../../types';

const getPointQuadrant = (x: number, y: number, center: number = 100): Quadrant => {
  if (x >= center && y >= center) return 'LEADING';
  if (x >= center && y < center) return 'WEAKENING';
  if (x < center && y < center) return 'LAGGING';
  return 'IMPROVING';
};

interface TrailElementProps {
  d: EnrichedRrgPoint;
  scales: RrgScales;
  isSelected: boolean;
  isFaded: boolean;
  zoom: number;
  isStressed: boolean;
  boundaryIndex?: number; // index where historical → live transition occurs
}

const TrailElement = React.memo(({ d, scales, isSelected, isFaded, isStressed, zoom, boundaryIndex = 0 }: TrailElementProps) => {
  let showArrows = true;

  let simplify = isStressed;

  const adjZoom = Math.max(0.1, zoom);

  const geometry = useMemo(() => {
    let rawTrail = d.trail;
    
    if (simplify && !isSelected) {
      // Simplify geometry by skipping segments
      rawTrail = rawTrail.filter((_, i) => i % 2 === 0 || i === rawTrail.length - 1);
    }

    const points = rawTrail.map(t => ({
      x: scales.xScale(t.x),
      y: scales.yScale(t.y),
      quadrant: getPointQuadrant(t.x, t.y, scales.center)
    }));
    
    const lastT = rawTrail[rawTrail.length - 1];
    if (lastT && (lastT.x !== d.x || lastT.y !== d.y)) {
       points.push({ x: scales.xScale(d.x), y: scales.yScale(d.y), quadrant: getPointQuadrant(d.x, d.y, scales.center) });
    }

    const opacities = trailOpacities(points.length);
    const widths = trailWidths(points.length);

    const segments = points.slice(0, points.length - 1).map((p, i) => {
      const nextP = points[i + 1];

      // Historical vs live visual differentiation
      // Segments before boundaryIndex are historical → render dimmer
      const isHistorical = boundaryIndex > 0 && i < boundaryIndex;
      const historicalDimFactor = isHistorical ? 0.5 : 1.0;
      const historicalWidthFactor = isHistorical ? 0.8 : 1.0;

      // Provisional detection: last segment may be provisional (pulsing)
      const isLastSegment = i === points.length - 2;
      const isProvisionalSegment = isLastSegment && (d as any).provisional;

      return {
        key: `segment-${i}`,
        pathD: catmullRomPath([p, nextP]),
        segmentColor: getQuadrantColor(nextP.quadrant as any).text,
        width: (widths[i] || 1.5) * historicalWidthFactor,
        opacity: (opacities[i] || 0.5) * historicalDimFactor,
        nextQuadrant: nextP.quadrant,
        isHistorical,
        isProvisionalSegment,
      };
    });

    return segments;
  }, [d, scales, isSelected, simplify, boundaryIndex]);

  if (!geometry) return null;

  const ageMs = d.computedAt ? Date.now() - d.computedAt : 0;
  let staleOpacity = 0.3;
  if (d.stale) {
    if (ageMs > 600000) staleOpacity = 0.15;
    else if (ageMs > 120000) staleOpacity = 0.2;
    else staleOpacity = 0.25;
  }

  let baseOpacity = 0.3;
  if (isFaded) baseOpacity = 0.15;
  else if (isSelected) baseOpacity = 1.0;
  else baseOpacity = staleOpacity;

  return (
    <g 
      opacity={baseOpacity} 
    >
      {geometry.map(seg => {
        const segWidth = seg.width;
        const strokeWidth = segWidth / adjZoom;

        // Provisional segments pulse with animated opacity
        const provisionalStyle = seg.isProvisionalSegment
          ? { filter: 'url(#glow)', animation: 'provisionalPulse 1.5s ease-in-out infinite' }
          : (isSelected)
            ? { filter: 'url(#glow)' }
            : {};

        // Historical segments render with dashed stroke for subtle distinction
        const strokeDash = seg.isHistorical ? '4 2' : undefined;

        return (
          <path
            key={seg.key}
            d={seg.pathD}
            stroke={seg.segmentColor}
            strokeWidth={strokeWidth}
            strokeOpacity={seg.opacity}
            strokeDasharray={strokeDash}
            fill="none"
            markerEnd={showArrows ? `url(#arrowhead-${seg.nextQuadrant})` : undefined}
            style={provisionalStyle}
          />
        );
      })}
    </g>
  );
});

interface TrailLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  showTrail: boolean;
  selectedSector: string | null;
  zoom: number;
  isStressed: boolean;
}

export const TrailLayer: React.FC<TrailLayerProps> = React.memo(({ data, scales, showTrail, selectedSector, zoom, isStressed }) => {
  if (!showTrail) return null;

  return (
    <g className="trail-layer">
      {/* Provisional pulse animation */}
      <style>{`
        @keyframes provisionalPulse {
          0%, 100% { stroke-opacity: 0.4; }
          50% { stroke-opacity: 1.0; }
        }
      `}</style>
      {data.map(d => {
        if (!d.trail || d.trail.length < 2) return null;

        const isSelected = selectedSector === d.symbol;
        const isFaded = !!(selectedSector) && !isSelected;
        const boundaryIndex = (d as any).boundaryIndex ?? 0;

        return (
          <TrailElement 
            key={`trail-${d.symbol}`} 
            d={d} 
            scales={scales} 
            isSelected={isSelected} 
            isFaded={isFaded} 
            zoom={zoom} 
            isStressed={isStressed}
            boundaryIndex={boundaryIndex}
          />
        );
      })}
    </g>
  );
});
