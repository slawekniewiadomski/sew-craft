import { createEmptyDocument, type Constraint, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { entityProperties } from './entity-properties';

const entities = [
  { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
  { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: true },
  { id: 'c', kind: 'point', x: 100, y: 60, construction: false, fixed: false },
  { id: 'd', kind: 'point', x: 0, y: 60, construction: true, fixed: false },
  { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
  { id: 'l2', kind: 'line', start: 'a', end: 'b', construction: true },
  { id: 'c1', kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd', construction: false },
] as const;

const doc = (overrides: Partial<PatternDocument> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [...entities],
  ...overrides,
});

describe('entityProperties', () => {
  it('returns null without a selection or for an id that no longer exists', () => {
    const document = doc();

    expect(entityProperties(document, null)).toBeNull();
    expect(entityProperties(document, 'missing')).toBeNull();
  });

  it('describes a point with its coordinates and fixed flag', () => {
    const properties = entityProperties(doc(), 'b');

    expect(properties).toEqual({
      id: 'b',
      kind: 'point',
      construction: false,
      fixed: true,
      geometry: { kind: 'point', x: 100, y: 0 },
      length: null,
      seam: null,
      dimensions: [],
      constraints: [],
    });
  });

  it('describes a line with endpoints, measured length and seam allowance', () => {
    const properties = entityProperties(
      doc({ seams: [{ id: 's1', edge: 'l1', width: 12 }] }),
      'l1',
    );

    expect(properties).toMatchObject({
      id: 'l1',
      kind: 'line',
      construction: false,
      fixed: null,
      geometry: { kind: 'line', start: 'a', end: 'b' },
      length: 100,
      seam: { id: 's1', width: 12 },
    });
  });

  it('describes a curve with all four control points and no length', () => {
    const properties = entityProperties(doc(), 'c1');

    expect(properties).toMatchObject({
      kind: 'curve',
      fixed: null,
      geometry: { kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd' },
      length: null,
      seam: null,
    });
  });

  it('reports construction geometry and a seam allowance on a guide edge', () => {
    const properties = entityProperties(
      doc({ seams: [{ id: 's1', edge: 'l2', width: 10 }] }),
      'l2',
    );

    expect(properties?.construction).toBe(true);
    expect(properties?.seam).toEqual({ id: 's1', width: 10 });
  });

  it('degrades length and relations when a referenced point is missing', () => {
    const properties = entityProperties(
      doc({
        entities: [
          ...entities,
          { id: 'broken', kind: 'line', start: 'a', end: 'gone', construction: false },
        ],
        constraints: [
          { id: 'h', type: 'horizontal', a: 'a', b: 'gone' },
          { id: 'v', type: 'vertical', a: 'b', b: 'c' },
        ],
      }),
      'broken',
    );

    expect(properties?.length).toBeNull();
    expect(properties?.constraints).toEqual([
      { id: 'h', type: 'horizontal', label: 'Horizontal', entities: ['a', 'gone'] },
    ]);
  });

  it('lists dimensions and constraints that reference the entity own points', () => {
    const constraints: Constraint[] = [
      { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100 },
      { id: 'axis', type: 'distance', a: 'a', b: 'c', value: 108, orientation: 'horizontal' },
      { id: 'horizontal', type: 'horizontal', a: 'a', b: 'b' },
      { id: 'unrelated', type: 'vertical', a: 'c', b: 'd' },
      { id: 'unrelated-dimension', type: 'distance', a: 'c', b: 'd', value: 60 },
    ];
    const properties = entityProperties(doc({ constraints }), 'l1');

    expect(properties?.dimensions).toEqual([
      { id: 'width', entities: ['a', 'b'], value: 100, orientation: 'aligned' },
      { id: 'axis', entities: ['a', 'c'], value: 108, orientation: 'horizontal' },
    ]);
    expect(properties?.constraints).toEqual([
      { id: 'horizontal', type: 'horizontal', label: 'Horizontal', entities: ['a', 'b'] },
    ]);
  });

  it('treats a dimension between unrelated points as unrelated', () => {
    const properties = entityProperties(
      doc({ constraints: [{ id: 'far', type: 'distance', a: 'c', b: 'd', value: 60 }] }),
      'l1',
    );

    expect(properties?.dimensions).toEqual([]);
  });

  it('relates point selections to constraints on that point', () => {
    const properties = entityProperties(
      doc({
        constraints: [
          { id: 'width', type: 'distance', a: 'b', b: 'a', value: 100 },
          { id: 'angle', type: 'angle', a: 'a', b: 'b', c: 'c', value: Math.PI / 2 },
        ],
      }),
      'b',
    );

    expect(properties?.dimensions).toEqual([
      { id: 'width', entities: ['b', 'a'], value: 100, orientation: 'aligned' },
    ]);
    expect(properties?.constraints).toEqual([
      { id: 'angle', type: 'angle', label: 'Angle 90°', entities: ['a', 'b', 'c'] },
    ]);
  });
});
