/** Default, piece and corner allowance commands. */
import { effectiveDefaultAllowance, effectivePieceAllowance } from '../defaults.js';
import { cornerRounds } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { sameParam } from '../expression.js';
import { allowanceForEdge, cornerAllowanceForRound, pieceById } from '../piece.js';
import { ALLOWANCE_KINDS } from '../types.js';
import type {
  Allowance,
  AllowanceKind,
  AllowancePreset,
  CornerAllowance,
  EntityId,
  PatternDocument,
  Piece,
} from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { noOp, replacePiece, requirePiece } from './shared.js';
import type { Command, CommandApplication, CommandOf, CommandType, ParamInput } from './types.js';

function effectiveKind(allowance: Allowance): AllowanceKind {
  return allowance.kind ?? 'seam';
}

/** The preset `create_piece`/`set_piece_loop` copies onto new loop edges, or `null`. */
export function resolveCreateAllowance(
  document: PatternDocument,
  allowance: 'default' | 'none' | AllowancePreset | undefined,
  type: CommandType,
  piece: Piece,
): AllowancePreset | null {
  if (allowance === 'none') return null;
  if (allowance === undefined || allowance === 'default') {
    return effectivePieceAllowance(document, piece);
  }

  return requireAllowancePreset(document, type, allowance);
}

/** Validate and copy one allowance preset, recording a formula's current value. */
export function requireAllowancePreset(
  document: PatternDocument,
  commandType: CommandType,
  preset: { width: ParamInput; kind?: AllowanceKind },
): AllowancePreset {
  if (typeof preset !== 'object' || preset === null) {
    throw new CommandValidationError(
      commandType,
      'allowance must be "default", "none" or a preset',
    );
  }
  const width = requireLengthParam(document, commandType, preset.width, 'allowance width');
  if (preset.kind !== undefined && !ALLOWANCE_KINDS.includes(preset.kind)) {
    throw new CommandValidationError(commandType, `unknown allowance kind: ${String(preset.kind)}`);
  }

  return {
    width,
    ...(preset.kind === undefined ? {} : { kind: preset.kind }),
  };
}

/** A command that restores an allowance to its previous width and kind. */
function restoreAllowance(id: EntityId, piece: EntityId, allowance: Allowance): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_allowance',
    params: {
      piece,
      edge: allowance.edge,
      width: allowance.width,
      ...(allowance.kind === undefined ? {} : { kind: allowance.kind }),
    },
  };
}

export function applySetDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_default_allowance'>,
): CommandApplication {
  const { width, kind, remove } = command.params;
  const current = effectiveDefaultAllowance(document);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_default_allowance', 'remove takes no width or kind');
    }
    if (current === null) {
      return noOp(document);
    }

    return {
      document: { ...document, defaults: { allowance: null } },
      inverse: restoreDefaultAllowance(command.id, current),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_default_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_default_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_default_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const nextKind = kind ?? 'seam';
  if (
    current !== null &&
    sameParam(current.width, nextWidth) &&
    (current.kind ?? 'seam') === nextKind
  ) {
    return noOp(document);
  }

  return {
    document: { ...document, defaults: { allowance: { width: nextWidth, kind: nextKind } } },
    inverse:
      current === null
        ? {
            id: `${command.id}:remove`,
            type: 'set_default_allowance',
            params: { remove: true },
          }
        : restoreDefaultAllowance(command.id, current),
  };
}

/** A command that restores the document's previous default allowance preset. */
function restoreDefaultAllowance(id: EntityId, preset: AllowancePreset): Command {
  return {
    id: `${id}:restore`,
    type: 'set_default_allowance',
    params: {
      width: preset.width,
      ...(preset.kind === undefined ? {} : { kind: preset.kind }),
    },
  };
}

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
