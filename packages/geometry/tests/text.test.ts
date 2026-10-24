import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEXT_SIZE,
  MONO_ADVANCE_RATIO,
  textLayout,
  textLeader,
  type TextEntity,
} from '../src/index.js';

const text = (overrides: Partial<TextEntity> = {}): TextEntity => ({
  id: 't',
  kind: 'text',
  piece: 'p',
  anchor: 'a',
  content: 'velcro',
  ...overrides,
});

describe('textLayout', () => {
  it('returns null without an anchor', () => {
    expect(textLayout(text(), null)).toBeNull();
  });

  it('lays a left-aligned label above its anchor', () => {
    const layout = textLayout(text(), { x: 10, y: 20 })!;

    expect(layout.width).toBeCloseTo('velcro'.length * DEFAULT_TEXT_SIZE * MONO_ADVANCE_RATIO);
    expect(layout.height).toBe(DEFAULT_TEXT_SIZE);
    expect(layout.rotation).toBe(0);
    expect(layout.corners).toEqual([
      { x: 10, y: 20 },
      { x: 10 + layout.width, y: 20 },
      { x: 10 + layout.width, y: 20 - DEFAULT_TEXT_SIZE },
      { x: 10, y: 20 - DEFAULT_TEXT_SIZE },
    ]);
  });

  it('centres and right-aligns the box around the anchor', () => {
    const centred = textLayout(text({ alignment: 'center' }), { x: 0, y: 0 })!;
    expect(centred.corners[0]!.x).toBeCloseTo(-centred.width / 2);
    expect(centred.corners[1]!.x).toBeCloseTo(centred.width / 2);

    const right = textLayout(text({ alignment: 'right' }), { x: 0, y: 0 })!;
    expect(right.corners[0]!.x).toBeCloseTo(-right.width);
    expect(right.corners[1]!.x).toBeCloseTo(0);
  });

  it('uses an explicit font size and rotation', () => {
    const layout = textLayout(text({ fontSize: 10, rotation: Math.PI / 2 }), { x: 0, y: 0 })!;

    expect(layout.height).toBe(10);
    // The bottom-left corner turns a quarter turn: (0,0) stays, bottom-right
    // moves to y = width.
    expect(layout.corners[0]!.x).toBeCloseTo(0);
    expect(layout.corners[1]!.x).toBeCloseTo(0);
    expect(layout.corners[1]!.y).toBeCloseTo(layout.width);
  });
});

describe('textLeader', () => {
  const anchor = { x: 0, y: 0 };
  const leader = { x: 100, y: 100 };

  it('returns null when there is no leader field', () => {
    expect(textLeader(text(), anchor, leader)).toBeNull();
  });

  it('returns null when the leader point or anchor is missing', () => {
    const withLeader = text({ leader: 'b' });
    expect(textLeader(withLeader, null, leader)).toBeNull();
    expect(textLeader(withLeader, anchor, null)).toBeNull();
  });

  it('runs from the nearest label edge to the leader point', () => {
    const withLeader = text({ leader: 'b', content: 'x' });
    const layout = textLayout(withLeader, anchor)!;
    const points = textLeader(withLeader, anchor, leader)!;

    expect(points).toHaveLength(2);
    expect(points[1]).toEqual(leader);
    // The nearest edge is the top-right corner of the box.
    expect(points[0]!.x).toBeGreaterThanOrEqual(0);
    expect(points[0]!.x).toBeLessThanOrEqual(layout.width);
    expect(points[0]!.y).toBeGreaterThanOrEqual(-DEFAULT_TEXT_SIZE);
    expect(points[0]!.y).toBeLessThanOrEqual(0);
  });

  it('follows a rotated label edge', () => {
    const withLeader = text({ leader: 'b', rotation: Math.PI });
    const points = textLeader(withLeader, anchor, leader)!;
    expect(points).toHaveLength(2);
    expect(points[0]!.y).toBeLessThanOrEqual(DEFAULT_TEXT_SIZE);
  });
});
