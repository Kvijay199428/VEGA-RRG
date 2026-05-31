import React from 'react';
import type { RrgScales } from '../../../core/scales';
import { bloomberg } from '../../../themes/bloomberg';

interface QuadrantBackgroundsProps {
  scales: RrgScales;
}

export const QuadrantBackgrounds: React.FC<QuadrantBackgroundsProps> = React.memo(({ scales }) => {
  // Center in data space (usually 100, or 1.0 if normalized differently)
  const cx = scales.xScale(scales.center);
  const cy = scales.yScale(scales.center);
  
  // Use massive world bounds (-5000 to +5000 offset from center)
  // to ensure they never clip during pan/zoom.
  const SIZE = 10000;

  return (
    <g className="quadrant-backgrounds">
      <defs>
        <radialGradient id="grad-leading" cx="0%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.leading.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-weakening" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.weakening.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-lagging" cx="100%" cy="0%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.lagging.bg} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="grad-improving" cx="100%" cy="100%" r="100%">
          <stop offset="0%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0.15} />
          <stop offset="100%" stopColor={bloomberg.quadrant.improving.bg} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Leading (top-right) -> x > cx, y < cy (y-axis is inverted in SVG) */}
      <rect x={cx} y={cy - SIZE} width={SIZE} height={SIZE} fill="url(#grad-leading)" />
      
      {/* Weakening (bottom-right) -> x > cx, y > cy */}
      <rect x={cx} y={cy} width={SIZE} height={SIZE} fill="url(#grad-weakening)" />
      
      {/* Lagging (bottom-left) -> x < cx, y > cy */}
      <rect x={cx - SIZE} y={cy} width={SIZE} height={SIZE} fill="url(#grad-lagging)" />
      
      {/* Improving (top-left) -> x < cx, y < cy */}
      <rect x={cx - SIZE} y={cy - SIZE} width={SIZE} height={SIZE} fill="url(#grad-improving)" />
    </g>
  );
});
