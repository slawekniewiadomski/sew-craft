import {
  createEmptyDocument,
  executeCommand,
  type ArcEntity,
  type Command,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { arcFromEndpoints, buildArcCommands, type ArcEndpoint } from './arc-tool';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([pt('a', 0, 0), pt('b', 100, 0), pt('c', 100, 100), ln('ab', 'a', 'b')]);

const existing = (id: EntityId): ArcEndpoint => ({ kind: 'point', id });
const fresh = (x: number, y: number): ArcEndpoint => ({ kind: 'new', x, y });

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

describe('arcFromEndpoints', () => {
  it('resolves the arc through three existing points', () => {
    const geometry = arcFromEndpoints(baseDoc, existing('a'), existing('b'), existing('c'));

    expect(geometry).not.toBeNull();
    // A right triangle: the chord through `through` is the diameter.
    expect(geometry!.center.x).toBeCloseTo(50);
    expect(geometry!.center.y).toBeCloseTo(50);
    expect(geometry!.radius).toBeCloseTo(Math.hypot(50, 50));
  });

  it('resolves an arc whose through point is provisional', () => {
    const geometry = arcFromEndpoints(baseDoc, existing('a'), existing('b'), fresh(50, 50));

    expect(geometry).not.toBeNull();
    expect(geometry!.center.x).toBeCloseTo(50);
    expect(geometry!.center.y).toBeCloseTo(0);
    expect(geometry!.radius).toBeCloseTo(50);
  });

  it('returns null when a referenced id is not a point', () => {
    expect(arcFromEndpoints(baseDoc, existing('ab'), existing('b'), existing('c'))).toBeNull();
  });

  it('returns null when a referenced id is missing', () => {
    expect(arcFromEndpoints(baseDoc, existing('missing'), existing('b'), existing('c'))).toBeNull();
  });

  it('returns null when the endpoints coincide', () => {
    expect(arcFromEndpoints(baseDoc, existing('a'), existing('a'), existing('c'))).toBeNull();
  });

  it('returns null when the third point is on the chord', () => {
    expect(arcFromEndpoints(baseDoc, existing('a'), existing('b'), fresh(50, 0))).toBeNull();
  });

  it('returns null when the third point repeats the start', () => {
    expect(arcFromEndpoints(baseDoc, existing('a'), existing('b'), existing('a'))).toBeNull();
  });
});

describe('buildArcCommands', () => {
  it('emits only add_arc when every endpoint already exists', () => {
    const commands = buildArcCommands(existing('a'), existing('b'), existing('c'), idGenerator());

    expect(commands).toEqual([
      { id: 'arc-1', type: 'add_arc', params: { start: 'a', end: 'b', through: 'c' } },
    ]);
  });

  it('creates the new points in click order before the arc', () => {
    const commands = buildArcCommands(fresh(10, 20), existing('b'), fresh(30, 40), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 10, y: 20 } },
      { id: 'point-2', type: 'add_point', params: { x: 30, y: 40 } },
      {
        id: 'arc-3',
        type: 'add_arc',
        params: { start: 'point-1', end: 'b', through: 'point-2' },
      },
    ]);
  });

  it('builds a batch that the command core accepts', () => {
    let sequence = 0;
    const commands: Command[] = buildArcCommands(fresh(0, 0), fresh(100, 0), fresh(50, 50), () => {
      sequence += 1;
      return `id-${sequence}`;
    });

    const applied = commands.reduce<PatternDocument>(
      (document, command) => executeCommand(document, command).document,
      createEmptyDocument(),
    );

    const arc = applied.entities.find((entity): entity is ArcEntity => entity.kind === 'arc');
    expect(arc).toBeDefined();
    expect(applied.entities.filter((entity) => entity.kind === 'point')).toHaveLength(3);
  });
});

describe('buildArcCommands ownership', () => {
  it('stamps the active piece on new points and the arc', () => {
    const commands = buildArcCommands(fresh(0, 0), fresh(100, 0), fresh(50, 50), idGenerator(), 'p1');
    expect(commands[0]).toMatchObject({ type: 'add_point', params: { piece: 'p1' } });
    expect(commands[3]).toMatchObject({ type: 'add_arc', params: { piece: 'p1' } });
  });
});
