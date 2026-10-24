import { describe, expect, it } from 'vitest';

import {
  createEmptyDocument,
  isAnnotation,
  isConstruction,
  isCut,
  pieceConstraints,
  pieceEntities,
  roleOf,
  type Constraint,
  type Entity,
} from '../src/index.js';

const line = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'l',
  kind: 'line',
  start: 'a',
  end: 'b',
  ...overrides,
});

describe('roleOf', () => {
  it('treats an absent role as cut', () => {
    expect(roleOf({ kind: 'line' })).toBe('cut');
    expect(roleOf({ kind: 'point' })).toBe('cut');
  });

  it('reads the deprecated construction flag', () => {
    expect(roleOf({ kind: 'line', construction: true })).toBe('construction');
    expect(roleOf({ kind: 'line', construction: false })).toBe('cut');
  });

  it('prefers an explicit role over the legacy flag', () => {
    expect(roleOf({ kind: 'line', role: 'annotation', construction: true })).toBe('annotation');
    expect(roleOf({ kind: 'line', role: 'construction', construction: false })).toBe(
      'construction',
    );
  });

  it('treats text as annotation regardless of the other fields', () => {
    expect(roleOf({ kind: 'text' })).toBe('annotation');
    expect(roleOf({ kind: 'text', role: 'construction' })).toBe('annotation');
  });
});

describe('role predicates', () => {
  it('classifies cut, construction and annotation', () => {
    expect(isCut(line())).toBe(true);
    expect(isConstruction(line())).toBe(false);
    expect(isAnnotation(line())).toBe(false);

    expect(isCut(line({ role: 'construction' }))).toBe(false);
    expect(isConstruction(line({ role: 'construction' }))).toBe(true);

    expect(isCut(line({ role: 'annotation' }))).toBe(false);
    expect(isAnnotation(line({ role: 'annotation' }))).toBe(true);
  });

  it('never calls text a cut edge', () => {
    expect(isCut({ kind: 'text' })).toBe(false);
    expect(isAnnotation({ kind: 'text' })).toBe(true);
    expect(isConstruction({ kind: 'text' })).toBe(false);
  });
});

describe('piece ownership collections', () => {
  const entities: Entity[] = [
    { id: 'a', kind: 'point', x: 0, y: 0, piece: 'p1', fixed: false },
    { id: 'b', kind: 'point', x: 10, y: 0, piece: 'p2', fixed: false },
    { id: 'l', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'free', kind: 'point', x: 1, y: 1, fixed: false },
  ];
  const constraints: Constraint[] = [
    { id: 'c1', type: 'horizontal', a: 'a', b: 'b', piece: 'p1' },
    { id: 'c2', type: 'vertical', a: 'a', b: 'b', piece: 'p2' },
  ];

  it('lists entities owned by one piece', () => {
    const document = { ...createEmptyDocument(), entities, constraints };
    expect(pieceEntities(document, 'p1').map((entity) => entity.id)).toEqual(['a', 'l']);
  });

  it('lists constraints owned by one piece', () => {
    const document = { ...createEmptyDocument(), entities, constraints };
    expect(pieceConstraints(document, 'p1').map((constraint) => constraint.id)).toEqual(['c1']);
  });
});
