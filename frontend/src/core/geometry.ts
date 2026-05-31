
export interface LabelRect { id: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; }

export function resolveScreenSpaceCollisions(labels: any[], maxOffset: number = 18): any[] {
  const MAX_ITERATIONS = 3;
  const resolved = labels.map(l => ({ ...l }));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const a = resolved[i];
        const b = resolved[j];
        if (
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + a.height &&
          a.y + a.height > b.y
        ) {
          const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
          const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
          
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) { b.x += 2; a.x -= 2; }
            else { b.x -= 2; a.x += 2; }
          } else {
            if (dy > 0) { b.y += 2; a.y -= 2; }
            else { b.y -= 2; a.y += 2; }
          }

          a.x = Math.max(a.anchorX - maxOffset, Math.min(a.anchorX + maxOffset, a.x));
          a.y = Math.max(a.anchorY - maxOffset, Math.min(a.anchorY + maxOffset, a.y));
          b.x = Math.max(b.anchorX - maxOffset, Math.min(b.anchorX + maxOffset, b.x));
          b.y = Math.max(b.anchorY - maxOffset, Math.min(b.anchorY + maxOffset, b.y));

          a.x = Math.round(a.x);
          a.y = Math.round(a.y);
          b.x = Math.round(b.x);
          b.y = Math.round(b.y);

          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return resolved;
}

function lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;

  const intersects = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, p4x: number, p4y: number) => {
    const d = (p4y - p3y) * (p2x - p1x) - (p4x - p3x) * (p2y - p1y);
    if (d === 0) return false;
    const uA = ((p4x - p3x) * (p1y - p3y) - (p4y - p3y) * (p1x - p3x)) / d;
    const uB = ((p2x - p1x) * (p1y - p3y) - (p2y - p1y) * (p1x - p3x)) / d;
    return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1;
  };

  if (intersects(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  if (intersects(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)) return true;
  if (intersects(x1, y1, x2, y2, rx, ry, rx, ry + rh)) return true;
  if (intersects(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;

  return false;
}

export function smartLabelPlacement(labels: any[]): any[] {
  labels.sort((a, b) => b.priority - a.priority);
  const placed: any[] = [];
  
  const allTrailSegments: any[] = [];
  for (const lbl of labels) {
    if (lbl.trailSegments) {
      allTrailSegments.push(...lbl.trailSegments);
    }
  }

  const getOverlapArea = (boxA: any, boxB: any) => {
    const dx = Math.max(0, Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x));
    const dy = Math.max(0, Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y));
    return dx * dy;
  };

  const getCollisionScore = (box: any) => {
    let score = 0;
    for (const p of placed) {
      score += getOverlapArea(box, p) * 10; // Heavy penalty for text overlap
    }
    for (const seg of allTrailSegments) {
      if (lineIntersectsRect(seg.x1, seg.y1, seg.x2, seg.y2, box.x, box.y, box.width, box.height)) {
        score += 50; // Moderate penalty for intersecting a trail line
      }
    }
    return score;
  };

  for (const lbl of labels) {
    const { cx, cy, width, height } = lbl;

    const candidates = [
      { x: cx + 6, y: cy - height / 2 },          // Right
      { x: cx - width / 2, y: cy + 6 },           // Bottom
      { x: cx - width / 2, y: cy - height - 6 },  // Top
      { x: cx - width - 6, y: cy - height / 2 }   // Left
    ];

    let bestPos = candidates[0];
    let minOverlap = Infinity;

    for (const pos of candidates) {
      const testBox = { x: pos.x, y: pos.y, width, height };
      const overlap = getCollisionScore(testBox);
      
      if (overlap === 0) {
        bestPos = pos;
        minOverlap = 0;
        break; 
      }
      
      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestPos = pos;
      }
    }

    lbl.x = bestPos.x;
    lbl.y = bestPos.y;
    lbl.anchorX = bestPos.x;
    lbl.anchorY = bestPos.y;
    placed.push(lbl);
  }

  return resolveScreenSpaceCollisions(placed, 8);
}

export function findNearestPoint(points: { x: number; y: number; id: string }[], mx: number, my: number, maxDistance: number = 20): string | null {
  let nearest: string | null = null;
  let minDist = maxDistance * maxDistance;
  for (const p of points) {
    const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = p.id;
    }
  }
  return nearest;
}
