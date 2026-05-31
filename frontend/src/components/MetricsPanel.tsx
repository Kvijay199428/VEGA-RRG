import React, { useMemo, memo } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import './MetricsPanel.css';

import { cleanSectorName } from '../core/math';

const MetricsPanel: React.FC = memo(() => {
  const { selectedSector, hoveredSector, enrichedData } = useRrgStore();

  const activeSector = hoveredSector || selectedSector;
  
  const sectorData = useMemo(() => {
    if (!activeSector || !enrichedData) return null;
    return enrichedData.find((d: any) => d.symbol === activeSector);
  }, [activeSector, enrichedData]);

  if (!sectorData) {
    return (
      <div className="metrics metrics__empty">
        Select a sector
      </div>
    );
  }

  const getQuadrantColorVar = (quadrant: string) => {
    switch (quadrant?.toUpperCase()) {
      case 'LEADING': return 'var(--quadrant-leading-text, var(--quadrant-leading))';
      case 'WEAKENING': return 'var(--quadrant-weakening-text, var(--quadrant-weakening))';
      case 'LAGGING': return 'var(--quadrant-lagging-text, var(--quadrant-lagging))';
      case 'IMPROVING': return 'var(--quadrant-improving-text, var(--quadrant-improving))';
      default: return 'inherit';
    }
  };

  const formatNumber = (num: number) => num != null ? num.toFixed(2) : '---';

  return (
    <div className="metrics">
      <div className="metrics__header">
        SECTOR: {cleanSectorName(sectorData.symbol)}
      </div>
      <div className="metrics__divider">─────────────────</div>
      
      <div className="metrics__row">
        <span className="metrics__label">RS-RATIO</span>
        <span className="metrics__value">{formatNumber(sectorData.x)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">RS-MOMENTUM</span>
        <span className="metrics__value">{formatNumber(sectorData.y)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">QUADRANT</span>
        <span className="metrics__value" style={{ color: getQuadrantColorVar(sectorData.quadrant) }}>
          {sectorData.quadrant?.toUpperCase()}
        </span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">VELOCITY</span>
        <span className="metrics__value">{formatNumber(sectorData.velocity)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">HEADING</span>
        <span className="metrics__value">{sectorData.heading || '---'}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">DISTANCE</span>
        <span className="metrics__value">{formatNumber(sectorData.distance)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">CURVATURE</span>
        <span className="metrics__value">{formatNumber(sectorData.curvature)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">MOM ROC</span>
        <span className="metrics__value">{formatNumber(sectorData.momentumRoc)}</span>
      </div>
      <div className="metrics__row">
        <span className="metrics__label">STRENGTH</span>
        <span className="metrics__value">{formatNumber(sectorData.trendStrength)}</span>
      </div>
    </div>
  );
});

export default MetricsPanel;
