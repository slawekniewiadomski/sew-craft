/** Point, line, curve, arc and circle commands, plus deletion. */
import { MIN_BULGE, arcThroughPoints } from '../arc.js';
import { MIN_RADIUS } from '../circle.js';
import { cornerRoundsForEntity, isCornerRoundDerived } from '../corner-round.js';
import { resolveSetValue } from '../dimension.js';
import { constraintEntityIds, cornerRounds, documentSeams, getEntity } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { isMeasuredVariable, measurementChain } from '../measurement.js';
import { midpointTargetFor } from '../midpoint.js';
import { pieceForEdge } from '../piece.js';
import { isConstruction } from '../roles.js';
import type { VariableScope } from '../expression.js';
import type {
  ArcEntity,
  CircleEntity,
  Constraint,
  CornerRound,
  CurveEntity,
  CutAnchor,
  Entity,
  EntityId,
  EntityRole,
  LineEntity,
  PatternDocument,
  PointEntity,
  Variable,
} from '../types.js';
import { applyRemoveCornerRound } from './corner-rounds.js';
import {
  deleteEntityCommand,
  noOp,
  requireDraftingPoint,
  requireLine,
  requirePiece,
  requirePoint,
  roleFromParams,
  withoutKeys,
} from './shared.js';
import { captureMeasuredValues } from './variables.js';
import type { AddLineParams, CommandApplication, CommandOf, CommandType } from './types.js';

export function applyAddPoint(
  document: PatternDocument,
  command: CommandOf<'add_point'>,
): CommandApplication {
  const { x, y } = command.params;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CommandValidationError('add_point', 'x and y must be finite numbers');
  }
  if (command.params.piece !== undefined) {
    requirePiece(document, command.params.piece, 'add_point');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const role = roleFromParams(command.params.role, command.params.construction);
  const point: PointEntity = {
    id: command.id,
    kind: 'point',
    x,
    y,
    ...(command.params.piece === undefined ? {} : { piece: command.params.piece }),
    ...(role === undefined ? {} : { role }),
    construction: role === 'construction',
    fixed: false,
  };

  return {
    document: { ...document, entities: [...document.entities, point] },
    inverse: deleteEntityCommand(command.id),
  };
}

export function applyMovePoint(
  document: PatternDocument,
  command: CommandOf<'move_point'>,
): CommandApplication {
  const { id, x, y } = command.params;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CommandValidationError('move_point', 'x and y must be finite numbers');
  }

  const point = requirePoint(document, id, 'move_point');
  if (midpointTargetFor(document, id) !== undefined) {
    throw new CommandValidationError(
      'move_point',
      'This point is fixed at the midpoint; move its source line or points instead.',
    );
  }
  if (isCornerRoundDerived(document, id)) {
    throw new CommandValidationError(
      'move_point',
      'This point is derived by a corner round; edit the radius.',
    );
  }
  if (point.x === x && point.y === y) {
    return noOp(document);
  }

  const moved: PointEntity = { ...point, x, y };
  const entities: Entity[] = document.entities.map((entity) => (entity.id === id ? moved : entity));

  return {
    document: { ...document, entities },
    inverse: { id: command.id, type: 'move_point', params: { id, x: point.x, y: point.y } },
  };
}

export function applyAddLine(
  document: PatternDocument,
  command: { id: EntityId; params: AddLineParams },
  role: EntityRole | undefined,
  type: CommandType,
): CommandApplication {
  const { start, end } = command.params;
  requireDraftingPoint(document, start, type);
  requireDraftingPoint(document, end, type);
  if (command.params.piece !== undefined) {
    requirePiece(document, command.params.piece, type);
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const line: LineEntity = {
    id: command.id,
    kind: 'line',
    start,
    end,
    ...(command.params.piece === undefined ? {} : { piece: command.params.piece }),
    ...(role === undefined ? {} : { role }),
    construction: role === 'construction',
  };

  return {
    document: { ...document, entities: [...document.entities, line] },
    inverse: deleteEntityCommand(command.id),
  };
}

/** The shortest length either half of a split line may keep, in millimetres. */
export const MIN_SPLIT_LENGTH = 0.001;

interface LineProjection {
  /** The full length of the projected line, in millimetres. */
  length: number;
  /** Distance from the line's start to the projected point. */
  along: number;
  /** Perpendicular distance from the point to the line. */
  off: number;
}

/** Project a point onto a non-degenerate line through `start` and `end`. */
function projectOnLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
  point: { x: number; y: number },
): LineProjection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const rx = point.x - start.x;
  const ry = point.y - start.y;
  return { length, along: rx * ux + ry * uy, off: Math.abs(-rx * uy + ry * ux) };
}

/**
 * Split a straight line at an existing authored point. The original line keeps
 * its id as the first half; the new half takes the command id. Both halves share
 * the split point, so the piece loop stays closed.
 *
 * Everything that names the line is re-pointed at the half that now owns it:
 * piece loops and per-edge allowances, legacy seams, corner rounds, notches,
 * measured-variable chains, the line form of a midpoint constraint, and cut
 * anchors that resolve to the line's natural end. The split is a geometric
 * no-op, so undo relies on the journal snapshot (`inverse: null`).
 */
export function applySplitLine(
  document: PatternDocument,
  command: CommandOf<'split_line'>,
): CommandApplication {
  const { line: lineId, point: pointId } = command.params;
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const line = requireLine(document, lineId, 'split_line');
  const point = requirePoint(document, pointId, 'split_line');
  if (isCornerRoundDerived(document, pointId)) {
    throw new CommandValidationError(
      'split_line',
      'This point is derived by a corner round; edit the radius.',
    );
  }
  if (midpointTargetFor(document, pointId) !== undefined) {
    throw new CommandValidationError(
      'split_line',
      'This point is fixed at the midpoint; split at another point.',
    );
  }
  if (line.piece !== undefined && point.piece !== undefined && point.piece !== line.piece) {
    throw new CommandValidationError(
      'split_line',
      'The point and the line must belong to the same piece.',
    );
  }
  if (pointId === line.start || pointId === line.end) {
    throw new CommandValidationError('split_line', 'The point is already an end of this line.');
  }

  const start = requirePoint(document, line.start, 'split_line');
  const end = requirePoint(document, line.end, 'split_line');
  if (start.x === end.x && start.y === end.y) {
    throw new CommandValidationError('split_line', 'The line has no length.');
  }
  const projection = projectOnLine(start, end, point);
  if (projection.off > MIN_SPLIT_LENGTH) {
    throw new CommandValidationError('split_line', 'The point is not on this line.');
  }
  if (
    projection.along <= MIN_SPLIT_LENGTH ||
    projection.length - projection.along <= MIN_SPLIT_LENGTH
  ) {
    throw new CommandValidationError(
      'split_line',
      'The point must sit between the ends of the line.',
    );
  }

  // A cut dimension on `at: 'edge'` measures the whole edge; splitting it would
  // silently halve the value, so refuse until the user removes it.
  const wholeEdge = document.constraints.some(
    (constraint) =>
      constraint.type === 'derived_distance' &&
      ((constraint.a.edge === lineId && constraint.a.at === 'edge') ||
        (constraint.b.edge === lineId && constraint.b.at === 'edge')),
  );
  if (wholeEdge) {
    throw new CommandValidationError(
      'split_line',
      'A cut dimension measures this edge as a whole; remove it before splitting.',
    );
  }

  const first: LineEntity = { ...line, end: pointId };
  const second: LineEntity = { ...line, id: command.id, start: pointId };
  const splitEntities: Entity[] = [
    ...document.entities.map((entity) => (entity.id === lineId ? first : entity)),
    second,
  ];

  // A notch cuts the allowance of the half that contains its point.
  const entities = splitEntities.map((entity): Entity => {
    if (entity.kind !== 'mark' || entity.type !== 'notch' || entity.edge !== lineId) return entity;
    const notchPoint = getEntity(document, entity.point);
    if (notchPoint === undefined || notchPoint.kind !== 'point') return entity;
    return projectOnLine(start, end, notchPoint).along > projection.along
      ? { ...entity, edge: command.id }
      : entity;
  });

  // Insert the new half immediately after the original wherever it appears.
  const pieces = document.pieces.map((piece) => {
    const index = piece.edges.indexOf(lineId);
    if (index < 0) return piece;
    const edges = [...piece.edges];
    edges.splice(index + 1, 0, command.id);
    const allowance = piece.allowances.find((candidate) => candidate.edge === lineId);
    return allowance === undefined
      ? { ...piece, edges }
      : {
          ...piece,
          edges,
          allowances: [...piece.allowances, { ...allowance, edge: command.id }],
        };
  });

  // A round owns the half that keeps its tangent; a round at the original start
  // stays on the original line, a round at the original end moves to the new one.
  const remapRoundEnd = (roundEnd: CornerRound['ends'][number]): CornerRound['ends'][number] =>
    roundEnd.line === lineId && roundEnd.tangent !== line.start
      ? { ...roundEnd, line: command.id }
      : roundEnd;
  const nextRounds =
    document.cornerRounds === undefined
      ? undefined
      : cornerRounds(document).map((round): CornerRound => ({
          ...round,
          ends: [remapRoundEnd(round.ends[0]), remapRoundEnd(round.ends[1])],
        }));

  const remapAnchor = (anchor: CutAnchor): CutAnchor =>
    anchor.edge === lineId && anchor.at === 'end' ? { ...anchor, edge: command.id } : anchor;
  const constraints = document.constraints.map((constraint): Constraint => {
    if (constraint.type === 'midpoint' && 'line' in constraint && constraint.line === lineId) {
      return {
        id: constraint.id,
        type: 'midpoint',
        point: constraint.point,
        ...(constraint.piece === undefined ? {} : { piece: constraint.piece }),
        a: line.start,
        b: line.end,
      };
    }
    if (constraint.type !== 'derived_distance') return constraint;
    const a = remapAnchor(constraint.a);
    const b = remapAnchor(constraint.b);
    return a === constraint.a && b === constraint.b ? constraint : { ...constraint, a, b };
  });

  // A measured chain replaces the edge with its two halves, then canonicalises
  // the order; a chain that already failed to resolve is left untouched.
  const variables =
    document.variables === undefined
      ? undefined
      : document.variables.map((variable): Variable => {
          if (!isMeasuredVariable(variable) || !variable.sources.includes(lineId)) return variable;
          const ids = variable.sources.flatMap((id) =>
            id === lineId ? [lineId, command.id] : [id],
          );
          const chain = measurementChain(entities, ids);
          return chain.chain === undefined ? variable : { ...variable, sources: chain.chain };
        });

  const seam = documentSeams(document).find((candidate) => candidate.edge === lineId);
  const seams =
    document.seams === undefined || seam === undefined
      ? document.seams
      : [...document.seams, { ...seam, id: `${command.id}:seam`, edge: command.id }];

  return {
    document: {
      ...document,
      entities,
      constraints,
      pieces,
      ...(nextRounds === undefined ? {} : { cornerRounds: nextRounds }),
      ...(variables === undefined ? {} : { variables }),
      ...(seams === undefined ? {} : { seams }),
    },
    inverse: null,
  };
}

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

export function applyAddCurve(
  document: PatternDocument,
  command: CommandOf<'add_curve'>,
): CommandApplication {
  const { p0, p1, p2, p3 } = command.params;
  const controlPoints = [p0, p1, p2, p3];
  if (new Set(controlPoints).size !== controlPoints.length) {
    throw new CommandValidationError('add_curve', 'control points must be distinct');
  }
  for (const id of controlPoints) {
    requireDraftingPoint(document, id, 'add_curve');
  }
  if (command.params.piece !== undefined) {
    requirePiece(document, command.params.piece, 'add_curve');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const role = roleFromParams(command.params.role, command.params.construction);
  const curve: CurveEntity = {
    id: command.id,
    kind: 'curve',
    p0,
    p1,
    p2,
    p3,
    ...(command.params.piece === undefined ? {} : { piece: command.params.piece }),
    ...(role === undefined ? {} : { role }),
    construction: role === 'construction',
  };

  return {
    document: { ...document, entities: [...document.entities, curve] },
    inverse: deleteEntityCommand(command.id),
  };
}

export function applyAddArc(
  document: PatternDocument,
  command: CommandOf<'add_arc'>,
): CommandApplication {
  const { start, end, through } = command.params;
  if (new Set([start, end, through]).size !== 3) {
    throw new CommandValidationError('add_arc', 'start, end and through must be distinct points');
  }

  const startPoint = requireDraftingPoint(document, start, 'add_arc');
  const endPoint = requireDraftingPoint(document, end, 'add_arc');
  const throughPoint = requireDraftingPoint(document, through, 'add_arc');

  const geometry = arcThroughPoints(
    { x: startPoint.x, y: startPoint.y },
    { x: endPoint.x, y: endPoint.y },
    { x: throughPoint.x, y: throughPoint.y },
  );
  if (geometry === null) {
    throw new CommandValidationError(
      'add_arc',
      `through must be at least ${MIN_BULGE} mm off the start-end chord`,
    );
  }
  if (command.params.piece !== undefined) {
    requirePiece(document, command.params.piece, 'add_arc');
  }

  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const role = roleFromParams(command.params.role, command.params.construction);
  const arc: ArcEntity = {
    id: command.id,
    kind: 'arc',
    start,
    end,
    through,
    ...(command.params.piece === undefined ? {} : { piece: command.params.piece }),
    ...(role === undefined ? {} : { role }),
    construction: role === 'construction',
  };

  return {
    document: { ...document, entities: [...document.entities, arc] },
    inverse: deleteEntityCommand(command.id),
  };
}

export function applyAddCircle(
  document: PatternDocument,
  command: CommandOf<'add_circle'>,
): CommandApplication {
  const { center, rim } = command.params;
  if (center === rim) {
    throw new CommandValidationError('add_circle', 'the centre and rim must be distinct points');
  }
  const centerPoint = requireDraftingPoint(document, center, 'add_circle');
  const rimPoint = requireDraftingPoint(document, rim, 'add_circle');

  const radius = Math.hypot(rimPoint.x - centerPoint.x, rimPoint.y - centerPoint.y);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS) {
    throw new CommandValidationError('add_circle', `the radius must be at least ${MIN_RADIUS} mm`);
  }
  if (command.params.piece !== undefined) {
    requirePiece(document, command.params.piece, 'add_circle');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const role = roleFromParams(command.params.role, command.params.construction);
  const circle: CircleEntity = {
    id: command.id,
    kind: 'circle',
    center,
    rim,
    ...(command.params.piece === undefined ? {} : { piece: command.params.piece }),
    ...(role === undefined ? {} : { role }),
    construction: role === 'construction',
  };

  return {
    document: { ...document, entities: [...document.entities, circle] },
    inverse: deleteEntityCommand(command.id),
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
