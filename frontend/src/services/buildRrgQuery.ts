// No Timeframe import needed

export interface RrgQueryParams {
  benchmark: string;
  timeframe: string;
  trailLength: number;
  normalized: boolean;
  sectors?: string[];
  watchlistOnlyResampling?: boolean;
  watchlist?: string[];
  selectedSector?: string | null;
  hoveredSector?: string | null;
}

export function buildRrgQuery(
  settings: { benchmark: string; timeframe: string; trailLength: number; normalized: boolean; watchlistOnlyResampling: boolean },
  enabledSectors: string[],
  watchlistSectors: string[],
  selectedSector: string | null,
  hoveredSector: string | null
): RrgQueryParams {
  return {
    benchmark: settings.benchmark,
    timeframe: settings.timeframe,
    trailLength: settings.trailLength,
    normalized: settings.normalized,
    sectors: enabledSectors,
    watchlistOnlyResampling: settings.watchlistOnlyResampling,
    watchlist: watchlistSectors,
    selectedSector,
    hoveredSector
  };
}
