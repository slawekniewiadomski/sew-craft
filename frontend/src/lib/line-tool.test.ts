import {
  createEmptyDocument,
  executeCommand,
  type Command,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  buildLineCommands,
  ENDPOINT_TOLERANCE,
  resolveLineEndpoint,
  sameEndpoint,
  type LineEndpoint,
} from './line-tool';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([pt('a', 0, 0), pt('b', 100, 0), pt('c', 100, 100)]);

const existing = (id: EntityId): LineEndpoint => ({ kind: 'point', id });
const fresh = (x: number, y: number): LineEndpoint => ({ kind: 'new', x, y });

function idGenerator(): (prefix: string) => EntityId {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
}

describe('resolveLineEndpoint', () => {
  it('reuses an existing point under the pointer', () => {
    expect(resolveLineEndpoint(baseDoc, { x: 100, y: 0 })).toEqual(existing('b'));
  });

  it('reuses an existing point within snap tolerance', () => {
    expect(resolveLineEndpoint(baseDoc, { x: 104, y: 2 })).toEqual(existing('b'));
  });

  it('snaps a bare position to the grid', () => {
    expect(resolveLineEndpoint(baseDoc, { x: 23, y: 47 })).toEqual(fresh(20, 50));
  });

  it('snaps an empty document to the grid', () => {
    expect(resolveLineEndpoint(createEmptyDocument(), { x: 4, y: 6 })).toEqual(fresh(0, 10));
  });
});

describe('sameEndpoint', () => {
  it('treats the same point id as equal', () => {
    expect(sameEndpoint(existing('a'), existing('a'))).toBe(true);
  });

  it('treats different point ids as different even at the same place', () => {
    expect(sameEndpoint(existing('a'), existing('b'))).toBe(false);
  });

  it('treats coordinates within the tolerance as equal', () => {
    expect(sameEndpoint(fresh(10, 10), fresh(10 + ENDPOINT_TOLERANCE, 10))).toBe(true);
  });

  it('treats coordinates beyond the tolerance as different', () => {
    expect(sameEndpoint(fresh(10, 10), fresh(10.01, 10))).toBe(false);
    expect(sameEndpoint(fresh(10, 10), fresh(10, 10.01))).toBe(false);
  });

  it('treats a point and a coordinate as different', () => {
    expect(sameEndpoint(existing('a'), fresh(0, 0))).toBe(false);
    expect(sameEndpoint(fresh(0, 0), existing('a'))).toBe(false);
  });
});

describe('buildLineCommands', () => {
  it('emits only add_line when both endpoints already exist', () => {
    const nextId = idGenerator();

    const commands = buildLineCommands(existing('a'), existing('b'), nextId);

    expect(commands).toEqual([
      { id: 'line-1', type: 'add_line', params: { start: 'a', end: 'b' } },
    ]);
  });

  it('creates both points before the line for empty to empty', () => {
    const commands = buildLineCommands(fresh(10, 20), fresh(30, 40), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 10, y: 20 } },
      { id: 'point-2', type: 'add_point', params: { x: 30, y: 40 } },
      { id: 'line-3', type: 'add_line', params: { start: 'point-1', end: 'point-2' } },
    ]);
  });

  it('creates only the end point for existing to empty', () => {
    const commands = buildLineCommands(existing('a'), fresh(30, 40), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 30, y: 40 } },
      { id: 'line-2', type: 'add_line', params: { start: 'a', end: 'point-1' } },
    ]);
  });

  it('creates only the start point for empty to existing', () => {
    const commands = buildLineCommands(fresh(10, 20), existing('b'), idGenerator());

    expect(commands).toEqual([
      { id: 'point-1', type: 'add_point', params: { x: 10, y: 20 } },
      { id: 'line-2', type: 'add_line', params: { start: 'point-1', end: 'b' } },
    ]);
  });

  it('builds a batch that the command core accepts', () => {
    let sequence = 0;
    const commands: Command[] = buildLineCommands(fresh(10, 20), fresh(30, 40), () => {
      sequence += 1;
      return `id-${sequence}`;
    });

    const applied = commands.reduce<PatternDocument>(
      (document, command) => executeCommand(document, command).document,
      baseDoc,
    );

    const line = applied.entities.find((entity): entity is LineEntity => entity.kind === 'line');
    expect(line).toBeDefined();
    expect(applied.entities.filter((entity) => entity.kind === 'point')).toHaveLength(5);
  });
});
