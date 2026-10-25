import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  getConstraint,
  getEntity,
  pieceById,
  type Command,
  type Constraint,
  type Entity,
  type PatternDocument,
  type Piece,
  type TextEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece = 'p1'): Entity => ({
  id,
  kind: 'point',
  x,
  y,
  piece,
  fixed: false,
});

const line = (id: string, start: string, end: string, piece = 'p1'): Entity => ({
  id,
  kind: 'line',
  start,
  end,
  piece,
});

const square = (): Entity[] => [
  point('a', 0, 0),
  point('b', 100, 0),
  point('c', 100, 100),
  point('d', 0, 100),
  line('bottom', 'a', 'b'),
  line('right', 'b', 'c'),
  line('top', 'c', 'd'),
  line('left', 'd', 'a'),
];

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: 'p1',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [],
  ...overrides,
});

const documentOf = (
  extra: Entity[] = [],
  pieces: Piece[] = [piece()],
  constraints: Constraint[] = [],
): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...square(), ...extra],
  pieces,
  constraints,
  defaults: { allowance: { width: 10, kind: 'seam' } },
});

const apply = (document: PatternDocument, command: Command): PatternDocument =>
  applyCommand(document, command).document;

const setLoop = (edges: string[], allowance?: 'default' | 'none'): Command => ({
  id: 'loop',
  type: 'set_piece_loop',
  params: { piece: 'p1', edges, ...(allowance === undefined ? {} : { allowance }) },
});

const addText = (overrides: Record<string, unknown> = {}): Command => ({
  id: 't1',
  type: 'add_text',
  params: { piece: 'p1', anchor: 'a', content: 'velcro', ...overrides },
});

describe('add_* ownership and roles', () => {
  it('stores the piece and role on a new point', () => {
    const added = apply(documentOf([], [piece({ edges: [] })]), {
      id: 'x',
      type: 'add_point',
      params: { x: 1, y: 2, piece: 'p1', role: 'annotation' },
    });

    expect(getEntity(added, 'x')).toMatchObject({ piece: 'p1', role: 'annotation' });
  });

  it('accepts the deprecated construction flag on a line', () => {
    const added = apply(documentOf(), {
      id: 'g',
      type: 'add_line',
      params: { start: 'a', end: 'b', piece: 'p1', construction: true },
    });

    expect(getEntity(added, 'g')).toMatchObject({ role: 'construction' });
  });

  it('rejects an unknown piece', () => {
    expect(() =>
      applyCommand(createEmptyDocument(), {
        id: 'x',
        type: 'add_point',
        params: { x: 1, y: 2, piece: 'missing' },
      }),
    ).toThrow('unknown piece: missing');
  });

  it('rejects a constraint that spans pieces', () => {
    const document = documentOf([point('other', 0, 0, 'p2')], [piece(), piece({ id: 'p2' })]);
    expect(() =>
      applyCommand(document, {
        id: 'c',
        type: 'add_constraint',
        params: { type: 'horizontal', entities: ['a', 'other'], piece: 'p1' },
      }),
    ).toThrow('entity other belongs to another piece');
  });

  it('rejects a reference source dimension from another piece', () => {
    const document = documentOf(
      [],
      [piece(), piece({ id: 'p2' })],
      [{ id: 'source', type: 'distance', a: 'a', b: 'b', value: 10, piece: 'p2' }],
    );
    expect(() =>
      applyCommand(document, {
        id: 'c',
        type: 'add_constraint',
        params: { type: 'distance', entities: ['a', 'b'], reference: 'source', piece: 'p1' },
      }),
    ).toThrow('reference source belongs to another piece');
  });

  it('stores the piece on a constraint', () => {
    const added = apply(documentOf(), {
      id: 'c',
      type: 'add_constraint',
      params: { type: 'horizontal', entities: ['a', 'b'], piece: 'p1' },
    });

    expect(getConstraint(added, 'c')).toMatchObject({ piece: 'p1' });
  });
});

describe('create_piece and set_piece_loop', () => {
  it('creates an empty piece by default', () => {
    const added = apply(createEmptyDocument(), {
      id: 'p1',
      type: 'create_piece',
      params: { name: 'Front' },
    });

    expect(pieceById(added, 'p1')).toEqual({ id: 'p1', name: 'Front', edges: [], allowances: [] });
  });

  it('captures a loop and applies the document default allowance', () => {
    const added = apply(documentOf(), setLoop(['bottom', 'right', 'top', 'left']));

    expect(pieceById(added, 'p1')?.edges).toEqual(['bottom', 'right', 'top', 'left']);
    expect(pieceById(added, 'p1')?.allowances).toEqual([
      { edge: 'bottom', width: 10, kind: 'seam' },
      { edge: 'right', width: 10, kind: 'seam' },
      { edge: 'top', width: 10, kind: 'seam' },
      { edge: 'left', width: 10, kind: 'seam' },
    ]);
  });

  it('keeps an existing allowance when the loop is re-set', () => {
    const document = documentOf([], [piece({ allowances: [{ edge: 'bottom', width: 4 }] })]);
    const added = apply(document, setLoop(['bottom', 'right', 'top', 'left']));

    expect(pieceById(added, 'p1')?.allowances[0]).toEqual({ edge: 'bottom', width: 4 });
  });

  it('clears the loop and its allowances', () => {
    const document = documentOf([], [piece({ allowances: [{ edge: 'bottom', width: 4 }] })]);
    const added = apply(document, setLoop([]));

    expect(pieceById(added, 'p1')).toEqual({ id: 'p1', edges: [], allowances: [] });
  });

  it('adopts unowned edges into the piece', () => {
    const unowned = square().map(({ piece: _piece, ...entity }) => entity as Entity);
    const document: PatternDocument = {
      ...documentOf(),
      entities: unowned,
      pieces: [piece({ edges: [] })],
    };
    const added = apply(document, setLoop(['bottom', 'right', 'top', 'left']));

    expect(getEntity(added, 'bottom')).toMatchObject({ piece: 'p1' });
  });

  it('rejects an open chain, annotation, construction, circle and foreign edge', () => {
    const annotation = documentOf([{ ...line('mark', 'a', 'b'), role: 'annotation' }]);
    expect(() => applyCommand(annotation, setLoop(['mark', 'bottom', 'right']))).toThrow(
      'annotation geometry',
    );

    const construction = documentOf([{ ...line('guide', 'a', 'b'), role: 'construction' }]);
    expect(() => applyCommand(construction, setLoop(['guide', 'bottom', 'right']))).toThrow(
      'construction geometry',
    );

    const circle = documentOf([
      { id: 'circle', kind: 'circle', center: 'a', rim: 'b', piece: 'p1' },
    ]);
    expect(() => applyCommand(circle, setLoop(['circle', 'bottom', 'right']))).toThrow('circle');

    const foreign = documentOf(
      [point('x', 0, 0, 'p2'), point('y', 10, 0, 'p2'), line('other-bottom', 'x', 'y', 'p2')],
      [piece(), piece({ id: 'p2', edges: ['other-bottom'], allowances: [] })],
    );
    expect(() => applyCommand(foreign, setLoop(['bottom', 'right', 'other-bottom']))).toThrow(
      'belongs to another piece',
    );

    expect(() => applyCommand(documentOf(), setLoop(['bottom', 'right']))).toThrow(
      'at least three edges',
    );
    expect(() => applyCommand(documentOf(), setLoop(['bottom', 'right', 'bottom', 'top']))).toThrow(
      'selected more than once',
    );
  });

  it('rejects an unknown piece and a missing edge', () => {
    expect(() =>
      applyCommand(documentOf(), {
        id: 'loop',
        type: 'set_piece_loop',
        params: { piece: 'missing', edges: [] },
      }),
    ).toThrow('unknown piece');

    expect(() => applyCommand(documentOf(), setLoop(['bottom', 'right', 'nope']))).toThrow(
      'does not exist',
    );
  });
});

describe('set_role', () => {
  it('changes a cut edge to construction and back through its inverse', () => {
    const applied = applyCommand(documentOf(), {
      id: 'role',
      type: 'set_role',
      params: { id: 'bottom', role: 'construction' },
    });

    expect(getEntity(applied.document, 'bottom')).toMatchObject({ role: 'construction' });
    expect(applied.inverse).toEqual({
      id: 'role',
      type: 'set_role',
      params: { id: 'bottom', role: 'cut' },
    });

    const back = apply(applied.document, applied.inverse!);
    expect(getEntity(back, 'bottom')).not.toHaveProperty('role');
  });

  it('marks an annotation and is a no-op for the same role', () => {
    const added = apply(documentOf(), {
      id: 'role',
      type: 'set_role',
      params: { id: 'top', role: 'annotation' },
    });
    expect(getEntity(added, 'top')).toMatchObject({ role: 'annotation' });

    expect(() =>
      applyCommand(added, {
        id: 'role2',
        type: 'set_role',
        params: { id: 'top', role: 'annotation' },
      }),
    ).not.toThrow();
  });

  it('refuses text, unknown entities, unknown roles and a rounded cut line', () => {
    const withText = apply(documentOf(), addText());
    expect(() =>
      applyCommand(withText, { id: 'r', type: 'set_role', params: { id: 't1', role: 'cut' } }),
    ).toThrow('text is always annotation');

    expect(() =>
      applyCommand(documentOf(), { id: 'r', type: 'set_role', params: { id: 'x', role: 'cut' } }),
    ).toThrow('unknown entity');

    expect(() =>
      applyCommand(documentOf(), {
        id: 'r',
        type: 'set_role',
        params: { id: 'bottom', role: 'nope' as never },
      }),
    ).toThrow('unknown role');

    const rounded = apply(documentOf(), {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    });
    expect(() =>
      applyCommand(rounded, {
        id: 'r',
        type: 'set_role',
        params: { id: 'bottom', role: 'annotation' },
      }),
    ).toThrow('Remove the corner round first.');
  });
});

describe('move_piece', () => {
  it('translates every owned point, including fixed ones, and returns the inverse', () => {
    const fixed = { ...point('fixed', 50, 50), fixed: true } as Entity;
    const document = documentOf([fixed]);
    const applied = applyCommand(document, {
      id: 'move',
      type: 'move_piece',
      params: { id: 'p1', dx: 5, dy: -7 },
    });

    expect(getEntity(applied.document, 'a')).toMatchObject({ x: 5, y: -7 });
    expect(getEntity(applied.document, 'fixed')).toMatchObject({ x: 55, y: 43 });
    expect(applied.inverse).toEqual({
      id: 'move',
      type: 'move_piece',
      params: { id: 'p1', dx: -5, dy: 7 },
    });
    expect(apply(applied.document, applied.inverse!)).toEqual(document);
  });

  it('no-ops at zero and rejects non-finite deltas and an unknown piece', () => {
    const document = documentOf();
    expect(
      applyCommand(document, { id: 'm', type: 'move_piece', params: { id: 'p1', dx: 0, dy: 0 } })
        .document,
    ).toBe(document);

    expect(() =>
      applyCommand(document, {
        id: 'm',
        type: 'move_piece',
        params: { id: 'p1', dx: Number.NaN, dy: 0 },
      }),
    ).toThrow('finite');
    expect(() =>
      applyCommand(document, { id: 'm', type: 'move_piece', params: { id: 'p2', dx: 1, dy: 1 } }),
    ).toThrow('unknown piece');
  });
});

describe('add_text and update_text', () => {
  it('creates a label with defaults', () => {
    const added = apply(documentOf(), addText());

    expect(getEntity(added, 't1')).toEqual({
      id: 't1',
      kind: 'text',
      piece: 'p1',
      anchor: 'a',
      content: 'velcro',
      alignment: 'left',
      rotation: 0,
      fontSize: 10,
    });
  });

  it('trims content and accepts a leader', () => {
    const added = apply(
      documentOf(),
      addText({
        content: '  rivet 2×  ',
        alignment: 'center',
        rotation: 1,
        fontSize: 8,
        leader: 'b',
      }),
    );

    expect(getEntity(added, 't1')).toMatchObject({
      content: 'rivet 2×',
      alignment: 'center',
      rotation: 1,
      fontSize: 8,
      leader: 'b',
    });
  });

  it('rejects invalid content, size, rotation, alignment and anchors', () => {
    const document = documentOf();
    expect(() => applyCommand(document, addText({ content: '   ' }))).toThrow('1–120');
    expect(() => applyCommand(document, addText({ content: 'x'.repeat(121) }))).toThrow('1–120');
    expect(() => applyCommand(document, addText({ content: 'a\nb' }))).toThrow('single line');
    expect(() => applyCommand(document, addText({ content: 4 }))).toThrow('must be a string');
    expect(() => applyCommand(document, addText({ fontSize: 0 }))).toThrow('fontSize');
    expect(() => applyCommand(document, addText({ fontSize: 101 }))).toThrow('fontSize');
    expect(() => applyCommand(document, addText({ rotation: Number.NaN }))).toThrow('rotation');
    expect(() => applyCommand(document, addText({ alignment: 'top' }))).toThrow('alignment');
    expect(() => applyCommand(document, addText({ piece: 'missing' }))).toThrow('unknown piece');
    expect(() => applyCommand(document, addText({ anchor: 'missing' }))).toThrow('unknown entity');
    expect(() =>
      applyCommand(
        documentOf([point('x', 0, 0, 'p2')], [piece(), piece({ id: 'p2' })]),
        addText({ anchor: 'x' }),
      ),
    ).toThrow('belongs to another piece');
    expect(() => applyCommand(document, addText({ leader: 'a' }))).toThrow(
      'differ from the anchor',
    );
  });

  it('rejects an anchor derived by a corner round', () => {
    const rounded = apply(documentOf(), {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    });
    expect(() => applyCommand(rounded, addText({ anchor: 'round:a' }))).toThrow('derived corner');
  });

  it('edits content, anchor, presentation and the leader', () => {
    const withText = apply(documentOf(), addText({ leader: 'b' }));
    const updated = apply(withText, {
      id: 'u',
      type: 'update_text',
      params: {
        id: 't1',
        content: '  snap ',
        anchor: 'c',
        alignment: 'right',
        rotation: 2,
        fontSize: 12,
        leader: 'd',
      },
    });

    expect(getEntity(updated, 't1')).toMatchObject({
      content: 'snap',
      anchor: 'c',
      alignment: 'right',
      rotation: 2,
      fontSize: 12,
      leader: 'd',
    });
  });

  it('removes a leader with null and restores the previous label through the inverse', () => {
    const withText = apply(documentOf(), addText({ leader: 'b' }));
    const applied = applyCommand(withText, {
      id: 'u',
      type: 'update_text',
      params: { id: 't1', leader: null },
    });

    expect(getEntity(applied.document, 't1')).not.toHaveProperty('leader');
    const restored = apply(applied.document, applied.inverse!);
    expect(getEntity(restored, 't1')).toMatchObject({ leader: 'b' });
  });

  it('rejects an edit with no fields, a missing or non-text entity and an invalid leader', () => {
    const withText = apply(documentOf(), addText());
    const document = documentOf(
      withText.entities.filter((entity) => entity.id !== 't1') as Entity[],
    );
    // Reuse the applied document so text exists, but mutate the selected id.
    expect(() =>
      applyCommand(withText, { id: 'u', type: 'update_text', params: { id: 't1' } }),
    ).toThrow('provide content');
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 'missing', content: 'x' },
      }),
    ).toThrow('unknown entity');
    expect(() =>
      applyCommand(document, { id: 'u', type: 'update_text', params: { id: 'a', content: 'x' } }),
    ).toThrow('is not text');
    expect(() =>
      applyCommand(withText, { id: 'u', type: 'update_text', params: { id: 't1', leader: 'a' } }),
    ).toThrow('differ from the anchor');
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', content: '   ' },
      }),
    ).toThrow('1–120');
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', fontSize: 0 },
      }),
    ).toThrow('fontSize');
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', alignment: 'top' as never },
      }),
    ).toThrow('alignment');
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', rotation: Number.NaN },
      }),
    ).toThrow('rotation');
  });

  it('rejects text whose owner is missing', () => {
    const orphan: TextEntity = {
      id: 't1',
      kind: 'text',
      anchor: 'a',
      content: 'x',
    };
    const document: PatternDocument = {
      ...documentOf(),
      entities: [...documentOf().entities, orphan],
      pieces: [],
    };
    expect(() =>
      applyCommand(document, { id: 'u', type: 'update_text', params: { id: 't1', content: 'y' } }),
    ).toThrow('not owned by a piece');
  });

  it('deletes a label with its anchor but keeps it when only the leader goes', () => {
    const withText = apply(documentOf(), addText({ leader: 'b' }));
    const anchorGone = apply(withText, {
      id: 'del',
      type: 'delete_entity',
      params: { id: 'a' },
    });
    expect(getEntity(anchorGone, 't1')).toBeUndefined();

    const leaderGone = apply(withText, {
      id: 'del',
      type: 'delete_entity',
      params: { id: 'b' },
    });
    expect(getEntity(leaderGone, 't1')).toMatchObject({ anchor: 'a' });
    expect(getEntity(leaderGone, 't1')).not.toHaveProperty('leader');
  });
});

describe('delete_piece cascade', () => {
  it('deletes owned geometry, constraints, texts and rounds but not another piece', () => {
    const other: Piece = { id: 'p2', edges: [], allowances: [] };
    const otherLine: Entity = line('other', 'x', 'y', 'p2');
    const document = documentOf(
      [
        point('x', 0, 0, 'p2'),
        point('y', 10, 0, 'p2'),
        otherLine,
        { ...line('mark', 'a', 'b'), role: 'annotation' },
      ],
      [piece(), other],
      [{ id: 'c', type: 'horizontal', a: 'a', b: 'b', piece: 'p1' }],
    );
    const withText = apply(document, addText());
    const deleted = apply(withText, { id: 'del', type: 'delete_piece', params: { id: 'p1' } });

    expect(pieceById(deleted, 'p1')).toBeUndefined();
    expect(pieceById(deleted, 'p2')).toBeDefined();
    expect(getEntity(deleted, 'other')).toBeDefined();
    expect(getEntity(deleted, 'bottom')).toBeUndefined();
    expect(getEntity(deleted, 't1')).toBeUndefined();
    expect(getConstraint(deleted, 'c')).toBeUndefined();
  });
});

describe('remaining ownership guards', () => {
  it('stores the piece on curves, arcs and circles and rejects an unknown piece', () => {
    const base = documentOf(
      [point('e', 10, 10), point('f', 20, 20), point('g', 30, 10), point('h', 40, 20)],
      [piece({ edges: [] })],
    );

    const curve = apply(base, {
      id: 'curve',
      type: 'add_curve',
      params: { p0: 'a', p1: 'e', p2: 'f', p3: 'b', piece: 'p1' },
    });
    expect(getEntity(curve, 'curve')).toMatchObject({ piece: 'p1' });

    const arc = apply(base, {
      id: 'arc',
      type: 'add_arc',
      params: { start: 'a', end: 'b', through: 'g', piece: 'p1' },
    });
    expect(getEntity(arc, 'arc')).toMatchObject({ piece: 'p1' });

    const circle = apply(base, {
      id: 'circle',
      type: 'add_circle',
      params: { center: 'a', rim: 'b', piece: 'p1' },
    });
    expect(getEntity(circle, 'circle')).toMatchObject({ piece: 'p1' });

    for (const type of ['add_curve', 'add_arc', 'add_circle'] as const) {
      const params =
        type === 'add_curve'
          ? { p0: 'a', p1: 'e', p2: 'f', p3: 'b', piece: 'missing' }
          : type === 'add_arc'
            ? { start: 'a', end: 'b', through: 'g', piece: 'missing' }
            : { center: 'a', rim: 'b', piece: 'missing' };
      expect(() => applyCommand(base, { id: 'x', type, params } as Command)).toThrow(
        'unknown piece',
      );
    }
  });

  it('refuses to toggle construction on a text entity', () => {
    const withText = apply(documentOf(), addText());
    expect(() =>
      applyCommand(withText, {
        id: 'c',
        type: 'set_construction',
        params: { id: 't1', construction: true },
      }),
    ).toThrow('text is always annotation');
  });

  it('refuses to round an annotation line', () => {
    const document = documentOf([{ ...line('mark', 'a', 'b'), role: 'annotation' }]);
    expect(() =>
      applyCommand(document, {
        id: 'r',
        type: 'add_corner_round',
        params: { first: 'mark', second: 'right', radius: 5 },
      }),
    ).toThrow('Annotation geometry cannot be rounded');
  });

  it('no-ops an add_text whose id already exists', () => {
    const withText = apply(documentOf(), addText());
    const again = applyCommand(withText, addText());
    expect(again.document).toBe(withText);
    expect(again.inverse).toBeNull();
  });

  it('accepts an explicit none allowance on a new loop', () => {
    const added = apply(
      documentOf([], [piece({ edges: [], allowances: [] })]),
      setLoop(['bottom', 'right', 'top', 'left'], 'none'),
    );
    expect(pieceById(added, 'p1')?.allowances).toEqual([]);
  });

  it('cascades texts led from a deleted piece and keeps rounds and seams consistent', () => {
    const withText = apply(documentOf(), addText({ leader: 'b' }));
    const withRound = apply(withText, {
      id: 'round',
      type: 'add_corner_round',
      params: { first: 'bottom', second: 'right', radius: 10 },
    });
    const deleted = apply(withRound, { id: 'del', type: 'delete_piece', params: { id: 'p1' } });

    expect(getEntity(deleted, 't1')).toBeUndefined();
    expect(deleted.cornerRounds).toEqual([]);
    expect(deleted.entities.some((entity) => entity.id === 'round:arc')).toBe(false);
  });

  it('reports a missing anchor and a wrong-piece leader on update_text', () => {
    const withText = apply(documentOf(), addText());
    expect(() =>
      applyCommand(withText, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', anchor: 'missing' },
      }),
    ).toThrow('unknown entity');

    const twoPieces = apply(
      documentOf(
        [point('other', 0, 0, 'p2')],
        [piece(), piece({ id: 'p2', edges: [], allowances: [] })],
      ),
      addText(),
    );
    expect(() =>
      applyCommand(twoPieces, {
        id: 'u',
        type: 'update_text',
        params: { id: 't1', leader: 'other' },
      }),
    ).toThrow('belongs to another piece');
  });
});

describe('cascade and preset details', () => {
  it('keeps another piece, its text, its constraint and legacy seams on delete', () => {
    const otherText: TextEntity = {
      id: 'other-text',
      kind: 'text',
      piece: 'p2',
      anchor: 'x',
      content: 'keep',
    };
    const led: TextEntity = {
      id: 'other-led',
      kind: 'text',
      piece: 'p2',
      anchor: 'x',
      leader: 'y',
      content: 'keep',
    };
    const document: PatternDocument = {
      ...documentOf(
        [point('x', 0, 0, 'p2'), point('y', 1, 1, 'p2'), otherText, led],
        [piece(), piece({ id: 'p2', edges: [], allowances: [] })],
        [{ id: 'c2', type: 'horizontal', a: 'x', b: 'x', piece: 'p2' }],
      ),
      seams: [{ id: 's', edge: 'other', width: 5 }],
    };
    const deleted = apply(document, { id: 'del', type: 'delete_piece', params: { id: 'p1' } });

    expect(getEntity(deleted, 'other-text')).toBeDefined();
    expect(getEntity(deleted, 'other-led')).toMatchObject({ leader: 'y' });
    expect(getConstraint(deleted, 'c2')).toBeDefined();
    expect(deleted.seams).toEqual([{ id: 's', edge: 'other', width: 5 }]);
  });

  it('uses an explicit allowance preset on a new loop', () => {
    const added = apply(documentOf([], [piece({ edges: [], allowances: [] })]), {
      id: 'loop',
      type: 'set_piece_loop',
      params: {
        piece: 'p1',
        edges: ['bottom', 'right', 'top', 'left'],
        allowance: { width: 5 },
      },
    });
    expect(pieceById(added, 'p1')?.allowances[0]).toEqual({
      edge: 'bottom',
      width: 5,
      kind: 'seam',
    });
  });

  it('edits only the content of a label that uses defaults', () => {
    const bare: TextEntity = {
      id: 't1',
      kind: 'text',
      piece: 'p1',
      anchor: 'a',
      content: 'x',
    };
    const document: PatternDocument = {
      ...documentOf(),
      entities: [...documentOf().entities, bare],
    };
    const updated = apply(document, {
      id: 'u',
      type: 'update_text',
      params: { id: 't1', content: 'y' },
    });

    expect(getEntity(updated, 't1')).toMatchObject({
      content: 'y',
      alignment: 'left',
      rotation: 0,
      fontSize: 10,
    });
  });
});

describe('empty and unfiltered branches', () => {
  it('keeps a label when an unrelated entity is deleted', () => {
    const withText = apply(documentOf(), addText({ leader: 'b' }));
    const deleted = apply(withText, { id: 'del', type: 'delete_entity', params: { id: 'top' } });

    expect(getEntity(deleted, 't1')).toMatchObject({ anchor: 'a', leader: 'b' });
  });

  it('no-ops clearing an already empty loop', () => {
    const empty = documentOf([], [piece({ edges: [], allowances: [] })]);
    const command = {
      id: 'loop',
      type: 'set_piece_loop',
      params: { piece: 'p1', edges: [] },
    } as Command;
    expect(applyCommand(empty, command).document).toBe(empty);
  });

  it('adds a curve without a piece owner', () => {
    const base = documentOf([point('e', 10, 10), point('f', 20, 20)], [piece({ edges: [] })]);
    const added = apply(base, {
      id: 'curve',
      type: 'add_curve',
      params: { p0: 'a', p1: 'e', p2: 'f', p3: 'b' },
    });
    expect(getEntity(added, 'curve')).not.toHaveProperty('piece');

    const annotated = apply(base, {
      id: 'curve2',
      type: 'add_curve',
      params: { p0: 'a', p1: 'e', p2: 'f', p3: 'b', piece: 'p1', role: 'annotation' },
    });
    expect(getEntity(annotated, 'curve2')).toMatchObject({ role: 'annotation' });
  });

  it('removes a persisted round without a centre when its piece goes', () => {
    const document = documentOf();
    document.cornerRounds = [
      {
        id: 'r',
        corner: 'a',
        ends: [
          { line: 'bottom', anchor: 'a', tangent: 't1' },
          { line: 'right', anchor: 'b', tangent: 't2' },
        ],
        radius: 5,
        arc: 'arc',
        controls: ['c1', 'c2'],
      },
    ];
    const deleted = apply(document, { id: 'del', type: 'delete_piece', params: { id: 'p1' } });
    expect(deleted.cornerRounds).toEqual([]);
  });
});
