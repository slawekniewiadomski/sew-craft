import { describe, expect, it } from 'vitest';

import { buildTextCommands, DEFAULT_TEXT_CONTENT, textContentError } from './text-tool';

const nextId = (prefix: string): string => `${prefix}-1`;

describe('buildTextCommands', () => {
  it('creates the anchor point and the label in one batch', () => {
    const commands = buildTextCommands({ kind: 'new', x: 10, y: 20 }, 'p1', nextId);

    expect(commands).toEqual([
      {
        id: 'point-1',
        type: 'add_point',
        params: { x: 10, y: 20, piece: 'p1' },
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
          fontSize: 6,
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
