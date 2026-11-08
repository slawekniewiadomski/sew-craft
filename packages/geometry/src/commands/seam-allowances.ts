import { cornerRoundsForEntity, isCornerRoundDerived } from '../corner-round.js';
import { documentSeams, getEntity, getSeam, seamForEdge } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { isExpressionParam } from '../expression.js';
import { pieceForEdge } from '../piece.js';
import { isCut } from '../roles.js';
import { SEAM_SIDES, seamSide } from '../types.js';
import type { PatternDocument, Seam, SeamSide } from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { noOp } from './shared.js';
import type { CommandApplication, CommandOf, ParamInput } from './types.js';

/** Seam allowance applied to an edge when the command omits an explicit width. */
export const DEFAULT_SEAM_ALLOWANCE = 10;

function requireSeamSide(
  commandType: 'add_seam_allowance' | 'set_seam_allowance',
  side: unknown,
): SeamSide {
  if (!SEAM_SIDES.includes(side as SeamSide)) {
    throw new CommandValidationError(commandType, "side must be 'left' or 'right'");
  }
  return side as SeamSide;
}

/**
 * Legacy seams store a plain number, so a formula is resolved when the seam is
 * written. Piece allowances keep the formula; this deprecated surface does not.
 */
function requireSeamWidth(
  document: PatternDocument,
  commandType: 'add_seam_allowance' | 'set_seam_allowance',
  width: ParamInput | undefined,
): number {
  const param = width ?? DEFAULT_SEAM_ALLOWANCE;
  const resolved = requireLengthParam(document, commandType, param, 'width');
  return isExpressionParam(resolved) ? resolved.lastKnown : resolved;
}

export function applyAddSeamAllowance(
  document: PatternDocument,
  command: CommandOf<'add_seam_allowance'>,
): CommandApplication {
  const { edge } = command.params;
  const width = requireSeamWidth(document, 'add_seam_allowance', command.params.width);
  const side =
    command.params.side === undefined
      ? 'left'
      : requireSeamSide('add_seam_allowance', command.params.side);

  const edgeEntity = getEntity(document, edge);
  if (
    edgeEntity === undefined ||
    edgeEntity.kind === 'point' ||
    edgeEntity.kind === 'text' ||
    !isCut(edgeEntity)
  ) {
    throw new CommandValidationError(
      'add_seam_allowance',
      `edge ${edge} is not a cut line, curve or arc`,
    );
  }
  if (edgeEntity.kind === 'circle') {
    throw new CommandValidationError(
      'add_seam_allowance',
      'seam allowances need a line, curve or arc edge',
    );
  }
  if (pieceForEdge(document, edge) !== undefined) {
    throw new CommandValidationError(
      'add_seam_allowance',
      'This edge belongs to a piece; set the allowance on the piece.',
    );
  }

  if (isCornerRoundDerived(document, edge) || cornerRoundsForEntity(document, edge).length > 0) {
    throw new CommandValidationError(
      'add_seam_allowance',
      'Remove the corner round first; a seam allowance cannot wrap the arc in v1.',
    );
  }

  if (getSeam(document, command.id) !== undefined) {
    return noOp(document);
  }
  if (seamForEdge(document, edge) !== undefined) {
    throw new CommandValidationError(
      'add_seam_allowance',
      `edge ${edge} already has a seam allowance`,
    );
  }

  const seam: Seam = { id: command.id, edge, width, side };

  return {
    document: { ...document, seams: [...documentSeams(document), seam] },
    inverse: { id: command.id, type: 'remove_seam_allowance', params: { id: command.id } },
  };
}

export function applyRemoveSeamAllowance(
  document: PatternDocument,
  command: CommandOf<'remove_seam_allowance'>,
): CommandApplication {
  const { id } = command.params;
  const seam = getSeam(document, id);
  if (seam === undefined) {
    return noOp(document);
  }

  const seams = documentSeams(document).filter((candidate) => candidate.id !== id);

  return {
    document: { ...document, seams },
    inverse: {
      id: seam.id,
      type: 'add_seam_allowance',
      params: {
        edge: seam.edge,
        width: seam.width,
        ...(seam.side === undefined ? {} : { side: seam.side }),
      },
    },
  };
}

export function applySetSeamAllowance(
  document: PatternDocument,
  command: CommandOf<'set_seam_allowance'>,
): CommandApplication {
  const { id, width, side: requestedSide } = command.params;
  if (width === undefined && requestedSide === undefined) {
    throw new CommandValidationError('set_seam_allowance', 'width or side is required');
  }
  const nextWidth =
    width === undefined ? undefined : requireSeamWidth(document, 'set_seam_allowance', width);
  const side =
    requestedSide === undefined ? undefined : requireSeamSide('set_seam_allowance', requestedSide);

  const seam = getSeam(document, id);
  if (seam === undefined) {
    throw new CommandValidationError('set_seam_allowance', `seam ${id} does not exist`);
  }

  const storedWidth = nextWidth ?? seam.width;
  const nextSide = side ?? seamSide(seam);
  if (seam.width === storedWidth && seamSide(seam) === nextSide) {
    return noOp(document);
  }

  const seams = documentSeams(document).map((candidate) =>
    candidate.id === id
      ? { ...candidate, width: storedWidth, ...(side === undefined ? {} : { side }) }
      : candidate,
  );

  const inverseSide = seam.side ?? (side === undefined ? undefined : seamSide(seam));

  return {
    document: { ...document, seams },
    inverse: {
      id: command.id,
      type: 'set_seam_allowance',
      params: {
        id,
        width: seam.width,
        ...(inverseSide === undefined ? {} : { side: inverseSide }),
      },
    },
  };
}
