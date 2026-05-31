export interface TrailPoint {
  epochMillis: number;
  x: number;
  y: number;
}

export interface RrgPoint {
  symbol: string;
  x: number;  // RS-Ratio
  y: number;  // RS-Momentum
  quadrant: 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';
  trail: TrailPoint[];
  stale?: boolean;
  computedAt?: number;
}

// Computed client-side
export interface EnrichedRrgPoint extends RrgPoint {
  velocity: number;
  heading: string;   // N, NE, E, SE, S, SW, W, NW
  headingAngle: number; // radians
  distance: number;  // from center (100,100)
  trendStrength: number;
  curvature: number;
  momentumRoc: number;
  quadrantDuration: number; // consecutive frames in same quadrant
}

export interface Viewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  innerWidth: number;
  innerHeight: number;
}

export interface HistoricalFrame {
  timestamp: number;
  points: RrgPoint[];
}

export type Quadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';

// For breadth gauge
export interface QuadrantDistribution {
  leading: number;
  weakening: number;
  lagging: number;
  improving: number;
}

export interface SectorWatchlistItem {
  symbol: string;
  enabled: boolean;
  pinned?: boolean;
  order?: number;
}
