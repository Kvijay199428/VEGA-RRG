export const TimeUnit = {
  MINUTE: 'm',
  HOUR: 'h',
  DAY: 'd',
  WEEK: 'w',
  MONTH: 'mo',
  YEAR: 'y',
} as const;

export type TimeUnit = typeof TimeUnit[keyof typeof TimeUnit];

export interface ParsedTimeframe {
  raw: string;
  multiplier: number;
  unit: TimeUnit;
  canonical: string;
  displayLabel: string;
  baseResolutionMinutes: number;
  baseCandleMultiplier: number;
  intraday: boolean;
  isCalendarAnchored: boolean;
  timeframeScaleClass: 'ultra_intraday' | 'intraday' | 'swing' | 'position' | 'macro';
  sortWeight: number;
}

const UNIT_ALIASES: Record<string, TimeUnit> = {
  min: TimeUnit.MINUTE,
  m: TimeUnit.MINUTE,
  h: TimeUnit.HOUR,
  d: TimeUnit.DAY,
  w: TimeUnit.WEEK,
  mo: TimeUnit.MONTH,
  y: TimeUnit.YEAR,
};

const MAX_LIMITS: Record<TimeUnit, number> = {
  [TimeUnit.MINUTE]: 1440,
  [TimeUnit.HOUR]: 168,
  [TimeUnit.DAY]: 365,
  [TimeUnit.WEEK]: 260,
  [TimeUnit.MONTH]: 120,
  [TimeUnit.YEAR]: 20,
};

const SORT_WEIGHTS: Record<TimeUnit, number> = {
  [TimeUnit.MINUTE]: 1,
  [TimeUnit.HOUR]: 60,
  [TimeUnit.DAY]: 1440,
  [TimeUnit.WEEK]: 10080,
  [TimeUnit.MONTH]: 50000,
  [TimeUnit.YEAR]: 600000,
};

const UNIT_DISPLAY: Record<TimeUnit, string> = {
  [TimeUnit.MINUTE]: 'Min',
  [TimeUnit.HOUR]: 'Hour',
  [TimeUnit.DAY]: 'Day',
  [TimeUnit.WEEK]: 'Week',
  [TimeUnit.MONTH]: 'Month',
  [TimeUnit.YEAR]: 'Year',
};

export function parseTimeframe(raw: string): ParsedTimeframe {
  const match = raw.toLowerCase().match(/^(\d+)([a-z]+)$/);
  if (!match) {
    throw new Error(`Invalid timeframe format: ${raw}`);
  }

  const [, numStr, unitStr] = match;
  
  if (numStr.includes('.')) {
    throw new Error(`Fractional timeframes are not allowed: ${raw}`);
  }

  const multiplier = parseInt(numStr, 10);
  if (isNaN(multiplier) || multiplier <= 0) {
    throw new Error(`Timeframe multiplier must be > 0: ${raw}`);
  }

  const unit = UNIT_ALIASES[unitStr];
  if (!unit) {
    throw new Error(`Unknown timeframe unit: ${unitStr}`);
  }

  if (multiplier > MAX_LIMITS[unit]) {
    throw new Error(`Timeframe ${multiplier}${unit} exceeds max limit of ${MAX_LIMITS[unit]}${unit}`);
  }

  const canonical = `${multiplier}${unit}`;
  const displayLabel = `${multiplier} ${UNIT_DISPLAY[unit]}`;
  const intraday = unit === TimeUnit.MINUTE || unit === TimeUnit.HOUR;
  const isCalendarAnchored = !intraday;
  
  const baseResolutionMinutes = intraday ? 1 : 1440;
  let baseCandleMultiplier = multiplier;
  if (unit === TimeUnit.HOUR) baseCandleMultiplier = multiplier * 60;
  if (unit === TimeUnit.WEEK) baseCandleMultiplier = multiplier * 7;
  if (unit === TimeUnit.MONTH) baseCandleMultiplier = multiplier * 30; // Approximation for rendering limits
  if (unit === TimeUnit.YEAR) baseCandleMultiplier = multiplier * 365; // Approximation for rendering limits

  if (baseCandleMultiplier > 10000) {
    throw new Error(`Timeframe ${canonical} base candle multiplier exceeds hard limit of 10000`);
  }

  let timeframeScaleClass: 'ultra_intraday' | 'intraday' | 'swing' | 'position' | 'macro';
  if (unit === TimeUnit.MINUTE && multiplier < 15) timeframeScaleClass = 'ultra_intraday';
  else if (intraday) timeframeScaleClass = 'intraday';
  else if (unit === TimeUnit.DAY && multiplier < 5) timeframeScaleClass = 'swing';
  else if (unit === TimeUnit.DAY || unit === TimeUnit.WEEK) timeframeScaleClass = 'position';
  else timeframeScaleClass = 'macro';

  const sortWeight = SORT_WEIGHTS[unit] * multiplier;

  return {
    raw,
    multiplier,
    unit,
    canonical,
    displayLabel,
    baseResolutionMinutes,
    baseCandleMultiplier,
    intraday,
    isCalendarAnchored,
    timeframeScaleClass,
    sortWeight,
  };
}
