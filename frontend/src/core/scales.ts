import { scaleLinear, type ScaleLinear } from 'd3';
import type { ChartDimensions } from '../types';

export interface RrgScales {
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  center: number;
}

export function createScales(
  xDomain: [number, number],
  yDomain: [number, number],
  dims: ChartDimensions,
  center: number = 100
): RrgScales {
  const xScale = scaleLinear().domain(xDomain).range([0, dims.innerWidth]);
  const yScale = scaleLinear().domain(yDomain).range([dims.innerHeight, 0]);
  return { xScale, yScale, center };
}

export function computeDomain(
  allX: number[], allY: number[],
  paddingRatio: number = 0.125
): { xDomain: [number, number]; yDomain: [number, number]; step: number } {
  if (allX.length === 0) return { xDomain: [0, 100], yDomain: [0, 100], step: 1 };
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);

  const xRange = Math.max(xMax - xMin, 0.001);
  const yRange = Math.max(yMax - yMin, 0.001);
  const maxRange = Math.max(xRange, yRange);

  // Dynamic Grid Step Calculation (scales down for lower timeframes)
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxRange)));
  const normalized = maxRange / magnitude;
  let step = magnitude;
  if (normalized <= 2) step = 0.2 * magnitude;
  else if (normalized <= 5) step = 0.5 * magnitude;
  else step = 1.0 * magnitude;

  // Proportional padding (e.g. 12.5% of range), guaranteed to be at least half a grid step
  const padX = Math.max(xRange * paddingRatio, step * 0.5);
  const padY = Math.max(yRange * paddingRatio, step * 0.5);

  const qxMin = Math.floor((xMin - padX) / step) * step;
  const qxMax = Math.ceil((xMax + padX) / step) * step;
  const qyMin = Math.floor((yMin - padY) / step) * step;
  const qyMax = Math.ceil((yMax + padY) / step) * step;

  return {
    xDomain: [qxMin, qxMax],
    yDomain: [qyMin, qyMax],
    step: step
  };
}

export function generateGridLines(
  domain: [number, number], step: number
): number[] {
  const lines: number[] = [];
  const start = Math.ceil(domain[0] / step) * step;

  // Calculate precision based on step size to avoid truncating lower timeframes
  let decimals = 2;
  if (step < 0.1) decimals = 3;
  if (step < 0.01) decimals = 4;
  if (step < 0.001) decimals = 5;
  const factor = Math.pow(10, decimals);

  for (let v = start; v <= domain[1] + step * 0.1; v += step) {
    lines.push(Math.round(v * factor) / factor);
  }
  return lines;
}
