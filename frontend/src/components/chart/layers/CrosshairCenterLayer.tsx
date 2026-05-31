import React from 'react';
import type { RrgScales } from '../../../core/scales';

interface CrosshairCenterLayerProps {
  scales: RrgScales;
}

export const CrosshairCenterLayer: React.FC<CrosshairCenterLayerProps> = React.memo(({ scales }) => {
  const cx = scales.xScale(scales.center);
  const cy = scales.yScale(scales.center);
  
  // Very large bounds so the crosshair always reaches the edge of the clipped plot space
  const SIZE = 10000;

  return (
    <g className="crosshair-center-layer">
      <line
        x1={cx - SIZE} x2={cx + SIZE}
        y1={cy} y2={cy}
        stroke="#707070" 
        strokeWidth={1.5} 
        strokeDasharray="6,4"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx} x2={cx}
        y1={cy - SIZE} y2={cy + SIZE}
        stroke="#707070" 
        strokeWidth={1.5} 
        strokeDasharray="6,4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});
