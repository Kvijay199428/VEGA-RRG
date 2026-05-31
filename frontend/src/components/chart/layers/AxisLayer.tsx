import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';

interface AxisLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
}

export const AxisLayer: React.FC<AxisLayerProps> = React.memo(({ scales, dims }) => {
  const xTicks = useMemo(() => scales.xScale.ticks(8), [scales.xScale]);
  const yTicks = useMemo(() => scales.yScale.ticks(8), [scales.yScale]);

  return (
    <g className="axis-layer">

      {/* X-axis tick labels — fixed to bottom gutter */}
      {xTicks.map(v => (
        <g key={`xt-${v}`} transform={`translate(${scales.xScale(v)}, 0)`}>
          <line y1={dims.innerHeight} y2={dims.innerHeight + 4} stroke="#444" strokeWidth={1} />
          <text
            x={0}
            y={dims.innerHeight + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#7a5c22"
            fontFamily="'IBM Plex Mono', monospace"
            fontWeight={500}
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Y-axis tick labels — fixed to left gutter */}
      {yTicks.map(v => (
        <g key={`yt-${v}`} transform={`translate(0, ${scales.yScale(v)})`}>
          <line x1={-4} x2={0} stroke="#444" strokeWidth={1} />
          <text
            x={-8}
            y={0}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={9}
            fill="#7a5c22"
            fontFamily="'IBM Plex Mono', monospace"
            fontWeight={500}
          >
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Axis name labels */}
      <text
        x={dims.innerWidth / 2}
        y={dims.innerHeight + 32}
        textAnchor="middle"
        fontSize={10}
        fill="#606060"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight={600}
        letterSpacing={2}
        style={{ cursor: 'help' }}
      >
        <title>RS-Ratio: Measures relative performance against the benchmark. Values &gt; 100 indicate outperformance, while &lt; 100 indicate underperformance.</title>
        RS-RATIO
      </text>

      <text
        x={-dims.innerHeight / 2}
        y={-40}
        textAnchor="middle"
        fontSize={10}
        fill="#606060"
        fontFamily="'IBM Plex Mono', monospace"
        fontWeight={600}
        letterSpacing={2}
        transform={`rotate(-90)`}
        style={{ cursor: 'help' }}
      >
        <title>RS-Momentum: Measures the momentum (rate of change) of the RS-Ratio. Values &gt; 100 indicate accelerating momentum, while &lt; 100 indicate decelerating momentum.</title>
        RS-MOMENTUM
      </text>
    </g>
  );
});
