import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEXT_SIZE,
  LEADER_HEAD_LENGTH_RATIO,
  LEADER_HEAD_WIDTH_RATIO,
  LEADER_RULE_GAP_RATIO,
  MONO_ADVANCE_RATIO,
  textLayout,
  textLeaderGeometry,
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

describe('textLeaderGeometry', () => {
  const anchor = { x: 0, y: 0 };
  const target = { x: 100, y: 100 };
  const gap = DEFAULT_TEXT_SIZE * LEADER_RULE_GAP_RATIO;
  const headLength = DEFAULT_TEXT_SIZE * LEADER_HEAD_LENGTH_RATIO;
  const headWidth = DEFAULT_TEXT_SIZE * LEADER_HEAD_WIDTH_RATIO;

  it('returns null when there is no leader field', () => {
    expect(textLeaderGeometry(text(), anchor, target)).toBeNull();
  });

  it('returns null when the leader point or anchor is missing', () => {
    const withLeader = text({ leader: 'b' });
    expect(textLeaderGeometry(withLeader, null, target)).toBeNull();
    expect(textLeaderGeometry(withLeader, anchor, null)).toBeNull();
  });

  it('draws the rule under the baseline, spanning the label width', () => {
    const withLeader = text({ leader: 'b', content: 'x' });
    const layout = textLayout(withLeader, anchor)!;
    const geometry = textLeaderGeometry(withLeader, anchor, target)!;

    expect(geometry.underline.start).toEqual({ x: 0, y: gap });
    expect(geometry.underline.end).toEqual({ x: layout.width, y: gap });
  });

  it('leaves from the nearer rule end and fills a head at the target', () => {
    const withLeader = text({ leader: 'b', content: 'x' });
    const layout = textLayout(withLeader, anchor)!;
    const geometry = textLeaderGeometry(withLeader, anchor, target)!;
    const base = {
      x: (geometry.head[1]!.x + geometry.head[2]!.x) / 2,
      y: (geometry.head[1]!.y + geometry.head[2]!.y) / 2,
    };

    expect(geometry.shaft).not.toBeNull();
    expect(geometry.shaft!.start).toEqual(geometry.underline.end);
    expect(geometry.shaft!.end).toEqual(base);
    expect(geometry.head[0]).toEqual(target);
    expect(
      Math.hypot(
        geometry.head[1]!.x - geometry.head[2]!.x,
        geometry.head[1]!.y - geometry.head[2]!.y,
      ),
    ).toBeCloseTo(headWidth);
    expect(Math.hypot(geometry.head[0]!.x - base.x, geometry.head[0]!.y - base.y)).toBeCloseTo(
      headLength,
    );
    expect(layout.width).toBeGreaterThan(0);
  });

  it('leaves from the left end for a target on the left', () => {
    const withLeader = text({ leader: 'b', content: 'x', fontSize: 12 });
    const geometry = textLeaderGeometry(withLeader, anchor, { x: -100, y: 100 })!;

    expect(geometry.shaft!.start).toEqual(geometry.underline.start);
  });

  it('breaks a tie towards the target’s side, then the right end', () => {
    const centred = text({ leader: 'b', content: 'x', alignment: 'center' });
    const exact = textLeaderGeometry(centred, anchor, { x: 0, y: 100 })!;
    expect(exact.shaft!.start).toEqual(exact.underline.end);

    const nudged = textLeaderGeometry(centred, anchor, { x: -0.00001, y: 100 })!;
    expect(nudged.shaft!.start).toEqual(nudged.underline.start);
  });

  it('shrinks the head and drops the shaft for a short leader', () => {
    const withLeader = text({ leader: 'b', content: 'x', alignment: 'right' });
    const geometry = textLeaderGeometry(withLeader, anchor, { x: 0, y: gap + 1 })!;
    const base = {
      x: (geometry.head[1]!.x + geometry.head[2]!.x) / 2,
      y: (geometry.head[1]!.y + geometry.head[2]!.y) / 2,
    };

    expect(geometry.shaft).toBeNull();
    expect(geometry.head[0]).toEqual({ x: 0, y: gap + 1 });
    expect(Math.hypot(geometry.head[0]!.x - base.x, geometry.head[0]!.y - base.y)).toBeCloseTo(1);
    expect(
      Math.hypot(
        geometry.head[1]!.x - geometry.head[2]!.x,
        geometry.head[1]!.y - geometry.head[2]!.y,
      ),
    ).toBeCloseTo(headWidth / 3);
  });

  it('rotates the rule with the box', () => {
    const withLeader = text({ leader: 'b', content: 'x', rotation: Math.PI / 2 });
    const geometry = textLeaderGeometry(withLeader, anchor, target)!;

    expect(geometry.underline.start.x).toBeCloseTo(-gap);
    expect(geometry.underline.start.y).toBeCloseTo(0);
    expect(geometry.underline.end.x).toBeCloseTo(-gap);
    expect(geometry.underline.end.y).toBeCloseTo(6);
  });

  it('degenerates cleanly when the target is the rule end', () => {
    const withLeader = text({ leader: 'b', content: 'x' });
    const geometry = textLeaderGeometry(withLeader, anchor, { x: 6, y: gap })!;

    expect(geometry.shaft).toBeNull();
    expect(geometry.head).toEqual([
      { x: 6, y: gap },
      { x: 6, y: gap },
      { x: 6, y: gap },
    ]);
  });
});
