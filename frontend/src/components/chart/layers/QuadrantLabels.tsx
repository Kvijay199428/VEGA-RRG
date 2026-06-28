import React from 'react';
import type { ChartDimensions } from '../../../types';

interface QuadrantLabelsProps {
  dims: ChartDimensions;
}

export const QuadrantLabels: React.FC<QuadrantLabelsProps> = React.memo(({ dims }) => {
  const { innerWidth, innerHeight } = dims;

  return (
    <g className="quadrant-labels">
      <text x={innerWidth - 20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#00ff59ff" textAnchor="end">LEADING</text>
      <text x={innerWidth - 20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#ffd500ff" textAnchor="end">WEAKENING</text>
      <text x={20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#ff0d00ff" textAnchor="start">LAGGING</text>
      <text x={20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#00a6ffff" textAnchor="start">IMPROVING</text>
    </g>
  );
});
