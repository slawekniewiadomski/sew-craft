import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  normalizeDocument,
  pieceMetrics,
  resolveParam,
  resolveVariable,
  sameParam,
  solveDocument,
  type Command,
  type Entity,
  type Param,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type Variable,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  fixed: false,
});

function documentOf(
  entities: Entity[],
  variables: Variable[],
  extras: Partial<PatternDocument> = {},
): PatternDocument {
  return { ...createEmptyDocument(), entities, variables, ...extras };
}

const variable = (slug: string, value: Param, unit: Variable['unit'] = 'mm'): Variable => ({
  slug,
  name: slug,
  unit,
  value,
});

const formula = (expr: string, lastKnown = 1): Param => ({ expr, lastKnown });

describe('resolveVariable', () => {
  it('reads a literal in its own unit', () => {
    const document = documentOf([], [variable('bust', 88, 'cm'), variable('ease', 10)]);
    expect(resolveVariable(document, 'bust')).toEqual({ value: 880, exponent: 1 });
    expect(resolveVariable(document, 'ease')).toEqual({ value: 10, exponent: 1 });
  });

  it('resolves a formula over other variables', () => {
    const document = documentOf(
      [],
      [variable('bust', 880), variable('quarter', formula('$bust / 4', 220))],
    );
    expect(resolveVariable(document, 'quarter')).toEqual({ value: 220, exponent: 1 });
  });

  it('keeps a ratio a ratio', () => {
    const document = documentOf(
      [],
      [
        variable('bust', 880),
        variable('waist', 720),
        variable('fit', formula('$waist / $bust', 0.8)),
      ],
    );
    expect(resolveVariable(document, 'fit')).toEqual({ value: 720 / 880, exponent: 0 });
  });

  it('refuses an area, an unknown slug and a missing variable', () => {
    const document = documentOf(
      [],
      [
        variable('a', 10),
        variable('area', formula('$a * $a', 100)),
        variable('unknown', formula('$missing + 1mm', 1)),
      ],
    );
    expect(resolveVariable(document, 'area')).toBeNull();
    expect(resolveVariable(document, 'unknown')).toBeNull();
    expect(resolveVariable(document, 'absent')).toBeNull();
    expect(resolveVariable(createEmptyDocument(), 'absent')).toBeNull();
  });

  it('breaks a cycle instead of recursing', () => {
    const document = documentOf(
      [],
      [variable('a', formula('$b + 1mm', 1)), variable('b', formula('$a + 1mm', 1))],
    );
    expect(resolveVariable(document, 'a')).toBeNull();
    expect(resolveVariable(document, 'b')).toBeNull();
  });

  it('resolves the same variable twice in one formula', () => {
    const document = documentOf(
      [],
      [variable('bust', 880), variable('double', formula('$bust + $bust', 1760))],
    );
    expect(resolveVariable(document, 'double')).toEqual({ value: 1760, exponent: 1 });
  });

  it('refuses a literal that is not a finite number', () => {
    const document = documentOf([], [variable('broken', Number.POSITIVE_INFINITY)]);
    expect(resolveVariable(document, 'broken')).toBeNull();
  });
});

describe('sameParam', () => {
  it('compares a formula by its text and a literal by its number', () => {
    expect(sameParam(10, 10)).toBe(true);
    expect(sameParam(10, 11)).toBe(false);
    expect(sameParam(formula('$a'), formula('$a'))).toBe(true);
    expect(sameParam(formula('$a'), formula('$b'))).toBe(false);
    expect(sameParam(formula('$a'), 10)).toBe(false);
  });
});

describe('resolveParam', () => {
  it('returns a literal unchanged', () => {
    expect(resolveParam(createEmptyDocument(), 12.5)).toBe(12.5);
  });

  it('resolves a formula through the document variables', () => {
    const document = documentOf([], [variable('bust', 880)]);
    expect(resolveParam(document, formula('$bust / 4 + 2cm', 0))).toBe(240);
  });

  it('falls back to the last known value when the formula breaks', () => {
    const document = documentOf([], []);
    expect(resolveParam(document, formula('$gone / 4', 55))).toBe(55);
  });

  it('falls back when the formula is not a length', () => {
    const document = documentOf([], [variable('bust', 880), variable('waist', 720)]);
    expect(resolveParam(document, formula('$waist / $bust', 0.8))).toBe(0.8);
  });
});

describe('variables in the document', () => {
  it('drives a dimension from a variable, and follows an edit', () => {
    const entities = [point('a', 0, 0), point('b', 100, 0)];
    const document = documentOf(entities, [variable('bust', 880)], {
      constraints: [
        {
          id: 'd',
          type: 'distance',
          a: 'a',
          b: 'b',
          value: formula('$bust / 4', 220),
        },
      ],
    });

    const span = (entities: Entity[]): number => {
      const [a, b] = entities.filter((entity): entity is PointEntity => entity.kind === 'point');
      return Math.hypot(b!.x - a!.x, b!.y - a!.y);
    };

    const first = solveDocument(document);
    expect(span(first.document.entities)).toBeCloseTo(220, 6);

    const wider: PatternDocument = {
      ...first.document,
      variables: [variable('bust', 1000)],
    };
    const second = solveDocument(wider);
    expect(span(second.document.entities)).toBeCloseTo(250, 6);
  });

  it('resolves an allowance formula when measuring the piece', () => {
    const entities = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 0, 100),
    ];
    const edges = [
      { id: 'l1', kind: 'line' as const, start: 'a', end: 'b' },
      { id: 'l2', kind: 'line' as const, start: 'b', end: 'c' },
      { id: 'l3', kind: 'line' as const, start: 'c', end: 'd' },
      { id: 'l4', kind: 'line' as const, start: 'd', end: 'a' },
    ];
    const piece: Piece = {
      id: 'p',
      edges: edges.map((edge) => edge.id),
      allowances: edges.map((edge) => ({ edge: edge.id, width: formula('$seam', 10) })),
    };
    const document = documentOf([...entities, ...edges], [variable('seam', 12)], {
      pieces: [piece],
      tabs: [{ kind: 'piece', id: 'p' }],
    });

    const metrics = pieceMetrics(document, piece);
    expect(metrics.finished.width).toBe(100);
    expect(metrics.cut.width).toBe(124);
  });

  it('loads a 0.4 document without variables', () => {
    const legacy = { ...createEmptyDocument(), schema: 'sewcraft.pattern/0.4' };
    const normalized = normalizeDocument(legacy as PatternDocument);
    expect(normalized.variables).toBeUndefined();
  });
});

describe('commands accept formulas', () => {
  const entities = [point('a', 0, 0), point('b', 100, 0)];
  const base = (): PatternDocument => documentOf(entities, [variable('bust', 880)]);

  it('stores a formula on a new dimension and records its value', () => {
    const command: Command = {
      id: 'd',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: formula('$bust / 4', 0) },
    };
    const result = applyCommand(base(), command);
    const constraint = result.document.constraints[0]!;
    expect(constraint.type).toBe('distance');
    if (constraint.type !== 'distance') return;
    expect(constraint.value).toEqual({ expr: '$bust / 4', lastKnown: 220 });
  });

  it('rejects a formula that resolves to zero', () => {
    expect(() =>
      applyCommand(base(), {
        id: 'd',
        type: 'add_constraint',
        params: { type: 'distance', entities: ['a', 'b'], value: formula('0mm', 1) },
      }),
    ).toThrow('distance value must be a finite number greater than 0');
  });

  it('rejects a formula that does not resolve or is not a length', () => {
    expect(() =>
      applyCommand(base(), {
        id: 'd',
        type: 'add_constraint',
        params: { type: 'distance', entities: ['a', 'b'], value: formula('$gone / 4', 1) },
      }),
    ).toThrow('unknown variable $gone');

    expect(() =>
      applyCommand(base(), {
        id: 'd',
        type: 'add_constraint',
        params: { type: 'distance', entities: ['a', 'b'], value: formula('$bust / 2mm', 1) },
      }),
    ).toThrow('expected a length, got a ratio');
  });

  it('updates a dimension to a formula and back to a literal', () => {
    const added = applyCommand(base(), {
      id: 'd',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 100 },
    }).document;

    const updated = applyCommand(added, {
      id: 'u',
      type: 'update_constraint',
      params: { id: 'd', value: formula('$bust / 8', 0) },
    }).document;
    const constraint = updated.constraints[0]!;
    expect(constraint.type === 'distance' && constraint.value).toEqual({
      expr: '$bust / 8',
      lastKnown: 110,
    });

    const literal = applyCommand(updated, {
      id: 'l',
      type: 'update_constraint',
      params: { id: 'd', value: 90 },
    }).document;
    expect(literal.constraints[0]!.type === 'distance' && literal.constraints[0]!.value).toBe(90);
  });

  it('resolves a formula on a legacy seam allowance to its number', () => {
    const document: PatternDocument = {
      ...base(),
      entities: [...entities, { id: 'l1', kind: 'line', start: 'a', end: 'b' }],
    };

    const result = applyCommand(document, {
      id: 's',
      type: 'add_seam_allowance',
      params: { edge: 'l1', width: formula('$bust / 88', 0) },
    }).document;

    expect(result.seams?.[0]?.width).toBe(10);
  });

  it('stores a formula on a piece allowance', () => {
    const piece: Piece = { id: 'p', edges: ['l1'], allowances: [] };
    const document: PatternDocument = {
      ...base(),
      entities: [
        ...entities,
        { id: 'l1', kind: 'line', start: 'a', end: 'b' },
        point('c', 100, 100),
        { id: 'l2', kind: 'line', start: 'b', end: 'c' },
        { id: 'l3', kind: 'line', start: 'c', end: 'a' },
      ],
      pieces: [piece],
      tabs: [{ kind: 'piece', id: 'p' }],
    };

    const result = applyCommand(document, {
      id: 'w',
      type: 'set_piece_allowance',
      params: { piece: 'p', edge: 'l1', width: formula('$bust / 88', 0) },
    }).document;

    expect(result.pieces[0]!.allowances[0]!.width).toEqual({
      expr: '$bust / 88',
      lastKnown: 10,
    });
  });

  it('stores a formula on the document default allowance', () => {
    const result = applyCommand(base(), {
      id: 'w',
      type: 'set_default_allowance',
      params: { width: formula('$bust / 88', 0) },
    }).document;

    expect(result.defaults?.allowance?.width).toEqual({ expr: '$bust / 88', lastKnown: 10 });
  });

  it('resolves a formula radius on a corner round', () => {
    const rightAngle: PatternDocument = documentOf(
      [
        point('c', 0, 0),
        point('x', 100, 0),
        point('y', 0, 100),
        { id: 'l1', kind: 'line', start: 'c', end: 'x' },
        { id: 'l2', kind: 'line', start: 'c', end: 'y' },
      ],
      [variable('radius', 10)],
    );

    const result = applyCommand(rightAngle, {
      id: 'r',
      type: 'add_corner_round',
      params: { first: 'l1', second: 'l2', radius: formula('$radius', 0) },
    }).document;

    expect(result.cornerRounds?.[0]?.radius).toEqual({ expr: '$radius', lastKnown: 10 });
  });
});
