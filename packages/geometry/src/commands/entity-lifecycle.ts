/** Construction roles, entity deletion and the dependent cascade. */
import { cornerRoundsForEntity, isCornerRoundDerived } from '../corner-round.js';
import { resolveSetValue } from '../dimension.js';
import { constraintEntityIds, documentSeams, getEntity } from '../document.js';
import { CommandValidationError } from '../errors.js';
import type { VariableScope } from '../expression.js';
import { pieceForEdge } from '../piece.js';
import { isConstruction } from '../roles.js';
import type { Constraint, Entity, PatternDocument } from '../types.js';
import { applyRemoveCornerRound } from './corner-rounds.js';
import { noOp, withoutKeys } from './shared.js';
import { captureMeasuredValues } from './variables.js';
import type { CommandApplication, CommandOf } from './types.js';

export function applySetConstruction(
  document: PatternDocument,
  command: CommandOf<'set_construction'>,
): CommandApplication {
  const { id, construction } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('set_construction', `unknown entity: ${id}`);
  }
  if (entity.kind === 'text') {
    throw new CommandValidationError('set_construction', 'text is always annotation geometry');
  }
  if (pieceForEdge(document, id) !== undefined) {
    throw new CommandValidationError(
      'set_construction',
      'This edge belongs to a piece; remove the piece first.',
    );
  }
  if (
    isCornerRoundDerived(document, id) ||
    cornerRoundsForEntity(document, id).some(
      (round) => round.corner === id || round.ends.some((end) => end.line === id),
    )
  ) {
    throw new CommandValidationError('set_construction', 'Remove the corner round first.');
  }
  if (isConstruction(entity) === construction) {
    return noOp(document);
  }

  const entities = document.entities.map((candidate): Entity => {
    if (candidate.id !== id || candidate.kind === 'text') return candidate;
    const rest = withoutKeys(candidate, ['construction', 'role']);
    return (
      construction
        ? { ...rest, role: 'construction', construction: true }
        : { ...rest, construction: false }
    ) as Entity;
  });

  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'set_construction',
      params: { id, construction: isConstruction(entity) },
    },
  };
}

export function applyDeleteEntity(
  document: PatternDocument,
  command: CommandOf<'delete_entity'>,
): CommandApplication {
  const { id } = command.params;
  if (getEntity(document, id) === undefined) {
    return noOp(document);
  }

  // Refresh a measured variable's fallback before any source can disappear, so
  // the row keeps the number it was showing instead of an older one.
  document = captureMeasuredValues(document);

  const rounds = cornerRoundsForEntity(document, id);
  if (rounds.some((round) => round.corner === id || round.ends.some((end) => end.anchor === id))) {
    throw new CommandValidationError('delete_entity', 'Remove the corner round first.');
  }

  // A rounded line, arc or derived point takes its feature with it; the requested
  // id itself is deleted below (and may already be gone with the derived geometry).
  let working = document;
  for (const round of rounds) {
    working = applyRemoveCornerRound(working, {
      id: `${command.id}:${round.id}`,
      type: 'remove_corner_round',
      params: { id: round.id },
    }).document;
  }

  const entities = working.entities.flatMap((entity): Entity[] => {
    if (entity.id === id) return [];
    if (entity.kind === 'text') {
      // A label whose anchor disappears goes with it; a deleted leader only
      // detaches, so the label stays where it was placed.
      if (entity.anchor === id) return [];
      if (entity.leader === id) return [withoutKeys(entity, ['leader'])];
      return [entity];
    }
    if (entity.kind === 'mark') {
      // A mark is only meaningful while its points and its edge exist.
      const references =
        entity.type === 'notch' ? [entity.point, entity.edge] : [entity.start, entity.end];
      return references.includes(id) ? [] : [entity];
    }
    return [entity];
  });
  // An edge leaves its piece loop, but the container survives as a broken piece;
  // deleting a whole piece is an explicit command of its own.
  const pieces = working.pieces.map((piece) =>
    piece.edges.includes(id)
      ? {
          ...piece,
          edges: piece.edges.filter((edge) => edge !== id),
          allowances: piece.allowances.filter((allowance) => allowance.edge !== id),
        }
      : piece,
  );
  const constraints = captureBrokenDependents(
    working.constraints,
    working.constraints.filter((constraint) => !constraintEntityIds(constraint).includes(id)),
    working,
  );

  // Restoring the entity plus its cascade-removed constraints and seams is not a
  // single command, so undo relies on the journal's snapshot.
  const next: PatternDocument = { ...working, entities, constraints, pieces };
  if (working.seams !== undefined) {
    next.seams = documentSeams(working).filter((seam) => seam.edge !== id);
  }
  return { document: next, inverse: null };
}

/**
 * Keep a dependent honest when its source disappears: record the value it last
 * drove with, keep the dangling `reference`, and leave the constraint in place.
 * Broken dependents are never deleted as a side effect.
 */
export function captureBrokenDependents(
  previous: Constraint[],
  next: Constraint[],
  scope: VariableScope,
): Constraint[] {
  return next.map((constraint) => {
    if (constraint.type !== 'distance' || constraint.reference === undefined) return constraint;
    const before = resolveSetValue(previous, constraint, scope);
    if (before === null || resolveSetValue(next, constraint, scope) !== null) return constraint;
    return { ...constraint, lastKnownValue: before };
  });
}
