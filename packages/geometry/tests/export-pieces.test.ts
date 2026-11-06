import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  toSvgPiece,
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

const svg = (document: PatternDocument, target: Piece, options = {}): string =>
  toSvgPiece(document, target, { generatedAt, ...options });

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
  it('exports the closed cut loop as the cut layer', () => {
    const document = documentOf();
    const cut = layer(svg(document, piece()), 'cut')!;

    expect(cut).toHaveLength(1);
    expect(cut[0]).toContain('data-piece="piece-1"');
    expect(cut[0]!.startsWith('<path d="M ')).toBe(true);
    expect(cut[0]!.endsWith('Z" data-piece="piece-1" />')).toBe(true);
    expect(cut[0]).not.toContain('data-entity-id');
  });

  it('exports only the requested piece from a multi-piece document', () => {
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
    const document = documentOf([piece(), secondPiece], second);
    const output = svg(document, secondPiece);

    expect(layer(output, 'cut')).toHaveLength(1);
    expect(output).toContain('data-piece="piece-2"');
    expect(output).not.toContain('data-piece="piece-1"');
    expect(output).toContain('width="120mm" height="220mm"');
    expect(output).toContain('viewBox="490 -10 120 220"');
  });

  it('exports an empty cut layer and a zero-size viewBox for an unresolvable piece', () => {
    const document = documentOf();
    const output = svg(
      {
        ...document,
        entities: document.entities.filter((entity) => entity.id !== 'c'),
      },
      piece(),
    );

    expect(layer(output, 'cut')).toEqual([]);
    expect(layer(output, 'stitch')).toBeNull();
    expect(output).not.toContain('data-entity-id');
    expect(output).toContain('width="0mm" height="0mm"');
    expect(output).toContain('viewBox="0 0 0 0"');
  });

  it('sizes the page from the cut bounds plus padding, not the document bounds', () => {
    const document = documentOf([piece()], [point('guide', 5000, 5000)]);
    const output = svg(document, piece());

    // 220 x 210 of cut geometry plus 10 mm on every side.
    expect(output).toContain('width="240mm" height="230mm"');
    expect(output).toContain('viewBox="-20 -10 240 230"');
  });

  it('accepts a custom padding', () => {
    const document = documentOf();
    const output = svg(document, piece(), { padding: 0 });

    expect(output).toContain('width="220mm" height="210mm"');
    expect(output).toContain('viewBox="-10 0 220 210"');
  });

  it('adds a stitch layer by default and omits it on request', () => {
    const document = documentOf();
    const stitch = layer(svg(document, piece()), 'stitch')!;

    expect(stitch).toHaveLength(1);
    expect(stitch[0]).toContain('data-piece="piece-1"');
    expect(stitch[0]).toContain('data-kind="stitch"');
    expect(layer(svg(document, piece(), { stitch: false }), 'stitch')).toBeNull();
  });

  it('adds a fold layer only for a double fold and omits it on request', () => {
    const doubled = piece({
      allowances: piece().allowances.map((allowance) => ({
        ...allowance,
        kind: 'double' as const,
      })),
    });
    const document = documentOf([doubled]);

    expect(layer(svg(documentOf(), piece()), 'fold')).toBeNull();
    const fold = layer(svg(document, doubled), 'fold')!;
    expect(fold).toHaveLength(1);
    expect(fold[0]).toContain('data-kind="fold"');
    expect(layer(svg(document, doubled, { fold: false }), 'fold')).toBeNull();
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
    const cut = layer(svg({ ...createEmptyDocument(), entities, pieces: [slot] }, slot), 'cut')!;

    expect(cut[0]).toContain('data-warning="self-intersection"');
  });
});

describe('piece marks layer', () => {
  const marks = (): Entity[] => [
    point('m', 200, 100),
    {
      id: 'notch-1',
      kind: 'mark',
      type: 'notch',
      piece: 'piece-1',
      edge: 'right',
      point: 'm',
    },
    {
      id: 'centre-1',
      kind: 'mark',
      type: 'centre_line',
      piece: 'piece-1',
      start: 'a',
      end: 'c',
    },
  ];

  it('exports a notch and a centre line on their own layer', () => {
    const document = documentOf([piece()], marks());
    const inner = layer(svg(document, piece()), 'marks');

    expect(inner).not.toBeNull();
    expect(inner!.join('\n')).toContain('data-kind="notch"');
    expect(inner!.join('\n')).toContain('data-kind="centre_line"');
    expect(inner!.join('\n')).toContain('stroke-dasharray="6 2 2 2"');
  });

  it('leaves the layer out when marks are switched off or none resolve', () => {
    const document = documentOf([piece()], marks());
    expect(layer(svg(document, piece(), { marks: false }), 'marks')).toBeNull();

    const broken = documentOf(
      [piece()],
      [
        {
          id: 'notch-1',
          kind: 'mark',
          type: 'notch',
          piece: 'piece-1',
          edge: 'bottom',
          point: 'a',
        },
        {
          id: 'centre-1',
          kind: 'mark',
          type: 'centre_line',
          piece: 'piece-1',
          start: 'a',
          end: 'gone',
        },
      ],
    );
    expect(layer(svg(broken, piece()), 'marks')).toBeNull();
  });

  it('keeps the cut layer identical with and without marks', () => {
    const withoutMarks = layer(svg(documentOf(), piece()), 'cut');
    const withMarks = layer(svg(documentOf([piece()], marks()), piece()), 'cut');

    expect(withMarks).toEqual(withoutMarks);
  });
});

describe('piece metadata', () => {
  it('records finished and cut sizes plus quantity', () => {
    const output = svg(documentOf(), piece());

    expect(output).toContain(
      '<!-- sewcraft:piece id="piece-1" name="Front &amp; back" finished="200x200" cut="220x210" quantity="2" -->',
    );
  });

  it('omits the name and defaults the quantity', () => {
    const unnamed = piece();
    delete unnamed.name;
    delete unnamed.quantity;
    const output = svg(documentOf([unnamed]), unnamed);

    expect(output).toContain(
      '<!-- sewcraft:piece id="piece-1" finished="200x200" cut="220x210" quantity="1" -->',
    );
  });

  it('omits metadata for a piece whose loop no longer resolves', () => {
    const broken: Piece = { ...piece(), edges: ['bottom', 'right'] };
    const output = svg(documentOf([broken]), broken);

    expect(output).not.toContain('sewcraft:piece');
  });

  it('uses the encoded schema version in the comment', () => {
    expect(svg(documentOf(), piece())).toContain(
      '<!-- sewcraft:svg schema="sewcraft.pattern/0.7" generated="2026-10-22T00:00:00.000Z" -->',
    );
  });
});
