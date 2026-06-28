import React, { useEffect, useRef } from 'react';
import { hoverEngine } from '../../../core/HoverEngine';
import type { ChartDimensions } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';

interface CrosshairLayerProps {
  dims: ChartDimensions;
}

export const CrosshairLayer: React.FC<CrosshairLayerProps> = React.memo(({ dims }) => {
  const lineXRef = useRef<SVGLineElement>(null);
  const lineYRef = useRef<SVGLineElement>(null);
  const labelXRef = useRef<SVGGElement>(null);
  const labelYRef = useRef<SVGGElement>(null);
  const textXRef = useRef<SVGTextElement>(null);
  const textYRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    hoverEngine.crosshairXRef = lineXRef.current;
    hoverEngine.crosshairYRef = lineYRef.current;
    hoverEngine.crosshairXLabelRef = labelXRef.current;
    hoverEngine.crosshairYLabelRef = labelYRef.current;
    hoverEngine.crosshairXTextRef = textXRef.current;
    hoverEngine.crosshairYTextRef = textYRef.current;

    return () => {
      hoverEngine.crosshairXRef = null;
      hoverEngine.crosshairYRef = null;
      hoverEngine.crosshairXLabelRef = null;
      hoverEngine.crosshairYLabelRef = null;
      hoverEngine.crosshairXTextRef = null;
      hoverEngine.crosshairYTextRef = null;
    };
  }, []);

  return (
    <g className="crosshair-layer" pointerEvents="none">
      <line 
        ref={lineYRef} 
        x1={0} x2={dims.innerWidth} y1={-100} y2={-100} 
        stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" 
        style={{ visibility: 'hidden' }} 
      />
      <line 
        ref={lineXRef} 
        x1={-100} x2={-100} y1={0} y2={dims.innerHeight} 
        stroke="#505050" strokeWidth={0.5} strokeDasharray="4,4" 
        style={{ visibility: 'hidden' }} 
      />

      {/* X-axis label */}
      <g ref={labelXRef} transform={`translate(-100, ${dims.innerHeight})`} style={{ visibility: 'hidden' }}>
        <rect x={-25} y={0} width={50} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text ref={textXRef} x={0} y={12} fontSize={10} fill={bloomberg.text.primary} textAnchor="middle">
          0.00
        </text>
      </g>

      {/* Y-axis label */}
      <g ref={labelYRef} transform={`translate(0, -100)`} style={{ visibility: 'hidden' }}>
        <rect x={-35} y={-8} width={35} height={16} fill={bloomberg.bg.panel} stroke={bloomberg.border.primary} />
        <text ref={textYRef} x={-4} y={3} fontSize={10} fill={bloomberg.text.primary} textAnchor="end">
          0.00
        </text>
      </g>
    </g>
  );
});
