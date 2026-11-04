import { createEmptyDocument, type CornerRound, type Piece } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { allowanceEditCommands, pruneAllowanceTargets } from '@/lib/allowance-edit';

const round = (id: string, first: string, second: string): CornerRound => ({
  id,
  corner: 'c',
  ends: [
    { line: first, anchor: 'a', tangent: `${id}:a` },
    { line: second, anchor: 'b', tangent: `${id}:b` },
  ],
  radius: 10,
  arc: `${id}:arc`,
  controls: [`${id}:c1`, `${id}:c2`],
  cornerConstruction: false,
});

const piece: Piece = {
  id: 'p1',
  edges: ['ab', 'bc', 'cd', 'da'],
  allowances: [
    { edge: 'ab', width: 10 },
    { edge: 'bc', width: 5, kind: 'double' },
    { edge: 'cd', width: 10 },
    { edge: 'da', width: 10 },
  ],
  cornerAllowances: [{ round: 'r1', cutWidth: 20 }],
};

const document = {
  ...createEmptyDocument(),
  pieces: [piece],
  cornerRounds: [round('r1', 'cd', 'da'), round('r2', 'cd', 'da'), round('r3', 'ab', 'bc')],
};

const nextId = (prefix = 'cmd') => `${prefix}-1`;

describe('allowanceEditCommands', () => {
  it('sets a finished width with a kind across edges and a cut width on corners', () => {
    const commands = allowanceEditCommands(
      document,
      piece,
      [
        { kind: 'edge', edge: 'ab' },
        { kind: 'round', round: 'r1' },
        { kind: 'round', round: 'missing' },
        { kind: 'edge', edge: 'missing' },
      ],
      { mode: 'set', cutWidth: 15, kind: 'single' },
      nextId,
    );

    expect(commands).toEqual([
      {
        id: 'allowance-1',
        type: 'set_piece_allowance',
        params: { piece: 'p1', edge: 'ab', width: 15, kind: 'single' },
      },
      {
        id: 'corner-allowance-1',
        type: 'set_piece_corner_allowance',
        params: { piece: 'p1', round: 'r1', cutWidth: 15 },
      },
    ]);
  });

  it('treats a mixed number as a cut width, halving a double fold', () => {
    const commands = allowanceEditCommands(
      document,
      piece,
      [
        { kind: 'edge', edge: 'ab' },
        { kind: 'edge', edge: 'bc' },
        { kind: 'round', round: 'r2' },
      ],
      { mode: 'set', cutWidth: 20 },
      nextId,
    );

    expect(commands).toEqual([
      {
        id: 'allowance-1',
        type: 'set_piece_allowance',
        params: { piece: 'p1', edge: 'ab', width: 20, kind: 'seam' },
      },
      {
        id: 'allowance-1',
        type: 'set_piece_allowance',
        params: { piece: 'p1', edge: 'bc', width: 10, kind: 'double' },
      },
      {
        id: 'corner-allowance-1',
        type: 'set_piece_corner_allowance',
        params: { piece: 'p1', round: 'r2', cutWidth: 20 },
      },
    ]);
  });

  it('doubles each target from its own base', () => {
    const commands = allowanceEditCommands(
      document,
      piece,
      [
        { kind: 'edge', edge: 'ab' },
        { kind: 'edge', edge: 'bc' },
        { kind: 'round', round: 'r1' },
        { kind: 'round', round: 'r2' },
        { kind: 'round', round: 'r3' },
      ],
      { mode: 'double' },
      nextId,
    );

    expect(commands).toEqual([
      {
        id: 'allowance-1',
        type: 'set_piece_allowance',
        params: { piece: 'p1', edge: 'ab', width: 20, kind: 'seam' },
      },
      {
        id: 'allowance-1',
        type: 'set_piece_allowance',
        params: { piece: 'p1', edge: 'bc', width: 10, kind: 'double' },
      },
      {
        id: 'corner-allowance-1',
        type: 'set_piece_corner_allowance',
        params: { piece: 'p1', round: 'r1', cutWidth: 40 },
      },
      {
        id: 'corner-allowance-1',
        type: 'set_piece_corner_allowance',
        params: { piece: 'p1', round: 'r2', cutWidth: 20 },
      },
    ]);
  });

  it('inherits only the corners that have their own width', () => {
    const commands = allowanceEditCommands(
      document,
      piece,
      [
        { kind: 'round', round: 'r1' },
        { kind: 'round', round: 'r2' },
        { kind: 'edge', edge: 'ab' },
      ],
      { mode: 'inherit' },
      nextId,
    );

    expect(commands).toEqual([
      {
        id: 'corner-allowance-1',
        type: 'set_piece_corner_allowance',
        params: { piece: 'p1', round: 'r1', remove: true },
      },
    ]);
  });

  it('applies nothing when the edit has no target left', () => {
    expect(allowanceEditCommands(document, piece, [], { mode: 'double' }, nextId)).toEqual([]);
  });
});

describe('pruneAllowanceTargets', () => {
  it('keeps targets the piece still offers and drops the rest', () => {
    expect(
      pruneAllowanceTargets(document, 'p1', [
        { kind: 'edge', edge: 'ab' },
        { kind: 'edge', edge: 'missing' },
        { kind: 'round', round: 'r1' },
        { kind: 'round', round: 'missing' },
      ]),
    ).toEqual([
      { kind: 'edge', edge: 'ab' },
      { kind: 'round', round: 'r1' },
    ]);
  });

  it('drops everything when the piece is gone or the loop no longer holds the round', () => {
    expect(pruneAllowanceTargets(document, null, [{ kind: 'edge', edge: 'ab' }])).toEqual([]);

    const relooped = {
      ...document,
      pieces: [{ ...piece, edges: ['bc', 'cd'] }],
    };
    expect(
      pruneAllowanceTargets(relooped, 'p1', [
        { kind: 'round', round: 'r1' },
        { kind: 'edge', edge: 'ab' },
      ]),
    ).toEqual([]);
  });
});
