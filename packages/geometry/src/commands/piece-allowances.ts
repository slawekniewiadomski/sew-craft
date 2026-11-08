import { cornerRounds } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { sameParam } from '../expression.js';
import { allowanceForEdge, cornerAllowanceForRound, pieceById } from '../piece.js';
import { ALLOWANCE_KINDS } from '../types.js';
import type { Allowance, CornerAllowance, EntityId, PatternDocument } from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { effectiveKind, restoreAllowance } from './default-allowances.js';
import { noOp, replacePiece, requirePiece } from './shared.js';
import type { Command, CommandApplication, CommandOf } from './types.js';

/** Set, change or remove the allowance of one loop edge. */
export function applySetPieceAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_allowance'>,
): CommandApplication {
  const { piece: pieceId, edge, width, kind, remove } = command.params;
  const piece = pieceById(document, pieceId);
  if (piece === undefined) {
    throw new CommandValidationError('set_piece_allowance', `unknown piece: ${pieceId}`);
  }
  if (!piece.edges.includes(edge)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `edge ${edge} is not in piece ${pieceId}`,
    );
  }

  const existing = allowanceForEdge(piece, edge);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_piece_allowance', 'remove takes no width or kind');
    }
    if (existing === undefined) {
      return noOp(document);
    }
    return {
      document: replacePiece(document, {
        ...piece,
        allowances: piece.allowances.filter((allowance) => allowance.edge !== edge),
      }),
      inverse: restoreAllowance(command.id, pieceId, existing),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_piece_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_piece_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const next: Allowance = { edge, width: nextWidth, ...(kind === undefined ? {} : { kind }) };
  if (
    existing !== undefined &&
    sameParam(existing.width, nextWidth) &&
    effectiveKind(existing) === effectiveKind(next)
  ) {
    return noOp(document);
  }

  const allowances =
    existing === undefined
      ? [...piece.allowances, next]
      : piece.allowances.map((allowance) => (allowance.edge === edge ? next : allowance));

  return {
    document: replacePiece(document, { ...piece, allowances }),
    inverse:
      existing === undefined
        ? {
            id: `${command.id}:restore`,
            type: 'set_piece_allowance',
            params: { piece: pieceId, edge, remove: true },
          }
        : restoreAllowance(command.id, pieceId, existing),
  };
}

/** A command that restores a corner round's own cut width. */
function restoreCornerAllowance(
  id: EntityId,
  piece: EntityId,
  allowance: CornerAllowance,
): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_corner_allowance',
    params: { piece, round: allowance.round, cutWidth: allowance.cutWidth },
  };
}

/** Set, change or remove one rounded corner's own allowance width. */
export function applySetPieceCornerAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_corner_allowance'>,
): CommandApplication {
  const { piece: pieceId, round: roundId, cutWidth, remove } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_corner_allowance');

  const round = cornerRounds(document).find((candidate) => candidate.id === roundId);
  if (round === undefined) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `unknown corner round: ${roundId}`,
    );
  }
  if (!round.ends.every((end) => piece.edges.includes(end.line))) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `corner round ${roundId} is not a corner of piece ${pieceId}`,
    );
  }

  const existing = cornerAllowanceForRound(piece, roundId);

  if (remove === true) {
    if (cutWidth !== undefined) {
      throw new CommandValidationError('set_piece_corner_allowance', 'remove takes no cutWidth');
    }
    if (existing === undefined) return noOp(document);
    return {
      document: replacePiece(document, {
        ...piece,
        // `existing` was found, so the array exists.
        cornerAllowances: piece.cornerAllowances!.filter((entry) => entry.round !== roundId),
      }),
      inverse: restoreCornerAllowance(command.id, pieceId, existing),
    };
  }

  if (cutWidth === undefined || !Number.isFinite(cutWidth) || cutWidth <= 0) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      'cutWidth must be a finite number greater than 0',
    );
  }
  if (existing !== undefined && existing.cutWidth === cutWidth) return noOp(document);

  const next: CornerAllowance = { round: roundId, cutWidth };
  const cornerAllowances =
    existing === undefined
      ? [...(piece.cornerAllowances ?? []), next]
      : // `existing` was found, so the array exists.
        piece.cornerAllowances!.map((allowance) =>
          allowance.round === roundId ? next : allowance,
        );

  return {
    document: replacePiece(document, { ...piece, cornerAllowances }),
    inverse:
      existing === undefined
        ? {
            id: `${command.id}:restore`,
            type: 'set_piece_corner_allowance',
            params: { piece: pieceId, round: roundId, remove: true },
          }
        : restoreCornerAllowance(command.id, pieceId, existing),
  };
}
