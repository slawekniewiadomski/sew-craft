import {
  applyCommand,
  createEmptyDocument,
  executeCommand,
  getEntity,
  type Command,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { buildPointOnLineCommands } from '@/lib/point-on-line';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: EntityId, end: EntityId): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([
  pt('a', 0, 0),
  pt('b', 100, 0),
  pt('c', 100, 100),
  pt('d', 0, 100),
  pt('z1', 10, 10),
  pt('z2', 10, 10),
  ln('ab', 'a', 'b'),
  ln('bc', 'b', 'c'),
  ln('zero', 'z1', 'z2'),
  ln('broken', 'a', 'missing'),
]);

/** `baseDoc` with the corner at `b` rounded between `ab` and `bc`. */
const roundedDoc = applyCommand(baseDoc, {
  id: 'r1',
  type: 'add_corner_round',
  params: { first: 'ab', second: 'bc', radius: 10 },
}).document;

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

describe('buildPointOnLineCommands', () => {
  it('projects the pointer and constrains the new point to the line', () => {
    expect(buildPointOnLineCommands(baseDoc, 'ab', { x: 30, y: 12 }, idGenerator())).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 30, y: 0 } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'point_on_line', entities: ['point-1', 'a', 'b'] },
      },
    ]);
  });

  it('projects onto a slanted line beyond the clicked span', () => {
    const commands = buildPointOnLineCommands(baseDoc, 'bc', { x: 130, y: 40 }, idGenerator());
    const point = commands![0] as Command & { params: { x: number; y: number } };
    expect(point.params.x).toBeCloseTo(100, 10);
    expect(point.params.y).toBeCloseTo(40, 10);
  });

  it('keeps a pointer already on the line where it is', () => {
    const commands = buildPointOnLineCommands(baseDoc, 'ab', { x: 100, y: 0 }, idGenerator());
    expect(commands![0]).toEqual({
      id: 'point-1',
      type: 'add_point',
      params: { x: 100, y: 0 },
    });
  });

  it('names the authored support anchors of a rounded line', () => {
    const line = getEntity(roundedDoc, 'ab') as LineEntity;
    // The round replaced the corner with a derived tangent on the stored line.
    expect(line.end).toBe('r1:a');

    const commands = buildPointOnLineCommands(roundedDoc, 'ab', { x: 70, y: 12 }, idGenerator())!;
    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 70, y: 0 } },
      {
        id: 'constraint-2',
        type: 'add_constraint',
        params: { type: 'point_on_line', entities: ['point-1', 'a', 'b'] },
      },
    ]);

    // The batch applies to the rounded document and stores the authored pair.
    const withPoint = executeCommand(roundedDoc, commands[0]!).document;
    const applied = executeCommand(withPoint, commands[1]!).document;
    expect(applied.constraints).toEqual([
      { id: 'constraint-2', type: 'point_on_line', point: 'point-1', a: 'a', b: 'b' },
    ]);
  });

  it('returns null for a missing id or a non-line entity', () => {
    expect(
      buildPointOnLineCommands(baseDoc, 'missing', { x: 10, y: 10 }, idGenerator()),
    ).toBeNull();
    expect(buildPointOnLineCommands(baseDoc, 'a', { x: 10, y: 10 }, idGenerator())).toBeNull();
  });

  it('returns null for a broken or degenerate line', () => {
    expect(buildPointOnLineCommands(baseDoc, 'broken', { x: 10, y: 10 }, idGenerator())).toBeNull();
    expect(buildPointOnLineCommands(baseDoc, 'zero', { x: 10, y: 10 }, idGenerator())).toBeNull();
  });

  it('builds commands that apply to the document in order', () => {
    const commands = buildPointOnLineCommands(baseDoc, 'ab', { x: 30, y: 12 }, idGenerator())!;
    const first = executeCommand(baseDoc, commands[0]!);
    const second = executeCommand(first.document, commands[1]!);

    expect(second.document.entities.find((entity) => entity.id === 'point-1')).toMatchObject({
      kind: 'point',
      x: 30,
      y: 0,
    });
    expect(second.document.constraints).toEqual([
      { id: 'constraint-2', type: 'point_on_line', point: 'point-1', a: 'a', b: 'b' },
    ]);
  });
});

describe('buildPointOnLineCommands ownership', () => {
  it('stamps the active piece on the point and the constraint', () => {
    const commands = buildPointOnLineCommands(
      baseDoc,
      'ab',
      { x: 30, y: 12 },
      idGenerator(),
      'p1',
    )!;
    expect(commands[0]).toMatchObject({ type: 'add_point', params: { piece: 'p1' } });
    expect(commands[1]).toMatchObject({ type: 'add_constraint', params: { piece: 'p1' } });
  });
});
