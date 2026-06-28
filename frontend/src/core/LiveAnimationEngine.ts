import type { LiveSectorPosition } from '../stores/useLiveStore';

/**
 * Live animation engine for 60fps visual interpolation.
 *
 * Uses lerp between current rendered position and target position
 * from the latest PATCH. Velocity/acceleration enable predictive
 * interpolation between WebSocket updates (correction #10).
 *
 * Provisional points rendered with pulsing glow effect (correction #4).
 */

export interface AnimatedPoint {
  symbol: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  quadrant: string;
  provisional: boolean;
  // Animation state
  animProgress: number; // 0..1, how far through the interpolation
}

const LERP_SPEED = 0.12; // Higher = snappier (0..1, per frame at 60fps)
const VELOCITY_PREDICTION_FACTOR = 0.3; // How much to use velocity for extrapolation

/**
 * Interpolate a set of positions with smooth lerp animation.
 *
 * @param currentAnimated Previous frame's animated points
 * @param targetPositions Latest positions from the live store
 * @returns New animated points for this frame
 */
export function interpolatePositions(
  currentAnimated: Map<string, AnimatedPoint>,
  targetPositions: Record<string, LiveSectorPosition>
): Map<string, AnimatedPoint> {
  const result = new Map<string, AnimatedPoint>();

  for (const [symbol, target] of Object.entries(targetPositions)) {
    const existing = currentAnimated.get(symbol);

    if (!existing) {
      // New sector — snap to position immediately
      result.set(symbol, {
        symbol,
        x: target.x,
        y: target.y,
        targetX: target.x,
        targetY: target.y,
        vx: target.vx,
        vy: target.vy,
        quadrant: target.quadrant,
        provisional: target.provisional,
        animProgress: 1,
      });
    } else {
      // Existing sector — lerp toward target with velocity prediction
      const predictedX = target.x + target.vx * VELOCITY_PREDICTION_FACTOR;
      const predictedY = target.y + target.vy * VELOCITY_PREDICTION_FACTOR;

      const newX = lerp(existing.x, predictedX, LERP_SPEED);
      const newY = lerp(existing.y, predictedY, LERP_SPEED);

      result.set(symbol, {
        symbol,
        x: newX,
        y: newY,
        targetX: target.x,
        targetY: target.y,
        vx: target.vx,
        vy: target.vy,
        quadrant: target.quadrant,
        provisional: target.provisional,
        animProgress: Math.min(1, existing.animProgress + LERP_SPEED),
      });
    }
  }

  return result;
}

/**
 * Compute trail opacity based on position in trail (older = more transparent).
 */
export function trailOpacity(index: number, total: number, provisional: boolean): number {
  if (total <= 1) return 1;
  const base = 0.15 + 0.85 * (index / (total - 1));
  return provisional ? base * 0.6 : base;
}

/**
 * Compute provisional point glow intensity (pulsing effect).
 * Returns 0..1 based on current time.
 */
export function provisionalGlow(timestamp: number): number {
  const cycle = 1500; // 1.5s pulse cycle
  const phase = (timestamp % cycle) / cycle;
  return 0.4 + 0.6 * Math.sin(phase * Math.PI * 2);
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
