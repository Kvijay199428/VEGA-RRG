export type TickFormat = 'DAY_MONTH' | 'MONTH_YEAR' | 'YEAR';

export function determineTickFormat(durationDays: number): TickFormat {
  if (durationDays <= 730) return 'DAY_MONTH';
  if (durationDays <= 3650) return 'MONTH_YEAR';
  return 'YEAR';
}

export class TimelineTickFormatter {
  static format(timestamp: number, format: TickFormat): string {
    const date = new Date(timestamp);
    
    switch (format) {
      case 'DAY_MONTH': {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${d}/${m}`;
      }
      case 'MONTH_YEAR': {
        const m = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date);
        const y = date.getFullYear();
        return `${m} ${y}`;
      }
      case 'YEAR':
        return date.getFullYear().toString();
    }
  }

  static formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
