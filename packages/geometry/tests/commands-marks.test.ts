import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  getEntity,
  pieceMarks,
  type Command,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type TextEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  fixed: false,
});

const line = (id: string, start: string, end: string): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
});

const text = (id: string, anchor: string): TextEntity => ({
  id,
  kind: 'text',
  piece: 'piece-1',
  anchor,
  content: 'label',
});

const allowance = (edge: string, width = 10) => ({ edge, width, kind: 'single' as const });

/** A 200 mm square with an allowance on every edge and a midpoint on the bottom. */
function square(overrides: { allowances?: Piece['allowances']; edges?: string[] } = {}) {
  const piece: Piece = {
    id: 'piece-1',
    edges: overrides.edges ?? ['e1', 'e2', 'e3', 'e4'],
    allowances: overrides.allowances ?? [
      allowance('e1'),
      allowance('e2'),
      allowance('e3'),
      allowance('e4'),
    ],
  };
  return {
    ...createEmptyDocument(),
    entities: [
      point('a', 0, 0),
      point('b', 200, 0),
      point('c', 200, 200),
      point('d', 0, 200),
      point('m', 100, 0),
      line('e1', 'a', 'b'),
      line('e2', 'b', 'c'),
      line('e3', 'c', 'd'),
      line('e4', 'd', 'a'),
    ],
    pieces: [piece],
  } satisfies PatternDocument;
}

const addNotch = (params: {
  piece?: string;
  edge?: string;
  point?: string;
  depth?: number;
}): Command => ({
  id: 'notch-1',
  type: 'add_notch',
  params: { piece: 'piece-1', edge: 'e1', point: 'm', ...params },
});

describe('add_notch', () => {
  it('creates a notch on an edge with an allowance', () => {
    const applied = applyCommand(square(), addNotch({}));

    expect(getEntity(applied.document, 'notch-1')).toEqual({
      id: 'notch-1',
      kind: 'mark',
      type: 'notch',
      piece: 'piece-1',
      edge: 'e1',
      point: 'm',
    });
    expect(applied.inverse).toEqual({
      id: 'notch-1',
      type: 'delete_entity',
      params: { id: 'notch-1' },
    });
  });

  it('stores an explicit depth share', () => {
    const applied = applyCommand(square(), addNotch({ depth: 0.25 }));
    expect(getEntity(applied.document, 'notch-1')).toMatchObject({ depth: 0.25 });
  });

  it('is idempotent', () => {
    const first = applyCommand(square(), addNotch({}));
    const second = applyCommand(first.document, addNotch({}));
    expect(second.document).toBe(first.document);
    expect(second.inverse).toBeNull();
  });

  it('rejects an unknown piece, edge or point', () => {
    const document = square();
    expect(() => applyCommand(document, addNotch({ piece: 'gone' }))).toThrow('unknown piece');
    expect(() => applyCommand(document, addNotch({ edge: 'gone' }))).toThrow(
      'edge gone is not in piece piece-1',
    );
    expect(() => applyCommand(document, addNotch({ point: 'gone' }))).toThrow('unknown entity');
  });

  it('rejects an edge that is not a line, curve or arc', () => {
    const document: PatternDocument = {
      ...square({ edges: ['e1', 'e2', 'e3', 'e4', 'note'] }),
      entities: [...square().entities, text('note', 'a')],
    };
    expect(() => applyCommand(document, addNotch({ edge: 'note' }))).toThrow(
      'edge note is not a line, curve or arc',
    );
  });

  it('rejects a point of another piece', () => {
    const document: PatternDocument = {
      ...square(),
      entities: [...square().entities, { ...point('other', 100, 0), piece: 'other-piece' }],
    };
    expect(() => applyCommand(document, addNotch({ point: 'other' }))).toThrow(
      'point other belongs to another piece',
    );
  });

  it('requires an allowance and a point on the edge', () => {
    const bare = square({ allowances: [allowance('e2')] });
    expect(() => applyCommand(bare, addNotch({}))).toThrow('This edge has no seam allowance');

    const offEdge: PatternDocument = {
      ...square(),
      entities: [...square().entities, point('off', 100, 50)],
    };
    expect(() => applyCommand(offEdge, addNotch({ point: 'off' }))).toThrow(
      'point off does not lie on edge e1',
    );
  });

  it('rejects a depth that is not a finite number', () => {
    expect(() => applyCommand(square(), addNotch({ depth: Number.NaN }))).toThrow(
      'depth must be a finite number',
    );
  });
});

describe('update_notch', () => {
  const withNotch = (): PatternDocument => applyCommand(square(), addNotch({})).document;

  const update = (params: { id?: string; depth?: number | null }): Command => ({
    id: 'update-1',
    type: 'update_notch',
    params: { id: 'notch-1', depth: 0.3, ...params },
  });

  it('changes the depth and reverses cleanly', () => {
    const document = withNotch();
    const applied = applyCommand(document, update({}));

    expect(getEntity(applied.document, 'notch-1')).toMatchObject({ depth: 0.3 });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('clears the depth back to the default', () => {
    const document = applyCommand(withNotch(), update({})).document;
    const applied = applyCommand(document, update({ depth: null }));

    expect(getEntity(applied.document, 'notch-1')).not.toHaveProperty('depth');
    expect(applied.inverse).toEqual({
      id: 'update-1',
      type: 'update_notch',
      params: { id: 'notch-1', depth: 0.3 },
    });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('is a no-op when the depth is unchanged', () => {
    const document = withNotch();
    const applied = applyCommand(document, update({ depth: null }));
    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('rejects an unknown, wrong or missing target', () => {
    const document = withNotch();
    expect(() => applyCommand(document, update({ id: 'gone' }))).toThrow('unknown entity');
    expect(() => applyCommand(document, update({ id: 'e1' }))).toThrow('is not a notch');
    expect(() =>
      applyCommand(
        {
          ...document,
          entities: [
            ...document.entities,
            { id: 'centre-1', kind: 'mark', type: 'centre_line', start: 'a', end: 'b' },
          ],
        },
        update({ id: 'centre-1' }),
      ),
    ).toThrow('is not a notch');
    expect(() =>
      applyCommand(document, { id: 'update-1', type: 'update_notch', params: { id: 'notch-1' } }),
    ).toThrow('provide a depth or null');
    expect(() => applyCommand(document, update({ depth: Number.NaN }))).toThrow(
      'depth must be a finite number',
    );
  });
});

describe('add_centre_line', () => {
  const addCentre = (params: { piece?: string; start?: string; end?: string } = {}): Command => ({
    id: 'centre-1',
    type: 'add_centre_line',
    params: { piece: 'piece-1', start: 'a', end: 'c', ...params },
  });

  it('creates a centre line between two points', () => {
    const applied = applyCommand(square(), addCentre());

    expect(getEntity(applied.document, 'centre-1')).toEqual({
      id: 'centre-1',
      kind: 'mark',
      type: 'centre_line',
      piece: 'piece-1',
      start: 'a',
      end: 'c',
    });
    expect(applied.inverse).toMatchObject({ type: 'delete_entity' });
  });

  it('is idempotent', () => {
    const first = applyCommand(square(), addCentre());
    const second = applyCommand(first.document, addCentre());
    expect(second.document).toBe(first.document);
    expect(second.inverse).toBeNull();
  });

  it('rejects an unknown piece, point or a repeated endpoint', () => {
    const document = square();
    expect(() => applyCommand(document, addCentre({ piece: 'gone' }))).toThrow('unknown piece');
    expect(() => applyCommand(document, addCentre({ start: 'gone' }))).toThrow('unknown entity');
    expect(() => applyCommand(document, addCentre({ end: 'gone' }))).toThrow('unknown entity');
    expect(() => applyCommand(document, addCentre({ end: 'a' }))).toThrow(
      'the endpoints must differ',
    );
  });
});

describe('update_centre_line', () => {
  const withCentre = (): PatternDocument =>
    applyCommand(square(), {
      id: 'centre-1',
      type: 'add_centre_line',
      params: { piece: 'piece-1', start: 'a', end: 'c' },
    }).document;

  const update = (params: { id?: string; start?: string; end?: string }): Command => ({
    id: 'update-1',
    type: 'update_centre_line',
    params: { id: 'centre-1', ...params },
  });

  it('moves one endpoint and reverses cleanly', () => {
    const document = withCentre();
    const applied = applyCommand(document, update({ start: 'b' }));

    expect(getEntity(applied.document, 'centre-1')).toMatchObject({ start: 'b', end: 'c' });
    expect(applied.inverse).toEqual({
      id: 'update-1',
      type: 'update_centre_line',
      params: { id: 'centre-1', start: 'a', end: 'c' },
    });
    expect(applyCommand(applied.document, applied.inverse!).document).toEqual(document);
  });

  it('is a no-op when nothing changes', () => {
    const document = withCentre();
    const applied = applyCommand(document, update({ start: 'a' }));
    expect(applied.document).toBe(document);
    expect(applied.inverse).toBeNull();
  });

  it('moves the other endpoint too', () => {
    const document = withCentre();
    const applied = applyCommand(document, update({ end: 'd' }));

    expect(getEntity(applied.document, 'centre-1')).toMatchObject({ start: 'a', end: 'd' });
  });

  it('rejects an unknown, wrong or missing target', () => {
    const document = withCentre();
    expect(() => applyCommand(document, update({ id: 'gone' }))).toThrow('unknown entity');
    expect(() => applyCommand(document, update({ id: 'e1' }))).toThrow('is not a centre line');
    expect(() => applyCommand(document, update({}))).toThrow('provide start or end');
    expect(() => applyCommand(document, update({ start: 'c' }))).toThrow(
      'the endpoints must differ',
    );
  });

  it('rejects a mark that is not owned by a piece', () => {
    const document: PatternDocument = {
      ...withCentre(),
      entities: [
        ...withCentre().entities,
        { id: 'loose', kind: 'mark', type: 'centre_line', start: 'a', end: 'c' },
      ],
    };
    expect(() => applyCommand(document, update({ id: 'loose', start: 'b' }))).toThrow(
      'the mark is not owned by a piece',
    );
  });
});

describe('delete_entity cascade', () => {
  const withMarks = (): PatternDocument =>
    applyCommand(
      applyCommand(square(), {
        id: 'notch-1',
        type: 'add_notch',
        params: { piece: 'piece-1', edge: 'e1', point: 'm' },
      }).document,
      {
        id: 'centre-1',
        type: 'add_centre_line',
        params: { piece: 'piece-1', start: 'a', end: 'c' },
      },
    ).document;

  const deleteCommand = (id: string): Command => ({
    id: `delete-${id}`,
    type: 'delete_entity',
    params: { id },
  });

  it('removes a notch with the point it anchors on', () => {
    const document = withMarks();
    const applied = applyCommand(document, deleteCommand('m'));

    expect(getEntity(applied.document, 'notch-1')).toBeUndefined();
    expect(pieceMarks(applied.document, 'piece-1').map((mark) => mark.id)).toEqual(['centre-1']);
  });

  it('removes a notch with its edge', () => {
    const document = withMarks();
    const applied = applyCommand(document, deleteCommand('e1'));

    expect(getEntity(applied.document, 'notch-1')).toBeUndefined();
  });

  it('keeps a notch when an unrelated entity goes', () => {
    const document = withMarks();
    const applied = applyCommand(document, deleteCommand('e3'));

    expect(getEntity(applied.document, 'notch-1')).toBeDefined();
  });

  it('removes a centre line with one of its endpoints', () => {
    const document = withMarks();
    const applied = applyCommand(document, deleteCommand('c'));

    expect(getEntity(applied.document, 'centre-1')).toBeUndefined();
    expect(getEntity(applied.document, 'notch-1')).toBeDefined();
  });
});
