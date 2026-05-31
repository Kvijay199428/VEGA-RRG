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
  isHovered: boolean;
  isFaded: boolean;
  zoom: number;
  isStressed: boolean;
}

const TrailElement = React.memo(({ d, scales, isSelected, isHovered, isFaded, isStressed, zoom }: TrailElementProps) => {
  let showArrows = true;

  let simplify = isStressed;

  const adjZoom = Math.max(0.1, zoom);

  const geometry = useMemo(() => {
    let rawTrail = d.trail;
    
    if (simplify && !isSelected && !isHovered) {
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
      return {
        key: `segment-${i}`,
        pathD: catmullRomPath([p, nextP]),
        segmentColor: getQuadrantColor(nextP.quadrant as any).text,
        width: widths[i] || 1.5,
        opacity: opacities[i] || 0.5,
        nextQuadrant: nextP.quadrant
      };
    });

    return segments;
  }, [d, scales, isSelected, isHovered, simplify]);

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
  else if (isSelected || isHovered) baseOpacity = 1.0;
  else baseOpacity = staleOpacity;

  return (
    <g 
      opacity={baseOpacity} 
      onMouseEnter={() => (d as any).setHoveredSector?.(d.symbol)} 
      onMouseLeave={() => (d as any).setHoveredSector?.(null)}
      style={{ cursor: 'pointer' }}
    >
      {geometry.map(seg => {
        const segWidth = isHovered ? seg.width * 1.5 : seg.width;
        const strokeWidth = segWidth / adjZoom;

        return (
          <path
            key={seg.key}
            d={seg.pathD}
            stroke={seg.segmentColor}
            strokeWidth={strokeWidth}
            strokeOpacity={seg.opacity}
            fill="none"
            markerEnd={showArrows ? `url(#arrowhead-${seg.nextQuadrant})` : undefined}
            style={
              (isSelected || isHovered)
                ? { filter: 'url(#glow)', pointerEvents: 'stroke' }
                : { pointerEvents: 'stroke' }
            }
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
  hoveredSector: string | null;
  zoom: number;
  isStressed: boolean;
  setHoveredSector: (symbol: string | null) => void;
}

export const TrailLayer: React.FC<TrailLayerProps> = React.memo(({ data, scales, showTrail, selectedSector, hoveredSector, zoom, isStressed, setHoveredSector }) => {
  if (!showTrail) return null;

  return (
    <g className="trail-layer">
      {data.map(d => {
        if (!d.trail || d.trail.length < 2) return null;

        const isSelected = selectedSector === d.symbol;
        const isHovered = hoveredSector === d.symbol;
        const isFaded = !!(selectedSector || hoveredSector) && !isSelected && !isHovered;

        return (
          <TrailElement 
            key={`trail-${d.symbol}`} 
            d={{...d, setHoveredSector} as any} 
            scales={scales} 
            isSelected={isSelected} 
            isHovered={isHovered} 
            isFaded={isFaded} 
            zoom={zoom} 
            isStressed={isStressed} 
          />
        );
      })}
    </g>
  );
});
