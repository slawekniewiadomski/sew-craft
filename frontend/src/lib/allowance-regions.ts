import { pointInPolygon, type BandRegion, type PieceCutLoop, type Vec2 } from '@sewcraft/geometry';

/**
 * The region under a world point, or `null` where the band has none. Regions are
 * checked in walk order, so an overlap resolves deterministically.
 */
export function regionAt(regions: readonly BandRegion[], point: Vec2): BandRegion | null {
  return regions.find((region) => pointInPolygon(region.polygon, point)) ?? null;
}

/** Whether a world point is inside a piece's cut loop, where its band is shown. */
export function cutLoopContains(cut: PieceCutLoop | null, point: Vec2): boolean {
  return cut !== null && pointInPolygon(cut.points, point);
}
