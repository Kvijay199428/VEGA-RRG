import React, { useMemo } from 'react';
import type { EnrichedRrgPoint } from '../../../types';
import type { RrgScales } from '../../../core/scales';
import { useRrgStore } from '../../../stores/useRrgStore';
import { getQuadrantColor } from '../../../themes/bloomberg';
import { catmullRomPath, trailOpacities, trailWidths } from '../../../core/animation';

interface HoverLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  zoom: number;
}

export const HoverLayer: React.FC<HoverLayerProps> = React.memo(({ data, scales, zoom }) => {
  const hoveredSector = useRrgStore(s => s.hoveredSector);
  const point = hoveredSector ? data.find(d => d.symbol === hoveredSector) : null;

  const trailGeometry = useMemo(() => {
    if (!point || !point.trail || point.trail.length < 2) return null;
    
    const cx = scales.xScale(point.x);
    const cy = scales.yScale(point.y);
    const rawTrail = point.trail;
    const points = rawTrail.map(t => ({ x: scales.xScale(t.x), y: scales.yScale(t.y) }));
    points.push({ x: cx, y: cy });

    const opacities = trailOpacities(points.length);
    const widths = trailWidths(points.length);

    return points.slice(0, points.length - 1).map((p, i) => {
      const nextP = points[i + 1];
      return {
        key: `hover-segment-${i}`,
        pathD: catmullRomPath([p, nextP]),
        width: (widths[i] || 1.5) * 1.5,
        opacity: (opacities[i] || 0.5)
      };
    });
  }, [point, scales]);

  if (!point) return null;

  const adjZoom = Math.max(0.1, zoom);
  const color = getQuadrantColor(point.quadrant as any).text;

  const cx = scales.xScale(point.x);
  const cy = scales.yScale(point.y);
  
  const size = 8 / adjZoom;
  const half = size / 2;
  const strokeWidth = 1 / adjZoom;


  return (
    <g className="hover-layer" pointerEvents="none">
      {/* 1. Trail Glow & Path */}
      {trailGeometry && trailGeometry.map(seg => (
        <path
          key={seg.key}
          d={seg.pathD}
          stroke={color}
          strokeWidth={seg.width / adjZoom}
          strokeOpacity={seg.opacity}
          fill="none"
          style={{ filter: 'url(#glow)' }}
        />
      ))}
      
      {/* 2. Selection Ring / Glow */}
      <rect
        x={cx - half - (4 / adjZoom)}
        y={cy - half - (4 / adjZoom)}
        width={size + (8 / adjZoom)}
        height={size + (8 / adjZoom)}
        fill="none"
        stroke={color}
        strokeWidth={2 / adjZoom}
        opacity={0.8}
        style={{ filter: 'url(#glow)' }}
      />
      
      {/* 3. Highlighted Point */}
      <rect
        x={cx - half}
        y={cy - half}
        width={size}
        height={size}
        fill="#FFFFFF"
        stroke="#000000"
        strokeWidth={strokeWidth}
      />
      
    </g>
  );
});
