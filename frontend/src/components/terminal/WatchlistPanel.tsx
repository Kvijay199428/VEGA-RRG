import React, { useState, useMemo, memo } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import WatchlistSettingsModal from './WatchlistSettingsModal';
import './WatchlistPanel.css';

import { cleanSectorName } from '../../core/math';

const WatchlistPanel: React.FC = memo(() => {
  const {
    enrichedData, watchlist,
    selectedSector, setSelectedSector,
    hoveredSector, setHoveredSector,
    hiddenSectors, toggleHiddenSector,
    hideSectors, showSectors
  } = useRrgStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredData = useMemo(() => {
    if (!enrichedData) return [];
    if (!searchTerm) return enrichedData;
    const lower = searchTerm.toLowerCase();
    return enrichedData.filter((item: any) => 
      cleanSectorName(item.symbol).toLowerCase().includes(lower)
    );
  }, [enrichedData, searchTerm]);


  const groupedData = useMemo(() => {
    const groups: Record<string, any[]> = {
      LEADING: [],
      WEAKENING: [],
      LAGGING: [],
      IMPROVING: []
    };

    filteredData.forEach((item: any) => {
      const q = item.quadrant?.toUpperCase();
      if (groups[q]) groups[q].push(item);
    });

    // LEADING: Sort descending by distance from center
    groups.LEADING.sort((a, b) => b.distance - a.distance);
    // WEAKENING: Sort descending by RS-Ratio
    groups.WEAKENING.sort((a, b) => b.x - a.x);
    // IMPROVING: Sort descending by Momentum acceleration
    groups.IMPROVING.sort((a, b) => b.momentumRoc - a.momentumRoc);
    // LAGGING: Sort ascending by combined weakness score (x + y is lowest for bottom-left)
    groups.LAGGING.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    return groups;
  }, [filteredData]);

  const QuadrantSection = ({ title, items, colorVar }: { title: string, items: any[], colorVar: string }) => {
    if (items.length === 0) return null;
    return (
      <div className="watchlist__section">
        <div className="watchlist__section-header" style={{ color: colorVar, display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{title} ({items.length})</span>
          <button 
            onClick={() => showSectors(items.map((i: any) => i.symbol))} 
            style={{ background: 'none', border: 'none', color: colorVar, cursor: 'pointer', fontSize: '0.8em', opacity: 0.8, padding: '0 4px', fontWeight: 'bold' }}
            title="Select All"
          >
            All
          </button>
          <span style={{ opacity: 0.5 }}>|</span>
          <button 
            onClick={() => hideSectors(items.map((i: any) => i.symbol))} 
            style={{ background: 'none', border: 'none', color: colorVar, cursor: 'pointer', fontSize: '0.8em', opacity: 0.8, padding: '0 4px', fontWeight: 'bold' }}
            title="Clear All"
          >
            None
          </button>
        </div>
        {items.map((item: any) => {
          const isSelected = selectedSector === item.symbol;
          const isHovered = hoveredSector === item.symbol;
          const isHidden = hiddenSectors.includes(item.symbol);
          return (
            <div
              key={item.symbol}
              className={`watchlist__row ${isSelected ? 'watchlist__row--selected' : ''} ${isHovered && !isSelected ? 'watchlist__row--hovered' : ''}`}
              onClick={() => setSelectedSector?.(isSelected ? null : item.symbol)}
              onMouseEnter={() => setHoveredSector?.(item.symbol)}
              onMouseLeave={() => setHoveredSector?.(null)}
            >
              <div 
                className="watchlist__indicator" 
                style={{ backgroundColor: colorVar }}
              />
              <span className="watchlist__name">{cleanSectorName(item.symbol)}</span>
              <input
                type="checkbox"
                checked={!isHidden}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleHiddenSector(item.symbol);
                }}
                className="watchlist__checkbox"
                style={{ marginLeft: 'auto', cursor: 'pointer' }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="watchlist">
      <div className="watchlist__header">
        <span>SECTORS ({watchlist.filter(w => w.enabled).length}/{watchlist.length})</span>
        <button className="watchlist__settings-btn" onClick={() => setIsModalOpen(true)}>⚙</button>
      </div>
      <div className="watchlist__search-container">
        <input 
          type="text" 
          className="watchlist__search" 
          placeholder="Search sectors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="watchlist__divider" />
      <div className="watchlist__list">
        <QuadrantSection title="LEADING" items={groupedData.LEADING} colorVar="var(--quadrant-leading-text, #2ECC71)" />
        <QuadrantSection title="WEAKENING" items={groupedData.WEAKENING} colorVar="var(--quadrant-weakening-text, #F1C40F)" />
        <QuadrantSection title="LAGGING" items={groupedData.LAGGING} colorVar="var(--quadrant-lagging-text, #E74C3C)" />
        <QuadrantSection title="IMPROVING" items={groupedData.IMPROVING} colorVar="var(--quadrant-improving-text, #3498DB)" />
      </div>
      {isModalOpen && <WatchlistSettingsModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
});

export default WatchlistPanel;
