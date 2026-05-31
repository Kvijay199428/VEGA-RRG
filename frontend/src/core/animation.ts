import { curveCardinal, line } from 'd3';

export function catmullRomPath(points: { x: number; y: number }[], tension: number = 0.5): string {
  if (points.length < 2) return '';
  const gen = line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(curveCardinal.tension(tension));
  return gen(points) || '';
}

export function trailOpacities(count: number): number[] {
  if (count <= 1) return [1];
  return Array.from({ length: count }, (_, i) => 0.2 + 0.8 * (i / (count - 1)));
}

export function trailWidths(count: number): number[] {
  if (count <= 1) return [2];
  return Array.from({ length: count }, (_, i) => 1 + 1.5 * (i / (count - 1)));
}

export function arrowAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
