export const bloomberg = {
  bg: { primary: '#000000', secondary: '#050505', panel: '#0B0B0B', command: '#111111' },
  border: { primary: '#1F1F1F', grid: '#1E1E1E', gridMajor: '#2A2A2A' },
  text: { primary: '#E0E0E0', secondary: '#909090', muted: '#606060', label: '#707070' },
  accent: { orange: '#FF9900', orangeDim: 'rgba(255,153,0,0.3)' },
  quadrant: {
    leading: { bg: '#0D5C2A', text: '#2ECC71' },
    weakening: { bg: '#8A7A00', text: '#F1C40F' },
    lagging: { bg: '#5A120F', text: '#E74C3C' },
    improving: { bg: '#0B3D5A', text: '#3498DB' },
  },
  axis: { center: '#707070' },
} as const;

export type Theme = typeof bloomberg;
export type Quadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';

export function getQuadrantColor(q: Quadrant) {
  const map = { LEADING: bloomberg.quadrant.leading, WEAKENING: bloomberg.quadrant.weakening, LAGGING: bloomberg.quadrant.lagging, IMPROVING: bloomberg.quadrant.improving };
  return map[q];
}
