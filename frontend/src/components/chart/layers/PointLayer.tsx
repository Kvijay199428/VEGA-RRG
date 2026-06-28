import React from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { getQuadrantColor } from '../../../themes/bloomberg';

interface PointLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  selectedSector: string | null;
  zoom: number;
}

export const PointLayer: React.FC<PointLayerProps> = React.memo(({ data, scales, selectedSector, zoom }) => {
  const adjZoom = Math.max(0.1, zoom);

  return (
    <g className="point-layer">
      {data.map(d => {
        const cx = scales.xScale(d.x);
        const cy = scales.yScale(d.y);
        const isSelected = selectedSector === d.symbol;
        const isFaded = selectedSector && !isSelected;
        
        // Semantic Zoom: Scale down world geometry so screen size remains constant
        const baseSize = isSelected ? 8 : 6;
        const size = baseSize / adjZoom;
        const half = size / 2;
        const color = getQuadrantColor(d.quadrant).text;
        
        const ageMs = d.computedAt ? Date.now() - d.computedAt : 0;
        let staleOpacity = 1.0;
        if (d.stale) {
          if (ageMs > 600000) staleOpacity = 0.5;
          else if (ageMs > 120000) staleOpacity = 0.7;
          else staleOpacity = 0.9;
        }

        let opacity = 1.0;
        if (isFaded) opacity = 0.15;
        else if (isSelected) opacity = 1.0;
        else opacity = staleOpacity;

        const strokeWidth = 1 / adjZoom;

        return (
          <g 
            key={`point-${d.symbol}`} 
            transform={`translate(${cx}, ${cy})`}
            opacity={opacity}
          >
            {isSelected && (
              <rect
                x={-half - (3 / adjZoom)}
                y={-half - (3 / adjZoom)}
                width={size + (6 / adjZoom)}
                height={size + (6 / adjZoom)}
                fill="none"
                stroke={color}
                strokeWidth={1.5 / adjZoom}
                opacity={0.8}
              />
            )}
            <rect
              x={-half}
              y={-half}
              width={size}
              height={size}
              fill={color}
              stroke="#000000"
              strokeWidth={strokeWidth}
            />
          </g>
        );
      })}
    </g>
  );
});
