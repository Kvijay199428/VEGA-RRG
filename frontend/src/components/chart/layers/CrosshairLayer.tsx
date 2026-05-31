import React from 'react';
import { useRrgStore } from '../../../stores/useRrgStore';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';

interface CrosshairLayerProps {
  dims: ChartDimensions;
  scales: RrgScales;
}

export const CrosshairLayer: React.FC<CrosshairLayerProps> = React.memo(({ dims, scales }) => {
  const crosshairX = useRrgStore(s => s.crosshairX);
  const crosshairY = useRrgStore(s => s.crosshairY);

  if (crosshairX === null || crosshairY === null) return null;

  const sx = scales.xScale(crosshairX);
  const sy = scales.yScale(crosshairY);

  const formatValue = (v: number) => v.toFixed(2);

  return (
    <g className="crosshair-layer" pointerEvents="none">
      <line x1={0} x2={dims.innerWidth} y1={sy} y2={sy} stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" />
      <line x1={sx} x2={sx} y1={0} y2={dims.innerHeight} stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" />

      {/* X-axis label */}
      <g transform={`translate(${sx}, ${dims.innerHeight})`}>
        <rect x={-25} y={0} width={50} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text x={0} y={12} fontSize={10} fill={bloomberg.text.primary} textAnchor="middle">
          {formatValue(crosshairX)}
        </text>
      </g>

      {/* Y-axis label */}
      <g transform={`translate(0, ${sy})`}>
        <rect x={-35} y={-8} width={35} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text x={-4} y={3} fontSize={10} fill={bloomberg.text.primary} textAnchor="end">
          {formatValue(crosshairY)}
        </text>
      </g>
    </g>
  );
});
