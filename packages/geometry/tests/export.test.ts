import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  toSvgPiece,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
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
  options: { construction?: boolean; fixed?: boolean; piece?: string } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  construction: options.construction ?? false,
  fixed: options.fixed ?? false,
});

const line = (
  id: string,
  start: string,
  end: string,
  options: { construction?: boolean; piece?: string } = {},
): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  construction: options.construction ?? false,
});

const curve = (
  id: string,
  points: [string, string, string, string],
  options: { construction?: boolean; piece?: string } = {},
): CurveEntity => ({
  id,
  kind: 'curve',
  p0: points[0],
  p1: points[1],
  p2: points[2],
  p3: points[3],
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  construction: options.construction ?? false,
});

const arc = (
  id: string,
  start: string,
  end: string,
  through: string,
  options: { construction?: boolean; piece?: string } = {},
): ArcEntity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  construction: options.construction ?? false,
});

const circle = (
  id: string,
  center: string,
  rim: string,
  options: { construction?: boolean; piece?: string } = {},
): CircleEntity => ({
  id,
  kind: 'circle',
  center,
  rim,
  ...(options.piece === undefined ? {} : { piece: options.piece }),
  construction: options.construction ?? false,
});

const loop: Entity[] = [
  point('a', 0, 0),
  point('b', 200, 0),
  point('c', 200, 200),
  point('d', 0, 200),
  line('bottom', 'a', 'b'),
  line('right', 'b', 'c'),
  line('top', 'c', 'd'),
  line('left', 'd', 'a'),
];

const piece: Piece = {
  id: 'piece-1',
  edges: ['bottom', 'right', 'top', 'left'],
  allowances: [],
};

const documentOf = (extra: Entity[] = []): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...loop, ...extra],
  pieces: [piece],
});

const generatedAt = '2026-10-22T00:00:00.000Z';

const svg = (document: PatternDocument, options = {}): string =>
  toSvgPiece(document, piece, { generatedAt, ...options });

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

describe('toSvgPiece construction layer', () => {
  it('omits construction by default and includes only the piece-owned geometry on request', () => {
    const document = documentOf([
      point('g1', 300, 0, { piece: 'piece-1' }),
      point('g2', 300, 100, { piece: 'piece-1' }),
      point('other1', 400, 0, { piece: 'other' }),
      point('other2', 400, 100, { piece: 'other' }),
      line('guide', 'g1', 'g2', { construction: true, piece: 'piece-1' }),
      line('foreign', 'other1', 'other2', { construction: true, piece: 'other' }),
    ]);

    expect(layer(svg(document), 'construction')).toBeNull();
    const construction = layer(svg(document, { construction: true }), 'construction')!;
    expect(construction).toHaveLength(1);
    expect(construction[0]).toContain('data-entity-id="guide"');
    expect(construction[0]).not.toContain('foreign');
  });

  it('omits an empty construction layer even when construction is requested', () => {
    expect(layer(svg(documentOf(), { construction: true }), 'construction')).toBeNull();
  });

  it('renders a line, curve, and true arc as cut-ready elements', () => {
    const document = documentOf([
      point('c1', 10, 10, { piece: 'piece-1' }),
      point('c2', 50, 10, { piece: 'piece-1' }),
      point('c3', 50, 50, { piece: 'piece-1' }),
      curve('bend', ['c1', 'c1', 'c2', 'c2'], { construction: true, piece: 'piece-1' }),
      point('a1', 0, 100, { piece: 'piece-1' }),
      point('a2', 100, 100, { piece: 'piece-1' }),
      point('a3', 50, 50, { piece: 'piece-1' }),
      arc('bump', 'a1', 'a2', 'a3', { construction: true, piece: 'piece-1' }),
      point('k1', 20, 20, { piece: 'piece-1' }),
      point('k2', 30, 20, { piece: 'piece-1' }),
      circle('hole', 'k1', 'k2', { construction: true, piece: 'piece-1' }),
    ]);
    const construction = layer(svg(document, { construction: true }), 'construction')!;

    expect(construction).toHaveLength(3);
    expect(construction[0]).toContain('<path d="M 10 10 C');
    expect(construction[1]).toContain('A ');
    expect(construction[2]).toContain('<circle cx="20" cy="20" r="10"');
  });

  it('skips a degenerate or unresolvable arc and circle', () => {
    const document = documentOf([
      point('collinear1', 0, 100, { piece: 'piece-1' }),
      point('collinear2', 10, 100, { piece: 'piece-1' }),
      point('collinear3', 20, 100, { piece: 'piece-1' }),
      arc('flat', 'collinear1', 'collinear3', 'collinear2', {
        construction: true,
        piece: 'piece-1',
      }),
      point('k1', 20, 20, { piece: 'piece-1' }),
      point('k2', 20, 20, { piece: 'piece-1' }),
      circle('empty', 'k1', 'k2', { construction: true, piece: 'piece-1' }),
      point('g1', 300, 0, { piece: 'piece-1' }),
      point('g2', 300, 100, { piece: 'piece-1' }),
      line('missing', 'g1', 'gone', { construction: true, piece: 'piece-1' }),
    ]);
    const construction = layer(svg(document, { construction: true }), 'construction');

    // The arc is collinear, the circle has a zero radius and the line's second
    // point is missing, so nothing renderable is left.
    expect(construction).toBeNull();
  });

  it('skips a curve with a missing point', () => {
    const document = documentOf([
      point('g1', 0, 0, { piece: 'piece-1' }),
      point('g2', 50, 0, { piece: 'piece-1' }),
      curve('broken', ['g1', 'g2', 'gone', 'g2'], { construction: true, piece: 'piece-1' }),
    ]);

    expect(layer(svg(document, { construction: true }), 'construction')).toBeNull();
  });

  it('generates a timestamp when none is supplied', () => {
    const output = toSvgPiece(documentOf(), piece);

    expect(output).toMatch(/generated="\d{4}-\d{2}-\d{2}T/);
  });

  it('skips a circle whose referenced points are missing or not points', () => {
    const document = documentOf([
      point('k1', 20, 20, { piece: 'piece-1' }),
      point('k2', 30, 20, { piece: 'piece-1' }),
      circle('missing', 'k1', 'gone', { construction: true, piece: 'piece-1' }),
      circle('not-points', 'missing', 'gone', { construction: true, piece: 'piece-1' }),
      circle('renderable', 'k1', 'k2', { construction: true, piece: 'piece-1' }),
    ]);
    const construction = layer(svg(document, { construction: true }), 'construction')!;

    expect(construction).toHaveLength(1);
    expect(construction[0]).toContain('data-entity-id="renderable"');
  });

  it('escapes XML special characters in ids and the metadata timestamp', () => {
    const document = documentOf([
      point('g1', 300, 0, { piece: 'piece-1' }),
      point('g2', 300, 100, { piece: 'piece-1' }),
      line('a&b<"c"', 'g1', 'g2', { construction: true, piece: 'piece-1' }),
    ]);
    const output = toSvgPiece(document, piece, {
      construction: true,
      generatedAt: 'a&b<c>',
    });

    expect(output).toContain('data-entity-id="a&amp;b&lt;&quot;c&quot;"');
    expect(output).toContain('generated="a&amp;b&lt;c&gt;"');
  });

  it('rounds coordinates to micrometres and normalises negative zero', () => {
    const document = documentOf([
      point('g1', -0, 0, { piece: 'piece-1' }),
      point('g2', 0.0000004, 100, { piece: 'piece-1' }),
      line('guide', 'g1', 'g2', { construction: true, piece: 'piece-1' }),
    ]);
    const output = svg(document, { construction: true });

    expect(output).toContain('x1="0" y1="0" x2="0" y2="100"');
  });
});
