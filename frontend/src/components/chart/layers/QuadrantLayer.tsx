import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { RrgScales } from '../../../core/scales';
import type { ChartDimensions } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';

interface QuadrantLayerProps {
  scales: RrgScales;
  dims: ChartDimensions;
}

export const QuadrantLayer: React.FC<QuadrantLayerProps> = React.memo(({ scales, dims }) => {
  const { innerWidth, innerHeight } = dims;

  const q1Ref = useRef<SVGRectElement>(null);
  const q2Ref = useRef<SVGRectElement>(null);
  const q3Ref = useRef<SVGRectElement>(null);
  const q4Ref = useRef<SVGRectElement>(null);

  useEffect(() => {
    const cx = scales.xScale(scales.center);
    const cy = scales.yScale(scales.center);
    const t = d3.transition().duration(500) as any;

    if (q1Ref.current) d3.select(q1Ref.current).transition(t).attr('x', cx).attr('width', Math.max(0, innerWidth - cx)).attr('height', Math.max(0, cy));
    if (q2Ref.current) d3.select(q2Ref.current).transition(t).attr('x', cx).attr('y', cy).attr('width', Math.max(0, innerWidth - cx)).attr('height', Math.max(0, innerHeight - cy));
    if (q3Ref.current) d3.select(q3Ref.current).transition(t).attr('y', cy).attr('width', Math.max(0, cx)).attr('height', Math.max(0, innerHeight - cy));
    if (q4Ref.current) d3.select(q4Ref.current).transition(t).attr('width', Math.max(0, cx)).attr('height', Math.max(0, cy));
  }, [scales, dims]);

  // Use gradient definitions
  return (
    <g className="quadrant-layer">
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

      {/* Leading (top-right: x > 100, y > 100 -> screen y < cy) */}
      <rect ref={q1Ref} y={0} fill="url(#grad-leading)" />
      
      {/* Weakening (bottom-right: x > 100, y < 100 -> screen y > cy) */}
      <rect ref={q2Ref} fill="url(#grad-weakening)" />
      
      {/* Lagging (bottom-left: x < 100, y < 100 -> screen y > cy) */}
      <rect ref={q3Ref} x={0} fill="url(#grad-lagging)" />
      
      {/* Improving (top-left: x < 100, y > 100 -> screen y < cy) */}
      <rect ref={q4Ref} x={0} y={0} fill="url(#grad-improving)" />

      {/* Labels */}
      <text x={innerWidth - 20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#1b6f38" textAnchor="end">LEADING</text>
      <text x={innerWidth - 20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#7f6900" textAnchor="end">WEAKENING</text>
      <text x={20} y={innerHeight - 20} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#6a1511" textAnchor="start">LAGGING</text>
      <text x={20} y={40} fontSize={30} fontWeight={700} opacity={0.22} letterSpacing={2} fill="#0f4663" textAnchor="start">IMPROVING</text>
    </g>
  );
});
