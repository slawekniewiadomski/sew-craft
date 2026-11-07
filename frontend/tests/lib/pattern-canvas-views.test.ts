import {
  createEmptyDocument,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  arcViews,
  bandPieceOf,
  circleViews,
  curveViews,
  lineViews,
  pieceViewsOf,
  regionClass,
  regionViewsOf,
  seamViews,
  type RegionView,
} from '@/lib/pattern-canvas-views';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
});

const square = (): { document: PatternDocument; piece: Piece } => {
  const piece: Piece = {
    id: 'piece',
    edges: ['l1', 'l2', 'l3', 'l4'],
    allowances: [],
  };
  const document: PatternDocument = {
    ...createEmptyDocument(),
    entities: [
      point('p1', 0, 0),
      point('p2', 10, 0),
      point('p3', 10, 10),
      point('p4', 0, 10),
      line('l1', 'p1', 'p2'),
      line('l2', 'p2', 'p3'),
      line('l3', 'p3', 'p4'),
      line('l4', 'p4', 'p1'),
    ],
    pieces: [piece],
  };
  return { document, piece };
};

const mapOf = (document: PatternDocument) =>
  new Map(
    document.entities
      .filter((entity): entity is PointEntity => entity.kind === 'point')
      .map((entity) => [entity.id, entity]),
  );

describe('lineViews', () => {
  it('keeps lines whose endpoints resolve', () => {
    const { document } = square();
    const views = lineViews(document, mapOf(document));

    expect(views.map((view) => view.line.id)).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(views[0]!.start.id).toBe('p1');
    expect(views[0]!.end.id).toBe('p2');
  });

  it('skips a line whose endpoint is missing', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [point('p1', 0, 0), line('l1', 'p1', 'gone')],
    };

    expect(lineViews(document, mapOf(document))).toEqual([]);
  });
});

describe('curveViews', () => {
  it('skips a curve with a missing control point', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('p0', 0, 0),
        point('p1', 1, 1),
        { id: 'c', kind: 'curve', p0: 'p0', p1: 'p1', p2: 'gone', p3: 'gone' },
      ],
    };

    expect(curveViews(document, mapOf(document))).toEqual([]);
  });
});

describe('arcViews', () => {
  it('skips an arc whose points no longer define a circle', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 10, 0),
        point('through', 5, 0),
        { id: 'arc', kind: 'arc', start: 'a', end: 'b', through: 'through' },
      ],
    };

    expect(arcViews(document, mapOf(document))).toEqual([]);
  });

  it('draws an arc through three non-collinear points', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('a', 0, 0),
        point('b', 10, 0),
        point('through', 5, 5),
        { id: 'arc', kind: 'arc', start: 'a', end: 'b', through: 'through' },
      ],
    };

    const views = arcViews(document, mapOf(document));

    expect(views).toHaveLength(1);
    expect(views[0]!.d.startsWith('M')).toBe(true);
  });
});

describe('circleViews', () => {
  it('skips a degenerate circle and a dangling rim', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('c', 0, 0),
        point('r0', 0, 0),
        { id: 'flat', kind: 'circle', center: 'c', rim: 'r0' },
        { id: 'dangling', kind: 'circle', center: 'c', rim: 'gone' },
      ],
    };

    expect(circleViews(document, mapOf(document))).toEqual([]);
  });

  it('resolves the centre, rim and radius', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('c', 1, 2),
        point('r', 4, 6),
        { id: 'circle', kind: 'circle', center: 'c', rim: 'r' },
      ],
    };

    expect(circleViews(document, mapOf(document))[0]).toMatchObject({
      cx: 1,
      cy: 2,
      r: 5,
    });
  });
});

describe('seamViews', () => {
  it('draws nothing while allowances are hidden', () => {
    const { document } = square();

    expect(seamViews(document, false)).toEqual([]);
  });

  it('maps each standalone seam to a path', () => {
    const { document } = square();
    const withSeam: PatternDocument = {
      ...document,
      seams: [{ id: 's', edge: 'l1', width: 10, side: 'left' }],
    };

    const views = seamViews(withSeam, true);

    expect(views).toHaveLength(1);
    expect(views[0]!.edge).toBe('l1');
    expect(views[0]!.d.startsWith('M')).toBe(true);
  });
});

describe('bandPieceOf', () => {
  it('prefers the active piece and falls back to the first', () => {
    const { document } = square();

    expect(bandPieceOf(document, 'piece')?.id).toBe('piece');
    expect(bandPieceOf(document, null)?.id).toBe('piece');
    expect(bandPieceOf({ ...document, pieces: [] }, 'piece')).toBeNull();
  });
});

describe('regionViewsOf', () => {
  const region = (key: string) =>
    ({
      target: { kind: 'edge', edge: key },
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    }) as never;

  const keyOf = (target: never) => (target as { edge: string }).edge;

  it('draws nothing while allowances are hidden', () => {
    expect(
      regionViewsOf([region('l1')], {
        showAllowances: false,
        selectedTargets: [],
        hovered: null,
        bandHovered: false,
        keyOf,
      }),
    ).toEqual([]);
  });

  it('resolves selection and hover by target key', () => {
    const views = regionViewsOf([region('l1'), region('l2')], {
      showAllowances: true,
      selectedTargets: [{ kind: 'edge', edge: 'l1' }] as never,
      hovered: { kind: 'edge', edge: 'l2' } as never,
      bandHovered: true,
      keyOf,
    });

    expect(views.map((view) => [view.key, view.selected, view.hovered])).toEqual([
      ['l1', true, false],
      ['l2', false, true],
    ]);
  });
});

describe('regionClass', () => {
  const view = (selected: boolean, hovered: boolean): RegionView => ({
    key: 'k',
    d: 'M 0 0 Z',
    target: { kind: 'edge', edge: 'l1' } as never,
    selected,
    hovered,
  });

  it('fills a selected region, tints a hovered one, and outlines the rest', () => {
    expect(regionClass(view(true, false), false)).toBe('fill-primary/30 stroke-primary');
    expect(regionClass(view(false, true), false)).toBe('fill-primary/20 stroke-primary');
    expect(regionClass(view(false, false), true)).toBe('fill-transparent stroke-primary/40');
    expect(regionClass(view(false, false), false)).toBe('fill-transparent stroke-transparent');
  });
});

describe('pieceViewsOf', () => {
  it('skips a piece with no cut loop', () => {
    const { document, piece } = square();
    const broken: PatternDocument = {
      ...document,
      pieces: [{ ...piece, edges: ['l1'] as EntityId[] }],
    };

    expect(
      pieceViewsOf(broken, { showAllowances: true, selectedPieceId: null, selectedEntityIds: [] }),
    ).toEqual([]);
  });

  it('draws the loops and marks the selected piece', () => {
    const { document } = square();
    const views = pieceViewsOf(document, {
      showAllowances: true,
      selectedPieceId: 'piece',
      selectedEntityIds: [],
    });

    expect(views).toHaveLength(1);
    expect(views[0]!.cut).toContain('Z');
    expect(views[0]!.band).not.toBeNull();
    expect(views[0]!.selected).toBe(true);
  });

  it('leaves the band empty while allowances are hidden', () => {
    const { document } = square();
    const views = pieceViewsOf(document, {
      showAllowances: false,
      selectedPieceId: null,
      selectedEntityIds: ['l2'],
    });

    expect(views[0]!.band).toBeNull();
    expect(views[0]!.selected).toBe(true);
  });
});
