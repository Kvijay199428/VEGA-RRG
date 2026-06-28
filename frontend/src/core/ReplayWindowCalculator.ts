

export function formatTailSpanLabel(ms: number): string {
  if (ms <= 0) return '0m';
  
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  const parts = [];
  if (d > 0) parts.push(`${d}D`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);

  return parts.join(' ');
}
