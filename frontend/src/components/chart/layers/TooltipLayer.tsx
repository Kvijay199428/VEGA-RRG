import React from 'react';
import { useRrgStore } from '../../../stores/useRrgStore';
import { cleanSectorName } from '../../../core/math';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions, EnrichedRrgPoint } from '../../../types';

interface TooltipLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  dims: ChartDimensions;
}

export const TooltipLayer: React.FC<TooltipLayerProps> = React.memo(({ data, scales, dims }) => {
  const hoveredSector = useRrgStore(s => s.hoveredSector);

  if (!hoveredSector) return null;

  const point = data.find(d => d.symbol === hoveredSector);
  if (!point) return null;

  const cx = scales.xScale(point.x);
  const cy = scales.yScale(point.y);

  const tooltipWidth = 180;
  const tooltipHeight = 130;

  let x = cx + 15;
  let y = cy + 15;
  if (x + tooltipWidth > dims.width) x = cx - tooltipWidth - 15;
  if (y + tooltipHeight > dims.height) y = cy - tooltipHeight - 15;

  return (
    <g className="tooltip-layer" pointerEvents="none">
      <foreignObject x={x} y={y} width={tooltipWidth} height={tooltipHeight}>
        <div style={{
          background: '#111111',
          border: '1px solid #333333',
          padding: '8px',
          borderRadius: '4px',
          color: '#E0E0E0',
          fontFamily: 'monospace',
          fontSize: '11px',
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
            {cleanSectorName(point.symbol)}
          </div>
          <div>RS-Ratio: {point.x.toFixed(2)}</div>
          <div>RS-Momentum: {point.y.toFixed(2)}</div>
          <div>Quadrant: {point.quadrant}</div>
          <div>Velocity: {point.velocity?.toFixed(2) || 'N/A'}</div>
          <div>Heading: {point.heading || 'N/A'}</div>
          <div>Distance: {point.distance?.toFixed(2) || 'N/A'}</div>
          {point.stale && point.computedAt && (
            <div style={{ color: '#FFB74D', marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px', fontStyle: 'italic' }}>
              Last Updated: {Math.round((Date.now() - point.computedAt) / 1000)}s ago (Stale)
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
});
