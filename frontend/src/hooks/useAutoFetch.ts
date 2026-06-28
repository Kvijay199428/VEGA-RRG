import { useEffect } from 'react';
import { useRrgStore } from '../stores/useRrgStore';
import { useChartSettingsStore } from '../stores/useChartSettingsStore';
import { useCommandBarStore } from '../stores/useCommandBarStore';
import { useLiveStore } from '../stores/useLiveStore';
import { useReplayStore } from '../stores/useReplayStore';

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
  const replayModeEnabled = useCommandBarStore(s => s.replayModeEnabled);
  const replayTimeframe = useReplayStore(s => s.replayTimeframe);
  const replayTrailLength = useReplayStore(s => s.replayTrailLength);

  const liveStreamingEnabled = useCommandBarStore(s => (s as any).liveStreamingEnabled);
  const liveConnectionStatus = useLiveStore(s => s.liveConnectionStatus);

  const watchlistStr = useRrgStore(s => s.watchlist.filter(w => w.enabled).map(w => w.symbol).join(','));
  const effectiveTimeframe = replayModeEnabled ? replayTimeframe : timeframe;
  const effectiveTrailLength = replayModeEnabled ? replayTrailLength : trailLength;

  useEffect(() => {
    fetchSectorList();
  }, [fetchSectorList]);

  useEffect(() => {
    // Replay session manages its own data lifecycle — skip all REST polling
    if (replayModeEnabled) {
      console.log('[AutoFetch] Paused — replay mode active');
      return () => {};
    }

    // Pause REST polling when live streaming is active and connected (correction #18 — resume on FALLBACK)
    if (liveStreamingEnabled && liveConnectionStatus === 'CONNECTED') {
      console.log('[AutoFetch] Paused — live streaming active');
      return () => {};
    }

    const abortController = new AbortController();
    
    const timeoutId = setTimeout(() => {
      console.log('[AutoFetch] Querying API with:', { timeframe: effectiveTimeframe, trailLength: effectiveTrailLength, normalized });
      fetchData(abortController.signal);
    }, 250); // Debounce
    
    const intervalMs = replayModeEnabled ? 0 : getPollInterval(effectiveTimeframe);
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
  }, [
    fetchData,
    benchmark,
    effectiveTimeframe,
    effectiveTrailLength,
    normalized,
    watchlistStr,
    liveStreamingEnabled,
    liveConnectionStatus,
    replayModeEnabled,
  ]);
}
