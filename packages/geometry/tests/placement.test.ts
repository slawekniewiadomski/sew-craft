import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  assignMissingPlacements,
  createEmptyDocument,
  documentForSketch,
  nextPiecePlacement,
  PIECE_PLACEMENT_GAP,
  pieceLocalBounds,
  piecePlacement,
  pieceWorldBounds,
  type Command,
  type Entity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece?: string): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  ...(piece === undefined ? {} : { piece }),
  fixed: false,
});

const line = (id: string, start: string, end: string, piece?: string): Entity => ({
  id,
  kind: 'line',
  start,
  end,
  ...(piece === undefined ? {} : { piece }),
});

const square = (suffix = '', piece = 'p1'): Entity[] => [
  point(`${suffix}a`, 0, 0, piece),
  point(`${suffix}b`, 100, 0, piece),
  point(`${suffix}c`, 100, 80, piece),
  point(`${suffix}d`, 0, 80, piece),
  line(`${suffix}bottom`, `${suffix}a`, `${suffix}b`, piece),
  line(`${suffix}right`, `${suffix}b`, `${suffix}c`, piece),
  line(`${suffix}top`, `${suffix}c`, `${suffix}d`, piece),
  line(`${suffix}left`, `${suffix}d`, `${suffix}a`, piece),
];

const piece = (id = 'p1', placement?: { x: number; y: number }): Piece => ({
  id,
  edges: [],
  allowances: [],
  ...(placement === undefined ? {} : { placement }),
});

const documentOf = (entities: Entity[], pieces: Piece[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
  pieces,
});

const apply = (document: PatternDocument, command: Command): PatternDocument =>
  applyCommand(document, command).document;

const place = (id: string, x: number, y: number): Command => ({
  id: `place-${id}`,
  type: 'place_piece',
  params: { id, x, y },
});

describe('piece placement', () => {
  it('reads a missing placement as the origin', () => {
    expect(piecePlacement(documentOf([], [piece()]), 'p1')).toEqual({ x: 0, y: 0 });
    expect(piecePlacement(documentOf([], [piece()]), 'gone')).toEqual({ x: 0, y: 0 });
  });

  it('reads a stored placement', () => {
    expect(piecePlacement(documentOf([], [piece('p1', { x: 12, y: -4 })]), 'p1')).toEqual({
      x: 12,
      y: -4,
    });
  });

  it('measures a piece in its own coordinates and in the sketch space', () => {
    const document = documentOf(square(), [piece('p1', { x: 300, y: 40 })]);

    expect(pieceLocalBounds(document, 'p1')).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 100, y: 80 },
    });
    expect(pieceWorldBounds(document, 'p1')).toEqual({
      min: { x: 300, y: 40 },
      max: { x: 400, y: 120 },
    });
  });

  it('has no bounds for a piece that never drew', () => {
    expect(pieceLocalBounds(documentOf([], [piece()]), 'p1')).toBeNull();
    expect(pieceWorldBounds(documentOf([], [piece()]), 'p1')).toBeNull();
  });

  it('places the next piece to the right of everything drawn', () => {
    expect(nextPiecePlacement(createEmptyDocument())).toEqual({ x: 0, y: 0 });

    const document = documentOf(square(), [piece('p1', { x: 10, y: 5 })]);
    expect(nextPiecePlacement(document)).toEqual({ x: 110 + PIECE_PLACEMENT_GAP, y: 5 });
  });
});

describe('assignMissingPlacements', () => {
  it('keeps a document whose pieces are all placed', () => {
    const document = documentOf(square(), [piece('p1', { x: 0, y: 0 })]);
    expect(assignMissingPlacements(document)).toBe(document);
  });

  it('packs unplaced pieces after the placed ones in order', () => {
    const document = documentOf(
      [...square('a', 'p1'), ...square('b', 'p2')],
      [piece('p1', { x: 200, y: 10 }), piece('p2'), piece('p3')],
    );

    const placed = assignMissingPlacements(document);

    expect(placed.pieces[0]!.placement).toEqual({ x: 200, y: 10 });
    expect(placed.pieces[1]!.placement).toEqual({
      x: 300 + PIECE_PLACEMENT_GAP,
      y: 10,
    });
    // p3 never drew, so it takes the fallback width before the next gap.
    expect(placed.pieces[2]!.placement).toEqual({
      x: 300 + PIECE_PLACEMENT_GAP + 100 + PIECE_PLACEMENT_GAP,
      y: 10,
    });
  });

  it('starts a fully unplaced document at the origin', () => {
    const document = documentOf(square(), [piece('p1'), piece('p2')]);
    const placed = assignMissingPlacements(document);

    expect(placed.pieces[0]!.placement).toEqual({ x: 0, y: 0 });
    expect(placed.pieces[1]!.placement).toEqual({ x: 100 + PIECE_PLACEMENT_GAP, y: 0 });
  });
});

describe('documentForSketch', () => {
  it('translates every owned point by its piece placement', () => {
    const document = documentOf(square(), [piece('p1', { x: 300, y: 40 })]);
    const sketch = documentForSketch(document);

    expect(sketch.entities[0]).toMatchObject({ id: 'a', x: 300, y: 40 });
    expect(sketch.entities[2]).toMatchObject({ id: 'c', x: 400, y: 120 });
    expect(document.entities[0]).toMatchObject({ id: 'a', x: 0, y: 0 });
    expect(sketch.assemblies).toEqual([]);
  });

  it('keeps points of a piece at the origin unchanged', () => {
    const document = documentOf(square(), [piece('p1', { x: 0, y: 0 })]);
    expect(documentForSketch(document).entities).toEqual(document.entities);
  });

  it('attributes an untagged point to the piece that references it', () => {
    const document = documentOf(
      [point('a', 0, 0, 'p1'), point('b', 100, 0), line('bottom', 'a', 'b', 'p1')],
      [piece('p1', { x: 10, y: 20 })],
    );

    const sketch = documentForSketch(document);

    expect(sketch.entities[1]).toMatchObject({ id: 'b', x: 110, y: 20 });
  });

  it('attributes geometry through a loop edge and leaves unowned points alone', () => {
    const unowned = point('loose', 5, 5);
    const document = documentOf(
      [point('a', 0, 0, 'p1'), point('b', 100, 0, 'p1'), line('bottom', 'a', 'b'), unowned],
      [{ ...piece('p1', { x: 10, y: 20 }), edges: ['bottom'] }],
    );

    const sketch = documentForSketch(document);

    expect(sketch.entities[0]).toMatchObject({ id: 'a', x: 10, y: 20 });
    expect(sketch.entities[3]).toEqual(unowned);
  });
});

describe('place_piece command', () => {
  it('moves a piece and returns the opposite command', () => {
    const document = documentOf(square(), [piece('p1', { x: 10, y: 10 })]);
    const result = applyCommand(document, place('p1', 400, 25));

    expect(result.document.pieces[0]!.placement).toEqual({ x: 400, y: 25 });
    expect(result.inverse).toEqual({
      id: 'place-p1',
      type: 'place_piece',
      params: { id: 'p1', x: 10, y: 10 },
    });
  });

  it('treats a missing placement as the origin when inverting', () => {
    const document = documentOf(square(), [piece('p1')]);
    const result = applyCommand(document, place('p1', 40, 60));

    expect(result.inverse).toEqual({
      id: 'place-p1',
      type: 'place_piece',
      params: { id: 'p1', x: 0, y: 0 },
    });
  });

  it('is a no-op when the placement does not change', () => {
    const document = documentOf(square(), [piece('p1', { x: 40, y: 60 })]);
    const result = applyCommand(document, place('p1', 40, 60));

    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('rejects an unknown piece', () => {
    expect(() => apply(createEmptyDocument(), place('gone', 0, 0))).toThrow('unknown piece: gone');
  });

  it('rejects a non-finite position', () => {
    const document = documentOf(square(), [piece('p1')]);

    expect(() => apply(document, place('p1', Number.NaN, 0))).toThrow(
      'x and y must be finite numbers',
    );
    expect(() => apply(document, place('p1', 0, Number.POSITIVE_INFINITY))).toThrow(
      'x and y must be finite numbers',
    );
  });

  it('places a new piece after existing geometry', () => {
    const document = documentOf(square(), [piece('p1')]);
    const result = apply(document, {
      id: 'p2',
      type: 'create_piece',
      params: { name: 'Sleeve' },
    });

    expect(result.pieces[1]!.placement).toEqual({ x: 100 + PIECE_PLACEMENT_GAP, y: 0 });
  });
});
