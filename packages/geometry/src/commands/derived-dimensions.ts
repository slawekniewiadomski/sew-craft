import { getConstraint } from '../document.js';
import { CommandValidationError } from '../errors.js';
import {
  constraintOffset,
  constraintOrientation,
  cutAnchorIssue,
  usesCutEdgeAnchor,
} from '../dimension.js';
import { pieceById } from '../piece.js';
import { DIMENSION_ORIENTATIONS } from '../types.js';
import type { DerivedDistanceConstraint, PatternDocument } from '../types.js';
import { CUT_ANCHOR_MESSAGES, requireCutAnchor } from './piece-anchors.js';
import { noOp } from './shared.js';
import type { AddDerivedDimensionParams, CommandApplication, CommandOf } from './types.js';

/** Add a read-only dimension measuring the cut loop between two anchors of one piece. */
export function applyAddDerivedDimension(
  document: PatternDocument,
  command: CommandOf<'add_derived_dimension'>,
): CommandApplication {
  const { piece: pieceId, a, b, orientation, offset } = command.params;
  if (getConstraint(document, command.id) !== undefined) {
    return noOp(document);
  }

  const piece = pieceById(document, pieceId);
  if (piece === undefined) {
    throw new CommandValidationError('add_derived_dimension', `unknown piece: ${pieceId}`);
  }
  requireCutAnchor('add_derived_dimension', piece, a);
  requireCutAnchor('add_derived_dimension', piece, b);

  const issue = cutAnchorIssue(document, piece, a, b);
  if (issue.reason !== null) {
    throw new CommandValidationError('add_derived_dimension', CUT_ANCHOR_MESSAGES[issue.reason]);
  }
  if (orientation !== undefined && !DIMENSION_ORIENTATIONS.includes(orientation)) {
    throw new CommandValidationError(
      'add_derived_dimension',
      `unknown dimension orientation: ${String(orientation)}`,
    );
  }
  if (usesCutEdgeAnchor({ a, b }) && orientation !== undefined && orientation !== 'aligned') {
    throw new CommandValidationError(
      'add_derived_dimension',
      'a cut dimension with an edge anchor is always aligned',
    );
  }
  if (offset !== undefined && !Number.isFinite(offset)) {
    throw new CommandValidationError('add_derived_dimension', 'offset must be a finite number');
  }

  const constraint: DerivedDistanceConstraint = {
    id: command.id,
    type: 'derived_distance',
    piece: pieceId,
    a,
    b,
    ...(orientation === undefined ? {} : { orientation }),
    ...(offset === undefined ? {} : { offset }),
  };

  return {
    document: {
      ...document,
      constraints: [...document.constraints, constraint],
    },
    inverse: { id: command.id, type: 'remove_constraint', params: { id: command.id } },
  };
}

/**
 * A cut dimension is read-only: it accepts a new placement only. A `value` or
 * `reference` is rejected because the number follows the stitch geometry and the
 * allowances, and nothing it could drive would be unambiguous.
 */
export function applyUpdateDerivedDimension(
  document: PatternDocument,
  command: CommandOf<'update_constraint'>,
  constraint: DerivedDistanceConstraint,
): CommandApplication {
  const { id, value, reference, orientation, offset } = command.params;
  if (value !== undefined || reference !== undefined) {
    throw new CommandValidationError(
      'update_constraint',
      'a cut dimension is read-only; give orientation or offset only',
    );
  }
  if (orientation === undefined && offset === undefined) {
    throw new CommandValidationError('update_constraint', 'provide orientation or offset');
  }
  if (orientation !== undefined && !DIMENSION_ORIENTATIONS.includes(orientation)) {
    throw new CommandValidationError(
      'update_constraint',
      `unknown dimension orientation: ${String(orientation)}`,
    );
  }
  if (usesCutEdgeAnchor(constraint) && orientation !== undefined && orientation !== 'aligned') {
    throw new CommandValidationError(
      'update_constraint',
      'a cut dimension with an edge anchor is always aligned',
    );
  }
  if (offset !== undefined && !Number.isFinite(offset)) {
    throw new CommandValidationError('update_constraint', 'offset must be a finite number');
  }

  const previousOrientation = constraintOrientation(constraint);
  const previousOffset = constraintOffset(constraint);
  const nextOrientation = orientation ?? previousOrientation;
  const nextOffset = offset ?? previousOffset;
  if (nextOrientation === previousOrientation && nextOffset === previousOffset) {
    return noOp(document);
  }

  return {
    document: {
      ...document,
      constraints: document.constraints.map((candidate) =>
        candidate.id === id
          ? { ...constraint, orientation: nextOrientation, offset: nextOffset }
          : candidate,
      ),
    },
    inverse: {
      id: command.id,
      type: 'update_constraint',
      params: { id, orientation: previousOrientation, offset: previousOffset },
    },
  };
}

/** The params that recreate a derived cut dimension, used by `remove_constraint`'s inverse. */
export function derivedConstraintToParams(
  constraint: DerivedDistanceConstraint,
): AddDerivedDimensionParams {
  return {
    piece: constraint.piece,
    a: constraint.a,
    b: constraint.b,
    ...(constraint.orientation === undefined ? {} : { orientation: constraint.orientation }),
    ...(constraint.offset === undefined ? {} : { offset: constraint.offset }),
  };
}
