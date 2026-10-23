import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  normalizeDocument,
  type Entity,
  type EntityId,
  type LegacyPatternDocument,
  type LineEntity,
  type Piece,
  type PointEntity,
  type Seam,
} from '../src/index.js';

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
  construction: false,
});

const square = (prefix: string): Entity[] => [
  point(`${prefix}-a`, 0, 0),
  point(`${prefix}-b`, 100, 0),
  point(`${prefix}-c`, 100, 100),
  point(`${prefix}-d`, 0, 100),
  line(`${prefix}-bottom`, `${prefix}-a`, `${prefix}-b`),
  line(`${prefix}-right`, `${prefix}-b`, `${prefix}-c`),
  line(`${prefix}-top`, `${prefix}-c`, `${prefix}-d`),
  line(`${prefix}-left`, `${prefix}-d`, `${prefix}-a`),
];

const seamsFor = (prefix: string, width = 10): Seam[] => [
  { id: `${prefix}-s1`, edge: `${prefix}-bottom`, width },
  { id: `${prefix}-s2`, edge: `${prefix}-right`, width },
  { id: `${prefix}-s3`, edge: `${prefix}-top`, width },
  { id: `${prefix}-s4`, edge: `${prefix}-left`, width, side: 'right' },
];

const legacy = (entities: Entity[], seams: Seam[], pieces?: Piece[]): LegacyPatternDocument => {
  const document: LegacyPatternDocument = {
    schema: 'sewcraft.pattern/0.1',
    units: 'mm',
    entities,
    constraints: [],
    seams,
  };
  if (pieces !== undefined) document.pieces = pieces;
  return document;
};

const edgeIds = (piece: Piece): EntityId[] => piece.edges;

describe('normalizeDocument', () => {
  it('adopts a closed seam chain as one piece with seam allowances', () => {
    const entities = square('a');
    const migrated = normalizeDocument(legacy(entities, seamsFor('a')));

    expect(migrated.schema).toBe('sewcraft.pattern/0.2');
    expect(migrated.pieces).toHaveLength(1);

    const piece = migrated.pieces[0]!;
    expect(piece.id).toBe('piece-1');
    expect(new Set(edgeIds(piece))).toEqual(new Set(['a-bottom', 'a-right', 'a-top', 'a-left']));
    expect(piece.allowances).toHaveLength(4);
    expect(piece.allowances.every((allowance) => allowance.kind === 'seam')).toBe(true);
    expect(piece.allowances.every((allowance) => allowance.width === 10)).toBe(true);
    // The side is discarded.
    expect('side' in piece.allowances[0]!).toBe(false);

    // Every adopted seam leaves the legacy field, so nothing renders twice.
    expect(migrated.seams).toEqual([]);
  });

  it('keeps seams on an open chain on the legacy path', () => {
    const entities: Entity[] = [point('a', 0, 0), point('b', 100, 0), line('ab', 'a', 'b')];
    const seams: Seam[] = [{ id: 's1', edge: 'ab', width: 10 }];
    const migrated = normalizeDocument(legacy(entities, seams));

    expect(migrated.pieces).toEqual([]);
    expect(migrated.seams).toEqual(seams);
  });

  it('keeps a closed chain that is only partly seamed on the legacy path', () => {
    const entities = square('a');
    const seams = seamsFor('a').slice(0, 3);
    const migrated = normalizeDocument(legacy(entities, seams));

    expect(migrated.pieces).toEqual([]);
    expect(migrated.seams).toEqual(seams);
  });

  it('adopts each closed chain separately', () => {
    const entities = [...square('a'), ...square('b')];
    const seams = [...seamsFor('a'), ...seamsFor('b', 5)];
    const migrated = normalizeDocument(legacy(entities, seams));

    expect(migrated.pieces.map((piece) => piece.id)).toEqual(['piece-1', 'piece-2']);
    expect(migrated.pieces.map((piece) => piece.allowances[0]!.width)).toEqual([10, 5]);
    expect(migrated.seams).toEqual([]);
  });

  it('keeps pieces a document already has and avoids their ids', () => {
    const existing: Piece = { id: 'piece-1', edges: ['other'], allowances: [] };
    const migrated = normalizeDocument(legacy(square('a'), seamsFor('a'), [existing]));

    expect(migrated.pieces[0]).toBe(existing);
    expect(migrated.pieces[1]!.id).toBe('piece-2');
  });

  it('adds an empty piece list and a 0.2 schema to a document without seams', () => {
    const migrated = normalizeDocument(legacy(square('a'), []));

    expect(migrated.pieces).toEqual([]);
    expect(migrated.schema).toBe('sewcraft.pattern/0.2');
  });

  it('treats a document without a seams field as having none', () => {
    const source = legacy(square('a'), []);
    delete source.seams;
    const migrated = normalizeDocument(source);

    expect(migrated.pieces).toEqual([]);
    expect(migrated.seams).toEqual([]);
  });

  it('is idempotent', () => {
    const once = normalizeDocument(legacy(square('a'), seamsFor('a')));
    const twice = normalizeDocument(once);

    expect(twice).toEqual(once);
  });

  it('returns a 0.2 document untouched apart from its schema', () => {
    const piece: Piece = { id: 'p', edges: ['a'], allowances: [] };
    const current = { ...createEmptyDocument(), pieces: [piece] };

    expect(normalizeDocument(current)).toBe(current);
  });

  it('adds a piece list to a 0.2 document written without one', () => {
    const current = { ...createEmptyDocument() } as LegacyPatternDocument;
    delete current.pieces;

    const migrated = normalizeDocument(current);

    expect(migrated.schema).toBe('sewcraft.pattern/0.2');
    expect(migrated.pieces).toEqual([]);
  });

  it('drops the seams field only for adopted edges', () => {
    const entities = [...square('a'), ...square('b')];
    const seams = [...seamsFor('a'), ...seamsFor('b').slice(0, 3)];
    const migrated = normalizeDocument(legacy(entities, seams));

    expect(migrated.pieces).toHaveLength(1);
    expect(migrated.seams).toHaveLength(3);
    expect(migrated.seams.every((seam) => seam.edge.startsWith('b-'))).toBe(true);
  });
});
