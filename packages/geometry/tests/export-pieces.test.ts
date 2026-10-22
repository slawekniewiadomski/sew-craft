import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  toSvg,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
} from '../src/index.js';

const point = (id: string, x: number, y: number, construction = false): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction,
  fixed: false,
});

const line = (id: string, start: string, end: string, construction = false): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction,
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

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: 'piece-1',
  name: 'Front & back',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [
    { edge: 'right', width: 10 },
    { edge: 'top', width: 10 },
    { edge: 'left', width: 10 },
  ],
  quantity: 2,
  ...overrides,
});

const documentOf = (pieces: Piece[] = [piece()], extra: Entity[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...entities(), ...extra],
  pieces,
});

const generatedAt = '2026-10-22T00:00:00.000Z';

const svg = (document: PatternDocument, options = {}): string =>
  toSvg(document, { generatedAt, ...options });

/** The inner content of the layer group with this name, or `null` when absent. */
function layer(svgText: string, name: string): string[] | null {
  const open = `<g data-layer="${name}"`;
  const start = svgText.indexOf(open);
  if (start < 0) return null;
  const inner = svgText.slice(start + open.length);
  const end = inner.indexOf('</g>');
  return inner
    .slice(inner.indexOf('>') + 1, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe('piece cut layer', () => {
  it('exports the closed cut loops as the cut layer', () => {
    const cut = layer(svg(documentOf()), 'cut')!;

    expect(cut).toHaveLength(1);
    expect(cut[0]).toContain('data-piece="piece-1"');
    expect(cut[0]!.startsWith('<path d="M ')).toBe(true);
    expect(cut[0]!.endsWith('Z" data-piece="piece-1" />')).toBe(true);
    expect(cut[0]).not.toContain('data-entity-id');
  });

  it('unions the cut bounds of several pieces', () => {
    const second: Entity[] = [
      point('a2', 500, 0),
      point('b2', 600, 0),
      point('c2', 600, 200),
      point('d2', 500, 200),
      line('bottom2', 'a2', 'b2'),
      line('right2', 'b2', 'c2'),
      line('top2', 'c2', 'd2'),
      line('left2', 'd2', 'a2'),
    ];
    const secondPiece: Piece = {
      id: 'piece-2',
      edges: ['bottom2', 'right2', 'top2', 'left2'],
      allowances: [],
    };
    const output = svg(documentOf([piece(), secondPiece], second));
    const cut = layer(output, 'cut')!;

    expect(cut).toHaveLength(2);
    expect(output).toContain('data-piece="piece-1"');
    expect(output).toContain('data-piece="piece-2"');
    // -10..600 wide and 0..210 high, plus 10 mm of padding.
    expect(output).toContain('width="630mm" height="230mm"');
    expect(output).toContain('viewBox="-20 -10 630 230"');
  });

  it('skips a piece that does not resolve but still uses the next cut bound', () => {
    const broken: Piece = { ...piece(), id: 'broken', edges: ['bottom', 'right'] };
    const output = svg(documentOf([broken, piece()]));

    expect(layer(output, 'cut')).toHaveLength(1);
    expect(output).toContain('width="240mm" height="230mm"');
    expect(output).not.toContain('sewcraft:piece id="broken"');
  });

  it('keeps the resolved cut bound when a later piece does not resolve', () => {
    const broken: Piece = { ...piece(), id: 'broken', edges: ['bottom', 'right'] };
    const output = svg(documentOf([piece(), broken]));

    expect(layer(output, 'cut')).toHaveLength(1);
    expect(output).toContain('width="240mm" height="230mm"');
    expect(output).not.toContain('sewcraft:piece id="broken"');
  });

  it('sizes the page from the cut bounds plus padding, not the document bounds', () => {
    const output = svg(documentOf([piece()], [point('guide', 5000, 5000, true)]));

    // 220 x 210 of cut geometry plus 10 mm on every side.
    expect(output).toContain('width="240mm" height="230mm"');
    expect(output).toContain('viewBox="-20 -10 240 230"');
  });

  it('adds a stitch layer by default and omits it on request', () => {
    const stitch = layer(svg(documentOf()), 'stitch')!;

    expect(stitch).toHaveLength(1);
    expect(stitch[0]).toContain('data-piece="piece-1"');
    expect(stitch[0]).toContain('data-kind="stitch"');
    expect(layer(svg(documentOf(), { stitch: false }), 'stitch')).toBeNull();
  });

  it('adds a fold layer only for a double fold and omits it on request', () => {
    expect(layer(svg(documentOf()), 'fold')).toBeNull();

    const doubled = piece({
      allowances: piece().allowances.map((allowance) => ({
        ...allowance,
        kind: 'double' as const,
      })),
    });
    const fold = layer(svg(documentOf([doubled])), 'fold')!;

    expect(fold).toHaveLength(1);
    expect(fold[0]).toContain('data-kind="fold"');
    expect(layer(svg(documentOf([doubled]), { fold: false }), 'fold')).toBeNull();
  });

  it('flags a self-intersecting cut loop as a warning', () => {
    const entities: Entity[] = [
      point('a', 0, 0),
      point('b', 100, 0),
      point('c', 100, 100),
      point('d', 60, 100),
      point('e', 60, 20),
      point('f', 40, 20),
      point('g', 40, 100),
      point('h', 0, 100),
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      line('cd', 'c', 'd'),
      line('de', 'd', 'e'),
      line('ef', 'e', 'f'),
      line('fg', 'f', 'g'),
      line('gh', 'g', 'h'),
      line('ha', 'h', 'a'),
    ];
    const edges = ['ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'ha'];
    const slot = piece({
      edges,
      allowances: edges.map((edge) => ({ edge, width: 15 })),
    });
    const cut = layer(svg({ ...createEmptyDocument(), entities, pieces: [slot] }), 'cut')!;

    expect(cut[0]).toContain('data-warning="self-intersection"');
  });
});

describe('piece metadata', () => {
  it('records finished and cut sizes plus quantity', () => {
    const output = svg(documentOf());

    expect(output).toContain(
      '<!-- sewcraft:piece id="piece-1" name="Front &amp; back" finished="200x200" cut="220x210" quantity="2" -->',
    );
  });

  it('omits the name and defaults the quantity', () => {
    const unnamed = piece();
    delete unnamed.name;
    delete unnamed.quantity;
    const output = svg(documentOf([unnamed]));

    expect(output).toContain(
      '<!-- sewcraft:piece id="piece-1" finished="200x200" cut="220x210" quantity="1" -->',
    );
  });

  it('omits metadata for a piece whose loop no longer resolves', () => {
    const broken: Piece = { ...piece(), edges: ['bottom', 'right'] };
    const output = svg(documentOf([broken]));

    expect(output).not.toContain('sewcraft:piece');
  });
});

describe('legacy documents and layers', () => {
  it('keeps the legacy cut layer without a stitch layer', () => {
    const output = svg(documentOf([]));
    const cut = layer(output, 'cut')!;

    expect(cut).toHaveLength(4);
    expect(cut[0]).toContain('data-entity-id="bottom"');
    expect(layer(output, 'stitch')).toBeNull();
    expect(layer(output, 'fold')).toBeNull();
  });

  it('keeps construction geometry opt-in', () => {
    const document = documentOf([], [point('g1', 300, 0), point('g2', 300, 100)]);
    document.entities.push(line('guide', 'g1', 'g2', true));

    expect(layer(svg(document), 'construction')).toBeNull();
    expect(layer(svg(document, { construction: true }), 'construction')).toHaveLength(1);
  });

  it('keeps legacy seam allowances in their own layer', () => {
    const output = svg(documentOf(), {
      seamAllowance: [{ edge: 'legacy', path: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    });
    const seams = layer(output, 'seam-allowance')!;

    expect(seams).toHaveLength(1);
    expect(seams[0]).toContain('data-edge="legacy"');
    expect(seams[0]!.endsWith(' />')).toBe(true);
    expect(seams[0]).not.toContain('Z"');
  });

  it('falls back to the document bounds when no piece resolves', () => {
    const broken: Piece = { ...piece(), edges: ['missing'] };
    const output = svg(documentOf([broken]));

    expect(output).toContain('width="220mm" height="220mm"');
    expect(output).toContain('viewBox="-10 -10 220 220"');
  });

  it('uses the encoded schema version in the comment', () => {
    expect(svg(documentOf())).toContain(
      '<!-- sewcraft:svg schema="sewcraft.pattern/0.2" generated="2026-10-22T00:00:00.000Z" -->',
    );
  });
});
