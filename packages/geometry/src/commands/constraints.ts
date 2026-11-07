/** Constraint commands and the derived cut dimensions. */
import {
  constraintOffset,
  constraintOrientation,
  createsReferenceCycle,
  cutAnchorIssue,
  distanceAnchorIssue,
  isLineAnchor,
  resolveSetValue,
  usesCutEdgeAnchor,
} from '../dimension.js';
import { getConstraint, getEntity } from '../document.js';
import { CommandValidationError } from '../errors.js';
import type { ExpressionError } from '../expression.js';
import {
  evaluateLength,
  expressionSlugs,
  isExpressionParam,
  resolveVariable,
} from '../expression.js';
import { isMeasuredVariable } from '../measurement.js';
import { midpointIssue, midpointUsedAsSource } from '../midpoint.js';
import { pieceById } from '../piece.js';
import { CONSTRAINT_TYPES, DIMENSION_ORIENTATIONS } from '../types.js';
import type { DistanceAnchorReason } from '../dimension.js';
import type { MidpointIssue } from '../midpoint.js';
import type {
  Constraint,
  ConstraintType,
  DerivedDistanceConstraint,
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  MidpointConstraint,
  Param,
  PatternDocument,
  Variable,
} from '../types.js';
import { captureBrokenDependents } from './entities.js';
import { CUT_ANCHOR_MESSAGES, requireCutAnchor } from './pieces.js';
import { noOp, requireDraftingPoint, requirePiece, requirePoint } from './shared.js';
import type {
  AddConstraintParams,
  AddDerivedDimensionParams,
  CommandApplication,
  CommandOf,
  CommandType,
  ParamInput,
  UpdateConstraintParams,
} from './types.js';

/**
 * Validate a millimetre parameter and, for a formula, record what it resolves to
 * right now. Commands only ever store a formula that already resolves, so a read
 * never has to invent a number.
 */
export function requireLengthParam(
  document: PatternDocument,
  commandType: CommandType,
  param: ParamInput,
  label: string,
): Param {
  if (typeof param === 'number') {
    if (!Number.isFinite(param) || param <= 0) {
      throw new CommandValidationError(
        commandType,
        `${label} must be a finite number greater than 0`,
      );
    }
    return param;
  }

  let value: number;
  try {
    value = evaluateLength(param.expr, { lookup: (slug) => resolveVariable(document, slug) });
  } catch (error) {
    // `evaluateLength` only throws `ExpressionError`, so its message is the detail.
    throw new CommandValidationError(
      commandType,
      `${label} is not a valid formula: ${(error as ExpressionError).message}`,
    );
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new CommandValidationError(
      commandType,
      `${label} must be a finite number greater than 0`,
    );
  }
  return { expr: param.expr, lastKnown: value };
}

/** The point ids a dimension anchors on, including a line anchor's endpoints. */
function dimensionAnchorIds(document: PatternDocument, entities: readonly EntityId[]): EntityId[] {
  const ids = new Set<EntityId>();
  for (const id of entities) {
    ids.add(id);
    const entity = getEntity(document, id);
    if (entity === undefined) continue;
    if (entity.kind === 'line') {
      ids.add(entity.start);
      ids.add(entity.end);
    }
  }
  return [...ids];
}

/** The endpoint point ids of one measured source, without resolving its geometry. */
function measuredSourceEndpoints(document: PatternDocument, id: EntityId): EntityId[] {
  const entity = getEntity(document, id);
  if (entity === undefined) return [];
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'curve':
      return [entity.p0, entity.p3];
    case 'arc':
      return [entity.start, entity.end];
    default:
      return [];
  }
}

/** Every measured variable a formula names, directly or through other variables. */
function measuredVariablesInFormula(
  document: PatternDocument,
  expr: string,
): Extract<Variable, { kind: 'measurement' }>[] {
  const bySlug = new Map((document.variables ?? []).map((variable) => [variable.slug, variable]));
  const found: Extract<Variable, { kind: 'measurement' }>[] = [];
  const seen = new Set<string>();
  const queue = expressionSlugs(expr);
  while (queue.length > 0) {
    const slug = queue.pop()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const variable = bySlug.get(slug);
    /* v8 ignore next -- every slug in the closure resolved before the command was accepted */
    if (variable === undefined) continue;
    if (isMeasuredVariable(variable)) {
      found.push(variable);
    } else if (isExpressionParam(variable.value)) {
      queue.push(...expressionSlugs(variable.value.expr));
    }
  }
  return found;
}

/**
 * Reject the obvious measurement/geometry loop: a dimension may not be driven by a
 * variable that measures its own anchor points or edges. The solver's rollback
 * remains the safety net for a loop the write-time check cannot see.
 */
function requireNoMeasurementFeedback(
  document: PatternDocument,
  commandType: CommandType,
  param: ParamInput,
  anchors: readonly EntityId[],
): void {
  if (typeof param === 'number') return;
  const anchorSet = new Set(anchors);
  for (const variable of measuredVariablesInFormula(document, param.expr)) {
    const touches = variable.sources.some(
      (id) =>
        anchorSet.has(id) ||
        measuredSourceEndpoints(document, id).some((point) => anchorSet.has(point)),
    );
    if (touches) {
      throw new CommandValidationError(
        commandType,
        `$${variable.slug} measures the geometry this dimension drives`,
      );
    }
  }
}

const CONSTRAINT_ARITY: Record<ConstraintType, readonly number[]> = {
  coincident: [2],
  horizontal: [2],
  vertical: [2],
  point_on_line: [3],
  distance: [2],
  angle: [3],
  equal: [4],
  midpoint: [2, 3],
};

/** Order-insensitive comparison of a dimension's point pair with another pair. */
function samePointPair(constraint: DistanceConstraint, a: EntityId, b: EntityId): boolean {
  return (constraint.a === a && constraint.b === b) || (constraint.a === b && constraint.b === a);
}

/**
 * Validate a link and return the source's resolved value. Rejects a missing or
 * non-distance source, a self link, the same point pair, a driven or broken
 * source, and a link that would close a cycle. Never mutates the document.
 */
function validateReference(
  document: PatternDocument,
  commandType: CommandType,
  dependent: { id: EntityId; a: EntityId; b: EntityId },
  reference: EntityId,
): number {
  const source = getConstraint(document, reference);
  if (source === undefined || source.type !== 'distance') {
    throw new CommandValidationError(
      commandType,
      `reference ${reference} is not an existing distance dimension`,
    );
  }
  if (source.id === dependent.id) {
    throw new CommandValidationError(commandType, 'a dimension cannot reference itself');
  }
  if (samePointPair(source, dependent.a, dependent.b)) {
    throw new CommandValidationError(
      commandType,
      `reference ${reference} measures the same point pair`,
    );
  }
  const value = resolveSetValue(document.constraints, source);
  if (value === null) {
    throw new CommandValidationError(
      commandType,
      `reference ${reference} is driven or broken and has no value`,
    );
  }
  if (createsReferenceCycle(document.constraints, dependent.id, reference)) {
    throw new CommandValidationError(commandType, `reference ${reference} would create a cycle`);
  }
  return value;
}

/** The command message for one shared pick-time anchor reason. */
function distanceIssueMessage(reason: DistanceAnchorReason): string {
  switch (reason) {
    case 'missing':
      return 'distance: an anchor does not resolve';
    case 'not-a-line':
      return 'distance: curves, arcs and circles are not line anchors';
    case 'not-parallel':
      return 'distance: lines must be parallel';
    case 'point-on-line':
      return 'distance: the point lies on the line';
    case 'coincident':
      return 'distance: the lines are coincident';
    case 'zero-length':
      return 'distance: a line anchor has zero length';
  }
}

/** The midpoint record for an `add_constraint` entity list, in either form. */
function midpointConstraint(
  id: EntityId,
  entities: EntityId[],
  piece?: EntityId,
): MidpointConstraint {
  const [point, first, second] = entities;
  const owner = piece === undefined ? {} : { piece };
  return entities.length === 2
    ? { id, type: 'midpoint', point: point!, line: first!, ...owner }
    : { id, type: 'midpoint', point: point!, a: first!, b: second!, ...owner };
}

/** The command message for one broken midpoint relation. */
function midpointIssueMessage(issue: MidpointIssue): string {
  switch (issue) {
    case 'missing-target':
      return 'midpoint: the point does not resolve';
    case 'target-not-point':
      return 'midpoint: the target must be a point';
    case 'target-derived':
      return 'This point is already derived; pick another point.';
    case 'missing-source':
      return 'midpoint: a source does not resolve';
    case 'source-not-point':
      return 'midpoint: sources must be points';
    case 'source-not-line':
      return 'midpoint: the source must be a straight line';
    case 'target-source':
      return 'midpoint: the point cannot be one of its sources';
    case 'degenerate':
      return 'midpoint: the sources must be distinct';
    case 'chain':
      return 'midpoint: a source is already a midpoint';
  }
}

export function applyAddConstraint(
  document: PatternDocument,
  command: CommandOf<'add_constraint'>,
): CommandApplication {
  const { type, entities, value, reference, orientation, offset, piece } = command.params;
  if (!CONSTRAINT_TYPES.includes(type)) {
    throw new CommandValidationError('add_constraint', `unknown constraint type: ${String(type)}`);
  }
  if (piece !== undefined) {
    requirePiece(document, piece, 'add_constraint');
  }
  // A replayed command whose constraint already exists is a no-op, checked before
  // the relation itself: re-validating it would report a stale state the document
  // has already moved past instead of replaying cleanly.
  if (getConstraint(document, command.id) !== undefined) {
    return noOp(document);
  }

  const arity = CONSTRAINT_ARITY[type];
  if (!arity.includes(entities.length)) {
    throw new CommandValidationError(
      'add_constraint',
      `${type} needs ${arity.join(' or ')} entities, got ${entities.length}`,
    );
  }
  // A driven distance measurement anchors on whatever points it measures, so a
  // fixed corner-round feature point is a legitimate anchor. A constraint that
  // drives a value still needs draggable points. A distance may also anchor to a
  // whole straight line, validated by the shared pick-time issue check below.
  const drivenMeasurement = type === 'distance' && value === undefined;
  for (const id of entities) {
    const entity = getEntity(document, id);
    if (piece !== undefined && entity?.piece !== undefined && entity.piece !== piece) {
      throw new CommandValidationError('add_constraint', `entity ${id} belongs to another piece`);
    }
    // A midpoint's line/point roles are validated together below.
    if (type === 'midpoint') continue;
    // A distance line anchor, missing id or unsupported kind is classified by
    // the shared issue helper below; only point anchors need the drafting rule.
    if (type === 'distance' && (entity === undefined || entity.kind !== 'point')) continue;
    if (drivenMeasurement) requirePoint(document, id, 'add_constraint');
    else requireDraftingPoint(document, id, 'add_constraint');
  }

  let storedValue: Param | undefined =
    value === undefined ? undefined : typeof value === 'number' ? value : undefined;
  if (type === 'distance' && value !== undefined) {
    storedValue = requireLengthParam(document, 'add_constraint', value, 'distance value');
    requireNoMeasurementFeedback(
      document,
      'add_constraint',
      value,
      dimensionAnchorIds(document, entities),
    );
  }
  if (type === 'angle' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new CommandValidationError('add_constraint', 'angle requires a finite value');
  }
  if (type === 'midpoint' && value !== undefined) {
    throw new CommandValidationError('add_constraint', 'midpoint takes no value');
  }
  if (reference !== undefined) {
    if (type !== 'distance') {
      throw new CommandValidationError(
        'add_constraint',
        'reference applies only to distance constraints',
      );
    }
    if (value !== undefined) {
      throw new CommandValidationError(
        'add_constraint',
        'a distance dimension takes a value or a reference, not both',
      );
    }
    const source = getConstraint(document, reference);
    if (piece !== undefined && source?.piece !== undefined && source.piece !== piece) {
      throw new CommandValidationError(
        'add_constraint',
        `reference ${reference} belongs to another piece`,
      );
    }
  }

  if (type !== 'distance' && (orientation !== undefined || offset !== undefined)) {
    throw new CommandValidationError(
      'add_constraint',
      'orientation and offset apply only to distance constraints',
    );
  }
  if (orientation !== undefined && !DIMENSION_ORIENTATIONS.includes(orientation)) {
    throw new CommandValidationError(
      'add_constraint',
      `unknown dimension orientation: ${String(orientation)}`,
    );
  }
  if (offset !== undefined && !Number.isFinite(offset)) {
    throw new CommandValidationError('add_constraint', 'offset must be a finite number');
  }

  if (type === 'distance') {
    const [a, b] = entities as [EntityId, EntityId];
    const issue = distanceAnchorIssue(document, a, b);
    if (issue.reason !== null) {
      throw new CommandValidationError('add_constraint', distanceIssueMessage(issue.reason));
    }
    if (
      orientation !== undefined &&
      orientation !== 'aligned' &&
      (isLineAnchor(document, a) || isLineAnchor(document, b))
    ) {
      throw new CommandValidationError(
        'add_constraint',
        'distance: a line anchor is always aligned',
      );
    }
  }

  if (type === 'midpoint') {
    const candidate = midpointConstraint(command.id, entities, piece);
    const issue = midpointIssue(document, candidate);
    if (issue !== null) {
      throw new CommandValidationError('add_constraint', midpointIssueMessage(issue));
    }
    if (midpointUsedAsSource(document, candidate.point, candidate.id)) {
      throw new CommandValidationError(
        'add_constraint',
        'midpoint: the point is already a source of another midpoint',
      );
    }
  }

  const [a, b] = entities;
  const resolved =
    reference === undefined
      ? undefined
      : validateReference(document, 'add_constraint', { id: command.id, a: a!, b: b! }, reference);
  const constraint = buildConstraint(
    command.id,
    type,
    entities,
    storedValue,
    orientation,
    offset,
    reference,
    resolved,
    piece,
  );

  return {
    document: { ...document, constraints: [...document.constraints, constraint] },
    inverse: { id: command.id, type: 'remove_constraint', params: { id: command.id } },
  };
}

/**
 * Update a dimensional constraint. Distance constraints may also change their
 * measurement axis and placement offset; angle constraints only their value.
 * The inverse restores the previous *effective* values, so an omitted orientation
 * or offset is materialised as its default (they are semantically identical).
 */
export function applyUpdateConstraint(
  document: PatternDocument,
  command: CommandOf<'update_constraint'>,
): CommandApplication {
  const { id, value, reference, orientation, offset } = command.params;
  const constraint = getConstraint(document, id);
  if (constraint === undefined) {
    throw new CommandValidationError('update_constraint', `unknown constraint: ${id}`);
  }
  if (constraint.type === 'derived_distance') {
    return applyUpdateDerivedDimension(document, command, constraint);
  }
  if (constraint.type !== 'distance' && constraint.type !== 'angle') {
    throw new CommandValidationError(
      'update_constraint',
      `constraint ${id} is a ${constraint.type}, expected distance or angle`,
    );
  }
  if (value !== undefined && reference !== undefined) {
    throw new CommandValidationError('update_constraint', 'provide value or reference, not both');
  }
  if (
    value === undefined &&
    reference === undefined &&
    orientation === undefined &&
    offset === undefined
  ) {
    throw new CommandValidationError(
      'update_constraint',
      'provide value, reference, orientation or offset',
    );
  }
  if (reference !== undefined && constraint.type !== 'distance') {
    throw new CommandValidationError(
      'update_constraint',
      'reference applies only to distance constraints',
    );
  }

  let nextValue: Param | null | undefined;
  if (value === null) {
    if (constraint.type !== 'distance') {
      throw new CommandValidationError(
        'update_constraint',
        'only distance constraints can be cleared to driven',
      );
    }
    nextValue = null;
  } else if (value === undefined) {
    nextValue = undefined;
  } else if (constraint.type === 'distance') {
    nextValue = requireLengthParam(document, 'update_constraint', value, 'distance value');
    requireNoMeasurementFeedback(
      document,
      'update_constraint',
      value,
      dimensionAnchorIds(document, [constraint.a, constraint.b]),
    );
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    nextValue = value;
  } else {
    throw new CommandValidationError('update_constraint', 'angle requires a finite value');
  }
  if (orientation !== undefined) {
    if (constraint.type !== 'distance') {
      throw new CommandValidationError(
        'update_constraint',
        'orientation applies only to distance constraints',
      );
    }
    if (!DIMENSION_ORIENTATIONS.includes(orientation)) {
      throw new CommandValidationError(
        'update_constraint',
        `unknown dimension orientation: ${String(orientation)}`,
      );
    }
    if (
      orientation !== 'aligned' &&
      (isLineAnchor(document, constraint.a) || isLineAnchor(document, constraint.b))
    ) {
      throw new CommandValidationError(
        'update_constraint',
        'distance: a line anchor is always aligned',
      );
    }
  }
  if (offset !== undefined) {
    if (constraint.type !== 'distance') {
      throw new CommandValidationError(
        'update_constraint',
        'offset applies only to distance constraints',
      );
    }
    if (!Number.isFinite(offset)) {
      throw new CommandValidationError('update_constraint', 'offset must be a finite number');
    }
  }

  const updated = updatedConstraint(
    document,
    constraint,
    nextValue,
    reference,
    orientation,
    offset,
  );
  if (updated === null) {
    return noOp(document);
  }

  const constraints = document.constraints.map((candidate) =>
    candidate.id === id ? updated.constraint : candidate,
  );

  return {
    document: {
      ...document,
      constraints: captureBrokenDependents(document.constraints, constraints, document),
    },
    // A previous broken link cannot be expressed as a command param, so undo
    // falls back to the journal snapshot for that transition.
    inverse:
      updated.inverse === null
        ? null
        : { id: command.id, type: 'update_constraint', params: updated.inverse },
  };
}

interface UpdatedConstraint {
  constraint: Constraint;
  /** `null` when undo has to restore a state the command params cannot express. */
  inverse: UpdateConstraintParams | null;
}

/** The params that restore a dimension's previous state, or `null` for a broken link. */
function previousStateParams(
  document: PatternDocument,
  constraint: DistanceConstraint,
  orientation: DimensionOrientation,
  offset: number,
): UpdateConstraintParams | null {
  const base = { id: constraint.id, orientation, offset };
  if (constraint.value !== undefined) return { ...base, value: constraint.value };
  if (constraint.reference === undefined) return { ...base, value: null };
  // A dangling or unresolvable reference cannot be re-linked by a command.
  if (resolveSetValue(document.constraints, constraint) === null) return null;
  return { ...base, reference: constraint.reference };
}

/** Build the next constraint plus the params that restore its previous values. */
function updatedConstraint(
  document: PatternDocument,
  constraint: DistanceConstraint | Extract<Constraint, { type: 'angle' }>,
  value: Param | null | undefined,
  reference: EntityId | null | undefined,
  orientation: DimensionOrientation | undefined,
  offset: number | undefined,
): UpdatedConstraint | null {
  if (constraint.type === 'angle') {
    // Validation rejects presentation fields, formulas and `null` for angles.
    const nextValue = value as number;
    if (nextValue === constraint.value) return null;
    return {
      constraint: { ...constraint, value: nextValue },
      inverse: { id: constraint.id, value: constraint.value },
    };
  }

  const previousOrientation = constraintOrientation(constraint);
  const previousOffset = constraintOffset(constraint);
  const nextOrientation = orientation ?? previousOrientation;
  const nextOffset = offset ?? previousOffset;

  let nextValue = constraint.value;
  let nextReference = constraint.reference;
  let nextLastKnown = constraint.lastKnownValue;

  if (reference === null) {
    // Unlink: keep the current effective value so the sketch does not move.
    if (constraint.reference !== undefined) {
      // A referenced dimension resolves to its source; a broken one keeps the
      // last reading. Both are the value the label currently shows.
      const effective =
        resolveSetValue(document.constraints, constraint) ?? constraint.lastKnownValue ?? null;
      if (effective === null) {
        throw new CommandValidationError(
          'update_constraint',
          `dimension ${constraint.id} has no value to keep when unlinking`,
        );
      }
      nextValue = effective;
      nextReference = undefined;
      nextLastKnown = undefined;
    }
  } else if (reference !== undefined) {
    const resolved = validateReference(
      document,
      'update_constraint',
      { id: constraint.id, a: constraint.a, b: constraint.b },
      reference,
    );
    nextValue = undefined;
    nextReference = reference;
    nextLastKnown = resolved;
  } else if (value !== undefined) {
    // A manual value (or `null`) breaks any existing link.
    nextValue = value === null ? undefined : value;
    nextReference = undefined;
    nextLastKnown = undefined;
  }

  if (
    nextValue === constraint.value &&
    nextReference === constraint.reference &&
    nextOrientation === previousOrientation &&
    nextOffset === previousOffset
  ) {
    return null;
  }

  const next: DistanceConstraint = {
    id: constraint.id,
    type: 'distance',
    a: constraint.a,
    b: constraint.b,
    orientation: nextOrientation,
    offset: nextOffset,
  };
  if (nextValue !== undefined) next.value = nextValue;
  if (nextReference !== undefined) next.reference = nextReference;
  if (nextLastKnown !== undefined) next.lastKnownValue = nextLastKnown;

  return {
    constraint: next,
    inverse: previousStateParams(document, constraint, previousOrientation, previousOffset),
  };
}

export function applyRemoveConstraint(
  document: PatternDocument,
  command: CommandOf<'remove_constraint'>,
): CommandApplication {
  const { id } = command.params;
  const constraint = getConstraint(document, id);
  if (constraint === undefined) {
    return noOp(document);
  }

  const constraints = captureBrokenDependents(
    document.constraints,
    document.constraints.filter((candidate) => candidate.id !== id),
    document,
  );

  if (constraint.type === 'derived_distance') {
    return {
      document: { ...document, constraints },
      inverse: {
        id: constraint.id,
        type: 'add_derived_dimension',
        params: derivedConstraintToParams(constraint),
      },
    };
  }

  return {
    document: { ...document, constraints },
    // A broken dimension's dangling reference cannot be re-linked by the inverse.
    inverse:
      constraint.type === 'distance' &&
      constraint.reference !== undefined &&
      resolveSetValue(document.constraints, constraint) === null
        ? null
        : { id: constraint.id, type: 'add_constraint', params: constraintToParams(constraint) },
  };
}

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
function applyUpdateDerivedDimension(
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
function derivedConstraintToParams(
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

function buildConstraint(
  id: EntityId,
  type: ConstraintType,
  entities: EntityId[],
  value: Param | undefined,
  orientation: DimensionOrientation | undefined,
  offset: number | undefined,
  reference?: EntityId,
  resolvedReference?: number,
  piece?: EntityId,
): Constraint {
  const [a, b, c, d] = entities;
  const owner = piece === undefined ? {} : { piece };

  switch (type) {
    case 'coincident':
      return { id, type, a: a!, b: b!, ...owner };
    case 'horizontal':
      return { id, type, a: a!, b: b!, ...owner };
    case 'vertical':
      return { id, type, a: a!, b: b!, ...owner };
    case 'point_on_line':
      return { id, type, point: a!, a: b!, b: c!, ...owner };
    case 'distance':
      return {
        id,
        type,
        a: a!,
        b: b!,
        ...owner,
        ...(value === undefined ? {} : { value }),
        ...(reference === undefined ? {} : { reference }),
        ...(resolvedReference === undefined ? {} : { lastKnownValue: resolvedReference }),
        ...(orientation === undefined ? {} : { orientation }),
        ...(offset === undefined ? {} : { offset }),
      };
    case 'angle':
      // `add_constraint` rejects a non-numeric angle value before building it.
      return { id, type, a: a!, b: b!, c: c!, value: value as number, ...owner };
    case 'equal':
      return { id, type, a1: a!, a2: b!, b1: c!, b2: d!, ...owner };
    case 'midpoint':
      return midpointConstraint(id, entities, piece);
  }
}

function constraintToParams(
  constraint: Exclude<Constraint, { type: 'derived_distance' }>,
): AddConstraintParams {
  switch (constraint.type) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
      return { type: constraint.type, entities: [constraint.a, constraint.b] };
    case 'point_on_line':
      return { type: 'point_on_line', entities: [constraint.point, constraint.a, constraint.b] };
    case 'distance':
      return {
        type: 'distance',
        entities: [constraint.a, constraint.b],
        ...(constraint.value === undefined ? {} : { value: constraint.value }),
        ...(constraint.reference === undefined ? {} : { reference: constraint.reference }),
        ...(constraint.orientation === undefined ? {} : { orientation: constraint.orientation }),
        ...(constraint.offset === undefined ? {} : { offset: constraint.offset }),
      };
    case 'angle':
      return {
        type: 'angle',
        entities: [constraint.a, constraint.b, constraint.c],
        value: constraint.value,
      };
    case 'equal':
      return {
        type: 'equal',
        entities: [constraint.a1, constraint.a2, constraint.b1, constraint.b2],
      };
    case 'midpoint':
      return {
        type: 'midpoint',
        entities:
          'line' in constraint
            ? [constraint.point, constraint.line]
            : [constraint.point, constraint.a, constraint.b],
      };
  }
}
