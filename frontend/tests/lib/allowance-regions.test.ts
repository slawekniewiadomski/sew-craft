import {
  createEmptyDocument,
  pieceBandRegions,
  pieceCutLoop,
  type Entity,
  type Piece,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { cutLoopContains, regionAt } from '@/lib/allowance-regions';

const entities: Entity[] = [
  { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
  { id: 'b', kind: 'point', x: 200, y: 0, construction: false, fixed: false },
  { id: 'c', kind: 'point', x: 200, y: 200, construction: false, fixed: false },
  { id: 'd', kind: 'point', x: 0, y: 200, construction: false, fixed: false },
  { id: 'ab', kind: 'line', start: 'a', end: 'b', construction: false },
  { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
  { id: 'cd', kind: 'line', start: 'c', end: 'd', construction: false },
  { id: 'da', kind: 'line', start: 'd', end: 'a', construction: false },
];

const piece: Piece = {
  id: 'p1',
  edges: ['ab', 'bc', 'cd', 'da'],
  allowances: [
    { edge: 'ab', width: 10 },
    { edge: 'bc', width: 10 },
    { edge: 'cd', width: 10 },
  ],
};

const document = { ...createEmptyDocument(), entities, pieces: [piece] };

/** A point inside a convex polygon: the average of its corners. */
const centroid = (points: readonly { x: number; y: number }[]) => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

describe('allowance regions', () => {
  it('finds the region under a point of each band', () => {
    const regions = pieceBandRegions(document, piece);

    expect(regions).toHaveLength(3);
    for (const region of regions) {
      const point = centroid(region.polygon);
      expect(regionAt(regions, point)).toBe(region);
    }
  });

  it('finds nothing inside the piece or outside the band', () => {
    const regions = pieceBandRegions(document, piece);

    expect(regionAt(regions, { x: 100, y: 100 })).toBeNull();
    expect(regionAt(regions, { x: 500, y: 500 })).toBeNull();
  });

  it('knows the cut loop', () => {
    const cut = pieceCutLoop(document, piece);
    expect(cutLoopContains(cut, { x: 100, y: 100 })).toBe(true);
    expect(cutLoopContains(cut, { x: 500, y: 500 })).toBe(false);
    expect(cutLoopContains(null, { x: 100, y: 100 })).toBe(false);
  });
});
