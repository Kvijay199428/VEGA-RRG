import { useEffect } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import { useChartSettingsStore } from '../stores/useChartSettingsStore';
import { useCommandBarStore } from '../stores/useCommandBarStore';

const getPollInterval = (tf: string) => {
  switch (tf) {
    case '1min': return 15000;
    case '5min': return 30000;
    case '15min': return 60000;
    case '30min': return 120000;
    case '1h': return 300000;
    default: return 0;
  }
};

export function useAutoFetch() {
  const fetchData = useRrgStore(s => s.fetchData);
  const fetchSectorList = useRrgStore(s => s.fetchSectorList);
  
  const benchmark = useChartSettingsStore(s => s.benchmark);
  
  const timeframe = useCommandBarStore(s => s.timeframe);
  const trailLength = useCommandBarStore(s => s.trailLength);
  const normalized = useCommandBarStore(s => s.normalized);

  const watchlistStr = useRrgStore(s => s.watchlist.filter(w => w.enabled).map(w => w.symbol).join(','));

  useEffect(() => {
    fetchSectorList();
  }, [fetchSectorList]);

  useEffect(() => {
    const abortController = new AbortController();
    
    const timeoutId = setTimeout(() => {
      console.log('[AutoFetch] Querying API with:', { timeframe, trailLength, normalized });
      fetchData(abortController.signal);
    }, 250); // Debounce
    
    const intervalMs = getPollInterval(timeframe);
    let interval: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      interval = setInterval(() => {
        fetchData(abortController.signal);
      }, intervalMs);
    }
    
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
      if (interval) clearInterval(interval);
    };
  }, [fetchData, benchmark, timeframe, trailLength, normalized, watchlistStr]);
}
