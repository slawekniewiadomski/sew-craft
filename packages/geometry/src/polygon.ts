import type { Vec2 } from './vector.js';

/**
 * Whether a point lies inside a closed polygon, by the even-odd rule. A point
 * exactly on an edge is unspecified: callers ask about interior samples, not
 * about boundaries shared by neighbouring regions.
 */
export function pointInPolygon(points: readonly Vec2[], point: Vec2): boolean {
  let inside = false;
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index, index += 1
  ) {
    const a = points[index]!;
    const b = points[previous]!;
    if (a.y > point.y === b.y > point.y) continue;
    const crossing = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossing) inside = !inside;
  }
  return inside;
}
