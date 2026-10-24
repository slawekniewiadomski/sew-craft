import {
  createEmptyDocument,
  type CircleEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  cutAnchorPreviewPosition,
  cutEdgeCandidateFor,
  cutGhostFor,
  cutLoopCandidateFor,
  cutPointCandidateFor,
  dimensionCandidateFor,
  dimensionGhostFor,
  dimensionPickFor,
  isDimensionPick,
  pickPreviewPosition,
  pickPreviewTick,
  sameDimensionPick,
  type DimensionPick,
} from './dimension-feedback';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

const squarePiece: Piece = { id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] };

function doc(entities: Entity[], pieces: Piece[] = [squarePiece]): PatternDocument {
  return { ...createEmptyDocument(), entities, pieces };
}

const squareDoc = doc([
  pt('a', 0, 0),
  pt('b', 100, 0),
  pt('c', 100, 100),
  pt('d', 0, 100),
  pt('e', 200, 0),
  pt('f', 300, 0),
  ln('ab', 'a', 'b'),
  ln('bc', 'b', 'c'),
  ln('cd', 'c', 'd'),
  ln('da', 'd', 'a'),
  ln('ef', 'e', 'f'),
  ln('on', 'a', 'b'),
  ln('degenerate', 'a', 'a'),
  ln('dangling', 'a', 'missing'),
  {
    id: 'curve',
    kind: 'curve',
    p0: 'a',
    p1: 'b',
    p2: 'c',
    p3: 'd',
    construction: false,
  },
]);

const pointA: DimensionPick = { id: 'a', kind: 'point' };
const lineAb: DimensionPick = { id: 'ab', kind: 'line' };

describe('dimensionPickFor', () => {
  it('resolves points and straight lines and rejects everything else', () => {
    expect(dimensionPickFor(squareDoc, null)).toBeNull();
    expect(dimensionPickFor(squareDoc, { id: 'missing', kind: 'point' })).toBeNull();
    expect(dimensionPickFor(squareDoc, { id: 'a', kind: 'line' })).toEqual({
      id: 'a',
      kind: 'point',
    });
    expect(dimensionPickFor(squareDoc, { id: 'ab', kind: 'point' })).toEqual({
      id: 'ab',
      kind: 'line',
    });
    expect(dimensionPickFor(squareDoc, { id: 'degenerate', kind: 'line' })).toBeNull();
    expect(dimensionPickFor(squareDoc, { id: 'dangling', kind: 'line' })).toBeNull();

    const withCurve = doc([
      ...squareDoc.entities,
      {
        id: 'curve',
        kind: 'curve',
        p0: 'a',
        p1: 'b',
        p2: 'c',
        p3: 'd',
        construction: false,
      },
    ]);
    expect(dimensionPickFor(withCurve, { id: 'curve', kind: 'curve' })).toBeNull();
  });

  it('tells whether a hit is an eligible Dimension pick', () => {
    expect(isDimensionPick(squareDoc, { id: 'a', kind: 'point' })).toBe(true);
    expect(isDimensionPick(squareDoc, { id: 'curve', kind: 'curve' })).toBe(false);
  });
});

describe('sameDimensionPick', () => {
  it('compares both id and kind', () => {
    expect(sameDimensionPick(pointA, { id: 'a', kind: 'point' })).toBe(true);
    expect(sameDimensionPick(pointA, { id: 'a', kind: 'line' })).toBe(false);
    expect(sameDimensionPick(pointA, lineAb)).toBe(false);
  });
});

describe('dimensionCandidateFor', () => {
  it('offers any eligible anchor before the first pick', () => {
    expect(dimensionCandidateFor(squareDoc, null, null)).toBeNull();
    expect(dimensionCandidateFor(squareDoc, { id: 'a', kind: 'point' }, null)).toEqual(pointA);
    expect(dimensionCandidateFor(squareDoc, { id: 'curve', kind: 'curve' }, null)).toBeNull();
  });

  it('rejects the same anchor and pairs the shared rules refuse', () => {
    expect(dimensionCandidateFor(squareDoc, { id: 'a', kind: 'point' }, pointA)).toBeNull();
    expect(dimensionCandidateFor(squareDoc, { id: 'on', kind: 'line' }, pointA)).toBeNull();
    expect(dimensionCandidateFor(squareDoc, { id: 'bc', kind: 'line' }, pointA)).toEqual({
      id: 'bc',
      kind: 'line',
    });
  });
});

describe('pickPreviewPosition', () => {
  it('uses a point coordinate, a line midpoint, or null when stale', () => {
    expect(pickPreviewPosition(squareDoc, null)).toBeNull();
    expect(pickPreviewPosition(squareDoc, { id: 'missing', kind: 'point' })).toBeNull();
    expect(pickPreviewPosition(squareDoc, pointA)).toEqual({ x: 0, y: 0 });
    expect(pickPreviewPosition(squareDoc, lineAb)).toEqual({ x: 50, y: 0 });
    expect(pickPreviewPosition(squareDoc, { id: 'curve', kind: 'line' })).toBeNull();
    expect(pickPreviewPosition(squareDoc, { id: 'dangling', kind: 'line' })).toBeNull();
  });
});

describe('pickPreviewTick', () => {
  it('draws a perpendicular tick at a line midpoint', () => {
    expect(pickPreviewTick(squareDoc, null)).toBeNull();
    expect(pickPreviewTick(squareDoc, pointA)).toBeNull();
    expect(pickPreviewTick(squareDoc, lineAb)).toEqual({
      start: { x: 50, y: -3 },
      end: { x: 50, y: 3 },
    });
    expect(pickPreviewTick(squareDoc, { id: 'degenerate', kind: 'line' })).toBeNull();
    expect(pickPreviewTick(squareDoc, { id: 'dangling', kind: 'line' })).toBeNull();
  });
});

describe('dimensionGhostFor', () => {
  it('needs a first pick and a pointer position', () => {
    expect(dimensionGhostFor(squareDoc, null, null, { x: 1, y: 1 })).toBeNull();
    expect(dimensionGhostFor(squareDoc, pointA, null, null)).toBeNull();
    expect(
      dimensionGhostFor(squareDoc, { id: 'dangling', kind: 'line' }, null, { x: 1, y: 1 }),
    ).toBeNull();
  });

  it('follows the raw pointer or snaps to a resolved candidate', () => {
    expect(dimensionGhostFor(squareDoc, lineAb, null, { x: 200, y: 50 })).toEqual({
      from: { x: 50, y: 0 },
      to: { x: 200, y: 50 },
      snapped: false,
    });
    expect(
      dimensionGhostFor(squareDoc, pointA, { id: 'c', kind: 'point' }, { x: 200, y: 50 }),
    ).toEqual({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, snapped: true });
    expect(
      dimensionGhostFor(squareDoc, pointA, { id: 'dangling', kind: 'line' }, { x: 1, y: 1 }),
    ).toBeNull();
  });
});

describe('cutPointCandidateFor', () => {
  it('needs a hit on a piece corner', () => {
    expect(cutPointCandidateFor(squareDoc, null, null)).toBeNull();
    expect(cutPointCandidateFor(squareDoc, { id: 'e', kind: 'point' }, null)).toBeNull();
    expect(cutPointCandidateFor(squareDoc, { id: 'missing', kind: 'point' }, null)).toBeNull();
  });

  it('offers any corner before the first pick and same-piece corners after it', () => {
    expect(cutPointCandidateFor(squareDoc, { id: 'b', kind: 'point' }, null)).toEqual({
      piece: squarePiece,
      anchor: { edge: 'ab', at: 'end' },
      pointId: 'b',
    });

    const pending = {
      piece: squarePiece,
      anchor: { edge: 'ab', at: 'end' as const },
    };
    expect(cutPointCandidateFor(squareDoc, { id: 'c', kind: 'point' }, pending)).toEqual({
      piece: squarePiece,
      anchor: { edge: 'bc', at: 'end' },
      pointId: 'c',
    });
    expect(cutPointCandidateFor(squareDoc, { id: 'b', kind: 'point' }, pending)).toBeNull();
    expect(cutPointCandidateFor(squareDoc, { id: 'e', kind: 'point' }, pending)).toBeNull();
  });
});

describe('cutLoopCandidateFor', () => {
  it('keeps a derived corner only when the pending pick accepts it', () => {
    const handle = {
      key: 'cut-p1-bc-end',
      piece: squarePiece,
      anchor: { edge: 'bc', at: 'end' as const },
    };
    expect(cutLoopCandidateFor(squareDoc, handle, null)).toEqual({
      ...handle,
      pointId: null,
    });

    const pending = { piece: squarePiece, anchor: { edge: 'ab', at: 'end' as const } };
    expect(cutLoopCandidateFor(squareDoc, handle, pending)).toEqual({
      ...handle,
      pointId: null,
    });
    expect(
      cutLoopCandidateFor(squareDoc, { ...handle, anchor: { edge: 'ab', at: 'end' } }, pending),
    ).toBeNull();
    expect(
      cutLoopCandidateFor(
        squareDoc,
        {
          ...handle,
          piece: { id: 'p2', edges: ['ef'], allowances: [] },
          anchor: { edge: 'ef', at: 'start' },
        },
        pending,
      ),
    ).toBeNull();
  });
});

describe('cutEdgeCandidateFor', () => {
  it('accepts a piece edge and rejects everything else', () => {
    expect(cutEdgeCandidateFor(squareDoc, null)).toBeNull();
    expect(cutEdgeCandidateFor(squareDoc, { id: 'missing', kind: 'line' })).toBeNull();
    expect(cutEdgeCandidateFor(squareDoc, { id: 'ab', kind: 'line' })).toEqual({
      piece: squarePiece,
      edge: 'ab',
    });

    const circle: CircleEntity = {
      id: 'k',
      kind: 'circle',
      center: 'a',
      rim: 'b',
      construction: false,
    };
    const withCircle = doc(
      [...squareDoc.entities, circle],
      [{ id: 'p1', edges: ['ab', 'k'], allowances: [] }],
    );
    expect(cutEdgeCandidateFor(withCircle, { id: 'k', kind: 'circle' })).toBeNull();
  });
});

describe('cutAnchorPreviewPosition', () => {
  it('resolves a cut-loop vertex or returns null', () => {
    expect(cutAnchorPreviewPosition(squareDoc, squarePiece, { edge: 'ab', at: 'start' })).toEqual({
      x: 0,
      y: 0,
    });
    expect(cutAnchorPreviewPosition(squareDoc, squarePiece, { edge: 'ab', at: 'end' })).toEqual({
      x: 100,
      y: 0,
    });
    expect(
      cutAnchorPreviewPosition(squareDoc, squarePiece, {
        edge: 'ab',
        at: 'start',
        loop: 'stitch',
      }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      cutAnchorPreviewPosition(squareDoc, squarePiece, { edge: 'missing', at: 'start' }),
    ).toBeNull();
  });
});

describe('cutGhostFor', () => {
  it('needs a pending corner and a pointer position', () => {
    expect(cutGhostFor(squareDoc, null, null, { x: 1, y: 1 })).toBeNull();
    expect(
      cutGhostFor(squareDoc, { piece: squarePiece, anchor: { edge: 'ab', at: 'end' } }, null, null),
    ).toBeNull();
    expect(
      cutGhostFor(
        squareDoc,
        { piece: squarePiece, anchor: { edge: 'missing', at: 'start' } },
        null,
        { x: 1, y: 1 },
      ),
    ).toBeNull();
  });

  it('follows the raw pointer or snaps to a same-piece corner', () => {
    const pending = { piece: squarePiece, anchor: { edge: 'ab', at: 'end' as const } };
    expect(cutGhostFor(squareDoc, pending, null, { x: 200, y: 50 })).toEqual({
      from: { x: 100, y: 0 },
      to: { x: 200, y: 50 },
      snapped: false,
    });
    expect(
      cutGhostFor(
        squareDoc,
        pending,
        { piece: squarePiece, anchor: { edge: 'bc', at: 'end' }, pointId: 'c' },
        { x: 200, y: 50 },
      ),
    ).toEqual({ from: { x: 100, y: 0 }, to: { x: 100, y: 100 }, snapped: true });
    expect(
      cutGhostFor(
        squareDoc,
        pending,
        { piece: squarePiece, anchor: { edge: 'missing', at: 'end' }, pointId: 'c' },
        { x: 1, y: 1 },
      ),
    ).toBeNull();
  });
});
