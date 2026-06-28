import React, { useRef, useCallback } from 'react';
import { hoverEngine } from '../../../core/HoverEngine';
import type { RrgScales } from '../../../core/scales';
import { useViewportStore } from '../../../stores/useViewportStore';
import { useRrgStore } from '../../../stores/useRrgStore';

interface InteractionLayerProps {
  width: number;
  height: number;
  scales: RrgScales;
}

export const InteractionLayer: React.FC<InteractionLayerProps> = React.memo(({ width, height }) => {
  const { startDrag, updateDrag, endDrag, isDragging } = useViewportStore();
  const mouseDownPos = useRef<{ x: number, y: number } | null>(null);
  const rectRef = useRef<SVGRectElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    endDrag();
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx < 5 && dy < 5) {
        useRrgStore.getState().setSelectedSector(null);
      }
    }
    mouseDownPos.current = null;
  }, [endDrag]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    updateDrag(e.clientX, e.clientY);

    if (!rectRef.current) return;
    const rect = rectRef.current.getBoundingClientRect();

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    hoverEngine.onMouseMove(sx, sy);
  }, [updateDrag]);

  const handleMouseLeave = useCallback(() => {
    endDrag();
    hoverEngine.onMouseLeave();
  }, [endDrag]);

  const handleMouseEnter = useCallback(() => {
    hoverEngine.onMouseEnter();
  }, []);

  return (
    <rect
      ref={rectRef}
      x={0}
      y={0}
      width={width}
      height={height}
      fill="transparent"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      style={{ cursor: isDragging ? 'grabbing' : 'crosshair', pointerEvents: 'all' }}
    />
  );
});
