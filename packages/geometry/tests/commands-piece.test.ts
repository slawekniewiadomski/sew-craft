import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  derivedDimensionGeometry,
  derivedDimensionState,
  derivedDimensionValue,
  getConstraint,
  measureCutDimension,
  pieceById,
  pieceCutLoop,
  pieceLoop,
  solveDocument,
  type Command,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
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

const entities = (): Entity[] => [
  point('a', 0, 0),
  point('b', 200, 0),
  point('c', 200, 200),
  point('d', 0, 200),
  line('bottom', 'a', 'b'),
  line('right', 'b', 'c'),
  line('top', 'c', 'd'),
  line('left', 'd', 'a'),
];

const documentOf = (extra: Entity[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...entities(), ...extra],
});

const createPiece = (
  overrides: Partial<{ id: string; edges: string[]; name: string; quantity: number }> = {},
): Command => ({
  id: overrides.id ?? 'piece-1',
  type: 'create_piece',
  params: {
    edges: overrides.edges ?? ['bottom', 'right', 'top', 'left'],
    ...(overrides.name === undefined ? {} : { name: overrides.name }),
    ...(overrides.quantity === undefined ? {} : { quantity: overrides.quantity }),
  },
});

/** A document with one piece and the standard three-edge allowance set. */
function withPiece(): PatternDocument {
  const created = applyCommand(documentOf(), createPiece()).document;
  return [
    { edge: 'right', width: 10, kind: 'single' as const },
    { edge: 'top', width: 10, kind: 'single' as const },
    { edge: 'left', width: 10, kind: 'single' as const },
  ].reduce(
    (document, allowance, index) =>
      applyCommand(document, {
        id: `allowance-${index}`,
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', ...allowance },
      }).document,
    created,
  );
}

const addDerived = (): Command => ({
  id: 'cut-width',
  type: 'add_derived_dimension',
  params: {
    piece: 'piece-1',
    a: { edge: 'bottom', at: 'start' },
    b: { edge: 'bottom', at: 'end' },
    orientation: 'horizontal',
    offset: 15,
  },
});

/** The derived cut dimension with this id, narrowed for measurement helpers. */
function derivedOf(document: PatternDocument, id: string) {
  const constraint = getConstraint(document, id);
  if (constraint?.type !== 'derived_distance') {
    throw new Error(`missing derived dimension: ${id}`);
  }
  return constraint;
}

describe('create_piece', () => {
  it('creates a piece with a name, quantity and allowances list', () => {
    const document = documentOf();
    const result = applyCommand(document, createPiece({ name: ' Panel ', quantity: 2 }));
    const piece = pieceById(result.document, 'piece-1');

    expect(piece).toEqual({
      id: 'piece-1',
      name: 'Panel',
      quantity: 2,
      edges: ['bottom', 'right', 'top', 'left'],
      allowances: [],
    });
    expect(result.inverse).toEqual({
      id: 'piece-1',
      type: 'delete_piece',
      params: { id: 'piece-1' },
    });
  });

  it('omits an absent name and quantity', () => {
    const piece = pieceById(applyCommand(documentOf(), createPiece()).document, 'piece-1')!;

    expect('name' in piece).toBe(false);
    expect('quantity' in piece).toBe(false);
  });

  it('is idempotent when the piece already exists', () => {
    const first = applyCommand(documentOf(), createPiece()).document;
    const second = applyCommand(first, createPiece());

    expect(second.document).toBe(first);
    expect(second.inverse).toBeNull();
  });

  it('rejects a selection that is not one closed loop', () => {
    expect(() =>
      applyCommand(documentOf(), createPiece({ edges: ['bottom', 'right', 'top'] })),
    ).toThrowError(/does not connect to edge/);
  });

  it('rejects a star that only shares one common vertex', () => {
    const document = documentOf([
      point('hub', 300, 0),
      point('x', 310, 0),
      point('y', 300, 10),
      point('z', 290, 0),
      line('spoke-x', 'hub', 'x'),
      line('spoke-y', 'hub', 'y'),
      line('spoke-z', 'hub', 'z'),
    ]);

    expect(() =>
      applyCommand(document, createPiece({ edges: ['spoke-x', 'spoke-y', 'spoke-z'] })),
    ).toThrowError(/does not connect to edge/);
  });

  it('rejects an edge that already belongs to a piece', () => {
    const document = applyCommand(documentOf(), createPiece()).document;

    expect(() =>
      applyCommand(
        document,
        createPiece({ id: 'piece-2', edges: ['bottom', 'right', 'top', 'left'] }),
      ),
    ).toThrowError(/already belongs to another piece/);
  });

  it('rejects an invalid quantity', () => {
    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      expect(() => applyCommand(documentOf(), createPiece({ quantity }))).toThrowError(
        /quantity must be an integer of at least 1/,
      );
    }
  });

  it('rejects a blank name', () => {
    expect(() => applyCommand(documentOf(), createPiece({ name: '   ' }))).toThrowError(
      /name must be a non-empty string/,
    );
  });
});

describe('update_piece', () => {
  it('renames a piece and changes its quantity', () => {
    const document = withPiece();
    const result = applyCommand(document, {
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', name: 'Front', quantity: 4 },
    });

    expect(pieceById(result.document, 'piece-1')).toMatchObject({ name: 'Front', quantity: 4 });
    expect(result.inverse).toEqual({
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', name: null, quantity: null },
    });
  });

  it('clears a name and quantity with null', () => {
    const document = applyCommand(
      documentOf(),
      createPiece({ name: 'Panel', quantity: 3 }),
    ).document;
    const result = applyCommand(document, {
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', name: null, quantity: null },
    });
    const piece = pieceById(result.document, 'piece-1')!;

    expect('name' in piece).toBe(false);
    expect('quantity' in piece).toBe(false);
    expect(result.inverse).toEqual({
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', name: 'Panel', quantity: 3 },
    });
  });

  it('keeps the other fields when only one changes', () => {
    const named = applyCommand(documentOf(), createPiece({ name: 'Panel', quantity: 1 })).document;
    const quantityOnly = applyCommand(named, {
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', quantity: 5 },
    }).document;

    expect(pieceById(quantityOnly, 'piece-1')).toMatchObject({ name: 'Panel', quantity: 5 });

    const nameOnly = applyCommand(quantityOnly, {
      id: 'update-2',
      type: 'update_piece',
      params: { id: 'piece-1', name: 'Back' },
    }).document;

    expect(pieceById(nameOnly, 'piece-1')).toMatchObject({ name: 'Back', quantity: 5 });
  });

  it('replaces one piece without touching another', () => {
    const document: PatternDocument = {
      ...withPiece(),
      pieces: [...withPiece().pieces, { id: 'piece-2', edges: ['other'], allowances: [] }],
    };
    const result = applyCommand(document, {
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', quantity: 3 },
    });

    expect(pieceById(result.document, 'piece-2')).toEqual({
      id: 'piece-2',
      edges: ['other'],
      allowances: [],
    });
  });

  it('is a no-op when nothing changes', () => {
    const document = applyCommand(documentOf(), createPiece({ name: 'Panel' })).document;
    const result = applyCommand(document, {
      id: 'update-1',
      type: 'update_piece',
      params: { id: 'piece-1', name: 'Panel' },
    });

    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('rejects an unknown piece, an empty update, a blank name and an invalid quantity', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'update-1',
        type: 'update_piece',
        params: { id: 'missing', name: 'x' },
      }),
    ).toThrowError(/unknown piece/);
    expect(() =>
      applyCommand(document, {
        id: 'update-1',
        type: 'update_piece',
        params: { id: 'piece-1' },
      }),
    ).toThrowError(/provide name or quantity/);
    expect(() =>
      applyCommand(document, {
        id: 'update-1',
        type: 'update_piece',
        params: { id: 'piece-1', name: ' ' },
      }),
    ).toThrowError(/name must be a non-empty string/);
    expect(() =>
      applyCommand(document, {
        id: 'update-1',
        type: 'update_piece',
        params: { id: 'piece-1', quantity: 0 },
      }),
    ).toThrowError(/quantity must be an integer of at least 1/);
  });
});

describe('delete_piece', () => {
  it('removes the piece and its cut dimensions', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const result = applyCommand(document, {
      id: 'delete-1',
      type: 'delete_piece',
      params: { id: 'piece-1' },
    });

    expect(result.document.pieces).toEqual([]);
    expect(result.document.constraints).toEqual([]);
    expect(result.inverse).toBeNull();
  });

  it('is a no-op for an unknown piece', () => {
    const document = withPiece();
    const result = applyCommand(document, {
      id: 'delete-1',
      type: 'delete_piece',
      params: { id: 'missing' },
    });

    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });
});

describe('set_piece_allowance', () => {
  it('adds an allowance and restores its absence', () => {
    const document = applyCommand(documentOf(), createPiece()).document;
    const result = applyCommand(document, {
      id: 'a1',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 12, kind: 'double' },
    });

    expect(pieceById(result.document, 'piece-1')!.allowances).toEqual([
      { edge: 'top', width: 12, kind: 'double' },
    ]);
    expect(result.inverse).toEqual({
      id: 'a1:restore',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', remove: true },
    });
  });

  it('updates an existing allowance and restores the previous values', () => {
    const document = withPiece();
    const result = applyCommand(document, {
      id: 'a2',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 5, kind: 'seam' },
    });

    expect(pieceById(result.document, 'piece-1')!.allowances).toContainEqual({
      edge: 'top',
      width: 5,
      kind: 'seam',
    });
    expect(result.inverse).toEqual({
      id: 'a2:restore',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'single' },
    });
  });

  it('omits the kind on undo when the previous allowance had none', () => {
    const created = applyCommand(documentOf(), createPiece()).document;
    const document = applyCommand(created, {
      id: 'a1',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10 },
    }).document;
    const result = applyCommand(document, {
      id: 'a2',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 12 },
    });

    expect(result.inverse).toEqual({
      id: 'a2:restore',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10 },
    });
  });

  it('removes an allowance and restores it', () => {
    const document = withPiece();
    const result = applyCommand(document, {
      id: 'a3',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', remove: true },
    });

    expect(
      pieceById(result.document, 'piece-1')!.allowances.some(
        (allowance) => allowance.edge === 'top',
      ),
    ).toBe(false);
    expect(result.inverse).toEqual({
      id: 'a3:restore',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'single' },
    });
  });

  it('is a no-op when removing an edge with no allowance or repeating the same values', () => {
    const document = withPiece();

    const removal = applyCommand(document, {
      id: 'a4',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'bottom', remove: true },
    });
    expect(removal.document).toBe(document);
    expect(removal.inverse).toBeNull();

    const repeated = applyCommand(document, {
      id: 'a5',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'single' },
    });
    expect(repeated.document).toBe(document);
    expect(repeated.inverse).toBeNull();
  });

  it('treats an omitted kind and seam as the same allowance', () => {
    const document = applyCommand(documentOf(), createPiece()).document;
    const added = applyCommand(document, {
      id: 'a1',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10 },
    }).document;
    const repeated = applyCommand(added, {
      id: 'a2',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'seam' },
    });

    expect(repeated.document).toBe(added);
  });

  it('rejects an unknown piece and an edge outside the loop', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'a1',
        type: 'set_piece_allowance',
        params: { piece: 'missing', edge: 'top', width: 10 },
      }),
    ).toThrowError(/unknown piece/);
    expect(() =>
      applyCommand(document, {
        id: 'a1',
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge: 'missing', width: 10 },
      }),
    ).toThrowError(/is not in piece/);
  });

  it('rejects remove combined with width or kind', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'a1',
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge: 'top', width: 10, remove: true },
      }),
    ).toThrowError(/remove takes no width or kind/);
  });

  it('rejects a missing, non-finite or non-positive width', () => {
    const document = withPiece();

    for (const width of [undefined, 0, -5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        applyCommand(document, {
          id: 'a1',
          type: 'set_piece_allowance',
          params: { piece: 'piece-1', edge: 'top', width },
        }),
      ).toThrowError(/width must be a finite number greater than 0/);
    }
  });

  it('rejects an unknown kind', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'a1',
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'zigzag' as never },
      }),
    ).toThrowError(/unknown allowance kind/);
  });
});

describe('add_derived_dimension', () => {
  it('adds a cut dimension measuring the cut loop', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const constraint = derivedOf(document, 'cut-width');

    expect(constraint).toEqual({
      id: 'cut-width',
      type: 'derived_distance',
      piece: 'piece-1',
      a: { edge: 'bottom', at: 'start' },
      b: { edge: 'bottom', at: 'end' },
      orientation: 'horizontal',
      offset: 15,
    });
    expect(measureCutDimension(document, constraint)).toBe(220);
    expect(derivedDimensionState(document, constraint)).toBe('derived');
    expect(derivedDimensionValue(document, constraint)).toBe(220);
    expect(derivedDimensionGeometry(document, constraint)).not.toBeNull();
  });

  it('measures vertically and follows a change to a contributing allowance', () => {
    const document = applyCommand(withPiece(), {
      id: 'cut-height',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'left', at: 'end' },
        b: { edge: 'left', at: 'start' },
        orientation: 'vertical',
      },
    }).document;
    expect(measureCutDimension(document, derivedOf(document, 'cut-height'))).toBe(210);

    const wider = applyCommand(document, {
      id: 'widen-left',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'left', width: 20 },
    }).document;
    // The left edge is vertical, so a wider allowance moves the cut loop sideways.
    expect(measureCutDimension(wider, derivedOf(wider, 'cut-height'))).toBe(210);
  });

  it('updates a width measurement when a contributing allowance changes', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    expect(measureCutDimension(document, derivedOf(document, 'cut-width'))).toBe(220);

    const wider = applyCommand(document, {
      id: 'widen-left',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'left', width: 20 },
    }).document;
    expect(measureCutDimension(wider, derivedOf(wider, 'cut-width'))).toBe(230);

    const doubled = applyCommand(wider, {
      id: 'double-top',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'top', width: 10, kind: 'double' },
    }).document;
    // The top edge contributes to the height, not the measured width.
    expect(measureCutDimension(doubled, derivedOf(doubled, 'cut-width'))).toBe(230);
  });

  it('measures an aligned cut dimension', () => {
    const document = applyCommand(withPiece(), {
      id: 'diagonal',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'left', at: 'start' },
      },
    }).document;
    const constraint = derivedOf(document, 'diagonal');

    expect(constraint).not.toHaveProperty('orientation');
    // (-10, 0) to (-10, 210).
    expect(measureCutDimension(document, constraint)).toBe(210);
  });

  it('reports a broken anchor without a reading', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const broken: PatternDocument = {
      ...document,
      pieces: [{ ...document.pieces[0]!, edges: ['bottom'] }],
    };

    expect(derivedDimensionState(broken, derivedOf(broken, 'cut-width'))).toBe('broken');
    expect(derivedDimensionValue(broken, derivedOf(broken, 'cut-width'))).toBeNull();
    expect(derivedDimensionGeometry(broken, derivedOf(broken, 'cut-width'))).toBeNull();
    expect(measureCutDimension(broken, derivedOf(broken, 'cut-width'))).toBeNull();
  });

  it('reports no reading when only the second anchor is broken', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const constraint = {
      ...derivedOf(document, 'cut-width'),
      b: { edge: 'ghost', at: 'end' as const },
    };

    expect(measureCutDimension(document, constraint)).toBeNull();
  });

  it('reports no reading when its piece is gone', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const constraint = { ...derivedOf(document, 'cut-width'), piece: 'ghost' };

    expect(measureCutDimension(document, constraint)).toBeNull();
  });

  it('keeps the last reading when a broken anchor has one', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const broken: PatternDocument = {
      ...document,
      pieces: [{ ...document.pieces[0]!, edges: ['bottom'] }],
      constraints: document.constraints.map((constraint) =>
        constraint.id === 'cut-width' ? { ...constraint, lastKnownValue: 111 } : constraint,
      ),
    };

    expect(derivedDimensionValue(broken, derivedOf(broken, 'cut-width'))).toBe(111);
  });

  it('is idempotent when the constraint id already exists', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const second = applyCommand(document, addDerived());

    expect(second.document).toBe(document);
    expect(second.inverse).toBeNull();
  });

  it('rejects an unknown piece', () => {
    expect(() =>
      applyCommand(withPiece(), {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'missing',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'bottom', at: 'end' },
        },
      }),
    ).toThrowError(/unknown piece/);
  });

  it('rejects an anchor edge outside the piece and an unknown anchor end', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'missing', at: 'start' },
          b: { edge: 'bottom', at: 'end' },
        },
      }),
    ).toThrowError(/is not in piece/);
    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'middle' as never },
          b: { edge: 'bottom', at: 'end' },
        },
      }),
    ).toThrowError(/must be 'start' or 'end'/);
  });

  it('rejects identical anchors and anchors that resolve to one point', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'bottom', at: 'start' },
        },
      }),
    ).toThrowError(/different loop vertices/);

    // The end of one edge and the start of the next share a loop vertex.
    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'end' },
          b: { edge: 'right', at: 'start' },
        },
      }),
    ).toThrowError(/same point/);
  });

  it('rejects an unknown orientation and a non-finite offset', () => {
    const document = withPiece();

    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'bottom', at: 'end' },
          orientation: 'diagonal' as never,
        },
      }),
    ).toThrowError(/unknown dimension orientation/);
    expect(() =>
      applyCommand(document, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'bottom', at: 'end' },
          offset: Number.POSITIVE_INFINITY,
        },
      }),
    ).toThrowError(/offset must be a finite number/);
  });

  it('rejects anchors that cannot resolve on the cut loop', () => {
    // A piece whose edges were deleted no longer resolves.
    const document = withPiece();
    const broken: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'top'),
    };

    expect(() =>
      applyCommand(broken, {
        id: 'dim',
        type: 'add_derived_dimension',
        params: {
          piece: 'piece-1',
          a: { edge: 'bottom', at: 'start' },
          b: { edge: 'bottom', at: 'end' },
        },
      }),
    ).toThrowError(/cannot resolve these anchors/);
  });
});

describe('update_constraint on a cut dimension', () => {
  it('moves the dimension line and restores its previous placement', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const result = applyCommand(document, {
      id: 'move',
      type: 'update_constraint',
      params: { id: 'cut-width', orientation: 'aligned', offset: 30 },
    });

    expect(getConstraint(result.document, 'cut-width')).toMatchObject({
      orientation: 'aligned',
      offset: 30,
    });
    expect(result.inverse).toEqual({
      id: 'move',
      type: 'update_constraint',
      params: { id: 'cut-width', orientation: 'horizontal', offset: 15 },
    });
  });

  it('materialises defaults when moving a dimension that had none', () => {
    const document = applyCommand(withPiece(), {
      id: 'dim',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'bottom', at: 'end' },
      },
    }).document;
    const result = applyCommand(document, {
      id: 'move',
      type: 'update_constraint',
      params: { id: 'dim', offset: 25 },
    });

    expect(result.inverse).toEqual({
      id: 'move',
      type: 'update_constraint',
      params: { id: 'dim', orientation: 'aligned', offset: 20 },
    });
  });

  it('moves only the selected dimension when another exists', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const withSecond = applyCommand(document, {
      id: 'cut-height',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'left', at: 'end' },
        b: { edge: 'left', at: 'start' },
        orientation: 'vertical',
      },
    }).document;
    const result = applyCommand(withSecond, {
      id: 'move',
      type: 'update_constraint',
      params: { id: 'cut-width', orientation: 'aligned' },
    });

    expect(getConstraint(result.document, 'cut-width')).toMatchObject({ orientation: 'aligned' });
    expect(getConstraint(result.document, 'cut-height')).toMatchObject({
      orientation: 'vertical',
    });
    expect(result.inverse).toEqual({
      id: 'move',
      type: 'update_constraint',
      params: { id: 'cut-width', orientation: 'horizontal', offset: 15 },
    });
  });

  it('is a no-op when placement does not change', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const result = applyCommand(document, {
      id: 'move',
      type: 'update_constraint',
      params: { id: 'cut-width', orientation: 'horizontal', offset: 15 },
    });

    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('rejects a value, a reference, no placement, an unknown orientation or a bad offset', () => {
    const document = applyCommand(withPiece(), addDerived()).document;

    expect(() =>
      applyCommand(document, {
        id: 'move',
        type: 'update_constraint',
        params: { id: 'cut-width', value: 100 },
      }),
    ).toThrowError(/read-only/);
    expect(() =>
      applyCommand(document, {
        id: 'move',
        type: 'update_constraint',
        params: { id: 'cut-width', reference: 'other' },
      }),
    ).toThrowError(/read-only/);
    expect(() =>
      applyCommand(document, {
        id: 'move',
        type: 'update_constraint',
        params: { id: 'cut-width' },
      }),
    ).toThrowError(/provide orientation or offset/);
    expect(() =>
      applyCommand(document, {
        id: 'move',
        type: 'update_constraint',
        params: { id: 'cut-width', orientation: 'diagonal' as never },
      }),
    ).toThrowError(/unknown dimension orientation/);
    expect(() =>
      applyCommand(document, {
        id: 'move',
        type: 'update_constraint',
        params: { id: 'cut-width', offset: Number.NaN },
      }),
    ).toThrowError(/offset must be a finite number/);
  });
});

describe('remove_constraint on a cut dimension', () => {
  it('removes the cut dimension and recreates it on undo', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const result = applyCommand(document, {
      id: 'remove',
      type: 'remove_constraint',
      params: { id: 'cut-width' },
    });

    expect(getConstraint(result.document, 'cut-width')).toBeUndefined();
    expect(result.inverse).toEqual({
      id: 'cut-width',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'bottom', at: 'end' },
        orientation: 'horizontal',
        offset: 15,
      },
    });
  });
});

describe('piece guards on the legacy tools', () => {
  it('refuses to toggle construction on an edge that belongs to a piece', () => {
    expect(() =>
      applyCommand(withPiece(), {
        id: 'toggle',
        type: 'set_construction',
        params: { id: 'bottom', construction: true },
      }),
    ).toThrowError(/belongs to a piece/);
  });

  it('refuses a legacy seam allowance on an edge that belongs to a piece', () => {
    expect(() =>
      applyCommand(withPiece(), {
        id: 'seam',
        type: 'add_seam_allowance',
        params: { edge: 'bottom', width: 10 },
      }),
    ).toThrowError(/set the allowance on the piece/);
  });

  it('refuses a corner round when the piece allowances differ at the corner', () => {
    expect(() =>
      applyCommand(withPiece(), {
        id: 'round',
        type: 'add_corner_round',
        params: { first: 'bottom', second: 'right', radius: 5 },
      }),
    ).toThrowError(/Both edges need the same allowance/);
  });
  it('recreates a dimension that had no explicit placement', () => {
    const document = applyCommand(withPiece(), {
      id: 'dim',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'bottom', at: 'end' },
      },
    }).document;
    const result = applyCommand(document, {
      id: 'remove',
      type: 'remove_constraint',
      params: { id: 'dim' },
    });

    expect(result.inverse).toEqual({
      id: 'dim',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'bottom', at: 'end' },
      },
    });
  });
});

describe('corner-round cascades', () => {
  it('removes a piece and its cut dimensions when the round rebuilds a loop edge', () => {
    const document: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        point('corner', 0, 0),
        point('t1', 10, 0),
        point('t2', 0, 10),
        point('a1', 20, 0),
        point('a2', 0, 20),
        point('c1', 5, 0),
        point('c2', 0, 5),
        line('l1', 't1', 'a1'),
        line('l2', 't2', 'a2'),
        {
          id: 'arc-1',
          kind: 'curve',
          p0: 't1',
          p1: 'c1',
          p2: 'c2',
          p3: 't2',
          construction: false,
        },
      ],
      pieces: [{ id: 'p', edges: ['arc-1', 'l1', 'l2'], allowances: [] }],
      constraints: [
        {
          id: 'dim',
          type: 'derived_distance',
          piece: 'p',
          a: { edge: 'l1', at: 'start' },
          b: { edge: 'l1', at: 'end' },
        },
      ],
      cornerRounds: [
        {
          id: 'round',
          corner: 'corner',
          ends: [
            { line: 'l1', anchor: 'a1', tangent: 't1' },
            { line: 'l2', anchor: 'a2', tangent: 't2' },
          ],
          radius: 5,
          arc: 'arc-1',
          controls: ['c1', 'c2'],
          cornerConstruction: false,
        },
      ],
    };
    const result = applyCommand(document, {
      id: 'remove-round',
      type: 'remove_corner_round',
      params: { id: 'round' },
    });

    expect(result.document.pieces).toEqual([]);
    expect(result.document.constraints).toEqual([]);
    expect(result.document.entities.some((entity) => entity.id === 'arc-1')).toBe(false);
  });
});

describe('piece deletion cascades', () => {
  it('deletes a piece when one of its edges is deleted, with its cut dimensions', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const result = applyCommand(document, {
      id: 'delete-edge',
      type: 'delete_entity',
      params: { id: 'bottom' },
    });

    expect(result.document.pieces).toEqual([]);
    expect(result.document.constraints).toEqual([]);
    expect(result.document.entities.some((entity) => entity.id === 'bottom')).toBe(false);
  });

  it('keeps a piece when an unconnected guide is deleted', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const withGuide = applyCommand(document, {
      id: 'guide',
      type: 'add_point',
      params: { x: 500, y: 500, construction: true },
    }).document;
    const result = applyCommand(withGuide, {
      id: 'delete-guide',
      type: 'delete_entity',
      params: { id: 'guide' },
    });

    expect(result.document.pieces).toHaveLength(1);
    expect(result.document.constraints).toHaveLength(1);
  });
});

describe('cut dimensions stay out of the solver', () => {
  it('solves a document with a cut dimension without adding an equation', () => {
    const document = applyCommand(withPiece(), addDerived()).document;
    const solved = solveDocument(document);

    expect(solved.result.converged).toBe(true);
    expect(solved.document.constraints).toHaveLength(1);
    expect(getConstraint(solved.document, 'cut-width')?.type).toBe('derived_distance');
    expect(derivedDimensionValue(solved.document, derivedOf(solved.document, 'cut-width'))).toBe(
      220,
    );
  });
});

describe('corner rounds on piece corners', () => {
  const roundCorner = (id = 'round-1', radius = 20, first = 'right', second = 'top'): Command => ({
    id,
    type: 'add_corner_round',
    params: { first, second, radius },
  });

  function roundedPiece(): PatternDocument {
    return applyCommand(withPiece(), roundCorner()).document;
  }

  it('keeps the piece, its edges and its allowances', () => {
    const before = withPiece();
    const after = applyCommand(before, roundCorner()).document;
    const piece = pieceById(after, 'piece-1')!;

    expect(piece.edges).toEqual(['bottom', 'right', 'top', 'left']);
    expect(piece.allowances).toEqual(pieceById(before, 'piece-1')!.allowances);
    expect(pieceLoop(after, piece)).not.toBeNull();
    expect(pieceCutLoop(after, piece)?.selfIntersections).toEqual([]);
  });

  it('rejects two edges whose piece allowances differ', () => {
    // `bottom` has no allowance, `right` has 10 mm single.
    expect(() =>
      applyCommand(withPiece(), roundCorner('round-1', 20, 'bottom', 'right')),
    ).toThrowError(/Both edges need the same allowance to round this corner/);
  });

  it('rejects an allowance edit that would unbalance a rounded corner', () => {
    const document = roundedPiece();
    const target = pieceById(document, 'piece-1')!;

    expect(() =>
      applyCommand(document, {
        id: 'widen',
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge: 'right', width: 12, kind: 'single' },
      }),
    ).toThrowError(/Remove the corner round before changing one side/);

    expect(() =>
      applyCommand(document, {
        id: 'remove-right',
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge: 'right', remove: true },
      }),
    ).toThrowError(/Remove the corner round before changing one side/);

    // An edge without a round on it is still editable.
    const widened = applyCommand(document, {
      id: 'widen-left',
      type: 'set_piece_allowance',
      params: { piece: 'piece-1', edge: 'left', width: 12, kind: 'single' },
    }).document;
    expect(pieceById(widened, 'piece-1')!.allowances).toContainEqual({
      edge: 'left',
      width: 12,
      kind: 'single',
    });
    expect(target.allowances).toHaveLength(3);
  });

  it('removing the round restores the sharp loop and keeps the piece', () => {
    const before = withPiece();
    const sharp = pieceCutLoop(before, pieceById(before, 'piece-1')!);
    const rounded = roundedPiece();

    const removed = applyCommand(rounded, {
      id: 'remove-round',
      type: 'remove_corner_round',
      params: { id: 'round-1' },
    }).document;

    expect(pieceById(removed, 'piece-1')!.allowances).toEqual(
      pieceById(before, 'piece-1')!.allowances,
    );
    expect(pieceCutLoop(removed, pieceById(removed, 'piece-1')!)).toEqual(sharp);
  });

  it('keeps a cut dimension anchored to a rounded piece', () => {
    const document = roundedPiece();
    const withDimension = applyCommand(document, {
      id: 'cut-width',
      type: 'add_derived_dimension',
      params: {
        piece: 'piece-1',
        a: { edge: 'bottom', at: 'start' },
        b: { edge: 'bottom', at: 'end' },
        orientation: 'horizontal',
      },
    }).document;

    const value = measureCutDimension(withDimension, getConstraint(withDimension, 'cut-width')!);
    expect(value).toBeCloseTo(220);
  });

  it('updates the loop when the radius changes', () => {
    const document = roundedPiece();
    const piece = pieceById(document, 'piece-1')!;
    const before = pieceLoop(document, piece)!;

    const changed = applyCommand(document, {
      id: 'radius',
      type: 'set_corner_round_radius',
      params: { id: 'round-1', radius: 40 },
    }).document;
    const after = pieceLoop(changed, pieceById(changed, 'piece-1')!)!;

    expect(after).not.toBeNull();
    expect(after.points).not.toEqual(before.points);
  });

  it('does not block a round when an unrelated piece loop cannot resolve', () => {
    const broken: Piece = {
      id: 'piece-1',
      edges: ['right', 'top'],
      allowances: [
        { edge: 'right', width: 10 },
        { edge: 'top', width: 10 },
      ],
    };
    const document = { ...documentOf(), pieces: [broken] };

    const rounded = applyCommand(document, roundCorner()).document;
    expect(pieceById(rounded, 'piece-1')!.edges).toEqual(['right', 'top']);
  });

  it('rejects a radius whose allowance folds the cut line', () => {
    const lShape: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 40),
      point('d', 40, 40),
      point('e', 40, 100),
      point('f', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('de', 'd', 'e'),
      line('ef', 'e', 'f'),
      line('fa', 'f', 'a'),
    ];
    const edges = ['ab', 'bc', 'cd', 'de', 'ef', 'fa'];
    let document = applyCommand(
      { ...createEmptyDocument(), entities: lShape },
      {
        id: 'piece-1',
        type: 'create_piece',
        params: { edges },
      },
    ).document;
    for (const [index, edge] of ['cd', 'de'].entries()) {
      document = applyCommand(document, {
        id: `allow-${index}`,
        type: 'set_piece_allowance',
        params: { piece: 'piece-1', edge, width: 10 },
      }).document;
    }

    const piece = pieceById(document, 'piece-1')!;
    expect(pieceCutLoop(document, piece)?.selfIntersections).toEqual([]);

    expect(() =>
      applyCommand(document, {
        id: 'round-concave',
        type: 'add_corner_round',
        params: { first: 'cd', second: 'de', radius: 1 },
      }),
    ).toThrowError(/folds the cut line/);
  });
});
