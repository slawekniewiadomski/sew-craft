import {
  allPoints,
  constraintEntityIds,
  getConstraint,
  getEntity,
  getSeam,
  seamForEdge,
} from './document.js';
import { solve } from './solver.js';
import type { SolveOptions, SolveResult } from './solver.js';
import {
  CONSTRAINT_TYPES,
  type Constraint,
  type ConstraintType,
  type CurveEntity,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Seam,
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
}

export interface RemoveConstraintParams {
  id: EntityId;
}

export interface AddSeamAllowanceParams {
  edge: EntityId;
  width?: number;
}

export interface RemoveSeamAllowanceParams {
  id: EntityId;
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
  | { id: EntityId; type: 'remove_constraint'; params: RemoveConstraintParams; issuedAt?: string }
  | { id: EntityId; type: 'add_seam_allowance'; params: AddSeamAllowanceParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'remove_seam_allowance';
      params: RemoveSeamAllowanceParams;
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

export class CommandValidationError extends Error {
  readonly commandType: CommandType;

  constructor(commandType: CommandType, message: string) {
    super(`[${commandType}] ${message}`);
    this.name = 'CommandValidationError';
    this.commandType = commandType;
  }
}

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
    case 'delete_entity':
      return applyDeleteEntity(document, command);
    case 'add_constraint':
      return applyAddConstraint(document, command);
    case 'remove_constraint':
      return applyRemoveConstraint(document, command);
    case 'add_seam_allowance':
      return applyAddSeamAllowance(document, command);
    case 'remove_seam_allowance':
      return applyRemoveSeamAllowance(document, command);
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
  const result = solve(allPoints(document), document.constraints, options);
  if (!result.converged) {
    return { document, result };
  }

  const entities = document.entities.map((entity): typeof entity => {
    if (entity.kind !== 'point') return entity;
    // `solve` returns a coordinate for every point, fixed ones included.
    const coordinate = result.coordinates.get(entity.id)!;
    return { ...entity, x: coordinate.x, y: coordinate.y };
  });

  return { document: { ...document, entities }, result };
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
  requirePoint(document, start, type);
  requirePoint(document, end, type);
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
    requirePoint(document, id, 'add_curve');
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

function applyDeleteEntity(
  document: PatternDocument,
  command: CommandOf<'delete_entity'>,
): CommandApplication {
  const { id } = command.params;
  if (getEntity(document, id) === undefined) {
    return noOp(document);
  }

  const entities = document.entities.filter((entity) => entity.id !== id);
  const constraints = document.constraints.filter(
    (constraint) => !constraintEntityIds(constraint).includes(id),
  );
  const seams = document.seams.filter((seam) => seam.edge !== id);

  // Restoring the entity plus its cascade-removed constraints and seams is not a
  // single command, so undo relies on the journal's snapshot.
  return { document: { ...document, entities, constraints, seams }, inverse: null };
}

function applyAddConstraint(
  document: PatternDocument,
  command: CommandOf<'add_constraint'>,
): CommandApplication {
  const { type, entities, value } = command.params;
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
    requirePoint(document, id, 'add_constraint');
  }

  if (type === 'distance' && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
    throw new CommandValidationError('add_constraint', 'distance requires a finite value > 0');
  }
  if (type === 'angle' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new CommandValidationError('add_constraint', 'angle requires a finite value');
  }

  if (getConstraint(document, command.id) !== undefined) {
    return noOp(document);
  }

  const constraint = buildConstraint(command.id, type, entities, value);

  return {
    document: { ...document, constraints: [...document.constraints, constraint] },
    inverse: { id: command.id, type: 'remove_constraint', params: { id: command.id } },
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

  const constraints = document.constraints.filter((candidate) => candidate.id !== id);

  return {
    document: { ...document, constraints },
    inverse: { id: constraint.id, type: 'add_constraint', params: constraintToParams(constraint) },
  };
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

  const edgeEntity = getEntity(document, edge);
  if (edgeEntity === undefined || edgeEntity.kind === 'point' || edgeEntity.construction) {
    throw new CommandValidationError(
      'add_seam_allowance',
      `edge ${edge} is not a cut line or curve`,
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

  const seam: Seam = { id: command.id, edge, width };

  return {
    document: { ...document, seams: [...document.seams, seam] },
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

  const seams = document.seams.filter((candidate) => candidate.id !== id);

  return {
    document: { ...document, seams },
    inverse: {
      id: seam.id,
      type: 'add_seam_allowance',
      params: { edge: seam.edge, width: seam.width },
    },
  };
}

function buildConstraint(
  id: EntityId,
  type: ConstraintType,
  entities: EntityId[],
  value: number | undefined,
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
      return { id, type, a: a!, b: b!, value: value! };
    case 'angle':
      return { id, type, a: a!, b: b!, c: c!, value: value! };
    case 'equal':
      return { id, type, a1: a!, a2: b!, b1: c!, b2: d! };
  }
}

function constraintToParams(constraint: Constraint): AddConstraintParams {
  switch (constraint.type) {
    case 'coincident':
    case 'horizontal':
    case 'vertical':
      return { type: constraint.type, entities: [constraint.a, constraint.b] };
    case 'point_on_line':
      return { type: 'point_on_line', entities: [constraint.point, constraint.a, constraint.b] };
    case 'distance':
      return { type: 'distance', entities: [constraint.a, constraint.b], value: constraint.value };
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
