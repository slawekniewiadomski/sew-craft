import {
  createEmptyDocument,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { endpointMissing, endpointPosition, resolveDraftingEndpoint, type DraftingEndpoint } from './drafting';

function pt(id: string, x: number, y: number): PointEntity {
  return { id, kind: 'point', x, y, construction: false, fixed: false };
}

function ln(id: string, start: string, end: string): LineEntity {
  return { id, kind: 'line', start, end, construction: false };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

const baseDoc = doc([pt('a', 0, 0), pt('b', 100, 0), ln('ab', 'a', 'b')]);

const existing = (id: string): DraftingEndpoint => ({ kind: 'point', id });
const fresh = (x: number, y: number): DraftingEndpoint => ({ kind: 'new', x, y });

describe('endpointPosition', () => {
  it('returns a provisional coordinate as-is', () => {
    expect(endpointPosition(baseDoc, fresh(10, 20))).toEqual({ x: 10, y: 20 });
  });

  it('returns the referenced point’s current position', () => {
    expect(endpointPosition(baseDoc, existing('b'))).toEqual({ x: 100, y: 0 });
  });

  it('returns null when the reference is not a point', () => {
    expect(endpointPosition(baseDoc, existing('ab'))).toBeNull();
  });

  it('returns null when the referenced point is gone', () => {
    expect(endpointPosition(baseDoc, existing('missing'))).toBeNull();
  });
});

describe('endpointMissing', () => {
  it('is false without a pending endpoint', () => {
    expect(endpointMissing(baseDoc, null)).toBe(false);
  });

  it('is false for a provisional coordinate', () => {
    expect(endpointMissing(baseDoc, fresh(10, 20))).toBe(false);
  });

  it('is false while the referenced point exists', () => {
    expect(endpointMissing(baseDoc, existing('b'))).toBe(false);
  });

  it('is true once the referenced point is gone', () => {
    expect(endpointMissing(baseDoc, existing('missing'))).toBe(true);
  });
});

describe('resolveDraftingEndpoint container rules', () => {
  const breaks = (id: string, x: number, y: number, role?: 'annotation', piece?: string): PointEntity => ({
    id,
    kind: 'point',
    x,
    y,
    construction: false,
    fixed: false,
    ...(role === undefined ? {} : { role }),
    ...(piece === undefined ? {} : { piece }),
  });

  const document = doc([
    breaks('own', 100, 100, undefined, 'p1'),
    breaks('other', 200, 100, undefined, 'p2'),
    breaks('mark', 300, 100, 'annotation', 'p1'),
  ]);

  it('reuses a point of the active piece', () => {
    expect(resolveDraftingEndpoint(document, { x: 100, y: 100 }, 'p1')).toEqual({
      kind: 'point',
      id: 'own',
    });
  });

  it('ignores annotation and other-piece points', () => {
    expect(resolveDraftingEndpoint(document, { x: 200, y: 100 }, 'p1')).toMatchObject({
      kind: 'new',
    });
    expect(resolveDraftingEndpoint(document, { x: 300, y: 100 }, 'p1')).toMatchObject({
      kind: 'new',
    });
  });

  it('keeps the legacy behaviour without an active piece', () => {
    expect(resolveDraftingEndpoint(document, { x: 200, y: 100 })).toEqual({
      kind: 'point',
      id: 'other',
    });
    expect(resolveDraftingEndpoint(document, { x: 300, y: 100 })).toMatchObject({
      kind: 'new',
    });
  });
});
