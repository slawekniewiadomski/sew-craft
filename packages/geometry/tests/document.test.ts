import { describe, expect, it } from 'vitest';

import {
  allPoints,
  bounds,
  createEmptyDocument,
  cutEdges,
  documentSeams,
  entityPoints,
  getEntity,
  getSeam,
  PATTERN_SCHEMA,
  seamForEdge,
  seamSide,
  sharedCorner,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Seam,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { construction?: boolean; fixed?: boolean } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: options.construction ?? false,
  fixed: options.fixed ?? false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const arc = (
  id: string,
  start: string,
  end: string,
  through: string,
  options: { construction?: boolean } = {},
): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  construction: options.construction ?? false,
});

const circle = (
  id: string,
  center: string,
  rim: string,
  options: { construction?: boolean } = {},
): CircleEntity => ({
  id,
  kind: 'circle',
  center,
  rim,
  construction: options.construction ?? false,
});

describe('createEmptyDocument', () => {
  it('creates an empty versioned millimetre document', () => {
    const document = createEmptyDocument();

    expect(document.schema).toBe(PATTERN_SCHEMA);
    expect(document.schema).toBe('sewcraft.pattern/0.8');
    expect(document.units).toBe('mm');
    expect(document.entities).toEqual([]);
    expect(document.constraints).toEqual([]);
    expect(document.pieces).toEqual([]);
    expect(document.assemblies).toEqual([]);
    expect(document.tabs).toEqual([]);
  });
});

describe('getEntity', () => {
  it('finds an entity by id', () => {
    const a = point('a', 0, 0);
    const document = documentOf([a]);

    expect(getEntity(document, 'a')).toBe(a);
  });

  it('returns undefined for an unknown id', () => {
    expect(getEntity(createEmptyDocument(), 'missing')).toBeUndefined();
  });
});

describe('seam helpers', () => {
  const seam: Seam = { id: 's', edge: 'l', width: 10 };
  const document: PatternDocument = { ...createEmptyDocument(), seams: [seam] };

  it('finds a seam by id', () => {
    expect(getSeam(document, 's')).toBe(seam);
    expect(getSeam(document, 'missing')).toBeUndefined();
  });

  it('finds a seam by its edge', () => {
    expect(seamForEdge(document, 'l')).toBe(seam);
    expect(seamForEdge(document, 'missing')).toBeUndefined();
  });

  it('resolves a missing side to the original left default', () => {
    expect(seamSide(seam)).toBe('left');
    expect(seamSide({ ...seam, side: 'right' })).toBe('right');
  });

  it('returns an empty list for a document without a seams field', () => {
    const withoutSeams: PatternDocument = { ...createEmptyDocument() };
    delete withoutSeams.seams;

    expect(documentSeams(withoutSeams)).toEqual([]);
  });
});

describe('allPoints', () => {
  it('returns only point entities, including construction points', () => {
    const a = point('a', 0, 0);
    const b = point('b', 1, 1, { construction: true });
    const line: LineEntity = { id: 'l', kind: 'line', start: 'a', end: 'b', construction: false };

    expect(allPoints(documentOf([a, line, b]))).toEqual([a, b]);
  });
});

describe('cutEdges', () => {
  const curve: CurveEntity = {
    id: 'c1',
    kind: 'curve',
    p0: 'a',
    p1: 'b',
    p2: 'c',
    p3: 'd',
    construction: false,
  };

  it('returns only non-construction lines and curves', () => {
    const cut: LineEntity = {
      id: 'l1',
      kind: 'line',
      start: 'a',
      end: 'b',
      construction: false,
    };
    const guide: LineEntity = {
      id: 'l2',
      kind: 'line',
      start: 'a',
      end: 'b',
      construction: true,
    };
    const document = documentOf([
      point('a', 0, 0),
      point('b', 1, 0),
      point('c', 1, 1),
      point('d', 0, 1),
      cut,
      guide,
      curve,
    ]);

    expect(cutEdges(document)).toEqual([cut, curve]);
  });

  it('returns an empty list for a document without edges', () => {
    expect(cutEdges(documentOf([point('a', 0, 0)]))).toEqual([]);
  });

  it('includes non-construction arcs and excludes construction ones', () => {
    const cut = arc('a1', 'a', 'b', 'c');
    const guide = arc('a2', 'a', 'b', 'c', { construction: true });
    const document = documentOf([
      point('a', 0, 0),
      point('b', 1, 0),
      point('c', 0.5, 1),
      cut,
      guide,
    ]);

    expect(cutEdges(document)).toEqual([cut]);
  });

  it('includes non-construction circles and excludes construction ones', () => {
    const cut = circle('c1', 'a', 'b');
    const guide = circle('c2', 'a', 'b', { construction: true });
    const document = documentOf([point('a', 0, 0), point('b', 1, 0), cut, guide]);

    expect(cutEdges(document)).toEqual([cut]);
  });
});

describe('entityPoints', () => {
  it('returns the point itself for a point entity', () => {
    const a = point('a', 2, 3);

    expect(entityPoints(documentOf([a]), a)).toEqual([a]);
  });

  it('resolves the endpoints of a line in order', () => {
    const a = point('a', 0, 0);
    const b = point('b', 4, 0);
    const line: LineEntity = { id: 'l', kind: 'line', start: 'a', end: 'b', construction: false };

    expect(entityPoints(documentOf([a, b, line]), line)).toEqual([a, b]);
  });

  it('resolves the four control points of a curve in order', () => {
    const p0 = point('p0', 0, 0);
    const p1 = point('p1', 1, 0);
    const p2 = point('p2', 2, 1);
    const p3 = point('p3', 3, 1);
    const curve: CurveEntity = {
      id: 'c',
      kind: 'curve',
      p0: 'p0',
      p1: 'p1',
      p2: 'p2',
      p3: 'p3',
      construction: false,
    };

    expect(entityPoints(documentOf([p0, p1, p2, p3, curve]), curve)).toEqual([p0, p1, p2, p3]);
  });

  it('resolves an arc as start, through, end so consumers keep the traversal order', () => {
    const start = point('s', 0, 0);
    const through = point('t', 5, 5);
    const end = point('e', 10, 0);
    const shape = arc('a1', 's', 'e', 't');

    expect(entityPoints(documentOf([start, through, end, shape]), shape)).toEqual([
      start,
      through,
      end,
    ]);
  });

  it('resolves the centre then the rim of a circle', () => {
    const center = point('c', 0, 0);
    const rim = point('r', 3, 4);
    const shape = circle('c1', 'c', 'r');

    expect(entityPoints(documentOf([center, rim, shape]), shape)).toEqual([center, rim]);
  });

  it('throws when a referenced point is missing', () => {
    const line: LineEntity = {
      id: 'l',
      kind: 'line',
      start: 'a',
      end: 'missing',
      construction: false,
    };

    expect(() => entityPoints(documentOf([line]), line)).toThrow(/unknown point/i);
  });
  it('throws when a reference points at a non-point entity', () => {
    const inner: LineEntity = { id: 'l0', kind: 'line', start: 'a', end: 'a', construction: false };
    const outer: LineEntity = {
      id: 'l1',
      kind: 'line',
      start: 'l0',
      end: 'a',
      construction: false,
    };
    const a = point('a', 0, 0);

    expect(() => entityPoints(documentOf([a, inner, outer]), outer)).toThrow(/unknown point/i);
  });
});

describe('bounds', () => {
  it('returns null for a document without points', () => {
    expect(bounds(createEmptyDocument())).toBeNull();
  });

  it('computes the min and max over all points', () => {
    const document = documentOf([point('a', -10, 5), point('b', 30, -20), point('c', 0, 0)]);

    expect(bounds(document)).toEqual({ min: { x: -10, y: -20 }, max: { x: 30, y: 5 } });
  });

  it('includes construction points', () => {
    const document = documentOf([
      point('a', 0, 0, { construction: true }),
      point('b', 10, 10, { construction: true }),
    ]);

    expect(bounds(document)).toEqual({ min: { x: 0, y: 0 }, max: { x: 10, y: 10 } });
  });

  it('returns a zero-size box for a single point', () => {
    const document = documentOf([point('a', 7, 8)]);

    expect(bounds(document)).toEqual({ min: { x: 7, y: 8 }, max: { x: 7, y: 8 } });
  });

  it('widens the box to the arc cardinal point that lies outside its three points', () => {
    const document = documentOf([
      point('s', 10 * Math.cos(0.3), 10 * Math.sin(0.3)),
      point('e', 10 * Math.cos(2.8), 10 * Math.sin(2.8)),
      point('t', 10 * Math.cos(1), 10 * Math.sin(1)),
      arc('a1', 's', 'e', 't'),
    ]);

    const box = bounds(document)!;

    // The apex (0, 10) is on the sweep but above every one of the three points.
    expect(box.min.x).toBeCloseTo(10 * Math.cos(2.8));
    expect(box.max.y).toBeCloseTo(10);
  });

  it('widens the box by the circle radius for an axis-aligned rim', () => {
    const document = documentOf([point('c', 10, 10), point('r', 10, 4), circle('c1', 'c', 'r')]);

    expect(bounds(document)).toEqual({ min: { x: 4, y: 4 }, max: { x: 16, y: 16 } });
  });

  it('widens the box by the radius for a diagonal rim', () => {
    const document = documentOf([point('c', 0, 0), point('r', 3, 4), circle('c1', 'c', 'r')]);

    expect(bounds(document)).toEqual({ min: { x: -5, y: -5 }, max: { x: 5, y: 5 } });
  });

  it('leaves the box unchanged for a degenerate or unresolvable arc', () => {
    const degenerate = documentOf([
      point('s', 0, 0),
      point('e', 10, 0),
      point('t', 5, 0),
      arc('a1', 's', 'e', 't'),
    ]);
    const missing = documentOf([point('s', 0, 0), arc('a2', 's', 'e', 't')]);
    const nonPoint = documentOf([
      point('s', 0, 0),
      { id: 'l', kind: 'line', start: 's', end: 's', construction: false },
      arc('a3', 's', 'l', 'l'),
    ]);

    expect(bounds(degenerate)).toEqual({ min: { x: 0, y: 0 }, max: { x: 10, y: 0 } });
    expect(bounds(missing)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
    expect(bounds(nonPoint)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
  });

  it('leaves the box unchanged for a degenerate or unresolvable circle', () => {
    const degenerate = documentOf([point('c', 0, 0), point('r', 0, 0), circle('c1', 'c', 'r')]);
    const missing = documentOf([point('c', 0, 0), circle('c2', 'c', 'missing')]);
    const notFinite = documentOf([
      point('c', 0, 0),
      point('r', Number.NaN, 0),
      circle('c3', 'c', 'r'),
    ]);
    const nonPoint = documentOf([
      point('c', 0, 0),
      { id: 'l', kind: 'line', start: 'c', end: 'c', construction: false },
      circle('c4', 'c', 'l'),
    ]);

    expect(bounds(degenerate)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
    expect(bounds(missing)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
    expect(bounds(notFinite)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
    expect(bounds(nonPoint)).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
  });
});

describe('entityPoints marks', () => {
  it('resolves a notch to its point and a centre line to both points', () => {
    const a = point('a', 0, 0);
    const b = point('b', 10, 0);
    const document = { ...createEmptyDocument(), entities: [a, b] };

    expect(
      entityPoints(document, {
        id: 'n',
        kind: 'mark',
        type: 'notch',
        piece: 'p',
        edge: 'e',
        point: 'a',
      }),
    ).toEqual([a]);
    expect(
      entityPoints(document, {
        id: 'c',
        kind: 'mark',
        type: 'centre_line',
        piece: 'p',
        start: 'a',
        end: 'b',
      }),
    ).toEqual([a, b]);
  });
});

describe('entityPoints text', () => {
  it('resolves a label to its anchor point', () => {
    const anchor = point('a', 1, 2);
    const document = { ...createEmptyDocument(), entities: [anchor] };
    const text = {
      id: 't',
      kind: 'text' as const,
      piece: 'p',
      anchor: 'a',
      content: 'x',
    };

    expect(entityPoints(document, text)).toEqual([anchor]);
  });

  it('throws when the anchor is missing', () => {
    const document = createEmptyDocument();
    const text = {
      id: 't',
      kind: 'text' as const,
      piece: 'p',
      anchor: 'missing',
      content: 'x',
    };

    expect(() => entityPoints(document, text)).toThrow('references unknown point: missing');
  });
});

describe('sharedCorner', () => {
  const line = (start: string, end: string): LineEntity => ({
    id: `${start}-${end}`,
    kind: 'line',
    start,
    end,
  });

  it('returns the single point two lines meet at', () => {
    expect(sharedCorner(line('a', 'b'), line('b', 'c'))).toBe('b');
    expect(sharedCorner(line('a', 'b'), line('c', 'a'))).toBe('a');
  });

  it('returns null when the lines do not meet', () => {
    expect(sharedCorner(line('a', 'b'), line('c', 'd'))).toBeNull();
  });

  it('returns null when both ends are shared, so there is no corner', () => {
    expect(sharedCorner(line('a', 'b'), line('b', 'a'))).toBeNull();
  });
});
