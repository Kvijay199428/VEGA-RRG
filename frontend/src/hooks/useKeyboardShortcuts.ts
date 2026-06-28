import { useEffect } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import { useViewportStore } from '../stores/useViewportStore';
import { useReplayStore } from '../stores/useReplayStore';

export const useKeyboardShortcuts = () => {
  const setIsPlaying = useReplayStore(s => s.setIsPlaying);
  const isPlaying = useReplayStore(s => s.isPlaying);
  const enrichedData = useRrgStore(s => s.enrichedData);
  const selectedSector = useRrgStore(s => s.selectedSector);
  const setSelectedSector = useRrgStore(s => s.setSelectedSector);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          useViewportStore.getState().zoomBy(-100, useViewportStore.getState().viewportWidth / 2, useViewportStore.getState().viewportHeight / 2);
          break;
        case '-':
          useViewportStore.getState().zoomBy(100, useViewportStore.getState().viewportWidth / 2, useViewportStore.getState().viewportHeight / 2);
          break;
        case 'ArrowUp':
          e.preventDefault();
          useViewportStore.getState().panBy(0, 30);
          break;
        case 'ArrowDown':
          e.preventDefault();
          useViewportStore.getState().panBy(0, -30);
          break;
        case 'ArrowLeft':
          useViewportStore.getState().panBy(30, 0);
          break;
        case 'ArrowRight':
          useViewportStore.getState().panBy(-30, 0);
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'F2':
          e.preventDefault();
          useViewportStore.getState().resetToFit();
          break;
        case 'Tab': {
          e.preventDefault();
          if (enrichedData.length === 0) break;
          const symbols = enrichedData.map(d => d.symbol);
          const idx = selectedSector ? symbols.indexOf(selectedSector) : -1;
          const next = symbols[(idx + 1) % symbols.length];
          setSelectedSector(next);
          break;
        }
        case '0':
          if (e.ctrlKey) {
            e.preventDefault();
            useViewportStore.getState().resetToFit();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, enrichedData, selectedSector, setIsPlaying, setSelectedSector]);
}
