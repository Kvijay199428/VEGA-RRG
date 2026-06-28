import type { RrgPoint, EnrichedRrgPoint, TrailPoint, QuadrantDistribution } from '../types';

export function cleanSectorName(symbol: string): string {
  if (!symbol) return '';
  let name = symbol.replace(/_/g, ' ');
  name = name.replace(/^NSE\s*INDEX\s*/i, '');
  // name = name.replace(/^NIFTY\s*/i, '');
  return name.trim();
}

export function computeHeading(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Adjusted: in SVG y-axis is inverted
  if (angle >= -22.5 && angle < 22.5) return 'E';
  if (angle >= 22.5 && angle < 67.5) return 'NE';
  if (angle >= 67.5 && angle < 112.5) return 'N';
  if (angle >= 112.5 && angle < 157.5) return 'NW';
  if (angle >= 157.5 || angle < -157.5) return 'W';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5) return 'S';
  return 'SE';
}

export function computeVelocity(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeDistance(x: number, y: number, cx = 100, cy = 100): number {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

export function computeCurvature(trail: TrailPoint[]): number {
  if (trail.length < 3) return 0;
  const n = trail.length;
  const p0 = trail[n - 3];
  const p1 = trail[n - 2];
  const p2 = trail[n - 1];
  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y;
  const cross = dx1 * dy2 - dy1 * dx2;
  const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  const denom = d1 * d2;
  return denom === 0 ? 0 : cross / denom;
}

export function computeMomentumRoc(trail: TrailPoint[]): number {
  if (trail.length < 3) return 0;
  const n = trail.length;
  const mom1 = trail[n - 1].y - trail[n - 2].y;
  const mom0 = trail[n - 2].y - trail[n - 3].y;
  return mom1 - mom0;
}

export function enrichPoint(point: RrgPoint): EnrichedRrgPoint {
  const trail = point.trail;
  let dx = 0, dy = 0;
  if (trail.length >= 2) {
    const prev = trail[trail.length - 2];
    dx = point.x - prev.x;
    dy = point.y - prev.y;
  }
  return {
    ...point,
    velocity: computeVelocity(dx, dy),
    heading: computeHeading(dx, dy),
    headingAngle: Math.atan2(dy, dx),
    distance: computeDistance(point.x, point.y),
    trendStrength: computeVelocity(dx, dy) * computeDistance(point.x, point.y),
    curvature: computeCurvature(trail),
    momentumRoc: computeMomentumRoc(trail),
    quadrantDuration: 0, // needs historical data to compute
  };
}

export function enrichAll(points: RrgPoint[]): EnrichedRrgPoint[] {
  return points.map(enrichPoint);
}

export function computeQuadrantDistribution(points: RrgPoint[]): QuadrantDistribution {
  const total = points.length || 1;
  const counts = { leading: 0, weakening: 0, lagging: 0, improving: 0 };
  points.forEach(p => {
    const key = p.quadrant.toLowerCase() as keyof QuadrantDistribution;
    counts[key]++;
  });
  return {
    leading: Math.round((counts.leading / total) * 100),
    weakening: Math.round((counts.weakening / total) * 100),
    lagging: Math.round((counts.lagging / total) * 100),
    improving: Math.round((counts.improving / total) * 100),
  };
}

export interface DataBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  domainWidth: number;
  domainHeight: number;
}

export function computeDataBounds(points: EnrichedRrgPoint[]): DataBounds {
  if (points.length === 0) {
    return { minX: 95, maxX: 105, minY: 95, maxY: 105, centerX: 100, centerY: 100, domainWidth: 10, domainHeight: 10 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;

    if (p.trail) {
      for (const t of p.trail) {
        if (t.x < minX) minX = t.x;
        if (t.x > maxX) maxX = t.x;
        if (t.y < minY) minY = t.y;
        if (t.y > maxY) maxY = t.y;
      }
    }
  }

  // Account for precision/quantization
  // Domain values precision: 0.0001
  const quantize = (val: number) => Math.round(val * 10000) / 10000;

  minX = quantize(minX);
  maxX = quantize(maxX);
  minY = quantize(minY);
  maxY = quantize(maxY);

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  // Padding incorporates labels, arrows, and glow blur
  // Adaptive padding: max(domainRange * 0.12, 1.5)
  const paddingX = Math.max(rangeX * 0.12, 1.5);
  const paddingY = Math.max(rangeY * 0.12, 1.5);

  minX -= paddingX;
  maxX += paddingX;
  minY -= paddingY;
  maxY += paddingY;

  const MIN_DOMAIN_SIZE = 4;
  const domainWidth = quantize(Math.max(maxX - minX, MIN_DOMAIN_SIZE));
  const domainHeight = quantize(Math.max(maxY - minY, MIN_DOMAIN_SIZE));

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: quantize((minX + maxX) / 2),
    centerY: quantize((minY + maxY) / 2),
    domainWidth,
    domainHeight,
  };
}
