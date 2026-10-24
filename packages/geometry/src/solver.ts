import { resolveSetValue } from './dimension.js';
import { constraintEntityIds, constraintPointIds } from './document.js';
import type { Constraint, Entity, EntityId, LineEntity, PointEntity } from './types.js';
import { cross, dot, sub, type Vec2 } from './vector.js';

export interface SolveOptions {
  /** Maximum Levenberg–Marquardt iterations before giving up. */
  maxIterations?: number;
  /** Residual norm below which the sketch is considered solved (units: mm). */
  tolerance?: number;
  /** Initial Levenberg–Marquardt damping factor. */
  initialDamping?: number;
}

export interface SolveResult {
  converged: boolean;
  iterations: number;
  residualNorm: number;
  coordinates: Map<EntityId, Vec2>;
}

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_DAMPING = 1e-3;
const FINITE_DIFFERENCE_STEP = 1e-6;
const MAX_DAMPING = 1e12;

/**
 * Solve a set of geometric constraints over the supplied points using a
 * Levenberg–Marquardt least-squares iteration with a numerical Jacobian.
 *
 * Fixed points are held constant; all other points move to satisfy the
 * constraints, staying as close as possible to their starting positions.
 *
 * `entities` is optional and only needed when a distance anchors to a straight
 * line instead of a point: the residual reads that line's two endpoints. Legacy
 * point-only call sites stay valid.
 */
export function solve(
  points: PointEntity[],
  constraints: Constraint[],
  options: SolveOptions = {},
  entities: readonly Entity[] = [],
): SolveResult {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  let damping = options.initialDamping ?? DEFAULT_DAMPING;

  const pointById = new Map<EntityId, PointEntity>(points.map((p) => [p.id, p]));
  const pointIds = new Set<EntityId>(pointById.keys());
  const entityById = new Map<EntityId, Entity>(entities.map((entity) => [entity.id, entity]));
  const lineById = new Map<EntityId, LineEntity>(
    entities
      .filter((entity): entity is LineEntity => entity.kind === 'line')
      .map((line) => [line.id, line]),
  );
  const isLineAnchor = (id: EntityId): boolean => lineById.has(id);
  const variableIds: EntityId[] = [];

  for (const point of points) {
    if (!point.fixed) variableIds.push(point.id);
  }

  for (const constraint of constraints) {
    // Cut dimensions measure derived geometry and never reference solver points.
    if (constraint.type === 'derived_distance') continue;

    if (constraint.type === 'distance') {
      // A curve, arc or circle is not a valid anchor; say so instead of
      // reporting it as an unknown point.
      for (const id of constraintEntityIds(constraint)) {
        const entity = entityById.get(id);
        if (entity !== undefined && entity.kind !== 'point' && entity.kind !== 'line') {
          throw new Error(
            `Constraint "${constraint.id}" anchor ${id} is a ${entity.kind}, expected a point or line`,
          );
        }
      }
      // Line anchors reference solver points through their two endpoints.
      for (const id of constraintEntityIds(constraint).filter(isLineAnchor)) {
        const line = lineById.get(id)!;
        for (const endpoint of [line.start, line.end]) {
          if (!pointIds.has(endpoint)) {
            throw new Error(
              `Constraint "${constraint.id}" line anchor ${id} references unknown point: ${endpoint}`,
            );
          }
        }
      }
    }

    // Every non-line reference must be a known point.
    for (const id of constraintPointIds(constraint, isLineAnchor)) {
      if (!pointIds.has(id)) {
        throw new Error(`Constraint "${constraint.id}" references unknown point: ${id}`);
      }
    }
  }

  // Referenced dimensions follow a source chain, so resolve every driving value
  // once per solve instead of once per residual (and per solver iteration).
  const drivingValues = resolvedDrivingValues(constraints);

  const readState = (x: Float64Array): Map<EntityId, Vec2> => {
    const state = new Map<EntityId, Vec2>();
    for (const point of points) {
      state.set(point.id, { x: point.x, y: point.y });
    }
    variableIds.forEach((id, i) => {
      state.set(id, { x: x[2 * i]!, y: x[2 * i + 1]! });
    });
    return state;
  };

  const residualVector = (x: Float64Array): Float64Array => {
    const state = readState(x);
    const readPoint = (id: EntityId): Vec2 => {
      // Unreachable: every referenced id is validated and seeded in `state`.
      /* v8 ignore next */
      if (!state.has(id)) throw new Error(`Unknown point referenced by constraint: ${id}`);
      return state.get(id)!;
    };
    const readAnchor = (
      id: EntityId,
    ): { kind: 'point'; point: Vec2 } | { kind: 'line'; start: Vec2; end: Vec2 } => {
      const line = lineById.get(id);
      if (line === undefined) return { kind: 'point', point: readPoint(id) };
      return { kind: 'line', start: readPoint(line.start), end: readPoint(line.end) };
    };
    return residuals(constraints, drivingValues, readPoint, readAnchor);
  };

  const dimensions = variableIds.length * 2;
  let x = new Float64Array(dimensions);
  variableIds.forEach((id, i) => {
    const point = pointById.get(id)!;
    x[2 * i] = point.x;
    x[2 * i + 1] = point.y;
  });

  let residual = residualVector(x);
  let norm = euclideanNorm(residual);
  let iterations = 0;

  while (iterations < maxIterations && dimensions > 0 && norm > tolerance) {
    iterations += 1;

    const jacobian = numericalJacobian(residualVector, x, residual.length, dimensions);
    const matrix = normalMatrix(jacobian, damping);
    const gradient = negativeGradient(jacobian, residual);
    const step = solveLinearSystem(matrix, gradient);

    // The normal matrix is symmetric positive-definite (`AᵀA + λI`, λ > 0), so
    // the linear solve never fails; this guard is unreachable defensive code.
    /* v8 ignore start */
    if (step === null) {
      damping = Math.min(damping * 10, MAX_DAMPING);
      if (damping >= MAX_DAMPING) break;
      continue;
    }
    /* v8 ignore stop */

    const candidate = new Float64Array(dimensions);
    for (let i = 0; i < dimensions; i += 1) {
      candidate[i] = x[i]! + step[i]!;
    }

    const candidateResidual = residualVector(candidate);
    const candidateNorm = euclideanNorm(candidateResidual);

    if (candidateNorm < norm) {
      x = candidate;
      residual = candidateResidual;
      norm = candidateNorm;
      damping = Math.max(damping * 0.3, 1e-12);
    } else {
      damping = Math.min(damping * 10, MAX_DAMPING);
      if (damping >= MAX_DAMPING) break;
    }
  }

  return {
    // A document with no driving constraints is converged by definition; driven
    // and broken dimensions measure the sketch without adding an equation.
    converged:
      !constraints.some((constraint) => hasDrivingValue(constraint, drivingValues)) ||
      norm <= tolerance,
    iterations,
    residualNorm: norm,
    coordinates: readState(x),
  };
}

/** Whether a constraint adds an equation the solver must satisfy. */
function hasDrivingValue(constraint: Constraint, drivingValues: Map<EntityId, number>): boolean {
  return constraint.type !== 'distance' || drivingValues.has(constraint.id);
}

/**
 * Resolve every dimension that drives the sketch into one map. Set dimensions
 * contribute their literal; referenced ones their resolved source value; driven
 * and broken ones are absent, so they add no residual.
 */
function resolvedDrivingValues(constraints: Constraint[]): Map<EntityId, number> {
  const values = new Map<EntityId, number>();
  for (const constraint of constraints) {
    if (constraint.type !== 'distance') continue;
    const value = resolveSetValue(constraints, constraint);
    if (value !== null) values.set(constraint.id, value);
  }
  return values;
}

function residuals(
  constraints: Constraint[],
  drivingValues: Map<EntityId, number>,
  point: (id: EntityId) => Vec2,
  anchor: (
    id: EntityId,
  ) => { kind: 'point'; point: Vec2 } | { kind: 'line'; start: Vec2; end: Vec2 },
): Float64Array {
  const values: number[] = [];

  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'coincident': {
        const a = point(constraint.a);
        const b = point(constraint.b);
        values.push(a.x - b.x, a.y - b.y);
        break;
      }
      case 'horizontal': {
        const a = point(constraint.a);
        const b = point(constraint.b);
        values.push(a.y - b.y);
        break;
      }
      case 'vertical': {
        const a = point(constraint.a);
        const b = point(constraint.b);
        values.push(a.x - b.x);
        break;
      }
      case 'point_on_line': {
        const p = point(constraint.point);
        const a = point(constraint.a);
        const b = point(constraint.b);
        const ab = sub(b, a);
        const length = Math.hypot(ab.x, ab.y) || 1;
        values.push(cross(ab, sub(p, a)) / length);
        break;
      }
      case 'distance': {
        // Driven and broken dimensions add no equation.
        const value = drivingValues.get(constraint.id);
        if (value === undefined) break;
        const a = anchor(constraint.a);
        const b = anchor(constraint.b);

        // Point ↔ point keeps the original orientation-aware residual.
        if (a.kind === 'point' && b.kind === 'point') {
          switch (constraint.orientation ?? 'aligned') {
            case 'horizontal':
              values.push(Math.abs(b.point.x - a.point.x) - value);
              break;
            case 'vertical':
              values.push(Math.abs(b.point.y - a.point.y) - value);
              break;
            case 'aligned':
              values.push(Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y) - value);
              break;
          }
          break;
        }

        // A line anchor is always aligned: the perpendicular from the origin to
        // the other line's infinite supporting line.
        let origin: Vec2;
        let line: { start: Vec2; end: Vec2 };
        if (a.kind === 'line' && b.kind === 'line') {
          // Canonical by entity id, matching the span resolver.
          const first = constraint.a <= constraint.b ? a : b;
          const second = constraint.a <= constraint.b ? b : a;
          origin = {
            x: (first.start.x + first.end.x) / 2,
            y: (first.start.y + first.end.y) / 2,
          };
          line = second;
        } else {
          // After the both-line case, exactly one anchor is a point.
          const originAnchor = (a.kind === 'point' ? a : b) as { kind: 'point'; point: Vec2 };
          const lineAnchor = (a.kind === 'line' ? a : b) as {
            kind: 'line';
            start: Vec2;
            end: Vec2;
          };
          origin = originAnchor.point;
          line = lineAnchor;
        }

        const direction = sub(line.end, line.start);
        const length = Math.hypot(direction.x, direction.y);
        // A zero-length line cannot define a perpendicular; skip rather than NaN.
        if (length === 0) break;
        values.push(Math.abs(cross(direction, sub(origin, line.start))) / length - value);
        break;
      }
      case 'angle': {
        const a = point(constraint.a);
        const b = point(constraint.b);
        const c = point(constraint.c);
        const u = sub(a, b);
        const v = sub(c, b);
        values.push(Math.atan2(cross(u, v), dot(u, v)) - constraint.value);
        break;
      }
      case 'equal': {
        const a1 = point(constraint.a1);
        const a2 = point(constraint.a2);
        const b1 = point(constraint.b1);
        const b2 = point(constraint.b2);
        values.push(Math.hypot(a2.x - a1.x, a2.y - a1.y) - Math.hypot(b2.x - b1.x, b2.y - b1.y));
        break;
      }
      case 'derived_distance':
        // A cut dimension measures derived geometry and adds no equation.
        break;
    }
  }

  return Float64Array.from(values);
}

function numericalJacobian(
  residualVector: (x: Float64Array) => Float64Array,
  x: Float64Array,
  rows: number,
  columns: number,
): Float64Array[] {
  const jacobian: Float64Array[] = Array.from({ length: rows }, () => new Float64Array(columns));

  for (let column = 0; column < columns; column += 1) {
    const forward = Float64Array.from(x);
    const backward = Float64Array.from(x);
    forward[column] = forward[column]! + FINITE_DIFFERENCE_STEP;
    backward[column] = backward[column]! - FINITE_DIFFERENCE_STEP;

    const forwardResidual = residualVector(forward);
    const backwardResidual = residualVector(backward);

    for (let row = 0; row < rows; row += 1) {
      jacobian[row]![column] =
        (forwardResidual[row]! - backwardResidual[row]!) / (2 * FINITE_DIFFERENCE_STEP);
    }
  }

  return jacobian;
}

function normalMatrix(jacobian: Float64Array[], damping: number): Float64Array[] {
  const columns = jacobian[0]!.length;
  const matrix: Float64Array[] = Array.from({ length: columns }, () => new Float64Array(columns));

  for (const row of jacobian) {
    for (let i = 0; i < columns; i += 1) {
      for (let j = i; j < columns; j += 1) {
        matrix[i]![j]! += row[i]! * row[j]!;
      }
    }
  }

  for (let i = 0; i < columns; i += 1) {
    for (let j = i + 1; j < columns; j += 1) {
      matrix[j]![i] = matrix[i]![j]!;
    }
    matrix[i]![i]! += damping;
  }

  return matrix;
}

function negativeGradient(jacobian: Float64Array[], residual: Float64Array): Float64Array {
  const columns = jacobian[0]!.length;
  const gradient = new Float64Array(columns);

  for (let rowIndex = 0; rowIndex < jacobian.length; rowIndex += 1) {
    const row = jacobian[rowIndex]!;
    const residualValue = residual[rowIndex]!;
    for (let column = 0; column < columns; column += 1) {
      gradient[column]! -= row[column]! * residualValue;
    }
  }

  return gradient;
}

function solveLinearSystem(matrix: Float64Array[], vector: Float64Array): Float64Array | null {
  const size = matrix.length;
  const augmented: Float64Array[] = matrix.map((row, index) => {
    const copy = new Float64Array(size + 1);
    copy.set(row, 0);
    copy[size] = vector[index]!;
    return copy;
  });

  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    let bestValue = Math.abs(augmented[pivot]![pivot]!);
    for (let row = pivot + 1; row < size; row += 1) {
      const value = Math.abs(augmented[row]![pivot]!);
      if (value > bestValue) {
        bestValue = value;
        bestRow = row;
      }
    }

    // Unreachable while the matrix has a positive damping term on its diagonal.
    /* v8 ignore next 3 */
    if (bestValue < 1e-14) {
      return null;
    }

    const temp = augmented[pivot]!;
    augmented[pivot] = augmented[bestRow]!;
    augmented[bestRow] = temp;

    const pivotRow = augmented[pivot]!;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]![pivot]! / pivotRow[pivot]!;
      if (factor === 0) continue;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column]! -= factor * pivotRow[column]!;
      }
    }
  }

  const solution = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    solution[i] = augmented[i]![size]! / augmented[i]![i]!;
  }

  return solution;
}

function euclideanNorm(vector: Float64Array): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}
