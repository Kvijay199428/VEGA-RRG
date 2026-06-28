import React, { useMemo } from 'react';
import type { RrgScales } from '../../../core/scales';
import type { EnrichedRrgPoint } from '../../../types';
import { bloomberg } from '../../../themes/bloomberg';
import { smartLabelPlacement } from '../../../core/geometry';
import { cleanSectorName } from '../../../core/math';
import { useViewportStore } from '../../../stores/useViewportStore';
import { useChartSettingsStore } from '../../../stores/useChartSettingsStore';
import { useRrgStore } from '../../../stores/useRrgStore';

interface LabelLayerProps {
  data: EnrichedRrgPoint[];
  scales: RrgScales;
  selectedSector: string | null;
  zoom: number;
  isStressed: boolean;
  renderState: any;
  setSelectedSector: (symbol: string | null) => void;
}

export const LabelLayer: React.FC<LabelLayerProps> = React.memo(({ data, scales, selectedSector, zoom, isStressed, renderState, setSelectedSector }) => {
  const viewportWidth = useViewportStore(s => s.viewportWidth);
  const viewportHeight = useViewportStore(s => s.viewportHeight);
  const showLabels = useChartSettingsStore(s => s.showLabels);
  const hoveredSector = useRrgStore(s => s.hoveredSector);

  if (!showLabels) return null;

  const labels = useMemo(() => {
    let rawLabels = data.map(d => {
      // Clean and shorten the sector name to save space
      const name = cleanSectorName(d.symbol);

      const isSelected = selectedSector === d.symbol;

      // Mathematical Camera Projection
      const worldX = scales.xScale(d.x);
      const worldY = scales.yScale(d.y);

      const intX = worldX * renderState.intZoom + renderState.intOffsetX;
      const intY = worldY * renderState.intZoom + renderState.intOffsetY;

      const screenX = intX * renderState.fitZoom + renderState.fitOffsetX;
      const screenY = intY * renderState.fitZoom + renderState.fitOffsetY;

      // Priority Scoring
      const selectedWeight = isSelected ? 1000 : 0;
      const momentumWeight = d.momentumRoc * 10;
      const velocityWeight = d.velocity * 5;
      const priority = selectedWeight + momentumWeight + velocityWeight;

      let trailSegments: {x1: number, y1: number, x2: number, y2: number}[] = [];
      if (d.trail && d.trail.length > 0) {
        for (let i = 0; i < d.trail.length - 1; i++) {
          const t1 = d.trail[i];
          const t2 = d.trail[i+1];
          
          const wx1 = scales.xScale(t1.x);
          const wy1 = scales.yScale(t1.y);
          const wx2 = scales.xScale(t2.x);
          const wy2 = scales.yScale(t2.y);
          
          const x1 = ((wx1 * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX;
          const y1 = ((wy1 * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY;
          const x2 = ((wx2 * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX;
          const y2 = ((wy2 * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY;
          
          trailSegments.push({x1, y1, x2, y2});
        }
        trailSegments.push({
            x1: ((scales.xScale(d.trail[d.trail.length - 1].x) * renderState.intZoom) + renderState.intOffsetX) * renderState.fitZoom + renderState.fitOffsetX,
            y1: ((scales.yScale(d.trail[d.trail.length - 1].y) * renderState.intZoom) + renderState.intOffsetY) * renderState.fitZoom + renderState.fitOffsetY,
            x2: screenX,
            y2: screenY,
        });
      }

      return {
        id: d.symbol,
        cx: screenX,
        cy: screenY,
        width: name.length * 6,
        height: 12,
        text: name,
        priority,
        isSelected,
        trailSegments,
        stale: d.stale,
        computedAt: d.computedAt
      };
    });

    rawLabels = rawLabels.filter(lbl => {
      if (lbl.isSelected) return true;
      if (isStressed) return false;

      const pad = 20;
      if (lbl.cx < -pad || lbl.cx > viewportWidth + pad || lbl.cy < -pad || lbl.cy > viewportHeight + pad) {
        return false;
      }
      return true;
    });

    // Phase 2: Dynamic Bounding Box Placement & Collision Avoidance
    const placed = smartLabelPlacement(rawLabels);
    
    // Sort so the hovered label is drawn last (on top)
    return placed.sort((a, b) => {
      if (a.id === hoveredSector) return 1;
      if (b.id === hoveredSector) return -1;
      return 0;
    });

  }, [data, scales, zoom, isStressed, renderState, viewportWidth, viewportHeight, selectedSector, hoveredSector]);

  return (
    <g className="label-layer">
      {labels.map(lbl => {
        const isFaded = selectedSector && !lbl.isSelected;
        const isHovered = lbl.id === hoveredSector;
        
        const ageMs = lbl.computedAt ? Date.now() - lbl.computedAt : 0;
        let staleOpacity = 0.6;
        if (lbl.stale) {
          if (ageMs > 600000) staleOpacity = 0.3;
          else if (ageMs > 120000) staleOpacity = 0.4;
          else staleOpacity = 0.5;
        }

        let opacity = 0.6;
        if (isFaded && !isHovered) opacity = 0.1;
        else if (lbl.isSelected || isHovered) opacity = 1.0;
        else opacity = staleOpacity;

        const fontWeight = (lbl.isSelected || isHovered) ? 700 : 400;
        const fill = isHovered ? '#ffffff' : bloomberg.text.primary;

        return (
          <g key={`label-${lbl.id}`} transform={`translate(${lbl.x}, ${lbl.y})`}>
            <text
              x={0}
              y={0}
              dominantBaseline="hanging"
              fontSize={10}
              fontWeight={fontWeight}
              fill={fill}
              opacity={opacity}
              style={{ pointerEvents: 'auto', cursor: 'pointer', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
              onMouseUp={(e) => {
                e.stopPropagation();
                setSelectedSector(lbl.isSelected ? null : lbl.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {lbl.text}
            </text>
          </g>
        );
      })}
    </g>
  );
});
