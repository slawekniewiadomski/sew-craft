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

const rectangleConstraints: Constraint[] = [
  { id: 'width', type: 'distance', a: 'a', b: 'b', value: 160 },
  { id: 'height', type: 'distance', a: 'b', b: 'c', value: 90 },
  { id: 'bottom', type: 'horizontal', a: 'a', b: 'b' },
  { id: 'right', type: 'vertical', a: 'b', b: 'c' },
  { id: 'top', type: 'horizontal', a: 'c', b: 'd' },
  { id: 'left', type: 'vertical', a: 'd', b: 'a' },
];

/** The seeded rectangle from `EditorView.vue`, with its four edges. */
const rectangle = (constraints: Constraint[]): PatternDocument =>
  doc({
    entities: [
      ...entities.filter((entity) => entity.kind === 'point'),
      { id: 'ab', kind: 'line', start: 'a', end: 'b', construction: false },
      { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
      { id: 'cd', kind: 'line', start: 'c', end: 'd', construction: false },
      { id: 'da', kind: 'line', start: 'd', end: 'a', construction: false },
    ],
    constraints,
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
      rounds: [],
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
      seam: { id: 's1', width: 12, side: 'left' },
    });
  });

  it('reports a stored right side', () => {
    const properties = entityProperties(
      doc({ seams: [{ id: 's1', edge: 'l1', width: 12, side: 'right' }] }),
      'l1',
    );

    expect(properties?.seam).toEqual({ id: 's1', width: 12, side: 'right' });
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
    expect(properties?.seam).toEqual({ id: 's1', width: 10, side: 'left' });
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

  it('lists only the rows that act on the selected line in the seeded rectangle', () => {
    const document = rectangle(rectangleConstraints);

    expect(entityProperties(document, 'ab')?.dimensions).toEqual([
      {
        id: 'width',
        entities: ['a', 'b'],
        value: 160,
        state: 'set',
        sourceId: null,
        orientation: 'aligned',
      },
    ]);
    expect(entityProperties(document, 'ab')?.constraints).toEqual([
      { id: 'bottom', type: 'horizontal', label: 'Horizontal', entities: ['a', 'b'] },
    ]);

    expect(entityProperties(document, 'bc')?.dimensions).toEqual([
      {
        id: 'height',
        entities: ['b', 'c'],
        value: 90,
        state: 'set',
        sourceId: null,
        orientation: 'aligned',
      },
    ]);
    expect(entityProperties(document, 'bc')?.constraints).toEqual([
      { id: 'right', type: 'vertical', label: 'Vertical', entities: ['b', 'c'] },
    ]);
  });

  it('keeps every constraint touching a selected point', () => {
    const properties = entityProperties(rectangle(rectangleConstraints), 'b');

    expect(properties?.dimensions.map((dimension) => dimension.id)).toEqual(['width', 'height']);
    expect(properties?.constraints.map((constraint) => constraint.id)).toEqual(['bottom', 'right']);
  });

  it('matches the line endpoint pair regardless of order', () => {
    const properties = entityProperties(
      doc({ constraints: [{ id: 'width', type: 'distance', a: 'b', b: 'a', value: 100 }] }),
      'l1',
    );

    expect(properties?.dimensions).toEqual([
      {
        id: 'width',
        entities: ['b', 'a'],
        value: 100,
        state: 'set',
        sourceId: null,
        orientation: 'aligned',
      },
    ]);
  });

  it('lists angle, equal and point_on_line on every segment they reference', () => {
    const document = rectangle([
      { id: 'angle', type: 'angle', a: 'a', b: 'b', c: 'c', value: Math.PI / 2 },
      { id: 'equal', type: 'equal', a1: 'a', a2: 'b', b1: 'c', b2: 'd' },
      { id: 'pin', type: 'point_on_line', point: 'd', a: 'a', b: 'b' },
    ]);

    expect(
      entityProperties(document, 'ab')?.constraints.map((constraint) => constraint.id),
    ).toEqual(['angle', 'equal', 'pin']);
    expect(
      entityProperties(document, 'bc')?.constraints.map((constraint) => constraint.id),
    ).toEqual(['angle']);
    expect(
      entityProperties(document, 'cd')?.constraints.map((constraint) => constraint.id),
    ).toEqual(['equal']);
  });

  it('hides endpoint-anchoring constraints on the line and shows them on the point', () => {
    const document = doc({
      entities: [
        ...entities,
        { id: 'x', kind: 'point', x: 0, y: 50, construction: false, fixed: false },
      ],
      constraints: [
        { id: 'coincident', type: 'coincident', a: 'a', b: 'x' },
        { id: 'distance', type: 'distance', a: 'a', b: 'x', value: 30 },
        { id: 'horizontal', type: 'horizontal', a: 'a', b: 'x' },
      ],
    });

    expect(entityProperties(document, 'l1')?.dimensions).toEqual([]);
    expect(entityProperties(document, 'l1')?.constraints).toEqual([]);
    expect(entityProperties(document, 'a')?.dimensions.map((dimension) => dimension.id)).toEqual([
      'distance',
    ]);
    expect(entityProperties(document, 'a')?.constraints.map((constraint) => constraint.id)).toEqual(
      ['coincident', 'horizontal'],
    );
  });

  it('keeps duplicate endpoint-pair constraints in document order', () => {
    const properties = entityProperties(
      doc({
        constraints: [
          { id: 'first', type: 'distance', a: 'a', b: 'b', value: 100 },
          { id: 'second', type: 'distance', a: 'b', b: 'a', value: 100 },
        ],
      }),
      'l1',
    );

    expect(properties?.dimensions.map((dimension) => dimension.id)).toEqual(['first', 'second']);
  });

  it('keeps the any-control-point relation for a curve', () => {
    const properties = entityProperties(
      doc({
        entities: [
          ...entities,
          { id: 'x', kind: 'point', x: 0, y: 50, construction: false, fixed: false },
          { id: 'y', kind: 'point', x: 50, y: 50, construction: false, fixed: false },
        ],
        constraints: [
          { id: 'curve-width', type: 'distance', a: 'a', b: 'b', value: 100 },
          { id: 'curve-side', type: 'vertical', a: 'b', b: 'c' },
          { id: 'unrelated', type: 'horizontal', a: 'x', b: 'y' },
        ],
      }),
      'c1',
    );

    expect(properties?.dimensions.map((dimension) => dimension.id)).toEqual(['curve-width']);
    expect(properties?.constraints.map((constraint) => constraint.id)).toEqual(['curve-side']);
  });

  it('treats a dimension between unrelated points as unrelated', () => {
    const properties = entityProperties(
      doc({ constraints: [{ id: 'far', type: 'distance', a: 'c', b: 'd', value: 60 }] }),
      'l1',
    );

    expect(properties?.dimensions).toEqual([]);
  });

  it('reports a driven dimension measurement and an unmeasurable one', () => {
    const document = doc({
      entities: [
        ...entities,
        { id: 'broken', kind: 'line', start: 'a', end: 'gone', construction: false },
      ],
      constraints: [
        { id: 'live', type: 'distance', a: 'a', b: 'b', orientation: 'horizontal' },
        { id: 'ghost', type: 'distance', a: 'a', b: 'gone' },
      ],
    });

    expect(entityProperties(document, 'l1')?.dimensions).toEqual([
      {
        id: 'live',
        entities: ['a', 'b'],
        value: 100,
        state: 'driven',
        sourceId: null,
        orientation: 'horizontal',
      },
    ]);
    expect(entityProperties(document, 'broken')?.dimensions).toEqual([
      {
        id: 'ghost',
        entities: ['a', 'gone'],
        value: null,
        state: 'driven',
        sourceId: null,
        orientation: 'aligned',
      },
    ]);
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
      {
        id: 'width',
        entities: ['b', 'a'],
        value: 100,
        state: 'set',
        sourceId: null,
        orientation: 'aligned',
      },
    ]);
    expect(properties?.constraints).toEqual([
      { id: 'angle', type: 'angle', label: 'Angle 90°', entities: ['a', 'b', 'c'] },
    ]);
  });
});
