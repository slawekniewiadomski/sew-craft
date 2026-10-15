import type { Vec2 } from '@sewcraft/geometry';

/** Serialize a cubic Bézier's four control points to an SVG path `d`. */
export function curvePath(points: [Vec2, Vec2, Vec2, Vec2]): string {
  const [p0, p1, p2, p3] = points;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

/** Serialize a polyline's vertices to an open SVG path `d` (straight segments). */
export function polylinePath(points: Vec2[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first!.x} ${first!.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}
