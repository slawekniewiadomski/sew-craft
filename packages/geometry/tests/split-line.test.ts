import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  CommandValidationError,
  cornerRounds,
  createEmptyDocument,
  executeCommand,
  getConstraint,
  type Command,
  type Constraint,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { piece?: string; role?: 'construction' | 'annotation' } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: options.role === 'construction',
  fixed: false,
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  ...(options.role === undefined ? {} : { role: options.role }),
});

const line = (
  id: string,
  start: string,
  end: string,
  options: { piece?: string; role?: 'construction' | 'annotation' } = {},
): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: options.role === 'construction',
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  ...(options.role === undefined ? {} : { role: options.role }),
});

const split = (pointId = 'm', lineId = 'bottom', id = 'split-1'): Command => ({
  id,
  type: 'split_line',
  params: { line: lineId, point: pointId },
});

/** A 200 mm square piece with a 10 mm allowance on every edge. */
function square(): PatternDocument {
  return {
    ...createEmptyDocument(),
    entities: [
      point('c1', 0, 0, { piece: 'p1' }),
      point('c2', 200, 0, { piece: 'p1' }),
      point('c3', 200, 200, { piece: 'p1' }),
      point('c4', 0, 200, { piece: 'p1' }),
      point('m', 100, 0, { piece: 'p1' }),
      line('bottom', 'c1', 'c2', { piece: 'p1' }),
      line('right', 'c2', 'c3', { piece: 'p1' }),
      line('top', 'c3', 'c4', { piece: 'p1' }),
      line('left', 'c4', 'c1', { piece: 'p1' }),
    ],
    pieces: [
      {
        id: 'p1',
        edges: ['bottom', 'right', 'top', 'left'],
        allowances: [
          { edge: 'bottom', width: 10 },
          { edge: 'right', width: 10 },
          { edge: 'top', width: 10 },
          { edge: 'left', width: 10 },
        ],
      },
    ],
  };
}

function entity(document: PatternDocument, id: string): Entity {
  return document.entities.find((candidate) => candidate.id === id)!;
}

function piece(document: PatternDocument, id = 'p1'): Piece {
  return document.pieces.find((candidate) => candidate.id === id)!;
}

describe('split_line', () => {
  it('keeps the original id as the first half and shares the split point', () => {
    const document = square();
    const result = applyCommand(document, split());

    expect(result.inverse).toBeNull();
    expect(entity(result.document, 'bottom')).toMatchObject({ start: 'c1', end: 'm' });
    expect(entity(result.document, 'split-1')).toMatchObject({
      kind: 'line',
      start: 'm',
      end: 'c2',
      piece: 'p1',
    });
    expect(result.document.entities.filter((candidate) => candidate.kind === 'line')).toHaveLength(
      5,
    );
  });

  it('inserts the new half after the original and copies its allowance', () => {
    const result = applyCommand(square(), split());
    const p1 = piece(result.document);

    expect(p1.edges).toEqual(['bottom', 'split-1', 'right', 'top', 'left']);
    expect(p1.allowances).toContainEqual({ edge: 'split-1', width: 10 });
  });

  it('inserts the new half without inventing an allowance', () => {
    const document = square();
    document.pieces = [{ ...piece(document), allowances: [] }];
    const result = applyCommand(document, split());

    expect(piece(result.document).edges).toEqual(['bottom', 'split-1', 'right', 'top', 'left']);
    expect(piece(result.document).allowances).toEqual([]);
  });

  it('copies role and construction onto both halves', () => {
    const document = square();
    document.entities = document.entities.map((candidate) =>
      candidate.id === 'bottom'
        ? { ...candidate, role: 'construction', construction: true }
        : candidate,
    );

    const result = applyCommand(document, split());

    expect(entity(result.document, 'bottom')).toMatchObject({
      role: 'construction',
      construction: true,
    });
    expect(entity(result.document, 'split-1')).toMatchObject({
      role: 'construction',
      construction: true,
    });
  });

  it('splits a line that belongs to no piece', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [point('a', 0, 0), point('b', 100, 0), point('m', 40, 0), line('l', 'a', 'b')],
    };
    const result = applyCommand(document, split('m', 'l'));

    expect(result.document.pieces).toEqual([]);
    expect(entity(result.document, 'l')).toMatchObject({ start: 'a', end: 'm' });
    expect(entity(result.document, 'split-1')).toMatchObject({ start: 'm', end: 'b' });
  });

  it('leaves unrelated pieces and lines alone', () => {
    const document = square();
    document.entities.push(
      point('g1', 300, 0, { piece: 'p2' }),
      point('g2', 400, 0, { piece: 'p2' }),
      point('gm', 350, 0, { piece: 'p2' }),
      line('guide', 'g1', 'g2', { piece: 'p2' }),
    );
    document.pieces.push({ id: 'p2', edges: ['guide'], allowances: [] });

    const result = applyCommand(document, split());

    expect(piece(result.document, 'p1').edges).toEqual([
      'bottom',
      'split-1',
      'right',
      'top',
      'left',
    ]);
    expect(piece(result.document, 'p2').edges).toEqual(['guide']);
  });

  it('is a no-op when the command was already applied', () => {
    const first = applyCommand(square(), split());
    const second = applyCommand(first.document, split());

    expect(second.document).toBe(first.document);
    expect(second.inverse).toBeNull();
  });

  it('copies a legacy seam onto the new half', () => {
    const document: PatternDocument = {
      ...square(),
      seams: [{ id: 's1', edge: 'bottom', width: 4 }],
    };
    const result = applyCommand(document, split());

    expect(result.document.seams).toContainEqual({ id: 'split-1:seam', edge: 'split-1', width: 4 });
  });

  it('leaves an existing seam list untouched when the line has no seam', () => {
    const seams = [{ id: 's1', edge: 'right', width: 4 }];
    const document: PatternDocument = { ...square(), seams };
    const result = applyCommand(document, split());

    expect(result.document.seams).toEqual(seams);
  });

  it('keeps the round at the original start and moves the round at the original end', () => {
    const rounded = applyCommand(
      applyCommand(square(), {
        id: 'r1',
        type: 'add_corner_round',
        params: { first: 'bottom', second: 'left', radius: 10 },
      }).document,
      {
        id: 'r2',
        type: 'add_corner_round',
        params: { first: 'bottom', second: 'right', radius: 10 },
      },
    ).document;

    const result = executeCommand(rounded, split('m')).document;
    const [first, second] = cornerRounds(result);

    expect(first!.ends[0]).toMatchObject({ line: 'bottom', tangent: 'r1:a' });
    expect(second!.ends[0]).toMatchObject({ line: 'split-1', tangent: 'r2:a' });
    expect(entity(result, 'bottom')).toMatchObject({ start: 'r1:a', end: 'm' });
    expect(entity(result, 'split-1')).toMatchObject({ start: 'm', end: 'r2:a' });
  });

  it('moves a notch to the half that contains its point', () => {
    const document = square();
    document.entities.push(
      point('near-start', 50, 0, { piece: 'p1' }),
      point('near-end', 150, 0, { piece: 'p1' }),
      { id: 'n-start', kind: 'mark', type: 'notch', edge: 'bottom', point: 'near-start' },
      { id: 'n-end', kind: 'mark', type: 'notch', edge: 'bottom', point: 'near-end' },
      { id: 'n-right', kind: 'mark', type: 'notch', edge: 'right', point: 'c2' },
      { id: 'n-missing', kind: 'mark', type: 'notch', edge: 'bottom', point: 'missing' },
      { id: 'n-line', kind: 'mark', type: 'notch', edge: 'bottom', point: 'top' },
    );

    const result = applyCommand(document, split());

    expect(entity(result.document, 'n-start')).toMatchObject({ edge: 'bottom' });
    expect(entity(result.document, 'n-end')).toMatchObject({ edge: 'split-1' });
    expect(entity(result.document, 'n-right')).toMatchObject({ edge: 'right' });
    expect(entity(result.document, 'n-missing')).toMatchObject({ edge: 'bottom' });
    expect(entity(result.document, 'n-line')).toMatchObject({ edge: 'bottom' });
  });

  it('canonicalises a measured chain that contains the line', () => {
    const document: PatternDocument = {
      ...square(),
      variables: [
        {
          slug: 'x',
          name: 'X',
          unit: 'mm',
          kind: 'measurement',
          sources: ['right', 'bottom'],
        },
      ],
    };
    const result = applyCommand(document, split());

    expect(result.document.variables![0]).toMatchObject({
      sources: ['right', 'split-1', 'bottom'],
    });
  });

  it('leaves a measured chain that already failed to resolve untouched', () => {
    const document: PatternDocument = {
      ...square(),
      variables: [
        {
          slug: 'x',
          name: 'X',
          unit: 'mm',
          kind: 'measurement',
          sources: ['bottom', 'missing'],
        },
      ],
    };
    const result = applyCommand(document, split());

    expect(result.document.variables![0]).toBe(document.variables![0]);
  });

  it('leaves value variables and chains without the line untouched', () => {
    const document: PatternDocument = {
      ...square(),
      variables: [
        { slug: 'v', name: 'V', unit: 'mm', value: 5 },
        { slug: 'y', name: 'Y', unit: 'mm', kind: 'measurement', sources: ['right', 'top'] },
      ],
    };
    const result = applyCommand(document, split());

    expect(result.document.variables![0]).toBe(document.variables![0]);
    expect(result.document.variables![1]).toBe(document.variables![1]);
  });

  it('converts a line-form midpoint to the two-point form', () => {
    const document: PatternDocument = {
      ...square(),
      constraints: [{ id: 'mid', type: 'midpoint', point: 'c4', line: 'bottom', piece: 'p1' }],
    };
    const result = applyCommand(document, split());
    const constraint = getConstraint(result.document, 'mid');

    expect(constraint).toEqual({
      id: 'mid',
      type: 'midpoint',
      point: 'c4',
      piece: 'p1',
      a: 'c1',
      b: 'c2',
    });
    expect(constraint).not.toHaveProperty('line');
  });

  it('converts a line-form midpoint without a piece', () => {
    const document = square();
    document.entities = document.entities.map((candidate) =>
      candidate.kind === 'line' ? { ...candidate, piece: undefined } : candidate,
    );
    document.constraints = [{ id: 'mid', type: 'midpoint', point: 'c4', line: 'bottom' }];
    const result = applyCommand(document, split());

    expect(getConstraint(result.document, 'mid')).toEqual({
      id: 'mid',
      type: 'midpoint',
      point: 'c4',
      a: 'c1',
      b: 'c2',
    });
  });

  it('leaves a two-point midpoint untouched', () => {
    const midpoint: Constraint = {
      id: 'mid',
      type: 'midpoint',
      point: 'c4',
      a: 'c1',
      b: 'c3',
    };
    const document: PatternDocument = { ...square(), constraints: [midpoint] };
    const result = applyCommand(document, split());

    expect(getConstraint(result.document, 'mid')).toBe(midpoint);
  });

  it('re-points end-anchored cut dimensions and keeps start anchors', () => {
    const document: PatternDocument = {
      ...square(),
      constraints: [
        {
          id: 'd1',
          type: 'derived_distance',
          piece: 'p1',
          a: { edge: 'bottom', at: 'end' },
          b: { edge: 'top', at: 'start' },
        },
        {
          id: 'd2',
          type: 'derived_distance',
          piece: 'p1',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'right', at: 'end' },
        },
      ],
    };
    const result = applyCommand(document, split());

    expect(getConstraint(result.document, 'd1')).toMatchObject({
      a: { edge: 'split-1', at: 'end' },
      b: { edge: 'top', at: 'start' },
    });
    expect(getConstraint(result.document, 'd2')).toMatchObject({
      a: { edge: 'bottom', at: 'start' },
      b: { edge: 'right', at: 'end' },
    });
  });

  it('keeps unrelated constraints identical', () => {
    const coincident: Constraint = { id: 'c', type: 'coincident', a: 'c1', b: 'c2' };
    const document: PatternDocument = { ...square(), constraints: [coincident] };
    const result = applyCommand(document, split());

    expect(getConstraint(result.document, 'c')).toBe(coincident);
  });

  describe('rejections', () => {
    const failure = (command: Command, document = square()): CommandValidationError => {
      try {
        applyCommand(document, command);
      } catch (error) {
        expect(error).toBeInstanceOf(CommandValidationError);
        return error as CommandValidationError;
      }
      throw new Error('the command should have failed');
    };

    it('requires a known straight line', () => {
      expect(failure(split('m', 'missing')).message).toContain('unknown entity');
      expect(failure(split('m', 'c1')).message).toContain('expected a line');
    });

    it('requires a known point', () => {
      expect(failure(split('missing')).message).toContain('unknown entity');
      expect(failure(split('bottom')).message).toContain('expected a point');
    });

    it('refuses a corner-round-derived point', () => {
      const rounded = applyCommand(square(), {
        id: 'r1',
        type: 'add_corner_round',
        params: { first: 'bottom', second: 'left', radius: 10 },
      }).document;

      expect(failure(split('r1:a'), rounded).message).toContain('derived by a corner round');
    });

    it('refuses a point fixed at the midpoint', () => {
      const document: PatternDocument = {
        ...square(),
        constraints: [{ id: 'mid', type: 'midpoint', point: 'm', line: 'bottom' }],
      };

      expect(failure(split('m'), document).message).toContain('fixed at the midpoint');
    });

    it('refuses a point from another piece', () => {
      const document = square();
      document.entities = document.entities.map((candidate) =>
        candidate.id === 'm' ? { ...candidate, piece: 'p2' } : candidate,
      );

      expect(failure(split('m'), document).message).toContain('same piece');
    });

    it('refuses either endpoint', () => {
      expect(failure(split('c1')).message).toContain('already an end');
      expect(failure(split('c2')).message).toContain('already an end');
    });

    it('refuses a line with no length', () => {
      const document = square();
      document.entities.push(point('zero', 0, 0, { piece: 'p1' }), line('z', 'c1', 'zero'));

      expect(failure(split('m', 'z'), document).message).toContain('no length');
    });

    it('refuses a point that is not on the line', () => {
      const document = square();
      document.entities = document.entities.map((candidate) =>
        candidate.id === 'm' ? { ...candidate, y: 0.01 } : candidate,
      );

      expect(failure(split('m'), document).message).toContain('not on this line');
    });

    it('refuses a split that leaves a sliver at either end', () => {
      const nearStart = square();
      nearStart.entities = nearStart.entities.map((candidate) =>
        candidate.id === 'm' ? { ...candidate, x: 0.0005 } : candidate,
      );
      const nearEnd = square();
      nearEnd.entities = nearEnd.entities.map((candidate) =>
        candidate.id === 'm' ? { ...candidate, x: 199.9998 } : candidate,
      );

      expect(failure(split('m'), nearStart).message).toContain('between the ends');
      expect(failure(split('m'), nearEnd).message).toContain('between the ends');
    });

    it('refuses a split under a whole-edge cut dimension', () => {
      const first: PatternDocument = {
        ...square(),
        constraints: [
          {
            id: 'd',
            type: 'derived_distance',
            piece: 'p1',
            a: { edge: 'bottom', at: 'edge' },
            b: { edge: 'top', at: 'start' },
          },
        ],
      };
      const second: PatternDocument = {
        ...square(),
        constraints: [
          {
            id: 'd',
            type: 'derived_distance',
            piece: 'p1',
            a: { edge: 'top', at: 'start' },
            b: { edge: 'bottom', at: 'edge' },
          },
        ],
      };

      expect(failure(split('m'), first).message).toContain('measures this edge as a whole');
      expect(failure(split('m'), second).message).toContain('measures this edge as a whole');
    });
  });
});
