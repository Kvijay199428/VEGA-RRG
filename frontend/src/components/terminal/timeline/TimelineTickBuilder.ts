import type { TimelineTick } from './TimelineTick';
import { TimelineTickFormatter, determineTickFormat } from './TimelineTickFormatter';
import { TimelineCollisionResolver } from './TimelineCollisionResolver';

export class TimelineTickBuilder {
  private static minTickSpacing = 95;
  private static minTicks = 6;
  private static maxTicks = 12;

  static build(
    history: { timestamp: number }[],
    containerWidth: number
  ): TimelineTick[] {
    if (history.length === 0 || containerWidth <= 0) return [];
    if (history.length === 1) {
      return [{
        index: 0,
        timestamp: history[0].timestamp,
        pixelX: 0,
        label: TimelineTickFormatter.format(history[0].timestamp, 'DAY_MONTH'),
        alignment: 'start',
        type: 'date'
      }];
    }

    const durationDays = (history[history.length - 1].timestamp - history[0].timestamp) / 86400000;
    
    if (durationDays <= 10) {
      return this.buildIntradayTicks(history, containerWidth);
    }

    return this.buildCalendarTicks(history, containerWidth, durationDays);
  }

  private static buildCalendarTicks(
    history: { timestamp: number }[],
    containerWidth: number,
    durationDays: number
  ): TimelineTick[] {
    const format = determineTickFormat(durationDays);
    let maxTicks = Math.floor(containerWidth / this.minTickSpacing);
    maxTicks = Math.max(this.minTicks, Math.min(this.maxTicks, maxTicks));
    maxTicks = Math.min(maxTicks, history.length);

    const step = (history.length - 1) / (maxTicks - 1);
    const ticks: TimelineTick[] = [];
    const xScale = (index: number) => (index / (history.length - 1)) * containerWidth;

    for (let i = 0; i < maxTicks; i++) {
      const index = Math.round(i * step);
      const timestamp = history[index].timestamp;
      
      ticks.push({
        index,
        timestamp,
        pixelX: xScale(index),
        label: TimelineTickFormatter.format(timestamp, format),
        alignment: 'center',
        type: 'date'
      });
    }
    
    return TimelineCollisionResolver.resolve(ticks, containerWidth);
  }

  private static buildIntradayTicks(
    history: { timestamp: number }[],
    containerWidth: number
  ): TimelineTick[] {
    const ticks: TimelineTick[] = [];
    const xScale = (index: number) => (index / (history.length - 1)) * containerWidth;

    const days: { dateStr: string, startIndex: number, endIndex: number, dateObj: Date }[] = [];
    let currentDayStr = '';
    
    for (let i = 0; i < history.length; i++) {
      const d = new Date(history[i].timestamp);
      const dayStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayStr !== currentDayStr) {
        if (days.length > 0) {
          days[days.length - 1].endIndex = i - 1;
        }
        days.push({ dateStr: dayStr, startIndex: i, endIndex: i, dateObj: d });
        currentDayStr = dayStr;
      }
      if (i === history.length - 1) {
        days[days.length - 1].endIndex = i;
      }
    }

    for (const day of days) {
      ticks.push({
        index: day.startIndex,
        timestamp: history[day.startIndex].timestamp,
        pixelX: xScale(day.startIndex),
        label: TimelineTickFormatter.format(history[day.startIndex].timestamp, 'DAY_MONTH'),
        alignment: 'center',
        type: 'date'
      });

      const dayWidth = xScale(day.endIndex) - xScale(day.startIndex);
      
      let timeTickCount = 0;
      if (dayWidth > 120) timeTickCount = 1;
      if (dayWidth > 200) timeTickCount = 2;
      if (dayWidth > 280) timeTickCount = 3;
      if (dayWidth > 350) timeTickCount = 4;
      if (dayWidth > 500) timeTickCount = 7;

      const targetTimes = this.getCanonicalTimes(timeTickCount);

      for (const t of targetTimes) {
        const targetMs = new Date(day.dateObj);
        targetMs.setHours(t.h, t.m, 0, 0);
        const targetTimestamp = targetMs.getTime();

        let nearestIndex = day.startIndex;
        let minDiff = Infinity;

        for (let i = day.startIndex; i <= day.endIndex; i++) {
          const diff = Math.abs(history[i].timestamp - targetTimestamp);
          if (diff < minDiff) {
            minDiff = diff;
            nearestIndex = i;
          }
        }

        if (nearestIndex !== day.startIndex) {
          ticks.push({
            index: nearestIndex,
            timestamp: history[nearestIndex].timestamp,
            pixelX: xScale(nearestIndex),
            label: TimelineTickFormatter.formatTime(history[nearestIndex].timestamp),
            alignment: 'center',
            type: 'time'
          });
        }
      }
    }

    ticks.sort((a, b) => a.index - b.index);
    return TimelineCollisionResolver.resolve(ticks, containerWidth);
  }

  private static getCanonicalTimes(count: number) {
    if (count >= 6) return [ {h:9,m:30}, {h:10,m:30}, {h:11,m:30}, {h:12,m:30}, {h:13,m:30}, {h:14,m:30}, {h:15,m:15} ];
    if (count === 5) return [ {h:10,m:30}, {h:11,m:30}, {h:12,m:30}, {h:13,m:30}, {h:14,m:30} ];
    if (count === 4) return [ {h:10,m:30}, {h:11,m:30}, {h:13,m:30}, {h:14,m:30} ];
    if (count === 3) return [ {h:10,m:30}, {h:12,m:30}, {h:14,m:30} ];
    if (count === 2) return [ {h:11,m:30}, {h:13,m:30} ];
    if (count === 1) return [ {h:12,m:30} ];
    return [];
  }
}
