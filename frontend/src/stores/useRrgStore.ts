import { create } from 'zustand';
import type { RrgPoint, EnrichedRrgPoint, QuadrantDistribution, HistoricalFrame, SectorWatchlistItem } from '../types';
import { enrichAll, computeQuadrantDistribution } from '../core/math';
import { useChartSettingsStore } from './useChartSettingsStore';
import { useCommandBarStore } from './useCommandBarStore';
import { fetchSnapshotWithLatency, fetchSectors, fetchWatchlistConfig, updateWatchlistConfig } from '../services/api';
import { useReplayStore } from './useReplayStore';

interface RrgState {
  // Data
  rawData: RrgPoint[];
  enrichedData: EnrichedRrgPoint[];
  sectors: string[];
  watchlist: SectorWatchlistItem[];
  quadrantDistribution: QuadrantDistribution;
  
  // Controls
  // benchmark, timeframe, trailLength, showTrail, normalized moved to useChartSettingsStore
  
  selectedSector: string | null;
  hoveredSector: string | null;
  hiddenSectors: string[];
  
  // Viewport removed, now in useViewportStore
  // Connection
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  lastUpdate: number | null;
  latency: number;
  loading: boolean;
  
  // Historical playback (future-proofed)
  historicalFrames: HistoricalFrame[];
  currentFrameIndex: number;
  
  // Replay date state
  replayDefaultApplied: boolean;       // guard: auto-apply trail only once per replay-enable

  // Actions
  // Settings setters moved to useChartSettingsStore
  setSelectedSector: (s: string | null) => void;
  setHoveredSector: (s: string | null) => void;
  setCurrentFrameIndex: (i: number) => void;
  setReplayDefaultApplied: (v: boolean) => void;
  toggleSector: (symbol: string) => void;
  toggleHiddenSector: (symbol: string) => void;
  hideSectors: (symbols: string[]) => void;
  showSectors: (symbols: string[]) => void;
  selectAllSectors: () => void;
  clearAllSectors: () => void;
  setWatchlist: (items: SectorWatchlistItem[]) => void;
  saveWatchlist: (items: SectorWatchlistItem[]) => void;
  lastQueryKey: string | null;
  fetchData: (signal?: AbortSignal) => Promise<void>;
  fetchSectorList: () => Promise<void>;
  
  // Replay engine: inject pre-built snapshot data directly (bypasses fetchData)
  setReplaySnapshot: (snapshot: {
    rawData: RrgPoint[];
    enrichedData: EnrichedRrgPoint[];
    quadrantDistribution: QuadrantDistribution;
  }) => void;
}

let saveTimeout: any = null;

export const useRrgStore = create<RrgState>((set, get) => ({
  rawData: [],
  enrichedData: [],
  sectors: [],
  watchlist: [],
  quadrantDistribution: { leading: 0, weakening: 0, lagging: 0, improving: 0 },
  selectedSector: null,
  hoveredSector: null,
  hiddenSectors: [],
  connectionStatus: 'DISCONNECTED',
  lastUpdate: null,
  latency: 0,
  loading: false,
  historicalFrames: [],
  currentFrameIndex: 0,
  lastQueryKey: null,
  replayDefaultApplied: false,
  
  setSelectedSector: (s) => set({ selectedSector: s }),
  setHoveredSector: (s) => set({ hoveredSector: s }),
  setCurrentFrameIndex: (i) => set({ currentFrameIndex: i }),
  setReplayDefaultApplied: (v) => set({ replayDefaultApplied: v }),
  
  toggleSector: (symbol) => set(state => {
    const next = state.watchlist.map(w => w.symbol === symbol ? { ...w, enabled: !w.enabled } : w);
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  toggleHiddenSector: (symbol) => set(state => {
    const hidden = state.hiddenSectors.includes(symbol)
      ? state.hiddenSectors.filter(s => s !== symbol)
      : [...state.hiddenSectors, symbol];
    return { hiddenSectors: hidden };
  }),
  hideSectors: (symbols) => set(state => {
    const newHidden = [...state.hiddenSectors];
    symbols.forEach(s => {
      if (!newHidden.includes(s)) newHidden.push(s);
    });
    return { hiddenSectors: newHidden };
  }),
  showSectors: (symbols) => set(state => {
    return { hiddenSectors: state.hiddenSectors.filter(s => !symbols.includes(s)) };
  }),
  selectAllSectors: () => set(state => {
    const next = state.watchlist.map(w => ({ ...w, enabled: true }));
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  clearAllSectors: () => set(state => {
    const next = state.watchlist.map(w => ({ ...w, enabled: false }));
    get().saveWatchlist(next);
    return { watchlist: next };
  }),
  setWatchlist: (items) => {
    set({ watchlist: items });
    get().saveWatchlist(items);
  },
  
  saveWatchlist: (items) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        const config = {
          version: 1,
          watchlistOnlyResampling: useChartSettingsStore.getState().watchlistOnlyResampling,
          watchlists: [{
            id: "default",
            name: "Default",
            active: true,
            sectors: items.map((i: SectorWatchlistItem) => ({
              symbol: i.symbol,
              pinned: i.pinned || false,
              priority: i.order || 0,
              hidden: !i.enabled
            }))
          }]
        };
        await updateWatchlistConfig(config);
      } catch (e) {
        console.error('Failed to save watchlist config', e);
      }
    }, 500);
  },

  fetchData: async (signal?: AbortSignal) => {
    let { benchmark, minimalWindowResampling, watchlistOnlyResampling } = useChartSettingsStore.getState();
    const commandBarState = useCommandBarStore.getState();
    const replayState = useReplayStore.getState();
    const replayModeEnabled = commandBarState.replayModeEnabled;
    const timeframe = replayModeEnabled ? replayState.replayTimeframe : commandBarState.timeframe;
    const trailLength = replayModeEnabled ? replayState.replayTrailLength : commandBarState.trailLength;
    const normalized = commandBarState.normalized;
    const selectedReplayDate = replayModeEnabled ? replayState.getSelectedReplayDate() : null;

    if (benchmark === 'NSE_INDEX__Nifty_50') benchmark = 'NSE_INDEX_Nifty 50';
    const { watchlist, lastQueryKey, selectedSector, hoveredSector } = get();
    let enabledSectors = watchlist.filter(w => w.enabled).map(w => w.symbol);
    const watchlistSectors = watchlist.map(w => w.symbol);
    
    // Validate out placeholder/malformed queries (but allow benchmark to be plotted)
    enabledSectors = enabledSectors.filter(s => s.trim().toLowerCase() !== "sector" && s.trim() !== "");

    // Ensure benchmark is always plotted
    if (!enabledSectors.includes(benchmark)) {
      enabledSectors.push(benchmark);
    }

    const queryKey = JSON.stringify({ benchmark, timeframe, trailLength, normalized, minimalWindowResampling, watchlistOnlyResampling, enabledSectors, watchlistSectors, selectedSector, hoveredSector, selectedReplayDate });
    if (queryKey === lastQueryKey) return; // Deduplication
    
    set({ lastQueryKey: queryKey });

    // Do not fetch if no sectors enabled
    if (enabledSectors.length === 0) {
      set({ rawData: [], enrichedData: [], quadrantDistribution: { leading: 0, weakening: 0, lagging: 0, improving: 0 } });
      return;
    }
    
    set({ loading: true });
    try {
      const { data, latency } = await fetchSnapshotWithLatency(benchmark, timeframe, trailLength, normalized, enabledSectors, minimalWindowResampling, watchlistOnlyResampling, watchlistSectors, selectedSector, hoveredSector, signal, selectedReplayDate ?? undefined);
      const enriched = enrichAll(data);
      const distribution = computeQuadrantDistribution(data);
      set({
        rawData: data,
        enrichedData: enriched,
        quadrantDistribution: distribution,
        connectionStatus: 'CONNECTED',
        lastUpdate: Date.now(),
        latency,
        loading: false,
      });
    } catch (error: any) {
      if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
        set({ connectionStatus: 'DISCONNECTED', loading: false });
      }
    }
  },
  
  // Replay engine: inject pre-built snapshot data directly, bypassing fetchData().
  // The live fetchData() path remains completely untouched.
  setReplaySnapshot: (snapshot) => {
    set({
      rawData: snapshot.rawData,
      enrichedData: snapshot.enrichedData,
      quadrantDistribution: snapshot.quadrantDistribution,
      lastUpdate: Date.now(),
      loading: false,
    });
  },

  fetchSectorList: async () => {
    try {
      const fetchedSectors = await fetchSectors();
      
      let savedWatchlist: SectorWatchlistItem[] = [];
      try {
        const config = await fetchWatchlistConfig();
        if (config && config.watchlists && config.watchlists.length > 0) {
           const activeList = config.watchlists.find((w: any) => w.active) || config.watchlists[0];
           savedWatchlist = activeList.sectors.map((s: any) => ({
             symbol: s.symbol,
             enabled: !s.hidden,
             pinned: s.pinned,
             order: s.priority
           }));
        }
      } catch (e) {
        console.error('Failed to load watchlist config', e);
      }
      
      let { benchmark } = useChartSettingsStore.getState();
      if (benchmark === 'NSE_INDEX__Nifty_50') benchmark = 'NSE_INDEX_Nifty 50';

      const sectors = Array.from(new Set([benchmark, ...fetchedSectors]));

      const watchlistMap = new Map(savedWatchlist.map(w => [w.symbol, w]));
      const newWatchlist = sectors.map(symbol => {
        if (watchlistMap.has(symbol)) {
          return watchlistMap.get(symbol)!;
        }
        return { symbol, enabled: true };
      });
      
      set({ sectors, watchlist: newWatchlist });
    } catch {
      console.error('Failed to fetch sectors');
    }
  },
}));
