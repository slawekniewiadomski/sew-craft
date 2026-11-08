import { CommandValidationError } from '../errors.js';
import type { EntityId, PatternDocument, Piece, PieceDefaults } from '../types.js';
import { requireAllowancePreset } from './default-allowances.js';
import { noOp, replacePiece, requirePiece } from './shared.js';
import type { Command, CommandApplication, CommandOf, CommandType } from './types.js';

/** Validate a per-piece defaults object, copying its preset. */
export function requirePieceDefaults(
  document: PatternDocument,
  commandType: CommandType,
  defaults: PieceDefaults | undefined,
): PieceDefaults | undefined {
  if (defaults === undefined) return undefined;
  if (defaults.allowance === null) return { allowance: null };
  return { allowance: requireAllowancePreset(document, commandType, defaults.allowance) };
}

/** The defaults a piece override represents, turned into a restoring command. */
function restorePieceDefaults(piece: EntityId, defaults: PieceDefaults | undefined): Command {
  if (defaults === undefined) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'inherit' },
    };
  }
  if (defaults.allowance === null) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'none' },
    };
  }
  return {
    id: `${piece}:default-allowance`,
    type: 'set_piece_default_allowance',
    params: {
      piece,
      mode: 'preset',
      width: defaults.allowance.width,
      ...(defaults.allowance.kind === undefined ? {} : { kind: defaults.allowance.kind }),
    },
  };
}

/** Create an empty piece; its loop is captured later with `set_piece_loop`. */
/** Store or clear a piece's allowance override. */
export function applySetPieceDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_default_allowance'>,
): CommandApplication {
  const { piece: pieceId, mode } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_default_allowance');

  let defaults: PieceDefaults | undefined;
  if (mode === 'inherit') {
    defaults = undefined;
  } else if (mode === 'none') {
    defaults = { allowance: null };
  } else if (mode === 'preset') {
    defaults = {
      allowance: requireAllowancePreset(document, 'set_piece_default_allowance', {
        width: command.params.width ?? Number.NaN,
        ...(command.params.kind === undefined ? {} : { kind: command.params.kind }),
      }),
    };
  } else {
    throw new CommandValidationError(
      'set_piece_default_allowance',
      `unknown mode: ${String(mode)}`,
    );
  }

  const next: Piece = { ...piece };
  if (defaults === undefined) delete next.defaults;
  else next.defaults = defaults;

  if (JSON.stringify(next.defaults) === JSON.stringify(piece.defaults)) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, next),
    inverse: restorePieceDefaults(pieceId, piece.defaults),
  };
}
