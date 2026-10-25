import { describe, expect, it } from 'vitest';

import type { TextEntity } from '@sewcraft/geometry';

import {
  buildTextCommands,
  DEFAULT_TEXT_CONTENT,
  leaderTargetIssue,
  textContentError,
} from './text-tool';

const nextId = (prefix: string): string => `${prefix}-1`;

const label = (overrides: Partial<TextEntity> = {}): TextEntity => ({
  id: 't1',
  kind: 'text',
  piece: 'p1',
  anchor: 'a',
  content: 'Text',
  ...overrides,
});

describe('buildTextCommands', () => {
  it('creates the anchor point and the label in one batch', () => {
    const commands = buildTextCommands({ kind: 'new', x: 10, y: 20 }, 'p1', nextId);

    expect(commands).toEqual([
      {
        id: 'point-1',
        type: 'add_point',
        params: { x: 10, y: 20, piece: 'p1', role: 'annotation' },
      },
      {
        id: 'text-1',
        type: 'add_text',
        params: {
          piece: 'p1',
          anchor: 'point-1',
          content: DEFAULT_TEXT_CONTENT,
          alignment: 'left',
          rotation: 0,
          fontSize: 10,
        },
      },
    ]);
  });

  it('reuses an existing point by id', () => {
    const commands = buildTextCommands({ kind: 'point', id: 'a' }, 'p1', nextId);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'add_text',
      params: { anchor: 'a', piece: 'p1' },
    });
  });

  it('adds a new arrow target and carries its id', () => {
    let index = 0;
    const ids = (prefix: string): string => `${prefix}-${(index += 1)}`;
    const commands = buildTextCommands({ kind: 'new', x: 10, y: 20 }, 'p1', ids, {
      kind: 'new',
      x: 50,
      y: 60,
    });

    expect(commands).toEqual([
      {
        id: 'point-1',
        type: 'add_point',
        params: { x: 10, y: 20, piece: 'p1', role: 'annotation' },
      },
      {
        id: 'point-2',
        type: 'add_point',
        params: { x: 50, y: 60, piece: 'p1', role: 'annotation' },
      },
      {
        id: 'text-3',
        type: 'add_text',
        params: {
          piece: 'p1',
          anchor: 'point-1',
          content: DEFAULT_TEXT_CONTENT,
          alignment: 'left',
          rotation: 0,
          fontSize: 10,
          leader: 'point-2',
        },
      },
    ]);
  });

  it('reuses an existing point as the arrow target', () => {
    let index = 0;
    const ids = (prefix: string): string => `${prefix}-${(index += 1)}`;
    const commands = buildTextCommands({ kind: 'new', x: 10, y: 20 }, 'p1', ids, {
      kind: 'point',
      id: 'mark',
    });

    expect(commands).toHaveLength(2);
    expect(commands[1]).toMatchObject({
      type: 'add_text',
      params: { anchor: 'point-1', leader: 'mark' },
    });
  });
});

describe('leaderTargetIssue', () => {
  const anchor = { x: 0, y: 0 };

  it('refuses the anchor itself', () => {
    expect(leaderTargetIssue(label(), anchor, { x: 0, y: 0 })).toBe(
      'The arrow needs a different point.',
    );
  });

  it('refuses a target inside the label box or on its rule', () => {
    expect(leaderTargetIssue(label(), anchor, { x: 5, y: -5 })).toBe(
      'Choose a point outside the label.',
    );
    expect(leaderTargetIssue(label(), anchor, { x: 5, y: 1 })).toBe(
      'Choose a point outside the label.',
    );
  });

  it('accepts a target outside the box', () => {
    expect(leaderTargetIssue(label(), anchor, { x: 5, y: -15 })).toBeNull();
    expect(leaderTargetIssue(label(), anchor, { x: 40, y: -5 })).toBeNull();
  });

  it('reads the box in its rotated frame', () => {
    const rotated = label({ rotation: Math.PI / 2 });
    expect(leaderTargetIssue(rotated, anchor, { x: 5, y: 5 })).toBe(
      'Choose a point outside the label.',
    );
    expect(leaderTargetIssue(rotated, anchor, { x: 5, y: -5 })).toBeNull();
  });

  it('accounts for centre and right alignment and an explicit size', () => {
    expect(leaderTargetIssue(label({ alignment: 'center' }), anchor, { x: -5, y: -5 })).toBe(
      'Choose a point outside the label.',
    );
    expect(leaderTargetIssue(label({ alignment: 'right' }), anchor, { x: -20, y: -5 })).toBe(
      'Choose a point outside the label.',
    );
    expect(leaderTargetIssue(label({ fontSize: 20 }), anchor, { x: 5, y: -15 })).toBe(
      'Choose a point outside the label.',
    );
  });
});

describe('textContentError', () => {
  it('accepts a trimmed single line', () => {
    expect(textContentError('  velcro  ')).toBeNull();
  });

  it('rejects empty, too long and multi-line content', () => {
    expect(textContentError('   ')).toBe('Enter some text.');
    expect(textContentError('x'.repeat(121))).toBe('Use at most 120 characters.');
    expect(textContentError('a\nb')).toBe('Labels are one line.');
  });
});
