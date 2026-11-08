import { getEntity, getConstraint } from '../document.js';
import { CommandValidationError } from '../errors.js';
import {
  evaluateLength,
  expressionSlugs,
  isExpressionParam,
  resolveVariable,
  type ExpressionError,
} from '../expression.js';
import { createsReferenceCycle, resolveSetValue } from '../dimension.js';
import { isMeasuredVariable } from '../measurement.js';
import type { MidpointIssue } from '../midpoint.js';
import type { DistanceAnchorReason } from '../dimension.js';
import type {
  ConstraintType,
  DistanceConstraint,
  EntityId,
  MidpointConstraint,
  Param,
  PatternDocument,
  Variable,
} from '../types.js';
import type { CommandType, ParamInput } from './types.js';

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
export function dimensionAnchorIds(
  document: PatternDocument,
  entities: readonly EntityId[],
): EntityId[] {
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
export function requireNoMeasurementFeedback(
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

export const CONSTRAINT_ARITY: Record<ConstraintType, readonly number[]> = {
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
export function validateReference(
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
export function distanceIssueMessage(reason: DistanceAnchorReason): string {
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
export function midpointConstraint(
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
export function midpointIssueMessage(issue: MidpointIssue): string {
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
