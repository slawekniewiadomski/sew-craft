import type { Command } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { localizeCommand, localizeCommands } from '@/lib/sketch';

const addPoint: Command = { id: 'p', type: 'add_point', params: { x: 120, y: 80, piece: 'p1' } };
const movePoint: Command = { id: 'm', type: 'move_point', params: { id: 'a', x: 10, y: 20 } };
const addLine: Command = { id: 'l', type: 'add_line', params: { start: 'a', end: 'b' } };

describe('sketch command localisation', () => {
  it('subtracts the piece offset from a point position', () => {
    expect(localizeCommand(addPoint, { x: 100, y: 50 })).toEqual({
      id: 'p',
      type: 'add_point',
      params: { x: 20, y: 30, piece: 'p1' },
    });
  });

  it('subtracts the piece offset from a moved point', () => {
    expect(localizeCommand(movePoint, { x: 4, y: 6 })).toEqual({
      id: 'm',
      type: 'move_point',
      params: { id: 'a', x: 6, y: 14 },
    });
  });

  it('leaves a command without a position untouched', () => {
    expect(localizeCommand(addLine, { x: 100, y: 50 })).toBe(addLine);
  });

  it('returns the batch untouched at the origin', () => {
    const commands = [addPoint, addLine];

    expect(localizeCommands(commands, { x: 0, y: 0 })).toBe(commands);
    expect(localizeCommands(commands, { x: 5, y: 0 })).not.toBe(commands);
    expect(localizeCommands(commands, { x: 5, y: 0 })[0]).toMatchObject({
      params: { x: 115, y: 80 },
    });
  });
});
