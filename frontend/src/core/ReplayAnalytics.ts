/**
 * ReplayAnalytics — pure function, separated from SnapshotBuilder.
 *
 * Takes a BuiltSnapshot → produces a ReplaySnapshot with:
 * - Quadrants derived from (x, y) relative to axis center
 * - QuadrantDistribution percentages
 * - Leaders / Laggards lists
 * - Enriched sector data (velocity, heading, curvature, etc.)
 *
 * Future scope: rotation velocity, acceleration, quadrant transitions,
 * sector entry/exit events, relative strength ranking.
 */

import type { RrgPoint, EnrichedRrgPoint, QuadrantDistribution, Quadrant } from '../types';
import type { BuiltSnapshot } from './SnapshotBuilder';
import { enrichAll, computeQuadrantDistribution } from './math';

// ─── Output Type ───────────────────────────────────────────────────────

export interface ReplaySnapshot {
  timestamp: number;
  cursorIndex: number;
  referenceCloses: Array<{ symbol: string; close: number }>;
  sectors: RrgPoint[];
  enrichedSectors: EnrichedRrgPoint[];
  quadrants: QuadrantDistribution;
  leaders: string[];    // sectors in LEADING quadrant
  laggards: string[];   // sectors in LAGGING quadrant
  // Future: movers, rotationVelocity, acceleration, quadrantTransitions
}

// ─── Quadrant Derivation ───────────────────────────────────────────────

function deriveQuadrant(x: number, y: number, axisCenter: number): Quadrant {
  if (x >= axisCenter && y >= axisCenter) return 'LEADING';
  if (x >= axisCenter && y < axisCenter) return 'WEAKENING';
  if (x < axisCenter && y < axisCenter) return 'LAGGING';
  return 'IMPROVING';
}

// ─── Core Analytics ────────────────────────────────────────────────────

/**
 * Analyzes a BuiltSnapshot and produces a fully enriched ReplaySnapshot.
 *
 * Pure function: no internal state, no side effects.
 *
 * @param built      Raw snapshot from SnapshotBuilder (quadrants not yet set)
 * @param normalized Whether the dataset uses normalized coordinates (center=100 vs 1.0)
 * @returns ReplaySnapshot with derived quadrants, distribution, leaders, enrichment
 */
export function analyzeSnapshot(
  built: BuiltSnapshot,
  normalized: boolean,
): ReplaySnapshot {
  const axisCenter = normalized ? 100 : 1.0;

  // 1. Derive quadrants for every sector (including trail points for consistency)
  const sectorsWithQuadrants: RrgPoint[] = built.sectors.map(sector => ({
    ...sector,
    quadrant: deriveQuadrant(sector.x, sector.y, axisCenter),
  }));

  // 2. Compute distribution
  const quadrants = computeQuadrantDistribution(sectorsWithQuadrants);

  // 3. Identify leaders and laggards
  const leaders: string[] = [];
  const laggards: string[] = [];
  for (const sector of sectorsWithQuadrants) {
    if (sector.quadrant === 'LEADING') leaders.push(sector.symbol);
    if (sector.quadrant === 'LAGGING') laggards.push(sector.symbol);
  }

  // 4. Enrich with velocity, heading, curvature, momentum RoC
  const enrichedSectors = enrichAll(sectorsWithQuadrants);

  return {
    timestamp: built.timestamp,
    cursorIndex: built.cursorIndex,
    referenceCloses: built.referenceCloses,
    sectors: sectorsWithQuadrants,
    enrichedSectors,
    quadrants,
    leaders,
    laggards,
  };
}
