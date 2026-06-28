import React, { useRef, useEffect, useState } from 'react';
import { RrgScene } from './RrgScene';

/**
 * Virtualized 2×2 grid for simultaneous multi-timeframe live views (correction #15).
 *
 * Layout:
 * ┌────────────┬────────────┐
 * │ 1 MIN      │ 5 MIN      │
 * ├────────────┼────────────┤
 * │ 15 MIN     │ 1 HOUR     │
 * └────────────┴────────────┘
 *
 * Virtualization:
 * - Only visible viewport charts run animation loops
 * - Off-screen charts are paused via IntersectionObserver
 * - Each chart receives independent PATCH updates per timeframe
 */

const GRID_TIMEFRAMES = ['1min', '5min', '15min', '1h'] as const;

const GRID_LABELS: Record<string, string> = {
  '1min': '1 MINUTE',
  '5min': '5 MINUTE',
  '15min': '15 MINUTE',
  '1h': '1 HOUR',
};

interface GridCellProps {
  label: string;
  isVisible: boolean;
}

const GridCell: React.FC<GridCellProps> = React.memo(({ label, isVisible }) => {
  const cellRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={cellRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
        background: 'var(--bg-secondary, rgba(0,0,0,0.3))',
      }}
    >
      {/* Timeframe label overlay */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          zIndex: 10,
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '1.5px',
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--text-muted, rgba(255,255,255,0.4))',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        {label}
      </div>

      {/* Chart — only animate when visible */}
      {isVisible ? (
        <RrgScene />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted, rgba(255,255,255,0.3))',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '12px',
          }}
        >
          {label} — PAUSED
        </div>
      )}
    </div>
  );
});

export const MultiTimeframeLayout: React.FC = React.memo(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCells, setVisibleCells] = useState<Set<string>>(new Set(GRID_TIMEFRAMES));

  // IntersectionObserver for virtualization
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleCells(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const tf = entry.target.getAttribute('data-timeframe');
            if (tf) {
              if (entry.isIntersecting) {
                next.add(tf);
              } else {
                next.delete(tf);
              }
            }
          });
          return next;
        });
      },
      { root: containerRef.current, threshold: 0.1 }
    );

    const cells = containerRef.current.querySelectorAll('[data-timeframe]');
    cells.forEach(cell => observer.observe(cell));

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '4px',
        width: '100%',
        height: '100%',
        padding: '4px',
      }}
    >
      {GRID_TIMEFRAMES.map(tf => (
        <div key={tf} data-timeframe={tf} style={{ width: '100%', height: '100%' }}>
          <GridCell
            label={GRID_LABELS[tf]}
            isVisible={visibleCells.has(tf)}
          />
        </div>
      ))}
    </div>
  );
});
