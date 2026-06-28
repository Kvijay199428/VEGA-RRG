import axios from 'axios';
import type { RrgPoint } from '../types';
import type { RangePreset } from '../stores/useReplayStore';

const API_BASE = 'http://localhost:8080/api/rrg';

// No timeframe mapping needed anymore

export async function fetchSnapshot(
  benchmark: string,
  timeframe: string,
  trailLength: number,
  normalized?: boolean,
  sectors?: string[],
  minimalWindowResampling?: boolean,
  watchlistOnlyResampling?: boolean,
  watchlist?: string[],
  selectedSector?: string | null,
  hoveredSector?: string | null,
  signal?: AbortSignal,
  date?: string  // YYYY-MM-DD — activates replay mode in backend
): Promise<RrgPoint[]> {
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector, date },
    signal,
  });
  return response.data;
}

export async function fetchSectors(): Promise<string[]> {
  const response = await axios.get<string[]>(`${API_BASE}/sectors`);
  return response.data;
}

export async function fetchBenchmarkHistory(
  benchmark: string,
  timeframe: string,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<{ benchmark: string; timeframe: string; points: { epochMillis: number; close: number }[] }> {
  const response = await axios.get(`${API_BASE}/benchmark/history`, {
    params: { benchmark, timeframe, from, to },
    signal,
  });
  return response.data;
}

export async function fetchBenchmarkTimeline(
  benchmark: string,
  timeframe: string,
  range: RangePreset,
  signal?: AbortSignal
): Promise<{ benchmark: string; timeframe: string; range: RangePreset; points: { epochMillis: number; close: number }[] }> {
  const response = await axios.get(`${API_BASE}/benchmark/history`, {
    params: { benchmark, timeframe, range },
    signal,
  });
  return response.data;
}

// Returns latency in ms for the last fetch
let _lastLatency = 0;
export function getLastLatency(): number { return _lastLatency; }

export async function fetchSnapshotWithLatency(
  benchmark: string,
  timeframe: string,
  trailLength: number,
  normalized?: boolean,
  sectors?: string[],
  minimalWindowResampling?: boolean,
  watchlistOnlyResampling?: boolean,
  watchlist?: string[],
  selectedSector?: string | null,
  hoveredSector?: string | null,
  signal?: AbortSignal,
  date?: string  // YYYY-MM-DD — activates replay mode in backend
): Promise<{ data: RrgPoint[]; latency: number }> {
  const start = performance.now();
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector, date },
    signal,
  });
  const latency = Math.round(performance.now() - start);
  _lastLatency = latency;
  return { data: response.data, latency };
}

// Replay Dataset Endpoint (stateless, series-oriented)
export async function fetchReplayDataset(
  benchmark: string,
  timeframe: string,
  normalized: boolean,
  sectors: string[],
  fromMs: number,
  toMs: number,
  signal?: AbortSignal
): Promise<any> {
  const response = await axios.get(`${API_BASE}/replay-dataset`, {
    params: {
      benchmark,
      timeframe,
      normalized,
      sectors: sectors.join(','),
      fromMs,
      toMs,
    },
    signal,
  });
  return response.data;
}



// Config Endpoints
export async function fetchWatchlistConfig() {
  const response = await axios.get(`${API_BASE}/config/watchlist`);
  return response.data;
}

export async function updateWatchlistConfig(config: any) {
  const response = await axios.patch(`${API_BASE}/config/watchlist`, config);
  return response.data;
}

export async function fetchSettingsConfig() {
  const response = await axios.get(`${API_BASE}/config/settings`);
  return response.data;
}

export async function updateSettingsConfig(config: any) {
  const response = await axios.patch(`${API_BASE}/config/settings`, config);
  return response.data;
}

export async function fetchPreferences() {
  const response = await axios.get(`${API_BASE}/config/preferences`);
  return response.data;
}

export async function updatePreferences(config: any) {
  const response = await axios.patch(`${API_BASE}/config/preferences`, config);
  return response.data;
}
