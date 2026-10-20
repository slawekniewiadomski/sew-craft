import { describe, expect, it } from 'vitest';

import {
  allPoints,
  bounds,
  createEmptyDocument,
  cutEdges,
  entityPoints,
  getEntity,
  getSeam,
  PATTERN_SCHEMA,
  seamForEdge,
  seamSide,
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

describe('createEmptyDocument', () => {
  it('creates an empty versioned millimetre document', () => {
    const document = createEmptyDocument();

    expect(document.schema).toBe(PATTERN_SCHEMA);
    expect(document.schema).toBe('sewcraft.pattern/0.1');
    expect(document.units).toBe('mm');
    expect(document.entities).toEqual([]);
    expect(document.constraints).toEqual([]);
    expect(document.seams).toEqual([]);
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
});
