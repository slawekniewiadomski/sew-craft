import { createEmptyDocument, type Entity, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { buildPointMidpointCommands } from './point-midpoint';

const point = (id: string, x: number, y: number): Entity => ({
  id,
  kind: 'point',
  x,
  y,
  construction: false,
  fixed: false,
});

const line = (id: string, start: string, end: string): Entity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: false,
});

const documentOf = (entities: Entity[]): PatternDocument => ({
  ...createEmptyDocument(),
  entities,
});

const base = documentOf([point('a', 0, 0), point('b', 100, 40), line('ab', 'a', 'b')]);

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${++counter}`;

describe('buildPointMidpointCommands', () => {
  it('creates the point at the visible middle and its line-form relation', () => {
    counter = 0;

    expect(buildPointMidpointCommands(base, 'ab', nextId)).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 50, y: 20 } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['point-1', 'ab'] },
      },
    ]);
  });

  it('stamps the owning piece on both commands', () => {
    counter = 0;

    expect(buildPointMidpointCommands(base, 'ab', nextId, 'piece-1')).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 50, y: 20, piece: 'piece-1' } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'midpoint', entities: ['point-1', 'ab'], piece: 'piece-1' },
      },
    ]);
  });

  it('returns null when the line or its endpoints cannot resolve', () => {
    expect(buildPointMidpointCommands(base, 'missing', nextId)).toBeNull();
    expect(
      buildPointMidpointCommands(
        documentOf([point('a', 0, 0), line('ab', 'a', 'ghost')]),
        'ab',
        nextId,
      ),
    ).toBeNull();
    expect(
      buildPointMidpointCommands(
        documentOf([point('a', 0, 0), point('b', 0, 0), line('ab', 'a', 'b')]),
        'ab',
        nextId,
      ),
    ).toBeNull();
  });
});
