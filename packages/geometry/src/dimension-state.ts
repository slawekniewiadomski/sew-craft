import { isExpressionParam, resolveExpression, type VariableScope } from './expression.js';
import type { Constraint, DistanceConstraint, EntityId, PatternDocument } from './types.js';
import { measureDistanceDimension } from './dimension-measure.js';

export type DimensionState = 'set' | 'formula' | 'driven' | 'referenced' | 'broken' | 'derived';

/** The `distance` constraint with this id, or `null` when absent or another type. */
function distanceById(constraints: readonly Constraint[], id: EntityId): DistanceConstraint | null {
  const constraint = constraints.find((candidate) => candidate.id === id);
  return constraint !== undefined && constraint.type === 'distance' ? constraint : null;
}

/** Whether a value can drive the solver: finite and greater than zero. */
function isUsableValue(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * The value a dimension drives with, following a reference chain. `null` for a
 * driven, missing, broken or cyclic source. `visited` makes a hand-edited cyclic
 * document safe to read instead of recursing forever.
 */
function resolveConstraintValue(
  constraints: readonly Constraint[],
  scope: VariableScope,
  constraint: DistanceConstraint,
  visited: Set<EntityId>,
): number | null {
  if (constraint.value !== undefined) {
    // A formula that no longer resolves drives nothing; its last number is kept
    // for display only, so a deleted variable never moves the sketch.
    const value = isExpressionParam(constraint.value)
      ? resolveExpression(scope, constraint.value.expr)
      : constraint.value;
    return value !== null && isUsableValue(value) ? value : null;
  }

  const reference = constraint.reference;
  if (reference === undefined) return null;
  if (visited.has(constraint.id)) return null;
  visited.add(constraint.id);

  const source = distanceById(constraints, reference);
  if (source === null) return null;
  return resolveConstraintValue(constraints, scope, source, visited);
}

/**
 * The resolved driving value of a dimension: its literal, or a source chain's
 * literal. `null` when the dimension is driven or its reference is broken.
 */
export function resolveSetValue(
  constraints: readonly Constraint[],
  constraint: DistanceConstraint,
  scope: VariableScope = {},
): number | null {
  return resolveConstraintValue(constraints, scope, constraint, new Set());
}

/** The state of a dimension, derived from its fields and the document. */
export function dimensionState(
  document: PatternDocument,
  constraint: DistanceConstraint,
): DimensionState {
  if (constraint.value !== undefined) {
    if (!isExpressionParam(constraint.value)) return 'set';
    return resolveSetValue(document.constraints, constraint, document) === null
      ? 'broken'
      : 'formula';
  }
  if (constraint.reference === undefined) return 'driven';
  return resolveSetValue(document.constraints, constraint, document) === null
    ? 'broken'
    : 'referenced';
}

/** True when a dimension only measures the sketch and adds no solver equation. */
export function isDrivenDimension(constraint: DistanceConstraint): boolean {
  return constraint.value === undefined && constraint.reference === undefined;
}

/** True when a dimension follows a source that currently resolves. */
export function isReferencedDimension(
  document: PatternDocument,
  constraint: DistanceConstraint,
): boolean {
  return dimensionState(document, constraint) === 'referenced';
}

/** True when a dimension's recorded source no longer resolves. */
export function isBrokenDimension(
  document: PatternDocument,
  constraint: DistanceConstraint,
): boolean {
  return dimensionState(document, constraint) === 'broken';
}

/**
 * The value a dimension reports: its literal `value`, the resolved source value
 * when referenced, the live measurement when driven, or the last known reading
 * when broken. `null` when a measured point is missing.
 */
export function resolveDimensionValue(
  document: PatternDocument,
  constraint: DistanceConstraint,
): number | null {
  if (constraint.value !== undefined) {
    const resolved = resolveSetValue(document.constraints, constraint, document);
    if (resolved !== null) return resolved;
    return isExpressionParam(constraint.value) ? constraint.value.lastKnown : null;
  }
  if (constraint.reference === undefined) {
    return measureDistanceDimension(document, constraint);
  }
  return (
    resolveSetValue(document.constraints, constraint, document) ?? constraint.lastKnownValue ?? null
  );
}

/**
 * The effective value of a dimension, resolved through any reference chain.
 * Every surface reads this so a linked dimension never has a second number.
 */
export function dimensionValue(
  document: PatternDocument,
  constraint: DistanceConstraint,
): number | null {
  return resolveDimensionValue(document, constraint);
}

/** Order-insensitive comparison of two point pairs. */
function samePointPair(constraint: DistanceConstraint, a: EntityId, b: EntityId): boolean {
  return (constraint.a === a && constraint.b === b) || (constraint.a === b && constraint.b === a);
}

/**
 * Whether linking `dependentId` to `sourceId` would close a loop, including a
 * self-link. Walks the source's chain and stops as soon as it reaches the
 * dependent or an existing cycle.
 */
export function createsReferenceCycle(
  constraints: readonly Constraint[],
  dependentId: EntityId,
  sourceId: EntityId,
): boolean {
  const seen = new Set<EntityId>([dependentId]);
  let current = distanceById(constraints, sourceId);
  while (current !== null) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    if (current.reference === undefined) return false;
    current = distanceById(constraints, current.reference);
  }
  return false;
}

/**
 * The dimensions a dimension may reference: another distance constraint that is
 * not itself, not on the same point pair, currently resolves to a value and
 * would not create a cycle. Driven and broken dimensions are never offered.
 */
export function referenceCandidates(
  document: PatternDocument,
  constraint: DistanceConstraint,
): DistanceConstraint[] {
  return document.constraints.filter(
    (candidate): candidate is DistanceConstraint =>
      candidate.type === 'distance' &&
      candidate.id !== constraint.id &&
      !samePointPair(candidate, constraint.a, constraint.b) &&
      resolveSetValue(document.constraints, candidate, document) !== null &&
      !createsReferenceCycle(document.constraints, constraint.id, candidate.id),
  );
}

/**
 * The point-to-point span, used by callers that measure an entity's own length
 * and keep the original point-only semantics.
 */
