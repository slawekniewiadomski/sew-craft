/**
 * Polyline resolution used when flattening a curved edge — a cubic curve or an
 * arc — for offsetting, seam allowances and hit-testing. Shared so every curved
 * edge tessellates the same way, whatever its kind.
 */
export const FLATTEN_SEGMENTS = 16;
