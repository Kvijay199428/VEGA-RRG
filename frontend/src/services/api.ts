import axios from 'axios';
import type { RrgPoint } from '../types';

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
  signal?: AbortSignal
): Promise<RrgPoint[]> {
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector },
    signal,
  });
  return response.data;
}

export async function fetchSectors(): Promise<string[]> {
  const response = await axios.get<string[]>(`${API_BASE}/sectors`);
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
  signal?: AbortSignal
): Promise<{ data: RrgPoint[]; latency: number }> {
  const start = performance.now();
  const response = await axios.get<RrgPoint[]>(`${API_BASE}/snapshot`, {
    params: { benchmark, timeframe, trailLength, normalized, sectors: sectors?.join(','), minimalWindowResampling,
              watchlistOnlyResampling, watchlist: watchlist?.join(','), selectedSector, hoveredSector },
    signal,
  });
  const latency = Math.round(performance.now() - start);
  _lastLatency = latency;
  return { data: response.data, latency };
}

// Config Endpoints
export async function fetchWatchlistConfig() {
  const response = await axios.get(`${API_BASE}/config/watchlist`);
  return response.data;
}

export async function updateWatchlistConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/watchlist`, config);
  return response.data;
}

export async function fetchSettingsConfig() {
  const response = await axios.get(`${API_BASE}/config/settings`);
  return response.data;
}

export async function updateSettingsConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/settings`, config);
  return response.data;
}

export async function fetchCommandBarConfig() {
  const response = await axios.get(`${API_BASE}/config/commandbar`);
  return response.data;
}

export async function updateCommandBarConfig(config: any) {
  const response = await axios.put(`${API_BASE}/config/commandbar`, config);
  return response.data;
}
