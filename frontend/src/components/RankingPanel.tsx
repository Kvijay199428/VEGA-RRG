import React, { useState, useMemo, memo } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import './RankingPanel.css';

import { cleanSectorName } from '../core/math';

type SortKey = 'symbol' | 'x' | 'y' | 'rank';

const RankingPanel: React.FC = memo(() => {
  const { enrichedData, selectedSector, setSelectedSector, hoveredSector, setHoveredSector } = useRrgStore();
  const [sortKey, setSortKey] = useState<SortKey>('x');
  const [sortDesc, setSortDesc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true); // Default to desc for new sort
    }
  };

  const sortedData = useMemo(() => {
    if (!enrichedData) return [];
    
    return [...enrichedData].sort((a: any, b: any) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // fallback handling for rank if not present
      if (sortKey === 'rank') {
        valA = a.trendStrength || a.x || 0;
        valB = b.trendStrength || b.x || 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      
      return sortDesc ? (valB - valA) : (valA - valB);
    });
  }, [enrichedData, sortKey, sortDesc]);

  const renderSortArrow = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDesc ? '▼' : '▲';
  };

  return (
    <div className="ranking">
      <div className="ranking__header">
        <div className="ranking__col ranking__col--num">#</div>
        <div 
          className="ranking__col ranking__col--sector" 
          onClick={() => handleSort('symbol')}
        >
          SECTOR {renderSortArrow('symbol')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('x')}
        >
          RS-R {renderSortArrow('x')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('y')}
        >
          MOM {renderSortArrow('y')}
        </div>
        <div 
          className="ranking__col ranking__col--num" 
          onClick={() => handleSort('rank')}
        >
          RANK {renderSortArrow('rank')}
        </div>
      </div>
      
      <div className="ranking__body">
        {sortedData.map((item: any, idx: number) => {
          const isSelected = selectedSector === item.symbol;
          const isHovered = hoveredSector === item.symbol;
          return (
            <div 
              key={item.symbol} 
              className={`ranking__row ${isSelected ? 'ranking__row--selected' : ''} ${isHovered && !isSelected ? 'ranking__row--hovered' : ''}`}
              onClick={() => setSelectedSector?.(item.symbol)}
              onMouseEnter={() => setHoveredSector?.(item.symbol)}
              onMouseLeave={() => setHoveredSector?.(null)}
            >
              <div className="ranking__col ranking__col--num">{idx + 1}</div>
              <div className="ranking__col ranking__col--sector" title={cleanSectorName(item.symbol)}>
                {cleanSectorName(item.symbol)}
              </div>
              <div className="ranking__col ranking__col--num">{Number(item.x || 0).toFixed(2)}</div>
              <div className="ranking__col ranking__col--num">{Number(item.y || 0).toFixed(2)}</div>
              <div className="ranking__col ranking__col--num">{item.rank || (idx + 1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default RankingPanel;
