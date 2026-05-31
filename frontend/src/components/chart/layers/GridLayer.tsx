import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import { generateGridLines } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';

interface GridLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
  xDomain: [number, number];
  yDomain: [number, number];
  step: number;
}

export const GridLayer: React.FC<GridLayerProps> = React.memo(({ scales, xDomain, yDomain, step }) => {
  const minorGridLinesX = useMemo(() => generateGridLines(xDomain, step / 2), [xDomain, step]);
  const majorGridLinesX = useMemo(() => generateGridLines(xDomain, step), [xDomain, step]);
  const minorGridLinesY = useMemo(() => generateGridLines(yDomain, step / 2), [yDomain, step]);
  const majorGridLinesY = useMemo(() => generateGridLines(yDomain, step), [yDomain, step]);

  return (
    <g className="grid-layer">
      {minorGridLinesX.map(x => (
        <line
          key={`minor-x-${x}`}
          x1={scales.xScale(x)}
          x2={scales.xScale(x)}
          y1={-5000}
          y2={5000}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {minorGridLinesY.map(y => (
        <line
          key={`minor-y-${y}`}
          x1={-5000}
          x2={5000}
          y1={scales.yScale(y)}
          y2={scales.yScale(y)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {majorGridLinesX.map(x => (
        <line
          key={`major-x-${x}`}
          x1={scales.xScale(x)}
          x2={scales.xScale(x)}
          y1={-5000}
          y2={5000}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {majorGridLinesY.map(y => (
        <line
          key={`major-y-${y}`}
          x1={-5000}
          x2={5000}
          y1={scales.yScale(y)}
          y2={scales.yScale(y)}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
});
