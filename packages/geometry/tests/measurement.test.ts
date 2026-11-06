import { describe, expect, it } from 'vitest';

import {
  isMeasuredVariable,
  isValueVariable,
  measurementChain,
  measurementChainMessage,
  measurementLength,
  type Entity,
  type Variable,
} from '../src/index.js';

const point = (id: string, x: number, y: number): Entity => ({
  id,
  kind: 'point',
  x,
  y,
  fixed: false,
});

const line = (id: string, start: string, end: string): Entity => ({
  id,
  kind: 'line',
  start,
  end,
});

const arc = (id: string, start: string, end: string, through: string): Entity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
});

const curve = (id: string, p0: string, p1: string, p2: string, p3: string): Entity => ({
  id,
  kind: 'curve',
  p0,
  p1,
  p2,
  p3,
});

const circle = (id: string, center: string, rim: string): Entity => ({
  id,
  kind: 'circle',
  center,
  rim,
});

/** A square loop a→b→c→d→a plus a dangling edge and a circle. */
const entities: Entity[] = [
  point('a', 0, 0),
  point('b', 10, 0),
  point('c', 10, 10),
  point('d', 0, 10),
  point('e', 20, 0),
  point('o', 40, 40),
  point('r', 50, 40),
  line('ab', 'a', 'b'),
  line('bc', 'b', 'c'),
  line('cd', 'c', 'd'),
  line('da', 'd', 'a'),
  line('be', 'b', 'e'),
  circle('c1', 'o', 'r'),
];

describe('measurementChain', () => {
  it('accepts one edge and keeps it alone', () => {
    expect(measurementChain(entities, ['ab'])).toEqual({ chain: ['ab'], closed: false });
  });

  it('orders an open chain from its free end whatever the input order', () => {
    // Either free end may begin the walk; the stored order is a path, not a
    // judgement about which end is "first".
    expect(measurementChain(entities, ['bc', 'ab'])).toEqual({
      chain: ['bc', 'ab'],
      closed: false,
    });
    expect(measurementChain(entities, ['ab', 'bc'])).toEqual({
      chain: ['ab', 'bc'],
      closed: false,
    });
  });

  it('chains a curve and an arc through their shared tangent points', () => {
    const mixed: Entity[] = [
      point('s', 0, 0),
      point('m', 10, 0),
      point('t', 20, 0),
      point('u', 15, 5),
      curve('cv', 's', 'm', 'm', 'm'),
      arc('a1', 'm', 't', 'u'),
    ];
    expect(measurementChain(mixed, ['a1', 'cv'])).toEqual({
      chain: ['a1', 'cv'],
      closed: false,
    });
  });

  it('walks a closed loop and reports it closed', () => {
    expect(measurementChain(entities, ['bc', 'cd', 'da', 'ab'])).toEqual({
      chain: ['bc', 'cd', 'da', 'ab'],
      closed: true,
    });
  });

  it('allows a circle only on its own', () => {
    expect(measurementChain(entities, ['c1'])).toEqual({ chain: ['c1'], closed: false });
    expect(measurementChain(entities, ['c1', 'ab'])).toEqual({
      problem: { code: 'circle', id: 'c1' },
    });
  });

  it('rejects an empty, unknown, non-edge, duplicated or branching selection', () => {
    expect(measurementChain(entities, [])).toEqual({ problem: { code: 'empty' } });
    expect(measurementChain(entities, ['gone'])).toEqual({
      problem: { code: 'unknown', id: 'gone' },
    });
    expect(measurementChain(entities, ['a'])).toEqual({ problem: { code: 'kind', id: 'a' } });
    expect(measurementChain(entities, ['ab', 'ab'])).toEqual({
      problem: { code: 'duplicate', id: 'ab' },
    });
    // `bc` joins `ab` and `cd` at b, and `be` too.
    expect(measurementChain(entities, ['ab', 'bc', 'cd', 'be'])).toEqual({
      problem: { code: 'branch', id: 'ab' },
    });
  });

  it('rejects two disjoint groups with the pair that does not meet', () => {
    expect(measurementChain(entities, ['ab', 'cd'])).toEqual({
      problem: { code: 'gap', from: 'ab', to: 'cd' },
    });
  });

  it('explains every problem', () => {
    expect(measurementChainMessage({ code: 'empty' })).toContain('at least one');
    expect(measurementChainMessage({ code: 'unknown', id: 'x' })).toContain('x does not exist');
    expect(measurementChainMessage({ code: 'kind', id: 'x' })).toContain('is not a line');
    expect(measurementChainMessage({ code: 'duplicate', id: 'x' })).toContain('more than once');
    expect(measurementChainMessage({ code: 'circle', id: 'x' })).toContain('cannot be combined');
    expect(measurementChainMessage({ code: 'gap', from: 'a', to: 'b' })).toContain(
      'do not share an endpoint',
    );
    expect(measurementChainMessage({ code: 'branch', id: 'x' })).toContain('more than two edges');
  });
});

describe('measurementLength', () => {
  it('sums straight lines', () => {
    expect(measurementLength(entities, ['ab', 'bc'])).toBeCloseTo(20, 10);
    expect(measurementLength(entities, ['ab', 'bc', 'cd', 'da'])).toBeCloseTo(40, 10);
  });

  it('measures a true arc, not its chord', () => {
    const quarter: Entity[] = [
      point('s', 0, 0),
      point('t', 10, 0),
      point('u', 5, -5),
      arc('a1', 's', 't', 'u'),
    ];
    expect(measurementLength(quarter, ['a1'])).toBeCloseTo(5 * Math.PI, 10);
  });

  it('flattens a cubic to its length', () => {
    const straight: Entity[] = [
      point('p0', 0, 0),
      point('p1', 10, 0),
      point('p2', 20, 0),
      point('p3', 30, 0),
      curve('cv', 'p0', 'p1', 'p2', 'p3'),
    ];
    expect(measurementLength(straight, ['cv'])).toBeCloseTo(30, 10);
  });

  it('uses the circumference of a circle', () => {
    expect(measurementLength(entities, ['c1'])).toBeCloseTo(20 * Math.PI, 10);
  });

  it('returns null when a source is missing, degenerate or empty', () => {
    const broken: Entity[] = [
      point('a', 0, 0),
      line('ab', 'a', 'gone'),
      point('b', 10, 0),
      point('c', 10, 10),
      point('d', 0, 10),
      arc('a1', 'a', 'b', 'gone'),
      arc('a2', 'a', 'a', 'a'),
      circle('c0', 'a', 'a'),
      circle('c1', 'a', 'gone'),
      curve('cv', 'a', 'b', 'gone', 'c'),
      { id: 'cv2', kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd' },
    ];
    expect(measurementLength(broken, ['ab'])).toBeNull();
    expect(measurementLength(broken, ['a1'])).toBeNull();
    expect(measurementLength(broken, ['a2'])).toBeNull();
    expect(measurementLength(broken, ['c0'])).toBeNull();
    expect(measurementLength(broken, ['c1'])).toBeNull();
    expect(measurementLength(broken, ['cv'])).toBeNull();
    expect(measurementLength(broken, ['gone'])).toBeNull();
    expect(measurementLength(broken, [])).toBeNull();
    // A point id is not a source.
    expect(measurementLength(broken, ['a'])).toBeNull();
  });
});

describe('variable kind guards', () => {
  const measured: Variable = {
    slug: 'neck',
    name: 'Neckline',
    unit: 'mm',
    kind: 'measurement',
    sources: ['ab'],
  };
  const value: Variable = { slug: 'bust', name: 'Bust', unit: 'mm', value: 88 };

  it('tells the two kinds apart', () => {
    expect(isMeasuredVariable(measured)).toBe(true);
    expect(isValueVariable(measured)).toBe(false);
    expect(isMeasuredVariable(value)).toBe(false);
    expect(isValueVariable(value)).toBe(true);
  });
});
