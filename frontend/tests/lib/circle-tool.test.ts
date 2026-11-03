import {
  createEmptyDocument,
  executeCommand,
  type CircleEntity,
  type Command,
  type Entity,
  type EntityId,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  buildCircleCommands,
  resolveCircleEndpoint,
  sameCircleEndpoint,
  type CircleEndpoint,
} from '@/lib/circle-tool';
import { ENDPOINT_TOLERANCE } from '@/lib/line-tool';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([pt('c', 0, 0), pt('r', 100, 0), pt('d', 100, 100)]);

const existing = (id: EntityId): CircleEndpoint => ({ kind: 'point', id });
const fresh = (x: number, y: number): CircleEndpoint => ({ kind: 'new', x, y });

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

describe('resolveCircleEndpoint', () => {
  it('reuses an existing point under the pointer', () => {
    expect(resolveCircleEndpoint(baseDoc, { x: 100, y: 0 })).toEqual(existing('r'));
  });

  it('snaps a bare position to the grid', () => {
    expect(resolveCircleEndpoint(baseDoc, { x: 23, y: 47 })).toEqual(fresh(20, 50));
  });
});

describe('sameCircleEndpoint', () => {
  it('treats the same point id as equal', () => {
    expect(sameCircleEndpoint(existing('c'), existing('c'))).toBe(true);
  });

  it('treats coordinates within the tolerance as equal', () => {
    expect(sameCircleEndpoint(fresh(10, 10), fresh(10 + ENDPOINT_TOLERANCE, 10))).toBe(true);
  });

  it('treats a different point id as different', () => {
    expect(sameCircleEndpoint(existing('c'), existing('r'))).toBe(false);
  });
});

describe('buildCircleCommands', () => {
  it('emits an empty batch for a degenerate radius', () => {
    expect(buildCircleCommands(existing('c'), existing('c'), idGenerator())).toEqual([]);
    expect(buildCircleCommands(fresh(10, 10), fresh(10, 10), idGenerator())).toEqual([]);
  });

  it('emits only add_circle when both endpoints already exist', () => {
    const commands = buildCircleCommands(existing('c'), existing('r'), idGenerator());

    expect(commands).toEqual([
      { id: 'circle-1', type: 'add_circle', params: { center: 'c', rim: 'r' } },
    ]);
  });

  it('creates both points before the circle for empty to empty', () => {
    const commands = buildCircleCommands(fresh(0, 0), fresh(30, 40), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 0, y: 0 } },
      { id: 'point-2', type: 'add_point', params: { x: 30, y: 40 } },
      { id: 'circle-3', type: 'add_circle', params: { center: 'point-1', rim: 'point-2' } },
    ]);
  });

  it('creates only the rim point for existing to empty', () => {
    const commands = buildCircleCommands(existing('c'), fresh(30, 40), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 30, y: 40 } },
      { id: 'circle-2', type: 'add_circle', params: { center: 'c', rim: 'point-1' } },
    ]);
  });

  it('builds a batch that the command core accepts', () => {
    let sequence = 0;
    const commands: Command[] = buildCircleCommands(fresh(0, 0), fresh(30, 40), () => {
      sequence += 1;
      return `id-${sequence}`;
    });

    const applied = commands.reduce<PatternDocument>(
      (document, command) => executeCommand(document, command).document,
      baseDoc,
    );

    const circle = applied.entities.find(
      (entity): entity is CircleEntity => entity.kind === 'circle',
    );
    expect(circle).toBeDefined();
    expect(applied.entities.filter((entity) => entity.kind === 'point')).toHaveLength(5);
  });
});

describe('buildCircleCommands ownership', () => {
  it('stamps the active piece on new points and the circle', () => {
    const commands = buildCircleCommands(fresh(0, 0), fresh(30, 40), idGenerator(), 'p1');
    expect(commands[0]).toMatchObject({ type: 'add_point', params: { piece: 'p1' } });
    expect(commands[2]).toMatchObject({ type: 'add_circle', params: { piece: 'p1' } });
  });
});
