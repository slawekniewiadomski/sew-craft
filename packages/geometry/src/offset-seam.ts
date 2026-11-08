import { documentSeams } from './document.js';
import type { Vec2 } from './vector.js';
import type { EntityId, PatternDocument, Seam, SeamSide } from './types.js';
import { seamSide } from './types.js';
import { edgePolyline } from './offset-curve.js';
import {
  findSelfIntersections,
  offsetPolyline,
  type JoinStyle,
  type OffsetOptions,
  type SelfIntersection,
} from './offset.js';

export interface SeamAllowancePath {
  edge: EntityId;
  width: number;
  /** The edge-relative side the allowance was offset to. */
  side: SeamSide;
  join: JoinStyle;
  path: Vec2[];
  selfIntersections: SelfIntersection[];
}

/**
 * The offset path for one edge's seam allowance, or `null` when the seam's edge
 * is missing, is not a line, curve or arc, or is an arc that has become
 * degenerate. Self-intersections are reported rather than hidden: a caller can
 * flag an allowance that folds over itself.
 */
export function seamAllowancePath(
  document: PatternDocument,
  seam: Seam,
  options: OffsetOptions = {},
): SeamAllowancePath | null {
  const polyline = edgePolyline(document, seam.edge);
  if (polyline === null) {
    return null;
  }

  const join = options.join ?? 'miter';
  const side = seamSide(seam);
  const distance = side === 'left' ? seam.width : -seam.width;
  const path = offsetPolyline(polyline, distance, options);
  return {
    edge: seam.edge,
    width: seam.width,
    side,
    join,
    path,
    selfIntersections: findSelfIntersections(path, { closed: options.closed ?? false }),
  };
}

/** Offset paths for every seam in the document, skipping seams with no valid edge. */
export function seamAllowancePaths(
  document: PatternDocument,
  options: OffsetOptions = {},
): SeamAllowancePath[] {
  const paths: SeamAllowancePath[] = [];
  for (const seam of documentSeams(document)) {
    const path = seamAllowancePath(document, seam, options);
    if (path !== null) {
      paths.push(path);
    }
  }
  return paths;
}
