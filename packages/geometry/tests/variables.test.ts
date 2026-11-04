import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  dimensionState,
  dimensionValue,
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

const empty = (): PatternDocument => ({ ...createEmptyDocument(), variables: [] });

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
      pieces: [piece, { id: 'p2', edges: [], allowances: [] }],
      tabs: [
        { kind: 'piece', id: 'p' },
        { kind: 'piece', id: 'p2' },
      ],
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

describe('a broken formula dimension', () => {
  const entities = [point('a', 0, 0), point('b', 100, 0)];

  function broken(): PatternDocument {
    return documentOf(entities, [], {
      constraints: [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: formula('$gone / 4', 55) }],
    });
  }

  it('reports broken, shows its last number and drives nothing', () => {
    const document = broken();
    const constraint = document.constraints[0]!;
    if (constraint.type !== 'distance') throw new Error('expected a distance');

    expect(dimensionState(document, constraint)).toBe('broken');
    expect(dimensionValue(document, constraint)).toBe(55);

    const solved = solveDocument(document).document.entities.filter(
      (entity): entity is PointEntity => entity.kind === 'point',
    );
    expect(solved[1]!.x).toBeCloseTo(100, 6);
  });

  it('reports no value for a stored literal that cannot drive', () => {
    const document = documentOf(entities, [], {
      constraints: [{ id: 'd', type: 'distance', a: 'a', b: 'b', value: 0 }],
    });
    const constraint = document.constraints[0]!;
    if (constraint.type !== 'distance') throw new Error('expected a distance');
    expect(dimensionValue(document, constraint)).toBeNull();
  });

  it('resolves again once the variable exists', () => {
    const document: PatternDocument = { ...broken(), variables: [variable('gone', 400)] };
    const constraint = document.constraints[0]!;
    if (constraint.type !== 'distance') throw new Error('expected a distance');
    expect(dimensionState(document, constraint)).toBe('formula');
    expect(dimensionValue(document, constraint)).toBe(100);
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
      pieces: [piece, { id: 'p2', edges: [], allowances: [] }],
      tabs: [
        { kind: 'piece', id: 'p' },
        { kind: 'piece', id: 'p2' },
      ],
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

describe('set_variable', () => {
  const set = (document: PatternDocument, params: Record<string, unknown>, id = 'v'): Command =>
    ({ id, type: 'set_variable', params }) as Command;

  it('mints a slug from the display name and defaults the unit to mm', () => {
    const result = applyCommand(empty(), set(empty(), { name: 'Bust (cm)', value: 88 })).document;
    expect(result.variables).toEqual([
      { slug: 'bust_cm', name: 'Bust (cm)', unit: 'mm', value: 88 },
    ]);
  });

  it('folds non-ascii names and prefixes a leading digit', () => {
    const accented = applyCommand(empty(), set(empty(), { name: 'Poitrine é', value: 1 })).document;
    expect(accented.variables?.[0]?.slug).toBe('poitrine_e');
    const digits = applyCommand(empty(), set(empty(), { name: '3/4 bust', value: 1 })).document;
    expect(digits.variables?.[0]?.slug).toBe('v3_4_bust');
    const punctuation = applyCommand(empty(), set(empty(), { name: '???', value: 1 })).document;
    expect(punctuation.variables?.[0]?.slug).toBe('v');
  });

  it('de-duplicates a minted slug', () => {
    const first = applyCommand(empty(), set(empty(), { name: 'Bust', value: 1 })).document;
    const second = applyCommand(first, set(first, { name: 'Bust!', value: 2 })).document;
    const third = applyCommand(second, set(second, { name: 'Bust?', value: 3 })).document;
    expect(third.variables?.map((variable) => variable.slug)).toEqual(['bust', 'bust_2', 'bust_3']);
  });

  it('updates an existing variable given only a value', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const applied = applyCommand(document, set(document, { slug: 'bust', value: 900 }));
    expect(applied.document.variables?.[0]?.value).toBe(900);
  });

  it('updates an existing variable given a name and a unit', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const applied = applyCommand(
      document,
      set(document, { slug: 'bust', name: 'Full bust', unit: 'cm', value: 90 }),
    );
    expect(applied.document.variables?.[0]).toMatchObject({
      name: 'Full bust',
      unit: 'cm',
      value: 90,
    });
  });

  it('treats an empty comment as none', () => {
    const applied = applyCommand(empty(), set(empty(), { name: 'Bust', value: 1, comment: '' }));
    expect(applied.document.variables?.[0]?.comment).toBeUndefined();
  });

  it('works on a document written before variables existed', () => {
    const legacy = createEmptyDocument();
    const applied = applyCommand(legacy, set(legacy, { name: 'Bust', value: 88 }));
    expect(applied.document.variables?.[0]?.slug).toBe('bust');

    const slugOnly = applyCommand(
      applied.document,
      set(applied.document, { slug: 'waist', value: 72 }),
    );
    expect(slugOnly.document.variables?.[1]).toMatchObject({ slug: 'waist', name: 'waist' });
  });

  it('stores a formula with the value it resolved to', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const result = applyCommand(
      document,
      set(document, { name: 'Quarter', value: { expr: '$bust / 4' } }),
    ).document;
    expect(result.variables?.[1]?.value).toEqual({ expr: '$bust / 4', lastKnown: 220 });
  });

  it('accepts a ratio variable but refuses an area', () => {
    const document = documentOf([], [variable('bust', 880), variable('waist', 720)]);
    const ratio = applyCommand(
      document,
      set(document, { name: 'Fit', value: { expr: '$waist / $bust' } }),
    ).document;
    expect(ratio.variables?.[2]?.value).toEqual({ expr: '$waist / $bust', lastKnown: 720 / 880 });

    expect(() =>
      applyCommand(document, set(document, { name: 'Area', value: { expr: '$bust * $bust' } })),
    ).toThrow('a variable must be a length or a ratio, not an area');
    expect(() =>
      applyCommand(
        document,
        set(document, { name: 'Volume', value: { expr: '$bust * $bust * $bust' } }),
      ),
    ).toThrow('a quantity with exponent 3');
  });

  it('rejects an invalid name, a duplicate name, a bad value and a bad slug', () => {
    const document = documentOf([], [variable('bust', 880)]);

    expect(() => applyCommand(document, set(document, { name: '   ', value: 1 }))).toThrow(
      'variable name must be 1-60 characters',
    );
    expect(() => applyCommand(document, set(document, { name: 'a'.repeat(61), value: 1 }))).toThrow(
      'variable name must be 1-60 characters',
    );
    expect(() => applyCommand(document, set(document, { name: 'BUST', value: 1 }))).toThrow(
      'variable name "BUST" is already used by bust',
    );
    expect(() => applyCommand(document, set(document, { name: 'X', value: -1 }))).toThrow(
      'variable value must be a finite number of at least 0',
    );
    expect(() =>
      applyCommand(document, set(document, { name: 'X', value: { expr: '$gone' } })),
    ).toThrow('value is not a valid formula: unknown variable $gone at 0');
    expect(() => applyCommand(document, set(document, { slug: 'Bust', value: 1 }))).toThrow(
      'slug must be lowercase letters',
    );
    expect(() => applyCommand(document, set(document, { value: 1 }))).toThrow(
      'slug or name is required',
    );
  });

  it('stores a trimmed comment and clears an empty one', () => {
    const withComment = applyCommand(
      empty(),
      set(empty(), { name: 'Bust', value: 1, comment: '  over bust  ' }),
    ).document;
    expect(withComment.variables?.[0]?.comment).toBe('over bust');

    const cleared = applyCommand(
      withComment,
      set(withComment, { slug: 'bust', value: 1, comment: '   ' }),
    ).document;
    expect(cleared.variables?.[0]?.comment).toBeUndefined();

    expect(() =>
      applyCommand(empty(), set(empty(), { name: 'Bust', value: 1, comment: 'x'.repeat(121) })),
    ).toThrow('variable comment must be at most 120 characters');
  });

  it('updates the variable already stored under the slug', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const applied = applyCommand(document, set(document, { slug: 'bust', value: 900, unit: 'cm' }));
    expect(applied.document.variables?.[0]).toMatchObject({ slug: 'bust', unit: 'cm', value: 900 });
    expect(applied.inverse).toMatchObject({ type: 'update_variable', params: { slug: 'bust' } });
  });
});

describe('update_variable', () => {
  it('renames without moving the slug or a dependent formula', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const renamed = applyCommand(document, {
      id: 'r',
      type: 'update_variable',
      params: { slug: 'bust', name: 'Full bust' },
    }).document;
    expect(renamed.variables?.[0]).toMatchObject({ slug: 'bust', name: 'Full bust' });

    const restored = applyCommand(
      renamed,
      renamed.constraints.length === 0
        ? {
            id: 'u',
            type: 'update_variable',
            params: { slug: 'bust', name: 'bust' },
          }
        : {
            id: 'u',
            type: 'update_variable',
            params: { slug: 'bust', name: 'bust' },
          },
    ).document;
    expect(restored.variables?.[0]?.name).toBe('bust');
  });

  it('converts a literal when the unit changes and keeps a formula as written', () => {
    const document = documentOf(
      [],
      [variable('bust', 88, 'cm'), variable('ease', formula('$bust / 10', 88))],
    );
    const toMm = applyCommand(document, {
      id: 'u',
      type: 'update_variable',
      params: { slug: 'bust', unit: 'mm' },
    }).document;
    expect(toMm.variables?.[0]?.value).toBe(880);

    const formulaUnit = applyCommand(toMm, {
      id: 'f',
      type: 'update_variable',
      params: { slug: 'ease', unit: 'cm' },
    }).document;
    expect(formulaUnit.variables?.[1]?.value).toEqual({ expr: '$bust / 10', lastKnown: 88 });
    expect(formulaUnit.variables?.[1]?.unit).toBe('cm');
  });

  it('changes a value and clears a comment', () => {
    const document = documentOf(
      [],
      [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880, comment: 'x' }],
    );
    const result = applyCommand(document, {
      id: 'u',
      type: 'update_variable',
      params: { slug: 'bust', value: { expr: '90cm' }, comment: null },
    }).document;
    expect(result.variables?.[0]?.value).toEqual({ expr: '90cm', lastKnown: 900 });
    expect(result.variables?.[0]?.comment).toBeUndefined();
  });

  it('sets a comment through an update', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const updated = applyCommand(document, {
      id: 'u',
      type: 'update_variable',
      params: { slug: 'bust', comment: 'over bust' },
    }).document;
    expect(updated.variables?.[0]?.comment).toBe('over bust');
  });

  it('rejects an update on a document with no variables and keeps a missing comment absent', () => {
    expect(() =>
      applyCommand(createEmptyDocument(), {
        id: 'u',
        type: 'update_variable',
        params: { slug: 'bust', value: 1 },
      }),
    ).toThrow('unknown variable: bust');

    const document = documentOf([], [variable('bust', 880)]);
    const updated = applyCommand(document, {
      id: 'u',
      type: 'update_variable',
      params: { slug: 'bust', value: 900 },
    }).document;
    expect(updated.variables?.[0]?.comment).toBeUndefined();
  });

  it('is a no-op when nothing changes and rejects an unknown slug', () => {
    const document = documentOf([], [variable('bust', 880)]);
    const unchanged = applyCommand(document, {
      id: 'u',
      type: 'update_variable',
      params: { slug: 'bust', name: 'bust', value: 880 },
    });
    expect(unchanged.document).toBe(document);

    expect(() =>
      applyCommand(document, {
        id: 'u',
        type: 'update_variable',
        params: { slug: 'gone', name: 'Gone' },
      }),
    ).toThrow('unknown variable: gone');
  });
});

describe('remove_variable', () => {
  it('keeps the number a dependent was showing, then re-links when restored', () => {
    const entities = [point('a', 0, 0), point('b', 100, 0)];
    const document = documentOf(entities, [variable('bust', 880)], {
      constraints: [
        { id: 'd', type: 'distance', a: 'a', b: 'b', value: formula('$bust / 4', 220) },
      ],
    });
    // The variable moves after the dimension was written, so `lastKnown` is stale.
    const edited: PatternDocument = { ...document, variables: [variable('bust', 1000)] };

    const removed = applyCommand(edited, {
      id: 'r',
      type: 'remove_variable',
      params: { slug: 'bust' },
    });
    const constraint = removed.document.constraints[0]!;
    expect(constraint.type === 'distance' && constraint.value).toEqual({
      expr: '$bust / 4',
      lastKnown: 250,
    });
    expect(removed.document.variables).toEqual([]);
    expect(removed.inverse).toMatchObject({ type: 'set_variable', params: { slug: 'bust' } });

    const restored = applyCommand(removed.document, removed.inverse!).document;
    expect(restored.variables?.[0]).toMatchObject({ slug: 'bust', value: 1000 });
  });

  it('is a no-op for an unknown slug, including a document with no variables', () => {
    const document = documentOf([], [variable('bust', 880)]);
    expect(
      applyCommand(document, {
        id: 'r',
        type: 'remove_variable',
        params: { slug: 'gone' },
      }).document,
    ).toBe(document);
    expect(
      applyCommand(createEmptyDocument(), {
        id: 'r',
        type: 'remove_variable',
        params: { slug: 'gone' },
      }).document,
    ).toEqual(createEmptyDocument());
  });

  it('captures the current value of every dependent formula before it breaks', () => {
    const entities = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 0, 100),
      { id: 'l1', kind: 'line' as const, start: 'a', end: 'b' },
      { id: 'l2', kind: 'line' as const, start: 'a', end: 'c' },
    ];
    const piece: Piece = {
      id: 'p',
      edges: ['l1', 'l2'],
      allowances: [{ edge: 'l1', width: formula('$bust / 88', 1) }],
      defaults: { allowance: { width: formula('$bust / 44', 1) } },
    };
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities,
      variables: [variable('bust', 880)],
      constraints: [
        { id: 'd', type: 'distance', a: 'a', b: 'b', value: formula('$bust / 4', 1) },
        { id: 'h', type: 'horizontal', a: 'a', b: 'b' },
      ],
      pieces: [piece, { id: 'p2', edges: [], allowances: [] }],
      tabs: [
        { kind: 'piece', id: 'p' },
        { kind: 'piece', id: 'p2' },
      ],
      cornerRounds: [
        {
          id: 'r',
          corner: 'a',
          ends: [
            { line: 'l1', anchor: 'a', tangent: 'a' },
            { line: 'l2', anchor: 'a', tangent: 'a' },
          ],
          radius: formula('$bust / 88', 1),
          arc: 'arc',
          controls: ['c1', 'c2'],
        },
      ],
      defaults: { allowance: { width: formula('$bust / 44', 1) } },
    };

    const removed = applyCommand(document, {
      id: 'r',
      type: 'remove_variable',
      params: { slug: 'bust' },
    }).document;

    expect(removed.constraints[0]).toMatchObject({ value: { lastKnown: 220 } });
    expect(removed.constraints[1]).toEqual({ id: 'h', type: 'horizontal', a: 'a', b: 'b' });
    expect(removed.pieces[0]?.allowances[0]?.width).toMatchObject({ lastKnown: 10 });
    expect(removed.pieces[0]?.defaults?.allowance).toMatchObject({ width: { lastKnown: 20 } });
    expect(removed.cornerRounds?.[0]?.radius).toMatchObject({ lastKnown: 10 });
    expect(removed.defaults?.allowance?.width).toMatchObject({ lastKnown: 20 });
  });

  it('restores a variable that carried a comment', () => {
    const document = documentOf(
      [],
      [{ slug: 'bust', name: 'Bust', unit: 'cm', value: 88, comment: 'over bust' }],
    );
    const removed = applyCommand(document, {
      id: 'r',
      type: 'remove_variable',
      params: { slug: 'bust' },
    });
    expect(removed.inverse).toMatchObject({ params: { comment: 'over bust' } });
    expect(applyCommand(removed.document, removed.inverse!).document.variables?.[0]).toMatchObject({
      comment: 'over bust',
    });
  });
});
