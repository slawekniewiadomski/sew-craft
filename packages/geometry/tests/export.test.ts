import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createEmptyDocument,
  PATTERN_SCHEMA,
  toSvg,
  type CurveEntity,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '../src/index.js';

const point = (
  id: string,
  x: number,
  y: number,
  options: { construction?: boolean; fixed?: boolean } = {},
): PointEntity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: options.construction ?? false,
  fixed: options.fixed ?? false,
});

const line = (
  id: string,
  start: string,
  end: string,
  options: { construction?: boolean } = {},
): LineEntity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: options.construction ?? false,
});

const curve = (
  id: string,
  points: [string, string, string, string],
  options: { construction?: boolean } = {},
): CurveEntity => ({
  id,
  kind: 'curve',
  p0: points[0],
  p1: points[1],
  p2: points[2],
  p3: points[3],
  construction: options.construction ?? false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const square = (): PatternDocument =>
  documentOf([point('a', 0, 0), point('b', 100, 50), line('l', 'a', 'b')]);

describe('toSvg', () => {
  it('exports a true-to-scale millimetre viewBox with padding around the geometry', () => {
    const svg = toSvg(square(), { generatedAt: '2026-01-01T00:00:00.000Z' });

    expect(svg).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="70mm" viewBox="-10 -10 120 70">',
    );
    expect(svg).toContain(
      `<!-- sewcraft:svg schema="${PATTERN_SCHEMA}" generated="2026-01-01T00:00:00.000Z" -->`,
    );
    expect(svg).toContain('<line x1="0" y1="0" x2="100" y2="50" data-entity-id="l" />');
  });

  it('always emits the cut layer and omits construction by default', () => {
    const svg = toSvg(
      documentOf([
        point('a', 0, 0),
        point('b', 10, 0),
        point('c', 10, 10),
        line('cut', 'a', 'b'),
        line('guide', 'b', 'c', { construction: true }),
      ]),
    );

    expect(svg).toContain('<g data-layer="cut" fill="none"');
    expect(svg).toContain('data-entity-id="cut"');
    expect(svg).not.toContain('data-layer="construction"');
    expect(svg).not.toContain('data-entity-id="guide"');
  });

  it('includes construction geometry in its own layer when requested', () => {
    const svg = toSvg(
      documentOf([
        point('a', 0, 0),
        point('b', 10, 0),
        line('guide', 'a', 'b', { construction: true }),
      ]),
      { construction: true },
    );

    expect(svg).toContain('<g data-layer="construction"');
    expect(svg).toContain('data-entity-id="guide"');
  });

  it('omits an empty construction layer even when construction is requested', () => {
    const svg = toSvg(square(), { construction: true });

    expect(svg).not.toContain('data-layer="construction"');
  });

  it('exports a rounded corner as trimmed cut lines and a cut arc', () => {
    const rounded = applyCommand(
      documentOf([
        point('c', 0, 0),
        point('a', 100, 0),
        point('b', 0, 100),
        line('l1', 'c', 'a'),
        line('l2', 'c', 'b'),
      ]),
      { id: 'r1', type: 'add_corner_round', params: { first: 'l1', second: 'l2', radius: 10 } },
    ).document;
    const svg = toSvg(rounded);

    expect(svg).toContain('<g data-layer="cut" fill="none"');
    expect(svg).toContain('data-entity-id="l1"');
    expect(svg).toContain('data-entity-id="l2"');
    expect(svg).toContain('data-entity-id="r1:arc"');
    expect(svg).toContain('<path d="M 10 0 C');
  });

  it('renders curves as cubic Bézier paths', () => {
    const svg = toSvg(
      documentOf([
        point('p0', 0, 0),
        point('p1', 10, 20),
        point('p2', 30, 20),
        point('p3', 40, 0),
        curve('c', ['p0', 'p1', 'p2', 'p3']),
      ]),
    );

    expect(svg).toContain('<path d="M 0 0 C 10 20 30 20 40 0" data-entity-id="c" />');
  });

  it('skips entities whose referenced points are missing or not points', () => {
    const svg = toSvg(
      documentOf([
        point('a', 0, 0),
        line('dangling', 'a', 'missing'),
        line('not-point', 'a', 'ref'),
        line('ref', 'a', 'a'),
        curve('broken', ['a', 'a', 'a', 'missing']),
      ]),
    );

    expect(svg).not.toContain('dangling');
    expect(svg).not.toContain('not-point');
    expect(svg).not.toContain('broken');
  });

  it('renders seam allowance outlines in a dedicated layer', () => {
    const svg = toSvg(square(), {
      seamAllowance: [
        {
          edge: 'l',
          path: [
            { x: 0, y: 5 },
            { x: 100, y: 55 },
          ],
        },
      ],
    });

    expect(svg).toContain('data-layer="seam-allowance"');
    expect(svg).toContain('<path d="M 0 5 L 100 55" data-edge="l" />');
  });

  it('renders a single-point allowance path and skips empty ones', () => {
    const svg = toSvg(square(), {
      seamAllowance: [
        { edge: 'empty', path: [] },
        { edge: 'dot', path: [{ x: 1, y: 2 }] },
      ],
    });

    expect(svg).toContain('<path d="M 1 2" data-edge="dot" />');
    expect(svg).not.toContain('data-edge="empty"');
  });

  it('omits the seam-allowance layer entirely when there is nothing to draw', () => {
    const svg = toSvg(square(), { seamAllowance: [{ edge: 'empty', path: [] }] });

    expect(svg).not.toContain('data-layer="seam-allowance"');
  });

  it('formats an empty document as a zero-sized viewBox with an empty cut layer', () => {
    const svg = toSvg(createEmptyDocument());

    expect(svg).toContain('width="0mm" height="0mm" viewBox="0 0 0 0"');
    expect(svg).toContain('<g data-layer="cut" fill="none"');
  });

  it('escapes XML special characters in ids and the metadata timestamp', () => {
    const svg = toSvg(
      documentOf([point('a', 0, 0), point('b', 1, 1), line('a&b<c>"d\'e', 'a', 'b')]),
      { generatedAt: 'now & then <"\' >' },
    );

    expect(svg).toContain('generated="now &amp; then &lt;&quot;&apos; &gt;"');
    expect(svg).toContain('data-entity-id="a&amp;b&lt;c&gt;&quot;d&apos;e"');
  });

  it('rounds coordinates to micrometres and normalises negative zero', () => {
    const svg = toSvg(
      documentOf([point('a', -0.00004, 1 / 3), point('b', 1000000000000, 0), line('l', 'a', 'b')]),
      { padding: 0 },
    );

    expect(svg).toContain('x1="0" y1="0.3333"');
    expect(svg).toContain('x2="1000000000000" y2="0"');
  });
});
