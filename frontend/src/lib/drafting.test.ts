import {
  createEmptyDocument,
  type Entity,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
} from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { endpointMissing, endpointPosition, type DraftingEndpoint } from './drafting';

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
