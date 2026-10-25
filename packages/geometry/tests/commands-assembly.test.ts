import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  pieceById,
  type Command,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
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

const square = (suffix = '', ox = 0, oy = 0, piece = 'p1'): Entity[] => [
  point(`${suffix}a`, ox, oy, piece),
  point(`${suffix}b`, ox + 100, oy, piece),
  point(`${suffix}c`, ox + 100, oy + 100, piece),
  point(`${suffix}d`, ox, oy + 100, piece),
  line(`${suffix}bottom`, `${suffix}a`, `${suffix}b`, piece),
  line(`${suffix}right`, `${suffix}b`, `${suffix}c`, piece),
  line(`${suffix}top`, `${suffix}c`, `${suffix}d`, piece),
  line(`${suffix}left`, `${suffix}d`, `${suffix}a`, piece),
];

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: 'p1',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [],
  ...overrides,
});

const documentOf = (overrides: Partial<PatternDocument> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  entities: square(),
  pieces: [piece()],
  tabs: [{ kind: 'piece', id: 'p1' }],

  ...overrides,
});

const apply = (document: PatternDocument, command: Command): PatternDocument =>
  applyCommand(document, command).document;

const createAssembly = (id = 'a1', name?: string): Command => ({
  id,
  type: 'create_assembly',
  params: name === undefined ? {} : { name },
});

describe('create_assembly', () => {
  it('creates an empty assembly with a default name and appends its tab', () => {
    const result = applyCommand(documentOf(), createAssembly());

    expect(result.document.assemblies).toEqual([{ id: 'a1', name: 'Assembly 1', instances: [] }]);
    expect(result.document.tabs).toEqual([
      { kind: 'piece', id: 'p1' },
      { kind: 'assembly', id: 'a1' },
    ]);
    expect(result.inverse).toEqual({
      id: 'a1',
      type: 'delete_assembly',
      params: { id: 'a1' },
    });
  });

  it('numbers the default name from the assembly count and trims a given name', () => {
    const first = apply(documentOf(), createAssembly('a1'));
    const second = apply(first, createAssembly('a2'));
    const named = apply(documentOf(), createAssembly('a1', '  Outer shell  '));

    expect(second.assemblies[1]!.name).toBe('Assembly 2');
    expect(named.assemblies[0]!.name).toBe('Outer shell');
  });

  it('is idempotent and rejects blank or overlong names', () => {
    const once = apply(documentOf(), createAssembly());
    const twice = applyCommand(once, createAssembly());

    expect(twice.document).toBe(once);
    expect(twice.inverse).toBeNull();

    expect(() => applyCommand(documentOf(), createAssembly('a1', '   '))).toThrowError(
      /name must be 1–80 characters/,
    );
    expect(() => applyCommand(documentOf(), createAssembly('a1', 'x'.repeat(81)))).toThrowError(
      /name must be 1–80 characters/,
    );
  });
});

describe('update_assembly', () => {
  const base = apply(documentOf(), createAssembly('a1', 'Shell'));

  it('renames an assembly and restores the previous name', () => {
    const result = applyCommand(base, {
      id: 'u1',
      type: 'update_assembly',
      params: { id: 'a1', name: '  Lining  ' },
    });

    expect(result.document.assemblies[0]!.name).toBe('Lining');
    expect(result.inverse).toEqual({
      id: 'u1',
      type: 'update_assembly',
      params: { id: 'a1', name: 'Shell' },
    });
  });

  it('is a no-op when the name is unchanged and rejects unknown assemblies', () => {
    const same = applyCommand(base, {
      id: 'u1',
      type: 'update_assembly',
      params: { id: 'a1', name: ' Shell ' },
    });
    expect(same.document).toBe(base);
    expect(same.inverse).toBeNull();

    expect(() =>
      applyCommand(base, {
        id: 'u1',
        type: 'update_assembly',
        params: { id: 'missing', name: 'x' },
      }),
    ).toThrowError(/unknown assembly/);
  });

  it('rejects a non-string, blank or overlong name', () => {
    for (const name of [42, '   ', 'x'.repeat(81)]) {
      expect(() =>
        applyCommand(base, {
          id: 'u1',
          type: 'update_assembly',
          params: { id: 'a1', name: name as string },
        }),
      ).toThrowError(/name/);
    }
  });
});

describe('delete_assembly', () => {
  it('removes the assembly and its tab without touching pieces', () => {
    const base = apply(documentOf(), createAssembly('a1'));
    const result = applyCommand(base, {
      id: 'd1',
      type: 'delete_assembly',
      params: { id: 'a1' },
    });

    expect(result.document.assemblies).toEqual([]);
    expect(result.document.tabs).toEqual([{ kind: 'piece', id: 'p1' }]);
    expect(result.document.pieces).toHaveLength(1);
    expect(result.inverse).toBeNull();
  });

  it('is a no-op for an unknown assembly', () => {
    const base = documentOf();
    const result = applyCommand(base, {
      id: 'd1',
      type: 'delete_assembly',
      params: { id: 'missing' },
    });

    expect(result.document).toBe(base);
  });
});

describe('add_instance', () => {
  const base = apply(documentOf(), createAssembly('a1'));

  it('places an instance with the command id', () => {
    const result = applyCommand(base, {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 10, y: 20 },
    });

    expect(result.document.assemblies[0]!.instances).toEqual([
      { id: 'i1', piece: 'p1', x: 10, y: 20 },
    ]);
    expect(result.inverse).toEqual({
      id: 'i1',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });
  });

  it('keeps an explicit rotation and mirror flag, including false', () => {
    const result = applyCommand(base, {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0, rotation: 1.5, mirrored: false },
    });

    expect(result.document.assemblies[0]!.instances[0]).toEqual({
      id: 'i1',
      piece: 'p1',
      x: 0,
      y: 0,
      rotation: 1.5,
      mirrored: false,
    });
  });

  it('is idempotent for the same instance id', () => {
    const once = apply(base, {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
    const twice = applyCommand(once, {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 50, y: 50 },
    });

    expect(twice.document).toBe(once);
    expect(twice.inverse).toBeNull();
  });

  it('rejects an unknown assembly or piece and non-finite coordinates', () => {
    const command = (params: Record<string, unknown>): Command =>
      ({
        id: 'i1',
        type: 'add_instance',
        params,
      }) as Command;

    expect(() =>
      applyCommand(base, command({ assembly: 'missing', piece: 'p1', x: 0, y: 0 })),
    ).toThrowError(/unknown assembly/);
    expect(() =>
      applyCommand(base, command({ assembly: 'a1', piece: 'missing', x: 0, y: 0 })),
    ).toThrowError(/unknown piece/);
    expect(() =>
      applyCommand(base, command({ assembly: 'a1', piece: 'p1', x: Number.NaN, y: 0 })),
    ).toThrowError(/x must be a finite number/);
    expect(() =>
      applyCommand(base, command({ assembly: 'a1', piece: 'p1', x: 0, y: Infinity })),
    ).toThrowError(/y must be a finite number/);
    expect(() =>
      applyCommand(base, command({ assembly: 'a1', piece: 'p1', x: 0, y: 0, rotation: NaN })),
    ).toThrowError(/rotation must be a finite number/);
  });
});

describe('remove_instance', () => {
  const base = apply(apply(documentOf(), createAssembly('a1')), {
    id: 'i1',
    type: 'add_instance',
    params: { assembly: 'a1', piece: 'p1', x: 10, y: 20, rotation: 0.5, mirrored: true },
  });

  it('removes an instance and restores its stored placement', () => {
    const result = applyCommand(base, {
      id: 'r1',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });

    expect(result.document.assemblies[0]!.instances).toEqual([]);
    expect(result.inverse).toEqual({
      id: 'i1',
      type: 'add_instance',
      params: {
        assembly: 'a1',
        piece: 'p1',
        x: 10,
        y: 20,
        rotation: 0.5,
        mirrored: true,
      },
    });
    expect(apply(result.document, result.inverse!).assemblies[0]!.instances).toEqual(
      base.assemblies[0]!.instances,
    );
  });

  it('omits an absent rotation and mirror from the inverse', () => {
    const plain = apply(apply(documentOf(), createAssembly('a1')), {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
    const result = applyCommand(plain, {
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

  it('is a no-op for an unknown instance and rejects an unknown assembly', () => {
    expect(
      applyCommand(base, {
        id: 'r1',
        type: 'remove_instance',
        params: { assembly: 'a1', instance: 'missing' },
      }).document,
    ).toBe(base);

    expect(() =>
      applyCommand(base, {
        id: 'r1',
        type: 'remove_instance',
        params: { assembly: 'missing', instance: 'i1' },
      }),
    ).toThrowError(/unknown assembly/);
  });
});

describe('update_instance', () => {
  const base = apply(apply(documentOf(), createAssembly('a1')), {
    id: 'i1',
    type: 'add_instance',
    params: { assembly: 'a1', piece: 'p1', x: 10, y: 20, rotation: 0.5, mirrored: false },
  });

  it('patches one field and restores every previous field', () => {
    const result = applyCommand(base, {
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', x: 30 },
    });

    expect(result.document.assemblies[0]!.instances[0]).toEqual({
      id: 'i1',
      piece: 'p1',
      x: 30,
      y: 20,
      rotation: 0.5,
      mirrored: false,
    });
    expect(result.inverse).toEqual({
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', x: 10, y: 20, rotation: 0.5, mirrored: false },
    });
  });

  it('patches y and leaves sibling instances alone', () => {
    const two = apply(base, {
      id: 'i2',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
    const result = applyCommand(two, {
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', y: 40 },
    });

    expect(result.document.assemblies[0]!.instances).toEqual([
      { id: 'i1', piece: 'p1', x: 10, y: 40, rotation: 0.5, mirrored: false },
      { id: 'i2', piece: 'p1', x: 0, y: 0 },
    ]);
  });

  it('materialises zero rotation and false mirror in the inverse', () => {
    const plain = apply(apply(documentOf(), createAssembly('a1')), {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
    const result = applyCommand(plain, {
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', x: 5 },
    });

    expect(result.inverse).toEqual({
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', x: 0, y: 0, rotation: 0, mirrored: false },
    });
  });

  it('replaces rotation and mirror', () => {
    const result = applyCommand(base, {
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', rotation: 2, mirrored: true },
    });

    expect(result.document.assemblies[0]!.instances[0]).toMatchObject({
      rotation: 2,
      mirrored: true,
    });
  });

  it('is a no-op when nothing changes', () => {
    const result = applyCommand(base, {
      id: 'u1',
      type: 'update_instance',
      params: { assembly: 'a1', instance: 'i1', x: 10 },
    });

    expect(result.document).toBe(base);
    expect(result.inverse).toBeNull();
  });

  it('rejects an empty patch, unknown ids and non-finite values', () => {
    expect(() =>
      applyCommand(base, {
        id: 'u1',
        type: 'update_instance',
        params: { assembly: 'a1', instance: 'i1' },
      }),
    ).toThrowError(/provide x, y, rotation or mirrored/);
    expect(() =>
      applyCommand(base, {
        id: 'u1',
        type: 'update_instance',
        params: { assembly: 'missing', instance: 'i1', x: 1 },
      }),
    ).toThrowError(/unknown assembly/);
    expect(() =>
      applyCommand(base, {
        id: 'u1',
        type: 'update_instance',
        params: { assembly: 'a1', instance: 'missing', x: 1 },
      }),
    ).toThrowError(/unknown instance/);
    for (const params of [{ x: NaN }, { y: Infinity }, { rotation: NaN }]) {
      expect(() =>
        applyCommand(base, {
          id: 'u1',
          type: 'update_instance',
          params: { assembly: 'a1', instance: 'i1', ...params },
        }),
      ).toThrowError(/must be a finite number/);
    }
  });
});

describe('reorder_tabs', () => {
  const base = apply(apply(documentOf(), createAssembly('a1')), createAssembly('a2'));

  it('stores a permutation and restores the previous order', () => {
    const tabs = [
      { kind: 'assembly' as const, id: 'a1' },
      { kind: 'piece' as const, id: 'p1' },
      { kind: 'assembly' as const, id: 'a2' },
    ];
    const result = applyCommand(base, { id: 'r1', type: 'reorder_tabs', params: { tabs } });

    expect(result.document.tabs).toEqual(tabs);
    expect(result.inverse).toEqual({
      id: 'r1',
      type: 'reorder_tabs',
      params: { tabs: base.tabs },
    });
    expect(apply(result.document, result.inverse!).tabs).toEqual(base.tabs);
  });

  it('is a no-op for the current order', () => {
    const result = applyCommand(base, {
      id: 'r1',
      type: 'reorder_tabs',
      params: { tabs: base.tabs },
    });

    expect(result.document).toBe(base);
    expect(result.inverse).toBeNull();
  });

  it('rejects a different length, an unknown ref and a duplicate', () => {
    const command = (tabs: { kind: 'piece' | 'assembly'; id: string }[]): Command => ({
      id: 'r1',
      type: 'reorder_tabs',
      params: { tabs },
    });

    expect(() => applyCommand(base, command(base.tabs.slice(0, 2)))).toThrowError(/permutation/);
    expect(() =>
      applyCommand(base, command([...base.tabs.slice(0, 2), { kind: 'assembly', id: 'gone' }])),
    ).toThrowError(/permutation/);
    expect(() =>
      applyCommand(base, command([base.tabs[0]!, base.tabs[0]!, base.tabs[2]!])),
    ).toThrowError(/permutation/);
  });
});

describe('set_piece_default_allowance', () => {
  const preset = (params: Record<string, unknown>): Command => ({
    id: 'd1',
    type: 'set_piece_default_allowance',
    params: { piece: 'p1', ...params },
  });

  it('sets a preset and restores the inherited default', () => {
    const base = documentOf();
    const result = applyCommand(base, preset({ mode: 'preset', width: 7, kind: 'single' }));

    expect(pieceById(result.document, 'p1')!.defaults).toEqual({
      allowance: { width: 7, kind: 'single' },
    });
    expect(result.inverse).toEqual({
      id: 'p1:default-allowance',
      type: 'set_piece_default_allowance',
      params: { piece: 'p1', mode: 'inherit' },
    });
    expect(apply(result.document, result.inverse!).pieces[0]!.defaults).toBeUndefined();
  });

  it('sets an explicit none and restores a stored preset', () => {
    const withPreset = apply(documentOf(), preset({ mode: 'preset', width: 7, kind: 'double' }));
    const none = applyCommand(withPreset, preset({ mode: 'none' }));

    expect(pieceById(none.document, 'p1')!.defaults).toEqual({ allowance: null });
    expect(none.inverse).toEqual({
      id: 'p1:default-allowance',
      type: 'set_piece_default_allowance',
      params: { piece: 'p1', mode: 'preset', width: 7, kind: 'double' },
    });
  });

  it('omits an undefined kind when restoring a bare preset', () => {
    const bare = apply(documentOf(), preset({ mode: 'preset', width: 7 }));
    const none = applyCommand(bare, preset({ mode: 'none' }));

    expect(none.inverse).toEqual({
      id: 'p1:default-allowance',
      type: 'set_piece_default_allowance',
      params: { piece: 'p1', mode: 'preset', width: 7 },
    });
  });

  it('restores an explicit none when moving back to a preset', () => {
    const none = apply(documentOf(), preset({ mode: 'none' }));
    const result = applyCommand(none, preset({ mode: 'preset', width: 5 }));

    expect(result.inverse).toEqual({
      id: 'p1:default-allowance',
      type: 'set_piece_default_allowance',
      params: { piece: 'p1', mode: 'none' },
    });
  });

  it('is a no-op when the override does not change', () => {
    const base = apply(documentOf(), preset({ mode: 'none' }));

    const fresh = documentOf();
    expect(applyCommand(base, preset({ mode: 'none' })).document).toBe(base);
    expect(applyCommand(fresh, preset({ mode: 'inherit' })).document).toBe(fresh);
  });

  it('rejects an unknown piece, mode, width and kind', () => {
    expect(() =>
      applyCommand(documentOf(), {
        id: 'd1',
        type: 'set_piece_default_allowance',
        params: { piece: 'missing', mode: 'none' },
      }),
    ).toThrowError(/unknown piece/);
    expect(() => applyCommand(documentOf(), preset({ mode: 'other' }))).toThrowError(
      /unknown mode/,
    );
    for (const width of [undefined, 0, -1, Number.NaN]) {
      expect(() => applyCommand(documentOf(), preset({ mode: 'preset', width }))).toThrowError(
        /allowance width must be a finite number greater than 0/,
      );
    }
    expect(() =>
      applyCommand(documentOf(), preset({ mode: 'preset', width: 5, kind: 'welded' })),
    ).toThrowError(/unknown allowance kind/);
  });
});

describe('delete_piece cascade into assemblies and tabs', () => {
  it('leaves an assembly with no instance of the piece untouched', () => {
    let document = apply(apply(documentOf(), createAssembly('a1')), createAssembly('a2'));
    document = apply(document, {
      id: 'i2',
      type: 'add_instance',
      params: { assembly: 'a2', piece: 'p1', x: 0, y: 0 },
    });

    const result = applyCommand(document, {
      id: 'd1',
      type: 'delete_piece',
      params: { id: 'p1' },
    });

    expect(result.document.assemblies[0]).toBe(document.assemblies[0]);
    expect(result.document.assemblies[1]!.instances).toEqual([]);
  });

  it('removes every instance of the piece and its tab in one command', () => {
    let document = apply(apply(documentOf(), createAssembly('a1')), createAssembly('a2'));
    document = apply(document, {
      id: 'i1',
      type: 'add_instance',
      params: { assembly: 'a1', piece: 'p1', x: 0, y: 0 },
    });
    document = apply(document, {
      id: 'i2',
      type: 'add_instance',
      params: { assembly: 'a2', piece: 'p1', x: 0, y: 0 },
    });

    const result = applyCommand(document, {
      id: 'd1',
      type: 'delete_piece',
      params: { id: 'p1' },
    });

    expect(result.document.assemblies.map((assembly) => assembly.instances)).toEqual([[], []]);
    expect(result.document.tabs).toEqual([
      { kind: 'assembly', id: 'a1' },
      { kind: 'assembly', id: 'a2' },
    ]);
  });
});

describe('update_piece free text fields', () => {
  it('stores trimmed notes and fabric and a colour', () => {
    const result = applyCommand(documentOf(), {
      id: 'u1',
      type: 'update_piece',
      params: { id: 'p1', notes: '  Cut two  ', fabric: ' Linen ', color: '#a1b2c3' },
    });

    expect(pieceById(result.document, 'p1')).toMatchObject({
      notes: 'Cut two',
      fabric: 'Linen',
      color: '#a1b2c3',
    });
    expect(result.inverse).toMatchObject({
      params: { id: 'p1', notes: null, fabric: null, color: null },
    });
  });

  it('clears text and colour with null or empty text', () => {
    const filled = apply(documentOf(), {
      id: 'u1',
      type: 'update_piece',
      params: { id: 'p1', notes: 'Cut two', fabric: 'Linen', color: '#a1b2c3' },
    });
    const cleared = apply(filled, {
      id: 'u2',
      type: 'update_piece',
      params: { id: 'p1', notes: null, fabric: '  ', color: null },
    });
    const piece = pieceById(cleared, 'p1')!;

    expect('notes' in piece).toBe(false);
    expect('fabric' in piece).toBe(false);
    expect('color' in piece).toBe(false);
  });

  it('rejects overlong notes or fabric and an invalid colour', () => {
    expect(() =>
      applyCommand(documentOf(), {
        id: 'u1',
        type: 'update_piece',
        params: { id: 'p1', notes: 'x'.repeat(501) },
      }),
    ).toThrowError(/notes must be at most 500/);
    expect(() =>
      applyCommand(documentOf(), {
        id: 'u1',
        type: 'update_piece',
        params: { id: 'p1', fabric: 'x'.repeat(121) },
      }),
    ).toThrowError(/fabric must be at most 120/);
    expect(() =>
      applyCommand(documentOf(), {
        id: 'u1',
        type: 'update_piece',
        params: { id: 'p1', color: '#AABBCC' },
      }),
    ).toThrowError(/color must be #rrggbb/);
  });

  it('rejects non-string notes or fabric', () => {
    expect(() =>
      applyCommand(documentOf(), {
        id: 'u1',
        type: 'update_piece',
        params: { id: 'p1', notes: 42 as unknown as string },
      }),
    ).toThrowError(/notes must be a string/);
    expect(() =>
      applyCommand(documentOf(), {
        id: 'u1',
        type: 'update_piece',
        params: { id: 'p1', fabric: 42 as unknown as string },
      }),
    ).toThrowError(/fabric must be a string/);
  });
});
