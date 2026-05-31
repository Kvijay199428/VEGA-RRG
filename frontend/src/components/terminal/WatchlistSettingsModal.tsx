import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRrgStore } from '../../stores/useRrgStore';
import './WatchlistSettingsModal.css';

import { cleanSectorName } from '../../core/math';

interface WatchlistSettingsModalProps {
  onClose: () => void;
}

const WatchlistSettingsModal: React.FC<WatchlistSettingsModalProps> = ({ onClose }) => {
  const { watchlist, toggleSector, selectAllSectors, clearAllSectors } = useRrgStore();
  const [searchTerm, setSearchTerm] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filteredWatchlist = useMemo(() => {
    if (!searchTerm) return watchlist;
    const lower = searchTerm.toLowerCase();
    return watchlist.filter(w => cleanSectorName(w.symbol).toLowerCase().includes(lower));
  }, [watchlist, searchTerm]);

  return (
    <div className="watchlist-modal-overlay">
      <div className="watchlist-modal" ref={modalRef}>
        <div className="watchlist-modal__header">
          <div className="watchlist-modal__title">SECTOR SETTINGS</div>
          <button className="watchlist-modal__close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="watchlist-modal__search-container">
          <input 
            type="text" 
            className="watchlist-modal__search" 
            placeholder="Search sectors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <div className="watchlist-modal__actions">
          <button className="watchlist-modal__btn" onClick={selectAllSectors}>SELECT ALL</button>
          <button className="watchlist-modal__btn" onClick={clearAllSectors}>CLEAR</button>
        </div>

        <div className="watchlist-modal__list">
          {filteredWatchlist.map(item => (
            <label key={item.symbol} className="watchlist-modal__row">
              <input 
                type="checkbox" 
                checked={item.enabled} 
                onChange={() => toggleSector(item.symbol)} 
                className="watchlist-modal__checkbox"
              />
              <span className="watchlist-modal__name">{cleanSectorName(item.symbol)}</span>
            </label>
          ))}
          {filteredWatchlist.length === 0 && (
            <div className="watchlist-modal__empty">No sectors found.</div>
          )}
        </div>

        <div className="watchlist-modal__footer">
          <button className="watchlist-modal__btn watchlist-modal__btn--primary" onClick={onClose}>DONE</button>
        </div>
      </div>
    </div>
  );
};

export default WatchlistSettingsModal;
