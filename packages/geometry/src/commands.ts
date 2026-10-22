import { MIN_BULGE, arcThroughPoints } from './arc.js';
import {
  allPoints,
  constraintEntityIds,
  cornerRounds,
  documentSeams,
  getConstraint,
  getEntity,
  getSeam,
  seamForEdge,
} from './document.js';
import {
  allowanceForEdge,
  pieceById,
  pieceCutVertex,
  pieceForEdge,
  validatePiece,
} from './piece.js';
import {
  cornerRoundGeometry,
  cornerRoundsForEntity,
  isCornerRoundDerived,
  maxCornerRadius,
  regenerateCornerRounds,
} from './corner-round.js';
import { MIN_RADIUS } from './circle.js';
import {
  constraintOffset,
  constraintOrientation,
  createsReferenceCycle,
  measureCutDimension,
  resolveSetValue,
} from './dimension.js';
import { CommandValidationError } from './errors.js';
import { solve } from './solver.js';
import type { SolveOptions, SolveResult } from './solver.js';
import {
  ALLOWANCE_KINDS,
  CONSTRAINT_TYPES,
  DIMENSION_ORIENTATIONS,
  SEAM_SIDES,
  seamSide,
  type Allowance,
  type AllowanceKind,
  type ArcEntity,
  type Constraint,
  type ConstraintType,
  type CornerRound,
  type CircleEntity,
  type CurveEntity,
  type CutAnchor,
  type DerivedDistanceConstraint,
  type DimensionOrientation,
  type DistanceConstraint,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type Seam,
  type SeamSide,
} from './types.js';

/** Seam allowance applied to an edge when the command omits an explicit width. */
export const DEFAULT_SEAM_ALLOWANCE = 10;

export interface AddPointParams {
  x: number;
  y: number;
  construction?: boolean;
}

export interface MovePointParams {
  id: EntityId;
  x: number;
  y: number;
}

export interface AddLineParams {
  start: EntityId;
  end: EntityId;
  construction?: boolean;
}

export interface AddCurveParams {
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
  construction?: boolean;
}

export interface AddArcParams {
  start: EntityId;
  end: EntityId;
  through: EntityId;
  construction?: boolean;
}

export interface AddCircleParams {
  center: EntityId;
  rim: EntityId;
  construction?: boolean;
}

export interface AddConstructionLineParams {
  start: EntityId;
  end: EntityId;
}

export interface SetConstructionParams {
  id: EntityId;
  construction: boolean;
}

export interface DeleteEntityParams {
  id: EntityId;
}

export interface AddConstraintParams {
  type: ConstraintType;
  entities: EntityId[];
  value?: number;
  /** Source dimension id for a `distance` constraint; exclusive with `value`. */
  reference?: EntityId;
  /** Measurement axis for `distance` constraints; ignored for other types. */
  orientation?: DimensionOrientation;
  /** Placement offset for `distance` constraints; ignored for other types. */
  offset?: number;
}

export interface UpdateConstraintParams {
  id: EntityId;
  /** A number sets the value; `null` clears a distance to driven. */
  value?: number | null;
  /** A source dimension id links; `null` unlinks and keeps the current value. */
  reference?: EntityId | null;
  orientation?: DimensionOrientation;
  offset?: number;
}

export interface RemoveConstraintParams {
  id: EntityId;
}

export interface AddSeamAllowanceParams {
  edge: EntityId;
  width?: number;
  side?: SeamSide;
}

export interface RemoveSeamAllowanceParams {
  id: EntityId;
}

export interface SetSeamAllowanceParams {
  id: EntityId;
  width?: number;
  side?: SeamSide;
}

export interface AddCornerRoundParams {
  first: EntityId;
  second: EntityId;
  radius: number;
}

export interface SetCornerRoundRadiusParams {
  id: EntityId;
  radius: number;
}

export interface RemoveCornerRoundParams {
  id: EntityId;
}

export interface CreatePieceParams {
  /** Ordered closed loop of cut line/curve/arc ids. */
  edges: EntityId[];
  name?: string;
  quantity?: number;
}

export interface UpdatePieceParams {
  id: EntityId;
  /** A string renames; `null` clears the name. */
  name?: string | null;
  /** A positive integer sets the cut quantity; `null` clears it (defaults to 1). */
  quantity?: number | null;
}

export interface DeletePieceParams {
  id: EntityId;
}

export interface SetPieceAllowanceParams {
  piece: EntityId;
  edge: EntityId;
  /** Finished width in millimetres; required unless `remove` is true. */
  width?: number;
  kind?: AllowanceKind;
  /** Remove the edge's allowance entirely. */
  remove?: boolean;
}

export interface AddDerivedDimensionParams {
  piece: EntityId;
  a: CutAnchor;
  b: CutAnchor;
  orientation?: DimensionOrientation;
  offset?: number;
}

export type SolveParams = Record<string, never>;

/**
 * Every mutation is a serializable command. The command `id` is also the id of
 * the entity/constraint it creates, which is what makes `applyCommand`
 * idempotent: re-applying a command whose product already exists is a no-op.
 */
export type Command =
  | { id: EntityId; type: 'add_point'; params: AddPointParams; issuedAt?: string }
  | { id: EntityId; type: 'move_point'; params: MovePointParams; issuedAt?: string }
  | { id: EntityId; type: 'add_line'; params: AddLineParams; issuedAt?: string }
  | { id: EntityId; type: 'add_curve'; params: AddCurveParams; issuedAt?: string }
  | { id: EntityId; type: 'add_arc'; params: AddArcParams; issuedAt?: string }
  | { id: EntityId; type: 'add_circle'; params: AddCircleParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'add_construction_line';
      params: AddConstructionLineParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_construction';
      params: SetConstructionParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'delete_entity'; params: DeleteEntityParams; issuedAt?: string }
  | { id: EntityId; type: 'add_constraint'; params: AddConstraintParams; issuedAt?: string }
  | { id: EntityId; type: 'update_constraint'; params: UpdateConstraintParams; issuedAt?: string }
  | { id: EntityId; type: 'remove_constraint'; params: RemoveConstraintParams; issuedAt?: string }
  | { id: EntityId; type: 'add_seam_allowance'; params: AddSeamAllowanceParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'remove_seam_allowance';
      params: RemoveSeamAllowanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_seam_allowance';
      params: SetSeamAllowanceParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'add_corner_round'; params: AddCornerRoundParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'set_corner_round_radius';
      params: SetCornerRoundRadiusParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'remove_corner_round';
      params: RemoveCornerRoundParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'create_piece'; params: CreatePieceParams; issuedAt?: string }
  | { id: EntityId; type: 'update_piece'; params: UpdatePieceParams; issuedAt?: string }
  | { id: EntityId; type: 'delete_piece'; params: DeletePieceParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'set_piece_allowance';
      params: SetPieceAllowanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'add_derived_dimension';
      params: AddDerivedDimensionParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'solve'; params: SolveParams; issuedAt?: string };

export type CommandType = Command['type'];

type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

export interface CommandApplication {
  document: PatternDocument;
  /** The command that undoes this one, or `null` when undo needs a snapshot. */
  inverse: Command | null;
}

export interface SolvedDocument {
  document: PatternDocument;
  result: SolveResult;
}

export interface ExecuteResult {
  document: PatternDocument;
  inverse: Command | null;
  solveResult: SolveResult;
}

export { CommandValidationError } from './errors.js';

export class CommandExecutionError extends Error {
  readonly commandType: CommandType;
  readonly iterations: number;
  readonly residualNorm: number;

  constructor(commandType: CommandType, result: SolveResult) {
    super(
      `[${commandType}] solver did not converge (residual ${result.residualNorm}, iterations ${result.iterations})`,
    );
    this.name = 'CommandExecutionError';
    this.commandType = commandType;
    this.iterations = result.iterations;
    this.residualNorm = result.residualNorm;
  }
}

const CONSTRAINT_ARITY: Record<ConstraintType, number> = {
  coincident: 2,
  horizontal: 2,
  vertical: 2,
  point_on_line: 3,
  distance: 2,
  angle: 3,
  equal: 4,
};

/**
 * Apply a command to a document without solving. Pure: the input document is
 * never mutated, validation failures throw before any new document is built, and
 * re-applying an already-applied command returns the document unchanged.
 */
export function applyCommand(document: PatternDocument, command: Command): CommandApplication {
  switch (command.type) {
    case 'add_point':
      return applyAddPoint(document, command);
    case 'move_point':
      return applyMovePoint(document, command);
    case 'add_line':
      return applyAddLine(document, command, command.params.construction ?? false, 'add_line');
    case 'add_construction_line':
      return applyAddLine(document, command, true, 'add_construction_line');
    case 'set_construction':
      return applySetConstruction(document, command);
    case 'add_curve':
      return applyAddCurve(document, command);
    case 'add_arc':
      return applyAddArc(document, command);
    case 'add_circle':
      return applyAddCircle(document, command);
    case 'delete_entity':
      return applyDeleteEntity(document, command);
    case 'add_constraint':
      return applyAddConstraint(document, command);
    case 'update_constraint':
      return applyUpdateConstraint(document, command);
    case 'remove_constraint':
      return applyRemoveConstraint(document, command);
    case 'add_seam_allowance':
      return applyAddSeamAllowance(document, command);
    case 'remove_seam_allowance':
      return applyRemoveSeamAllowance(document, command);
    case 'set_seam_allowance':
      return applySetSeamAllowance(document, command);
    case 'add_corner_round':
      return applyAddCornerRound(document, command);
    case 'set_corner_round_radius':
      return applySetCornerRoundRadius(document, command);
    case 'remove_corner_round':
      return applyRemoveCornerRound(document, command);
    case 'create_piece':
      return applyCreatePiece(document, command);
    case 'update_piece':
      return applyUpdatePiece(document, command);
    case 'delete_piece':
      return applyDeletePiece(document, command);
    case 'set_piece_allowance':
      return applySetPieceAllowance(document, command);
    case 'add_derived_dimension':
      return applyAddDerivedDimension(document, command);
    case 'solve':
      return noOp(document);
  }
}

/**
 * Run the solver over a document and write the solved coordinates back into a
 * new document. Immutable, and a no-op when the solver does not converge.
 */
export function solveDocument(
  document: PatternDocument,
  options: SolveOptions = {},
): SolvedDocument {
  // Derived cut dimensions measure generated geometry and never reach the solver.
  const constraints = document.constraints.filter(
    (constraint) => constraint.type !== 'derived_distance',
  );
  const result = solve(allPoints(document), constraints, options);
  if (!result.converged) {
    return { document, result };
  }

  const entities = document.entities.map((entity): typeof entity => {
    if (entity.kind !== 'point') return entity;
    // `solve` returns a coordinate for every point, fixed ones included.
    const coordinate = result.coordinates.get(entity.id)!;
    return { ...entity, x: coordinate.x, y: coordinate.y };
  });

  return { document: regenerateCornerRounds({ ...document, entities }), result };
}

/**
 * Apply a command and solve the result. Throws `CommandExecutionError` (leaving
 * the input document untouched) when the solver does not converge.
 */
export function executeCommand(
  document: PatternDocument,
  command: Command,
  options: SolveOptions = {},
): ExecuteResult {
  const application = applyCommand(document, command);
  const solved = solveDocument(application.document, options);

  if (!solved.result.converged) {
    throw new CommandExecutionError(command.type, solved.result);
  }

  return { document: solved.document, inverse: application.inverse, solveResult: solved.result };
}

function noOp(document: PatternDocument): CommandApplication {
  return { document, inverse: null };
}

function deleteEntityCommand(id: EntityId): Command {
  return { id, type: 'delete_entity', params: { id } };
}

function requirePoint(document: PatternDocument, id: EntityId, type: CommandType): PointEntity {
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError(type, `unknown entity: ${id}`);
  }
  if (entity.kind !== 'point') {
    throw new CommandValidationError(type, `entity ${id} is a ${entity.kind}, expected a point`);
  }
  return entity;
}

/** A point the user may attach new geometry to; derived points are read-only. */
function requireDraftingPoint(
  document: PatternDocument,
  id: EntityId,
  type: CommandType,
): PointEntity {
  const point = requirePoint(document, id, type);
  if (isCornerRoundDerived(document, id)) {
    throw new CommandValidationError(
      type,
      'This point is derived by a corner round; edit the radius.',
    );
  }
  return point;
}

function requireLine(document: PatternDocument, id: EntityId, type: CommandType): LineEntity {
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError(type, `unknown entity: ${id}`);
  }
  if (entity.kind !== 'line') {
    throw new CommandValidationError(type, `entity ${id} is a ${entity.kind}, expected a line`);
  }
  return entity;
}

/** The single point two distinct lines share, or `null` when they share none. */
function sharedCorner(first: LineEntity, second: LineEntity): EntityId | null {
  const shared = [first.start, first.end].filter((id) => id === second.start || id === second.end);
  return shared.length === 1 ? shared[0]! : null;
}

/** Millimetre text for an error message, rounded to the field precision. */
function radiusText(radius: number): string {
  return String(Math.round(radius * 1000) / 1000);
}

function applyAddPoint(
  document: PatternDocument,
  command: CommandOf<'add_point'>,
): CommandApplication {
  const { x, y } = command.params;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CommandValidationError('add_point', 'x and y must be finite numbers');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const point: PointEntity = {
    id: command.id,
    kind: 'point',
    x,
    y,
    construction: command.params.construction ?? false,
    fixed: false,
  };

  return {
    document: { ...document, entities: [...document.entities, point] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyMovePoint(
  document: PatternDocument,
  command: CommandOf<'move_point'>,
): CommandApplication {
  const { id, x, y } = command.params;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CommandValidationError('move_point', 'x and y must be finite numbers');
  }

  const point = requirePoint(document, id, 'move_point');
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

function applyAddLine(
  document: PatternDocument,
  command: { id: EntityId; params: AddConstructionLineParams },
  construction: boolean,
  type: CommandType,
): CommandApplication {
  const { start, end } = command.params;
  requireDraftingPoint(document, start, type);
  requireDraftingPoint(document, end, type);
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const line: LineEntity = { id: command.id, kind: 'line', start, end, construction };

  return {
    document: { ...document, entities: [...document.entities, line] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applySetConstruction(
  document: PatternDocument,
  command: CommandOf<'set_construction'>,
): CommandApplication {
  const { id, construction } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('set_construction', `unknown entity: ${id}`);
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
  if (entity.construction === construction) {
    return noOp(document);
  }

  const entities = document.entities.map((candidate): typeof candidate =>
    candidate.id === id ? { ...candidate, construction } : candidate,
  );

  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'set_construction',
      params: { id, construction: entity.construction },
    },
  };
}

function applyAddCurve(
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
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const curve: CurveEntity = {
    id: command.id,
    kind: 'curve',
    p0,
    p1,
    p2,
    p3,
    construction: command.params.construction ?? false,
  };

  return {
    document: { ...document, entities: [...document.entities, curve] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyAddArc(document: PatternDocument, command: CommandOf<'add_arc'>): CommandApplication {
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

  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const arc: ArcEntity = {
    id: command.id,
    kind: 'arc',
    start,
    end,
    through,
    construction: command.params.construction ?? false,
  };

  return {
    document: { ...document, entities: [...document.entities, arc] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyAddCircle(
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
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const circle: CircleEntity = {
    id: command.id,
    kind: 'circle',
    center,
    rim,
    construction: command.params.construction ?? false,
  };

  return {
    document: { ...document, entities: [...document.entities, circle] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyDeleteEntity(
  document: PatternDocument,
  command: CommandOf<'delete_entity'>,
): CommandApplication {
  const { id } = command.params;
  if (getEntity(document, id) === undefined) {
    return noOp(document);
  }

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

  const entities = working.entities.filter((entity) => entity.id !== id);
  const removedPieceIds = new Set(
    working.pieces.filter((piece) => piece.edges.includes(id)).map((piece) => piece.id),
  );
  const pieces = working.pieces.filter((piece) => !removedPieceIds.has(piece.id));
  const constraints = captureBrokenDependents(
    working.constraints,
    working.constraints.filter(
      (constraint) =>
        !constraintEntityIds(constraint).includes(id) &&
        !(constraint.type === 'derived_distance' && removedPieceIds.has(constraint.piece)),
    ),
  );
  const seams = documentSeams(working).filter((seam) => seam.edge !== id);

  // Restoring the entity plus its cascade-removed constraints and seams is not a
  // single command, so undo relies on the journal's snapshot.
  return { document: { ...working, entities, constraints, pieces, seams }, inverse: null };
}

/**
 * Keep a dependent honest when its source disappears: record the value it last
 * drove with, keep the dangling `reference`, and leave the constraint in place.
 * Broken dependents are never deleted as a side effect.
 */
function captureBrokenDependents(previous: Constraint[], next: Constraint[]): Constraint[] {
  return next.map((constraint) => {
    if (constraint.type !== 'distance' || constraint.reference === undefined) return constraint;
    const before = resolveSetValue(previous, constraint);
    if (before === null || resolveSetValue(next, constraint) !== null) return constraint;
    return { ...constraint, lastKnownValue: before };
  });
}

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

function applyAddConstraint(
  document: PatternDocument,
  command: CommandOf<'add_constraint'>,
): CommandApplication {
  const { type, entities, value, reference, orientation, offset } = command.params;
  if (!CONSTRAINT_TYPES.includes(type)) {
    throw new CommandValidationError('add_constraint', `unknown constraint type: ${String(type)}`);
  }

  const arity = CONSTRAINT_ARITY[type];
  if (entities.length !== arity) {
    throw new CommandValidationError(
      'add_constraint',
      `${type} needs ${arity} entities, got ${entities.length}`,
    );
  }
  for (const id of entities) {
    requireDraftingPoint(document, id, 'add_constraint');
  }

  if (
    type === 'distance' &&
    value !== undefined &&
    (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
  ) {
    throw new CommandValidationError(
      'add_constraint',
      'distance requires a finite value > 0 when provided',
    );
  }
  if (type === 'angle' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new CommandValidationError('add_constraint', 'angle requires a finite value');
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

  if (getConstraint(document, command.id) !== undefined) {
    return noOp(document);
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
    value,
    orientation,
    offset,
    reference,
    resolved,
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
function applyUpdateConstraint(
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

  if (value === null) {
    if (constraint.type !== 'distance') {
      throw new CommandValidationError(
        'update_constraint',
        'only distance constraints can be cleared to driven',
      );
    }
  } else if (value !== undefined) {
    if (constraint.type === 'distance' && (!Number.isFinite(value) || value <= 0)) {
      throw new CommandValidationError('update_constraint', 'distance requires a finite value > 0');
    }
    if (constraint.type === 'angle' && !Number.isFinite(value)) {
      throw new CommandValidationError('update_constraint', 'angle requires a finite value');
    }
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

  const updated = updatedConstraint(document, constraint, value, reference, orientation, offset);
  if (updated === null) {
    return noOp(document);
  }

  const constraints = document.constraints.map((candidate) =>
    candidate.id === id ? updated.constraint : candidate,
  );

  return {
    document: {
      ...document,
      constraints: captureBrokenDependents(document.constraints, constraints),
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
  value: number | null | undefined,
  reference: EntityId | null | undefined,
  orientation: DimensionOrientation | undefined,
  offset: number | undefined,
): UpdatedConstraint | null {
  if (constraint.type === 'angle') {
    // Validation rejects presentation fields and `null` for angles, so a value is present.
    const nextValue = value!;
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

function applyRemoveConstraint(
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

function requireSeamSide(
  commandType: 'add_seam_allowance' | 'set_seam_allowance',
  side: unknown,
): SeamSide {
  if (!SEAM_SIDES.includes(side as SeamSide)) {
    throw new CommandValidationError(commandType, "side must be 'left' or 'right'");
  }
  return side as SeamSide;
}

function applyAddSeamAllowance(
  document: PatternDocument,
  command: CommandOf<'add_seam_allowance'>,
): CommandApplication {
  const { edge } = command.params;
  const width = command.params.width ?? DEFAULT_SEAM_ALLOWANCE;
  if (!Number.isFinite(width) || width <= 0) {
    throw new CommandValidationError(
      'add_seam_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const side =
    command.params.side === undefined
      ? 'left'
      : requireSeamSide('add_seam_allowance', command.params.side);

  const edgeEntity = getEntity(document, edge);
  if (edgeEntity === undefined || edgeEntity.kind === 'point' || edgeEntity.construction) {
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

function applyRemoveSeamAllowance(
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

function applySetSeamAllowance(
  document: PatternDocument,
  command: CommandOf<'set_seam_allowance'>,
): CommandApplication {
  const { id, width, side: requestedSide } = command.params;
  if (width === undefined && requestedSide === undefined) {
    throw new CommandValidationError('set_seam_allowance', 'width or side is required');
  }
  if (width !== undefined && (!Number.isFinite(width) || width <= 0)) {
    throw new CommandValidationError(
      'set_seam_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const side =
    requestedSide === undefined ? undefined : requireSeamSide('set_seam_allowance', requestedSide);

  const seam = getSeam(document, id);
  if (seam === undefined) {
    throw new CommandValidationError('set_seam_allowance', `seam ${id} does not exist`);
  }

  const nextWidth = width ?? seam.width;
  const nextSide = side ?? seamSide(seam);
  if (seam.width === nextWidth && seamSide(seam) === nextSide) {
    return noOp(document);
  }

  const seams = documentSeams(document).map((candidate) =>
    candidate.id === id
      ? { ...candidate, width: nextWidth, ...(side === undefined ? {} : { side }) }
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

/** The original point at a line end, following one level of corner-round trim. */
function originalAnchor(document: PatternDocument, lineId: EntityId, endpoint: EntityId): EntityId {
  const round = cornerRounds(document).find((candidate) =>
    candidate.ends.some((end) => end.line === lineId && end.tangent === endpoint),
  );
  return round?.corner ?? endpoint;
}

/**
 * Round a corner between two lines. The selected lines are trimmed to their
 * tangent points, the arc and its control points are derived, and the sharp
 * corner stays as a construction point so existing dimensions keep driving it.
 */
function applyAddCornerRound(
  document: PatternDocument,
  command: CommandOf<'add_corner_round'>,
): CommandApplication {
  const { first, second, radius } = command.params;
  if (cornerRounds(document).some((round) => round.id === command.id)) {
    return noOp(document);
  }

  const lineA = requireLine(document, first, 'add_corner_round');
  const lineB = requireLine(document, second, 'add_corner_round');
  if (first === second) {
    throw new CommandValidationError('add_corner_round', 'Pick two different lines.');
  }

  // A committed round trims both lines away from the shared corner, so the
  // corner id is no longer an endpoint. The round itself is the evidence.
  const sharedRound = cornerRounds(document).find(
    (round) =>
      round.ends.some((end) => end.line === first) && round.ends.some((end) => end.line === second),
  );
  if (sharedRound !== undefined) {
    throw new CommandValidationError('add_corner_round', 'This corner is already rounded.');
  }

  const corner = sharedCorner(lineA, lineB);
  if (corner === null) {
    const shared = [lineA.start, lineA.end].filter((id) => id === lineB.start || id === lineB.end);
    throw new CommandValidationError(
      'add_corner_round',
      shared.length === 0 ? 'The lines must meet at a corner.' : 'Pick two different lines.',
    );
  }
  if (cornerRounds(document).some((round) => round.corner === corner)) {
    throw new CommandValidationError('add_corner_round', 'This corner is already rounded.');
  }
  if (lineA.construction !== lineB.construction) {
    throw new CommandValidationError(
      'add_corner_round',
      'Both lines must be cut edges or both construction.',
    );
  }
  if (seamForEdge(document, first) !== undefined || seamForEdge(document, second) !== undefined) {
    throw new CommandValidationError('add_corner_round', 'Remove the seam allowance first.');
  }
  if (pieceForEdge(document, first) !== undefined || pieceForEdge(document, second) !== undefined) {
    throw new CommandValidationError('add_corner_round', 'Remove the piece first.');
  }

  const meeting = document.entities.filter(
    (entity) =>
      entity.kind === 'line' &&
      entity.construction === lineA.construction &&
      (entity.start === corner || entity.end === corner),
  );
  if (meeting.length > 2) {
    throw new CommandValidationError(
      'add_corner_round',
      'The corner is shared by more than two edges of this kind.',
    );
  }

  const anchorA = originalAnchor(document, first, lineA.start === corner ? lineA.end : lineA.start);
  const anchorB = originalAnchor(
    document,
    second,
    lineB.start === corner ? lineB.end : lineB.start,
  );
  const geometry = cornerRoundGeometry(document, corner, anchorA, anchorB, radius);
  if (geometry.geometry === null) {
    throw new CommandValidationError('add_corner_round', geometry.error);
  }

  const tentative: CornerRound = {
    id: command.id,
    corner,
    ends: [
      { line: first, anchor: anchorA, tangent: `${command.id}:a` },
      { line: second, anchor: anchorB, tangent: `${command.id}:b` },
    ],
    radius,
    arc: `${command.id}:arc`,
    controls: [`${command.id}:c1`, `${command.id}:c2`],
    cornerConstruction: false,
  };
  const maximum = maxCornerRadius(document, tentative);
  if (maximum === null) {
    throw new CommandValidationError('add_corner_round', 'The corner cannot be rounded.');
  }
  if (radius > maximum + 1e-9) {
    throw new CommandValidationError(
      'add_corner_round',
      `Radius ${radiusText(radius)} mm is too large for these lines; the maximum is ${radiusText(maximum)} mm.`,
    );
  }

  const derivedIds = [
    tentative.ends[0].tangent,
    tentative.ends[1].tangent,
    tentative.controls[0],
    tentative.controls[1],
    tentative.arc,
  ];
  for (const id of derivedIds) {
    if (getEntity(document, id) !== undefined) {
      throw new CommandValidationError('add_corner_round', `Derived entity id "${id}" is in use.`);
    }
  }

  const cornerEntity = requirePoint(document, corner, 'add_corner_round');
  const construction = lineA.construction;
  const entities: Entity[] = document.entities.map((entity) => {
    if (entity.kind === 'line' && entity.id === first) {
      return entity.start === corner
        ? { ...entity, start: tentative.ends[0].tangent }
        : { ...entity, end: tentative.ends[0].tangent };
    }
    if (entity.kind === 'line' && entity.id === second) {
      return entity.start === corner
        ? { ...entity, start: tentative.ends[1].tangent }
        : { ...entity, end: tentative.ends[1].tangent };
    }
    if (entity.id === corner) {
      return { ...cornerEntity, construction: true };
    }
    return entity;
  });

  entities.push(
    {
      id: tentative.ends[0].tangent,
      kind: 'point',
      x: geometry.geometry.tangentA.x,
      y: geometry.geometry.tangentA.y,
      construction,
      fixed: true,
    },
    {
      id: tentative.ends[1].tangent,
      kind: 'point',
      x: geometry.geometry.tangentB.x,
      y: geometry.geometry.tangentB.y,
      construction,
      fixed: true,
    },
    {
      id: tentative.controls[0],
      kind: 'point',
      x: geometry.geometry.control1.x,
      y: geometry.geometry.control1.y,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.controls[1],
      kind: 'point',
      x: geometry.geometry.control2.x,
      y: geometry.geometry.control2.y,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.arc,
      kind: 'curve',
      p0: tentative.ends[0].tangent,
      p1: tentative.controls[0],
      p2: tentative.controls[1],
      p3: tentative.ends[1].tangent,
      construction,
    },
  );

  const round: CornerRound = { ...tentative, cornerConstruction: cornerEntity.construction };

  return {
    document: {
      ...document,
      entities,
      cornerRounds: [...cornerRounds(document), round],
    },
    inverse: {
      id: `${command.id}:remove`,
      type: 'remove_corner_round',
      params: { id: command.id },
    },
  };
}

/** Change the radius of an existing round and regenerate its derived geometry. */
function applySetCornerRoundRadius(
  document: PatternDocument,
  command: CommandOf<'set_corner_round_radius'>,
): CommandApplication {
  const { id, radius } = command.params;
  const round = cornerRounds(document).find((candidate) => candidate.id === id);
  if (round === undefined) {
    throw new CommandValidationError('set_corner_round_radius', `unknown corner round: ${id}`);
  }
  if (!Number.isFinite(radius) || radius < 0.001) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'Radius must be a finite number of at least 0.001 mm.',
    );
  }
  if (round.radius === radius) {
    return noOp(document);
  }

  const maximum = maxCornerRadius(document, round);
  if (maximum === null) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'The corner can no longer be rounded.',
    );
  }
  if (radius > maximum + 1e-9) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      `Radius ${radiusText(radius)} mm is too large for these lines; the maximum is ${radiusText(maximum)} mm.`,
    );
  }

  const updated: CornerRound = { ...round, radius };
  const documentWithRadius: PatternDocument = {
    ...document,
    cornerRounds: cornerRounds(document).map((candidate) =>
      candidate.id === id ? updated : candidate,
    ),
  };

  return {
    document: regenerateCornerRounds(documentWithRadius),
    inverse: {
      id: `${command.id}:restore`,
      type: 'set_corner_round_radius',
      params: { id, radius: round.radius },
    },
  };
}

/** Restore the sharp corner, delete the derived geometry and drop the feature. */
function applyRemoveCornerRound(
  document: PatternDocument,
  command: CommandOf<'remove_corner_round'>,
): CommandApplication {
  const { id } = command.params;
  const round = cornerRounds(document).find((candidate) => candidate.id === id);
  if (round === undefined) {
    return noOp(document);
  }

  const removed = new Set<EntityId>([
    round.arc,
    ...round.controls,
    ...round.ends.map((end) => end.tangent),
  ]);

  const entities = document.entities
    .filter((entity) => !removed.has(entity.id))
    .map((entity): Entity => {
      if (entity.kind === 'line') {
        const end = round.ends.find((candidate) => candidate.line === entity.id);
        if (end !== undefined) {
          if (entity.start === end.tangent) return { ...entity, start: round.corner };
          if (entity.end === end.tangent) return { ...entity, end: round.corner };
        }
      }
      if (entity.kind === 'point' && entity.id === round.corner) {
        return { ...entity, construction: round.cornerConstruction };
      }
      return entity;
    });

  const constraints = document.constraints.filter(
    (constraint) => !constraintEntityIds(constraint).some((entityId) => removed.has(entityId)),
  );
  const seams = documentSeams(document).filter((seam) => !removed.has(seam.edge));
  const removedPieceIds = new Set(
    document.pieces
      .filter((piece) => piece.edges.some((edge) => removed.has(edge)))
      .map((piece) => piece.id),
  );

  return {
    document: {
      ...document,
      entities,
      constraints: constraints.filter(
        (constraint) =>
          !(constraint.type === 'derived_distance' && removedPieceIds.has(constraint.piece)),
      ),
      seams,
      pieces: document.pieces.filter((piece) => !removedPieceIds.has(piece.id)),
      cornerRounds: cornerRounds(document).filter((candidate) => candidate.id !== id),
    },
    inverse: {
      id: round.id,
      type: 'add_corner_round',
      params: {
        first: round.ends[0].line,
        second: round.ends[1].line,
        radius: round.radius,
      },
    },
  };
}

/** Reject a quantity that is not a positive integer. */
function requireQuantity(commandType: CommandType, quantity: number | null | undefined): void {
  if (quantity === undefined || quantity === null) return;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CommandValidationError(commandType, 'quantity must be an integer of at least 1');
  }
}

/** Reject an empty or blank piece name; `null` means "clear" and is handled by the caller. */
function requirePieceName(commandType: CommandType, name: string | null | undefined): void {
  if (name === undefined || name === null) return;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new CommandValidationError(commandType, 'name must be a non-empty string');
  }
}

/** Reject an anchor that does not address a vertex of this piece. */
function requireCutAnchor(commandType: CommandType, piece: Piece, anchor: CutAnchor): void {
  if (!piece.edges.includes(anchor.edge)) {
    throw new CommandValidationError(
      commandType,
      `edge ${anchor.edge} is not in piece ${piece.id}`,
    );
  }
  if (anchor.at !== 'start' && anchor.at !== 'end') {
    throw new CommandValidationError(
      commandType,
      `anchor ${String(anchor.at)} must be 'start' or 'end'`,
    );
  }
}

/** Replace one piece in the document, preserving piece order. */
function replacePiece(document: PatternDocument, piece: Piece): PatternDocument {
  return {
    ...document,
    pieces: document.pieces.map((candidate) => (candidate.id === piece.id ? piece : candidate)),
  };
}

/** The kind an allowance effectively has; an omitted kind means `seam`. */
function effectiveKind(allowance: Allowance): AllowanceKind {
  return allowance.kind ?? 'seam';
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

/** Create a piece from one closed loop of existing cut edges. */
function applyCreatePiece(
  document: PatternDocument,
  command: CommandOf<'create_piece'>,
): CommandApplication {
  const { edges, name, quantity } = command.params;
  if (pieceById(document, command.id) !== undefined) {
    return noOp(document);
  }

  requireQuantity('create_piece', quantity);
  requirePieceName('create_piece', name);

  const validation = validatePiece(document, edges);
  if (!validation.ok) {
    throw new CommandValidationError('create_piece', validation.message);
  }

  const piece: Piece = {
    id: command.id,
    edges: [...edges],
    allowances: [],
  };
  if (name !== undefined) piece.name = name.trim();
  if (quantity !== undefined) piece.quantity = quantity;

  return {
    document: { ...document, pieces: [...document.pieces, piece] },
    inverse: { id: command.id, type: 'delete_piece', params: { id: command.id } },
  };
}

/** Rename a piece or change its cut quantity; `null` clears either. */
function applyUpdatePiece(
  document: PatternDocument,
  command: CommandOf<'update_piece'>,
): CommandApplication {
  const { id, name, quantity } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    throw new CommandValidationError('update_piece', `unknown piece: ${id}`);
  }
  if (name === undefined && quantity === undefined) {
    throw new CommandValidationError('update_piece', 'provide name or quantity');
  }

  requirePieceName('update_piece', name);
  requireQuantity('update_piece', quantity);

  const nextName = name === undefined ? piece.name : name === null ? undefined : name.trim();
  const nextQuantity =
    quantity === undefined ? piece.quantity : quantity === null ? undefined : quantity;
  if (nextName === piece.name && nextQuantity === piece.quantity) {
    return noOp(document);
  }

  const next: Piece = { ...piece };
  if (nextName === undefined) delete next.name;
  else next.name = nextName;
  if (nextQuantity === undefined) delete next.quantity;
  else next.quantity = nextQuantity;

  return {
    document: replacePiece(document, next),
    inverse: {
      id: command.id,
      type: 'update_piece',
      params: {
        id,
        name: piece.name ?? null,
        quantity: piece.quantity ?? null,
      },
    },
  };
}

/** Delete a piece and the cut dimensions anchored to it. */
function applyDeletePiece(
  document: PatternDocument,
  command: CommandOf<'delete_piece'>,
): CommandApplication {
  const { id } = command.params;
  if (pieceById(document, id) === undefined) {
    return noOp(document);
  }

  return {
    document: {
      ...document,
      pieces: document.pieces.filter((piece) => piece.id !== id),
      constraints: document.constraints.filter(
        (constraint) => !(constraint.type === 'derived_distance' && constraint.piece === id),
      ),
    },
    // Restoring a piece together with its cut dimensions is not a single command.
    inverse: null,
  };
}

/** Set, change or remove the allowance of one loop edge. */
function applySetPieceAllowance(
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

  if (width === undefined || !Number.isFinite(width) || width <= 0) {
    throw new CommandValidationError(
      'set_piece_allowance',
      'width must be a finite number greater than 0',
    );
  }
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const next: Allowance = { edge, width, ...(kind === undefined ? {} : { kind }) };
  if (
    existing !== undefined &&
    existing.width === width &&
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

/** Add a read-only dimension measuring the cut loop between two loop vertices. */
function applyAddDerivedDimension(
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
  if (a.edge === b.edge && a.at === b.at) {
    throw new CommandValidationError(
      'add_derived_dimension',
      'the two anchors must be different loop vertices',
    );
  }
  if (orientation !== undefined && !DIMENSION_ORIENTATIONS.includes(orientation)) {
    throw new CommandValidationError(
      'add_derived_dimension',
      `unknown dimension orientation: ${String(orientation)}`,
    );
  }
  if (offset !== undefined && !Number.isFinite(offset)) {
    throw new CommandValidationError('add_derived_dimension', 'offset must be a finite number');
  }

  const start = pieceCutVertex(document, piece, a);
  const end = pieceCutVertex(document, piece, b);
  if (start === null || end === null) {
    throw new CommandValidationError(
      'add_derived_dimension',
      'the piece cut loop cannot resolve these anchors',
    );
  }
  if (Math.hypot(end.x - start.x, end.y - start.y) <= 1e-9) {
    throw new CommandValidationError(
      'add_derived_dimension',
      'the two anchors resolve to the same point',
    );
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
  value: number | undefined,
  orientation: DimensionOrientation | undefined,
  offset: number | undefined,
  reference?: EntityId,
  resolvedReference?: number,
): Constraint {
  const [a, b, c, d] = entities;

  switch (type) {
    case 'coincident':
      return { id, type, a: a!, b: b! };
    case 'horizontal':
      return { id, type, a: a!, b: b! };
    case 'vertical':
      return { id, type, a: a!, b: b! };
    case 'point_on_line':
      return { id, type, point: a!, a: b!, b: c! };
    case 'distance':
      return {
        id,
        type,
        a: a!,
        b: b!,
        ...(value === undefined ? {} : { value }),
        ...(reference === undefined ? {} : { reference }),
        ...(resolvedReference === undefined ? {} : { lastKnownValue: resolvedReference }),
        ...(orientation === undefined ? {} : { orientation }),
        ...(offset === undefined ? {} : { offset }),
      };
    case 'angle':
      return { id, type, a: a!, b: b!, c: c!, value: value! };
    case 'equal':
      return { id, type, a1: a!, a2: b!, b1: c!, b2: d! };
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
  }
}
