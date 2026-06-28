export interface TimelineTick {
  index: number;
  timestamp: number;
  pixelX: number;
  label: string;
  alignment: 'start' | 'center' | 'end';
  type: 'date' | 'time';
}
