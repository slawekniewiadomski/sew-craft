import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  type AddSeamMatchParams,
  type Assembly,
  type AssemblyInstance,
  type Command,
  type Entity,
  type FinishedEdge,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type SeamMatch,
  type SetEdgeFinishedParams,
  type UpdateSeamMatchParams,
} from '../src/index.js';

const point = (id: string, x: number, y: number, piece = 'p1'): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  piece,
  fixed: false,
});

const line = (id: string, start: string, end: string, piece = 'p1'): LineEntity => ({
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

const instance = (id: string, overrides: Partial<AssemblyInstance> = {}): AssemblyInstance => ({
  id,
  piece: 'p1',
  x: 0,
  y: 0,
  ...overrides,
});

const assembly = (
  instances: AssemblyInstance[] = [instance('i1'), instance('i2', { x: 0, y: 200 })],
  extra: Partial<Assembly> = {},
): Assembly => ({ id: 'a1', name: 'Assembly 1', instances, ...extra });

const documentOf = (overrides: Partial<PatternDocument> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  entities: square(),
  pieces: [piece()],
  assemblies: [assembly()],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'assembly', id: 'a1' },
  ],
  ...overrides,
});

const apply = (document: PatternDocument, command: Command): PatternDocument =>
  applyCommand(document, command).document;

const seam = (overrides: Partial<SeamMatch> = {}): SeamMatch => ({
  id: 's1',
  sides: [
    { instance: 'i1', edges: ['bottom'] },
    { instance: 'i2', edges: ['bottom'] },
  ],
  ...overrides,
});

const defaultSides: AddSeamMatchParams['sides'] = [
  { instance: 'i1', edges: ['bottom'] },
  { instance: 'i2', edges: ['bottom'] },
];

const addSeam = (
  params: AddSeamMatchParams = { assembly: 'a1', sides: defaultSides },
): Command => ({
  id: 's1',
  type: 'add_seam_match',
  params,
});

describe('add_seam_match', () => {
  it('stores the record and undoes it by removing the same id', () => {
    const result = applyCommand(documentOf(), addSeam());

    expect(result.document.assemblies[0]!.seams).toEqual([seam()]);
    expect(result.inverse).toEqual({
      id: 's1',
      type: 'remove_seam_match',
      params: { assembly: 'a1', seam: 's1' },
    });
  });

  it('normalizes sides and stores eased only when true', () => {
    const document = apply(
      documentOf(),
      addSeam({
        assembly: 'a1',
        eased: true,
        sides: [
          { instance: 'i1', edges: ['bottom'], reversed: false },
          { instance: 'i2', edges: ['bottom'], reversed: true },
        ],
      }),
    );

    expect(document.assemblies[0]!.seams).toEqual([
      {
        id: 's1',
        eased: true,
        sides: [
          { instance: 'i1', edges: ['bottom'] },
          { instance: 'i2', edges: ['bottom'], reversed: true },
        ],
      },
    ]);
  });

  it('is a no-op for a duplicate id', () => {
    const document = documentOf({ assemblies: [assembly(undefined, { seams: [seam()] })] });
    const result = applyCommand(document, addSeam());

    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('rejects an unknown assembly and invalid sides', () => {
    expect(() => applyCommand(documentOf(), addSeam({ assembly: 'nope', sides: [] }))).toThrow(
      'unknown assembly: nope',
    );
    expect(() =>
      applyCommand(
        documentOf(),
        addSeam({ assembly: 'a1', sides: [{ instance: 'i1', edges: ['bottom'] }] }),
      ),
    ).toThrow('a seam needs at least two sides');
  });
});

describe('update_seam_match', () => {
  const sewn = (): PatternDocument =>
    documentOf({
      assemblies: [
        assembly(undefined, {
          seams: [seam({ eased: true })],
        }),
      ],
    });

  const update = (params: UpdateSeamMatchParams): Command => ({
    id: 'u1',
    type: 'update_seam_match',
    params,
  });

  it('replaces the sides and carries the previous ones in the inverse', () => {
    const result = applyCommand(
      sewn(),
      update({
        assembly: 'a1',
        seam: 's1',
        sides: [
          { instance: 'i1', edges: ['right'] },
          { instance: 'i2', edges: ['right'] },
        ],
      }),
    );

    expect(result.document.assemblies[0]!.seams![0]!.sides).toEqual([
      { instance: 'i1', edges: ['right'] },
      { instance: 'i2', edges: ['right'] },
    ]);
    expect(result.inverse).toEqual({
      id: 'u1',
      type: 'update_seam_match',
      params: {
        assembly: 'a1',
        seam: 's1',
        sides: [
          { instance: 'i1', edges: ['bottom'] },
          { instance: 'i2', edges: ['bottom'] },
        ],
        eased: true,
      },
    });
  });

  it('keeps the sides when only eased changes and can clear it', () => {
    const noEase = apply(sewn(), update({ assembly: 'a1', seam: 's1', eased: false }));

    expect(noEase.assemblies[0]!.seams![0]).toEqual({
      id: 's1',
      sides: [
        { instance: 'i1', edges: ['bottom'] },
        { instance: 'i2', edges: ['bottom'] },
      ],
    });
  });

  it('rejects no fields, an unknown seam and invalid sides', () => {
    expect(() => applyCommand(sewn(), update({ assembly: 'a1', seam: 's1' }))).toThrow(
      'provide eased or sides',
    );
    expect(() =>
      applyCommand(sewn(), update({ assembly: 'a1', seam: 'nope', eased: true })),
    ).toThrow('unknown seam: nope');
    expect(() =>
      applyCommand(documentOf(), update({ assembly: 'a1', seam: 'nope', eased: true })),
    ).toThrow('unknown seam: nope');
    expect(() =>
      applyCommand(
        sewn(),
        update({
          assembly: 'a1',
          seam: 's1',
          sides: [
            { instance: 'i1', edges: ['bottom', 'top'] },
            { instance: 'i2', edges: ['top'] },
          ],
        }),
      ),
    ).toThrow('edge top is not consecutive in piece p1');
  });

  it('leaves the other seams untouched', () => {
    const other = seam({ id: 's2' });
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam(), other] })],
    });

    const result = apply(document, update({ assembly: 'a1', seam: 's1', eased: true }));

    expect(result.assemblies[0]!.seams).toEqual([seam({ eased: true }), other]);
  });

  it('ignores its own claims when replacing the sides', () => {
    const document = apply(
      sewn(),
      update({
        assembly: 'a1',
        seam: 's1',
        sides: [
          { instance: 'i1', edges: ['bottom'] },
          { instance: 'i2', edges: ['bottom'] },
        ],
      }),
    );

    expect(document.assemblies[0]!.seams![0]!.sides).toHaveLength(2);
  });
});

describe('remove_seam_match', () => {
  it('removes the seam and recreates it exactly', () => {
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam({ eased: true })] })],
    });
    const result = applyCommand(document, {
      id: 'r1',
      type: 'remove_seam_match',
      params: { assembly: 'a1', seam: 's1' },
    });

    expect(result.document.assemblies[0]!.seams).toEqual([]);
    expect(result.inverse).toEqual({
      id: 's1',
      type: 'add_seam_match',
      params: {
        assembly: 'a1',
        sides: seam().sides,
        eased: true,
      },
    });

    // The inverse restores the record exactly.
    expect(apply(result.document, result.inverse!).assemblies[0]!.seams).toEqual([
      seam({ eased: true }),
    ]);
  });

  it('is a no-op for an unknown seam and rejects an unknown assembly', () => {
    const document = documentOf();
    expect(
      applyCommand(document, {
        id: 'r1',
        type: 'remove_seam_match',
        params: { assembly: 'a1', seam: 'nope' },
      }),
    ).toEqual({ document, inverse: null });

    expect(() =>
      applyCommand(document, {
        id: 'r1',
        type: 'remove_seam_match',
        params: { assembly: 'nope', seam: 's1' },
      }),
    ).toThrow('unknown assembly: nope');
  });

  it('omits eased from the inverse when the seam was not eased', () => {
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam()] })],
    });
    const result = applyCommand(document, {
      id: 'r1',
      type: 'remove_seam_match',
      params: { assembly: 'a1', seam: 's1' },
    });

    expect(result.inverse).toEqual({
      id: 's1',
      type: 'add_seam_match',
      params: { assembly: 'a1', sides: seam().sides },
    });
  });
});

describe('set_edge_finished', () => {
  const finished = (): PatternDocument =>
    documentOf({
      assemblies: [
        assembly(undefined, {
          finishedEdges: [{ instance: 'i1', edge: 'top', kind: 'binding' }],
        }),
      ],
    });

  const set = (params: SetEdgeFinishedParams): Command => ({
    id: 'f1',
    type: 'set_edge_finished',
    params,
  });

  it('marks an edge and undoes it by clearing the mark', () => {
    const result = applyCommand(
      documentOf(),
      set({ assembly: 'a1', instance: 'i1', edge: 'bottom', kind: 'hem' }),
    );

    expect(result.document.assemblies[0]!.finishedEdges).toEqual([
      { instance: 'i1', edge: 'bottom', kind: 'hem' },
    ]);
    expect(result.inverse).toEqual({
      id: 'f1',
      type: 'set_edge_finished',
      params: { assembly: 'a1', instance: 'i1', edge: 'bottom', kind: null },
    });
  });

  it('changes a kind and restores the previous one', () => {
    const result = applyCommand(
      finished(),
      set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: 'opening' }),
    );

    expect(result.document.assemblies[0]!.finishedEdges).toEqual([
      { instance: 'i1', edge: 'top', kind: 'opening' },
    ]);
    expect(result.inverse).toEqual({
      id: 'f1',
      type: 'set_edge_finished',
      params: { assembly: 'a1', instance: 'i1', edge: 'top', kind: 'binding' },
    });
  });

  it('clears a mark and restores it', () => {
    const result = applyCommand(
      finished(),
      set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: null }),
    );

    expect(result.document.assemblies[0]!.finishedEdges).toEqual([]);
    expect(result.inverse).toEqual({
      id: 'f1',
      type: 'set_edge_finished',
      params: { assembly: 'a1', instance: 'i1', edge: 'top', kind: 'binding' },
    });
  });

  it('leaves the other finished edges untouched when changing a kind', () => {
    const document = documentOf({
      assemblies: [
        assembly(undefined, {
          finishedEdges: [
            { instance: 'i1', edge: 'top', kind: 'binding' },
            { instance: 'i1', edge: 'left', kind: 'hem' },
          ],
        }),
      ],
    });

    const result = apply(
      document,
      set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: 'opening' }),
    );

    expect(result.assemblies[0]!.finishedEdges).toEqual([
      { instance: 'i1', edge: 'top', kind: 'opening' },
      { instance: 'i1', edge: 'left', kind: 'hem' },
    ]);
  });

  it('is a no-op when the kind is unchanged', () => {
    const document = finished();

    expect(
      applyCommand(document, set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: 'binding' })),
    ).toEqual({ document, inverse: null });
    expect(
      applyCommand(documentOf(), set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: null })),
    ).toEqual({ document: documentOf(), inverse: null });
  });

  it('rejects an unknown kind, instance, piece, edge or a sewn edge', () => {
    expect(() =>
      applyCommand(
        documentOf(),
        set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: 'belt' as never }),
      ),
    ).toThrow('unknown finish kind: belt');
    expect(() =>
      applyCommand(
        documentOf(),
        set({ assembly: 'a1', instance: 'nope', edge: 'top', kind: 'hem' }),
      ),
    ).toThrow('unknown instance: nope');
    expect(() =>
      applyCommand(
        documentOf(),
        set({ assembly: 'a1', instance: 'i1', edge: 'nope', kind: 'hem' }),
      ),
    ).toThrow('edge nope is not in the loop of piece p1');
    expect(() =>
      applyCommand(
        documentOf({
          assemblies: [assembly([{ id: 'i1', piece: 'gone', x: 0, y: 0 }])],
        }),
        set({ assembly: 'a1', instance: 'i1', edge: 'top', kind: 'hem' }),
      ),
    ).toThrow('instance i1 places an unknown piece');
    expect(() =>
      applyCommand(
        documentOf({ assemblies: [assembly(undefined, { seams: [seam()] })] }),
        set({ assembly: 'a1', instance: 'i1', edge: 'bottom', kind: 'hem' }),
      ),
    ).toThrow('edge bottom is sewn to a seam');
    expect(() =>
      applyCommand(
        documentOf(),
        set({ assembly: 'nope', instance: 'i1', edge: 'top', kind: 'hem' }),
      ),
    ).toThrow('unknown assembly: nope');
  });
});

describe('cascades', () => {
  const finishedEdges: FinishedEdge[] = [{ instance: 'i1', edge: 'top', kind: 'hem' }];

  it('removes a whole seam and its finishes with an instance', () => {
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam()], finishedEdges })],
    });
    const result = applyCommand(document, {
      id: 'r1',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });

    expect(result.document.assemblies[0]!.seams).toEqual([]);
    expect(result.document.assemblies[0]!.finishedEdges).toEqual([]);
    expect(result.inverse).toBeNull();
  });

  it('keeps the instance inverse when nothing seam-related was dropped', () => {
    const document = documentOf({ assemblies: [assembly()] });
    const result = applyCommand(document, {
      id: 'r1',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });

    expect(result.inverse).toEqual({
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
  });

  it('keeps a seam that does not name the removed instance', () => {
    const other: SeamMatch = {
      id: 's2',
      sides: [
        { instance: 'i2', edges: ['top'] },
        { instance: 'i2', edges: ['left'] },
      ],
    };
    const edges: FinishedEdge[] = [
      { instance: 'i1', edge: 'left', kind: 'hem' },
      { instance: 'i2', edge: 'left', kind: 'hem' },
    ];
    const document = documentOf({
      assemblies: [
        assembly([instance('i1'), instance('i2', { x: 0, y: 200 })], {
          seams: [other],
          finishedEdges: edges,
        }),
      ],
    });

    const result = applyCommand(document, {
      id: 'r1',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });

    expect(result.document.assemblies[0]!.seams).toEqual([other]);
    expect(result.document.assemblies[0]!.finishedEdges).toEqual([
      { instance: 'i2', edge: 'left', kind: 'hem' },
    ]);
  });

  it('takes seams and finishes with a deleted piece across assemblies', () => {
    const second: Assembly = {
      id: 'a2',
      name: 'Assembly 2',
      instances: [instance('j1')],
      seams: [
        {
          id: 's2',
          sides: [
            { instance: 'j1', edges: ['bottom'] },
            { instance: 'i2', edges: ['bottom'] },
          ],
        },
      ],
      finishedEdges: [{ instance: 'j1', edge: 'top', kind: 'hem' }],
    };
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam()], finishedEdges }), second],
    });

    const result = applyCommand(document, {
      id: 'd1',
      type: 'delete_piece',
      params: { id: 'p1' },
    });

    expect(result.document.assemblies).toEqual([
      { id: 'a1', name: 'Assembly 1', instances: [], seams: [], finishedEdges: [] },
      { id: 'a2', name: 'Assembly 2', instances: [], seams: [], finishedEdges: [] },
    ]);
  });

  it('takes seams and finishes with a deleted assembly', () => {
    const document = documentOf({
      assemblies: [assembly(undefined, { seams: [seam()], finishedEdges })],
    });

    expect(
      apply(document, { id: 'd1', type: 'delete_assembly', params: { id: 'a1' } }).assemblies,
    ).toEqual([]);
  });
});

describe('split_line seam repair', () => {
  const withPoint = (id: string, x: number): Entity => point(id, x, 0);

  const split = (
    document: PatternDocument,
    lineId: string,
    pointId: string,
    id: string,
  ): PatternDocument =>
    apply(document, {
      id,
      type: 'split_line',
      params: { line: lineId, point: pointId },
    });

  const sewn = (edges: string[]): PatternDocument =>
    documentOf({
      entities: [...square(), withPoint('mid', 50), withPoint('q', 75)],
      assemblies: [
        assembly(undefined, {
          seams: [
            {
              id: 's1',
              sides: [
                { instance: 'i1', edges: [...edges] },
                { instance: 'i2', edges: ['top'] },
              ],
            },
          ],
        }),
      ],
    });

  it('inserts the new half after the split edge inside a run', () => {
    const document = split(sewn(['bottom', 'right']), 'bottom', 'mid', 'half');

    expect(document.assemblies[0]!.seams![0]!.sides[0]!.edges).toEqual(['bottom', 'half', 'right']);
  });

  it('repairs a side that starts at the split edge', () => {
    const document = split(sewn(['bottom']), 'bottom', 'mid', 'half');

    expect(document.assemblies[0]!.seams![0]!.sides[0]!.edges).toEqual(['bottom', 'half']);
  });

  it('repairs two splits in order', () => {
    const once = split(sewn(['bottom', 'right']), 'bottom', 'mid', 'half');
    const twice = split(once, 'half', 'q', 'quarter');

    expect(twice.assemblies[0]!.seams![0]!.sides[0]!.edges).toEqual([
      'bottom',
      'half',
      'quarter',
      'right',
    ]);
  });

  it('leaves an assembly without seams untouched', () => {
    const document = documentOf({
      entities: [...square(), withPoint('mid', 50)],
    });

    expect(split(document, 'bottom', 'mid', 'half').assemblies[0]).toEqual(document.assemblies[0]);
  });

  it('leaves a seam that does not name the split edge unchanged', () => {
    const document = sewn(['top']);

    const result = split(document, 'bottom', 'mid', 'half');

    expect(result.assemblies[0]!.seams![0]).toEqual(document.assemblies[0]!.seams![0]);
  });
});
