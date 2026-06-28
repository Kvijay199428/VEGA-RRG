import React, { useEffect, useRef } from 'react';
import { useRrgStore } from '../../../stores/useRrgStore';
import { hoverEngine } from '../../../core/HoverEngine';
import { tooltipController } from '../../../core/TooltipController';

interface TooltipLayerProps {}

export const TooltipLayer: React.FC<TooltipLayerProps> = React.memo(() => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoveredSector = useRrgStore(s => s.hoveredSector);
  
  // Register handle with controller
  useEffect(() => {
    tooltipController.registerHandle({
      setTransform: (x, y) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      },
      setOpacity: (opacity) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = opacity.toString();
        }
      },
      setVisibility: (visible) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.visibility = visible ? 'visible' : 'hidden';
        }
      }
    });

    return () => {
      tooltipController.unregisterHandle();
    };
  }, []);

  // Set up ResizeObserver to feed dimensions back to controller
  useEffect(() => {
    if (!tooltipRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
          tooltipController.setSize(entry.borderBoxSize[0].inlineSize, entry.borderBoxSize[0].blockSize);
        } else {
          tooltipController.setSize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    
    observer.observe(tooltipRef.current);
    
    return () => {
      observer.disconnect();
    };
  }, []);

  const tooltipData = hoveredSector ? hoverEngine.getTooltipData(hoveredSector) : null;

  return (
    <div 
      className="tooltip-layer-container" 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none', 
        overflow: 'hidden'
      }}
    >
      <div 
        ref={tooltipRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 180, // We can keep a fixed width, or let it shrink to fit (auto)
          background: '#111111',
          border: '1px solid #333333',
          padding: '8px',
          borderRadius: '4px',
          color: '#E0E0E0',
          fontFamily: '"IBM Plex Mono", "JetBrains Mono", monospace',
          fontSize: '11px',
          lineHeight: '15px',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
          visibility: 'hidden',
          opacity: 0,
          willChange: 'transform, opacity',
          zIndex: 1000
        }}
      >
        {tooltipData && (
          <>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
              {tooltipData.name}
            </div>
            <div>RS-Ratio: {tooltipData.ratio}</div>
            <div>RS-Momentum: {tooltipData.momentum}</div>
            <div>Quadrant: {tooltipData.quadrant}</div>
            <div>Velocity: {tooltipData.velocity}</div>
            <div>Heading: {tooltipData.heading}</div>
            <div>Distance: {tooltipData.distance}</div>
            {tooltipData.stale && tooltipData.computedAt && (
              <div style={{ color: '#FFB74D', marginTop: '4px', borderTop: '1px solid #333', paddingTop: '4px', fontStyle: 'italic' }}>
                Last Updated: {Math.round((Date.now() - tooltipData.computedAt) / 1000)}s ago (Stale)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
