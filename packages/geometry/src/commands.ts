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
  cornerAllowanceForRound,
  pieceById,
  pieceCutLoop,
  pieceForEdge,
  validatePiece,
} from './piece.js';
import { isAnnotation, isConstruction, isCut, roleOf } from './roles.js';
import { DEFAULT_TEXT_SIZE, MAX_TEXT_LENGTH, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from './text.js';
import {
  cornerRoundGeometry,
  cornerRoundsForEntity,
  isCornerRoundDerived,
  lineEndpointAnchor,
  maxCornerRadius,
  regenerateCornerRounds,
} from './corner-round.js';
import { MIN_RADIUS } from './circle.js';
import { effectiveDefaultAllowance, effectivePieceAllowance } from './defaults.js';
import { pointOnEdge } from './mark.js';
import {
  constraintOffset,
  constraintOrientation,
  createsReferenceCycle,
  cutAnchorIssue,
  distanceAnchorIssue,
  isLineAnchor,
  resolveSetValue,
  usesCutEdgeAnchor,
  type CutAnchorIssueReason,
  type DistanceAnchorReason,
} from './dimension.js';
import { CommandValidationError } from './errors.js';
import {
  type ExpressionError,
  evaluateLength,
  evaluateQuantity,
  isExpressionParam,
  resolveParam,
  resolveVariable,
  sameParam,
  type Quantity,
  type VariableScope,
} from './expression.js';
import {
  midpointIssue,
  midpointTargetFor,
  midpointUsedAsSource,
  regenerateMidpoints,
  type MidpointIssue,
} from './midpoint.js';
import { solve } from './solver.js';
import type { SolveOptions, SolveResult } from './solver.js';
import {
  ALLOWANCE_KINDS,
  CONSTRAINT_TYPES,
  DIMENSION_ORIENTATIONS,
  SEAM_SIDES,
  TEXT_ALIGNMENTS,
  seamSide,
  type Allowance,
  type AllowanceKind,
  type AllowancePreset,
  type ArcEntity,
  type Assembly,
  type AssemblyInstance,
  type AssignableRole,
  type Constraint,
  type ConstraintType,
  type CornerAllowance,
  type CornerRound,
  type CircleEntity,
  type CurveEntity,
  type CutAnchor,
  type DerivedDistanceConstraint,
  type DimensionOrientation,
  type DistanceConstraint,
  type Entity,
  type EntityId,
  type EntityRole,
  type LineEntity,
  type MidpointConstraint,
  type NotchMark,
  type Param,
  type PatternDocument,
  type Piece,
  type PieceDefaults,
  type PointEntity,
  type CentreLineMark,
  type Seam,
  type SeamSide,
  type TabRef,
  type Unit,
  type Variable,
  type TextAlignment,
  type TextEntity,
} from './types.js';

/** Seam allowance applied to an edge when the command omits an explicit width. */
export const DEFAULT_SEAM_ALLOWANCE = 10;

/**
 * Validate a millimetre parameter and, for a formula, record what it resolves to
 * right now. Commands only ever store a formula that already resolves, so a read
 * never has to invent a number.
 */
function requireLengthParam(
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

/** The longest assembly name `create_assembly`/`update_assembly` accepts. */
export const MAX_ASSEMBLY_NAME_LENGTH = 80;

/** The longest free-text note a piece stores. */
export const MAX_PIECE_NOTES_LENGTH = 500;

/** The longest fabric name a piece stores. */
export const MAX_PIECE_FABRIC_LENGTH = 120;

export interface AddPointParams {
  x: number;
  y: number;
  /** The piece that contains the point. Required by schema 0.3 commands. */
  piece?: EntityId;
  /** Omitted means cut. */
  role?: EntityRole;
  /** Deprecated alias for `role: 'construction'`. */
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
  piece?: EntityId;
  role?: EntityRole;
  construction?: boolean;
}

export interface AddCurveParams {
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
  piece?: EntityId;
  role?: EntityRole;
  construction?: boolean;
}

export interface AddArcParams {
  start: EntityId;
  end: EntityId;
  through: EntityId;
  piece?: EntityId;
  role?: EntityRole;
  construction?: boolean;
}

export interface AddCircleParams {
  center: EntityId;
  rim: EntityId;
  piece?: EntityId;
  role?: EntityRole;
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
  /** The piece the constraint belongs to. Required by schema 0.3 commands. */
  piece?: EntityId;
  /** A distance's driving value: millimetres or a formula; an angle's radians. */
  value?: ParamInput;
  /** Source dimension id for a `distance` constraint; exclusive with `value`. */
  reference?: EntityId;
  /** Measurement axis for `distance` constraints; ignored for other types. */
  orientation?: DimensionOrientation;
  /** Placement offset for `distance` constraints; ignored for other types. */
  offset?: number;
}

export interface UpdateConstraintParams {
  id: EntityId;
  /** A value or formula sets it; `null` clears a distance to driven. */
  value?: ParamInput | null;
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
  width?: ParamInput;
  side?: SeamSide;
}

export interface RemoveSeamAllowanceParams {
  id: EntityId;
}

export interface SetSeamAllowanceParams {
  id: EntityId;
  width?: ParamInput;
  side?: SeamSide;
}

export interface AddCornerRoundParams {
  first: EntityId;
  second: EntityId;
  radius: ParamInput;
}

export interface SetCornerRoundRadiusParams {
  id: EntityId;
  radius: ParamInput;
}

export interface RemoveCornerRoundParams {
  id: EntityId;
}

/** A formula as a command supplies it: the document records what it resolves to. */
export type ParamInput = number | { expr: string };

export interface SetVariableParams {
  /** Bare slug; omit to mint one from `name`. */
  slug?: string;
  /** Display name; required for a new variable and unique case-insensitively. */
  name?: string;
  /** Defaults to `mm` on creation. */
  unit?: Unit;
  value: ParamInput;
  /** Free text; `null` or empty clears it. */
  comment?: string | null;
}

export interface UpdateVariableParams {
  slug: string;
  name?: string;
  unit?: Unit;
  value?: ParamInput;
  comment?: string | null;
}

export interface RemoveVariableParams {
  slug: string;
}

export interface CreatePieceParams {
  name?: string;
  quantity?: number;
  /** `#rrggbb`; absent means the neutral fallback. */
  color?: string;
  /** Per-piece overrides applied at creation; absent inherits the document. */
  defaults?: PieceDefaults;
}

export interface SetPieceLoopParams {
  piece: EntityId;
  /** Ordered closed chain of cut line/curve/arc edges; empty clears the loop. */
  edges: EntityId[];
  /** Allowance copied onto edges that have none yet; default `'default'`. */
  allowance?: 'default' | 'none' | AllowancePreset;
}

export interface SetRoleParams {
  id: EntityId;
  role: AssignableRole;
}

export interface SetPieceDefaultAllowanceParams {
  piece: EntityId;
  /** `inherit` drops the override, `none` stores an explicit null, `preset` sets one. */
  mode: 'inherit' | 'none' | 'preset';
  /** Finished width in millimetres; required for `preset`. */
  width?: ParamInput;
  /** Omitted means `seam`. */
  kind?: AllowanceKind;
}

export interface CreateAssemblyParams {
  /** Defaults to "Assembly N" by creation index when omitted. */
  name?: string;
}

export interface UpdateAssemblyParams {
  id: EntityId;
  name: string;
}

export interface DeleteAssemblyParams {
  id: EntityId;
}

export interface AddInstanceParams {
  assembly: EntityId;
  piece: EntityId;
  x: number;
  y: number;
  rotation?: number;
  mirrored?: boolean;
}

export interface RemoveInstanceParams {
  assembly: EntityId;
  instance: EntityId;
}

export interface UpdateInstanceParams {
  assembly: EntityId;
  instance: EntityId;
  x?: number;
  y?: number;
  rotation?: number;
  mirrored?: boolean;
}

export interface ReorderTabsParams {
  /** A permutation of the document's current tab refs. */
  tabs: TabRef[];
}

export interface AddTextParams {
  piece: EntityId;
  anchor: EntityId;
  content: string;
  alignment?: TextAlignment;
  rotation?: number;
  fontSize?: number;
  leader?: EntityId;
}

export interface UpdateTextParams {
  id: EntityId;
  content?: string;
  anchor?: EntityId;
  alignment?: TextAlignment;
  rotation?: number;
  fontSize?: number;
  /** `null` removes the leader. */
  leader?: EntityId | null;
}

export interface AddNotchParams {
  piece: EntityId;
  /** The loop edge whose allowance the V cuts into. */
  edge: EntityId;
  /** The snapped point the V is centred on. */
  point: EntityId;
  /** Share of the edge's cut distance; omitted means the default. */
  depth?: number;
}

export interface UpdateNotchParams {
  id: EntityId;
  /** `null` returns the notch to the default share. */
  depth?: number | null;
}

export interface AddCentreLineParams {
  piece: EntityId;
  start: EntityId;
  end: EntityId;
}

export interface UpdateCentreLineParams {
  id: EntityId;
  start?: EntityId;
  end?: EntityId;
}

export interface UpdatePieceParams {
  id: EntityId;
  /** A string renames; `null` clears the name. */
  name?: string | null;
  /** A positive integer sets the cut quantity; `null` clears it (defaults to 1). */
  quantity?: number | null;
  /** Free text, at most 500 characters; `null` or empty clears it. */
  notes?: string | null;
  /** Fabric name, at most 120 characters; `null` or empty clears it. */
  fabric?: string | null;
  /** `#rrggbb`; `null` clears the colour. */
  color?: string | null;
}

export interface DeletePieceParams {
  id: EntityId;
}

export interface SetDefaultAllowanceParams {
  /** Finished width in millimetres; required unless `remove` is true. */
  width?: ParamInput;
  /** Omitted means `seam`. */
  kind?: AllowanceKind;
  /** Clear the default so new pieces start with no allowance. */
  remove?: boolean;
}

export interface SetPieceAllowanceParams {
  piece: EntityId;
  edge: EntityId;
  /** Finished width in millimetres; required unless `remove` is true. */
  width?: ParamInput;
  kind?: AllowanceKind;
  /** Remove the edge's allowance entirely. */
  remove?: boolean;
}

export interface SetPieceCornerAllowanceParams {
  piece: EntityId;
  round: EntityId;
  /** Cut distance in millimetres; required unless `remove` is true. */
  cutWidth?: number;
  /** Remove the corner's own width so it inherits its edges again. */
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
      type: 'set_piece_loop';
      params: SetPieceLoopParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'set_role'; params: SetRoleParams; issuedAt?: string }
  | { id: EntityId; type: 'add_text'; params: AddTextParams; issuedAt?: string }
  | { id: EntityId; type: 'update_text'; params: UpdateTextParams; issuedAt?: string }
  | { id: EntityId; type: 'add_notch'; params: AddNotchParams; issuedAt?: string }
  | { id: EntityId; type: 'update_notch'; params: UpdateNotchParams; issuedAt?: string }
  | { id: EntityId; type: 'add_centre_line'; params: AddCentreLineParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'update_centre_line';
      params: UpdateCentreLineParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_piece_allowance';
      params: SetPieceAllowanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_piece_corner_allowance';
      params: SetPieceCornerAllowanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_default_allowance';
      params: SetDefaultAllowanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'add_derived_dimension';
      params: AddDerivedDimensionParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_piece_default_allowance';
      params: SetPieceDefaultAllowanceParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'set_variable'; params: SetVariableParams; issuedAt?: string }
  | { id: EntityId; type: 'update_variable'; params: UpdateVariableParams; issuedAt?: string }
  | { id: EntityId; type: 'remove_variable'; params: RemoveVariableParams; issuedAt?: string }
  | { id: EntityId; type: 'create_assembly'; params: CreateAssemblyParams; issuedAt?: string }
  | { id: EntityId; type: 'update_assembly'; params: UpdateAssemblyParams; issuedAt?: string }
  | { id: EntityId; type: 'delete_assembly'; params: DeleteAssemblyParams; issuedAt?: string }
  | { id: EntityId; type: 'add_instance'; params: AddInstanceParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'remove_instance';
      params: RemoveInstanceParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'update_instance';
      params: UpdateInstanceParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'reorder_tabs'; params: ReorderTabsParams; issuedAt?: string }
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
      return applyAddLine(
        document,
        command,
        roleFromParams(command.params.role, command.params.construction),
        'add_line',
      );
    case 'add_construction_line':
      return applyAddLine(document, command, 'construction', 'add_construction_line');
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
    case 'set_piece_loop':
      return applySetPieceLoop(document, command);
    case 'set_role':
      return applySetRole(document, command);
    case 'add_text':
      return applyAddText(document, command);
    case 'update_text':
      return applyUpdateText(document, command);
    case 'add_notch':
      return applyAddNotch(document, command);
    case 'update_notch':
      return applyUpdateNotch(document, command);
    case 'add_centre_line':
      return applyAddCentreLine(document, command);
    case 'update_centre_line':
      return applyUpdateCentreLine(document, command);
    case 'set_piece_allowance':
      return applySetPieceAllowance(document, command);
    case 'set_piece_corner_allowance':
      return applySetPieceCornerAllowance(document, command);
    case 'set_default_allowance':
      return applySetDefaultAllowance(document, command);
    case 'add_derived_dimension':
      return applyAddDerivedDimension(document, command);
    case 'set_piece_default_allowance':
      return applySetPieceDefaultAllowance(document, command);
    case 'set_variable':
      return applySetVariable(document, command);
    case 'update_variable':
      return applyUpdateVariable(document, command);
    case 'remove_variable':
      return applyRemoveVariable(document, command);
    case 'create_assembly':
      return applyCreateAssembly(document, command);
    case 'update_assembly':
      return applyUpdateAssembly(document, command);
    case 'delete_assembly':
      return applyDeleteAssembly(document, command);
    case 'add_instance':
      return applyAddInstance(document, command);
    case 'remove_instance':
      return applyRemoveInstance(document, command);
    case 'update_instance':
      return applyUpdateInstance(document, command);
    case 'reorder_tabs':
      return applyReorderTabs(document, command);
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
  // A trimmed line ends at a fixed tangent; its support anchor is the sharp
  // corner, so line-anchored dimensions still see a line that can move.
  const supportAnchors = new Map<EntityId, EntityId>();
  for (const round of cornerRounds(document)) {
    for (const end of round.ends) supportAnchors.set(end.tangent, round.corner);
  }
  const result = solve(
    allPoints(document),
    constraints,
    options,
    document.entities,
    supportAnchors,
    document,
  );
  if (!result.converged) {
    return { document, result };
  }

  const entities = document.entities.map((entity): typeof entity => {
    if (entity.kind !== 'point') return entity;
    // `solve` returns a coordinate for every point, fixed ones included.
    const coordinate = result.coordinates.get(entity.id)!;
    return { ...entity, x: coordinate.x, y: coordinate.y };
  });

  return {
    document: regenerateMidpoints(regenerateCornerRounds({ ...document, entities })),
    result,
  };
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

/** Resolve a command's `role`/legacy `construction` pair to the stored role. */
function roleFromParams(
  role: EntityRole | undefined,
  construction: boolean | undefined,
): EntityRole | undefined {
  if (role === 'construction' || role === 'annotation') return role;
  return construction === true ? 'construction' : undefined;
}

/** Copy an object without the named keys, without leaving unused bindings behind. */
function withoutKeys<T extends object>(value: T, keys: readonly string[]): T {
  const copy = { ...value };
  for (const key of keys) delete (copy as Record<string, unknown>)[key];
  return copy;
}

/** Reject a piece that does not exist; ownership validation needs it. */
function requirePiece(document: PatternDocument, piece: EntityId, type: CommandType): Piece {
  const found = pieceById(document, piece);
  if (found === undefined) {
    throw new CommandValidationError(type, `unknown piece: ${piece}`);
  }
  return found;
}

/**
 * A point a label may anchor on: it must be a point, belong to the same piece and
 * not be derived by a corner round (labels attach to authored geometry).
 */
function requireOwnedPoint(
  document: PatternDocument,
  id: EntityId,
  piece: EntityId,
  type: CommandType,
): PointEntity {
  const point = requirePoint(document, id, type);
  if (point.piece !== undefined && point.piece !== piece) {
    throw new CommandValidationError(type, `point ${id} belongs to another piece`);
  }
  if (isCornerRoundDerived(document, id)) {
    throw new CommandValidationError(type, 'a label cannot anchor on a derived corner point');
  }
  return point;
}

function applyAddPoint(
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

function applyMovePoint(
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

function applyAddLine(
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

function applySetConstruction(
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
function captureBrokenDependents(
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

function applyAddConstraint(
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

function applyAddSeamAllowance(
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

/**
 * Round a corner between two lines. The selected lines are trimmed to their
 * tangent points, the arc and its control points are derived, and the sharp
 * corner stays as a construction point so existing dimensions keep driving it.
 */
function applyAddCornerRound(
  document: PatternDocument,
  command: CommandOf<'add_corner_round'>,
): CommandApplication {
  const { first, second } = command.params;
  const radius = requireLengthParam(document, 'add_corner_round', command.params.radius, 'radius');
  const radiusValue = resolveParam(document, radius);
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
  if (isAnnotation(lineA) || isAnnotation(lineB)) {
    throw new CommandValidationError('add_corner_round', 'Annotation geometry cannot be rounded.');
  }
  if (roleOf(lineA) !== roleOf(lineB)) {
    throw new CommandValidationError('add_corner_round', 'Both lines must share a role.');
  }
  if (seamForEdge(document, first) !== undefined || seamForEdge(document, second) !== undefined) {
    throw new CommandValidationError('add_corner_round', 'Remove the seam allowance first.');
  }

  const meeting = document.entities.filter(
    (entity) =>
      entity.kind === 'line' &&
      isConstruction(entity) === isConstruction(lineA) &&
      (entity.start === corner || entity.end === corner),
  );
  if (meeting.length > 2) {
    throw new CommandValidationError(
      'add_corner_round',
      'The corner is shared by more than two edges of this kind.',
    );
  }

  const anchorA = lineEndpointAnchor(
    document,
    first,
    lineA.start === corner ? lineA.end : lineA.start,
  );
  const anchorB = lineEndpointAnchor(
    document,
    second,
    lineB.start === corner ? lineB.end : lineB.start,
  );
  const geometry = cornerRoundGeometry(document, corner, anchorA, anchorB, radiusValue);
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
    center: `${command.id}:center`,
    cornerConstruction: false,
  };
  const maximum = maxCornerRadius(document, tentative);
  if (maximum === null) {
    throw new CommandValidationError('add_corner_round', 'The corner cannot be rounded.');
  }
  if (radiusValue > maximum + 1e-9) {
    throw new CommandValidationError(
      'add_corner_round',
      `Radius ${radiusText(radiusValue)} mm is too large for these lines; the maximum is ${radiusText(maximum)} mm.`,
    );
  }

  const derivedIds = [
    tentative.ends[0].tangent,
    tentative.ends[1].tangent,
    tentative.controls[0],
    tentative.controls[1],
    tentative.arc,
    tentative.center!,
  ];
  for (const id of derivedIds) {
    if (getEntity(document, id) !== undefined) {
      throw new CommandValidationError('add_corner_round', `Derived entity id "${id}" is in use.`);
    }
  }

  const cornerEntity = requirePoint(document, corner, 'add_corner_round');
  const construction = isConstruction(lineA);
  // The derived geometry belongs to the same piece as the selected lines; an
  // unowned legacy document stays unowned rather than inventing a piece.
  const owner = lineA.piece ?? lineB.piece;
  const ownership = owner === undefined ? {} : { piece: owner };
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
      id: tentative.center!,
      kind: 'point',
      x: geometry.geometry.center.x,
      y: geometry.geometry.center.y,
      ...ownership,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.ends[0].tangent,
      kind: 'point',
      x: geometry.geometry.tangentA.x,
      y: geometry.geometry.tangentA.y,
      ...ownership,
      construction,
      fixed: true,
    },
    {
      id: tentative.ends[1].tangent,
      kind: 'point',
      x: geometry.geometry.tangentB.x,
      y: geometry.geometry.tangentB.y,
      ...ownership,
      construction,
      fixed: true,
    },
    {
      id: tentative.controls[0],
      kind: 'point',
      x: geometry.geometry.control1.x,
      y: geometry.geometry.control1.y,
      ...ownership,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.controls[1],
      kind: 'point',
      x: geometry.geometry.control2.x,
      y: geometry.geometry.control2.y,
      ...ownership,
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
      ...ownership,
      construction,
    },
  );

  const round: CornerRound = { ...tentative, cornerConstruction: isConstruction(cornerEntity) };
  const next: PatternDocument = {
    ...document,
    entities,
    cornerRounds: [...cornerRounds(document), round],
  };

  // A radius that folds a piece's cut line is not a usable round: compare the
  // affected loops so an unrelated pre-existing fold does not block the edit.
  const pieces = document.pieces.filter(
    (piece) => piece.edges.includes(first) && piece.edges.includes(second),
  );
  for (const piece of pieces) {
    const before = pieceCutLoop(document, piece)?.selfIntersections.length ?? 0;
    const after = pieceCutLoop(next, piece)?.selfIntersections.length ?? 0;
    if (after > before) {
      throw new CommandValidationError(
        'add_corner_round',
        'This radius with the current allowance folds the cut line.',
      );
    }
  }

  return {
    document: next,
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
  const { id } = command.params;
  const radius = requireLengthParam(
    document,
    'set_corner_round_radius',
    command.params.radius,
    'radius',
  );
  const radiusValue = resolveParam(document, radius);
  const round = cornerRounds(document).find((candidate) => candidate.id === id);
  if (round === undefined) {
    throw new CommandValidationError('set_corner_round_radius', `unknown corner round: ${id}`);
  }
  if (radiusValue < 0.001) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'Radius must be a finite number of at least 0.001 mm.',
    );
  }
  if (sameParam(round.radius, radius)) {
    return noOp(document);
  }

  const maximum = maxCornerRadius(document, round);
  if (maximum === null) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'The corner can no longer be rounded.',
    );
  }
  if (radiusValue > maximum + 1e-9) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      `Radius ${radiusText(radiusValue)} mm is too large for these lines; the maximum is ${radiusText(maximum)} mm.`,
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
    document: regenerateMidpoints(regenerateCornerRounds(documentWithRadius)),
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
  if (round.center !== undefined) removed.add(round.center);

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
      pieces: document.pieces
        .filter((piece) => !removedPieceIds.has(piece.id))
        .map((piece) =>
          cornerAllowanceForRound(piece, id) === undefined
            ? piece
            : {
                ...piece,
                // The entry was found, so the array exists.
                cornerAllowances: piece.cornerAllowances!.filter((entry) => entry.round !== id),
              },
        ),
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

/** Reject an anchor that does not address a vertex or whole edge of this piece. */
function requireCutAnchor(commandType: CommandType, piece: Piece, anchor: CutAnchor): void {
  if (!piece.edges.includes(anchor.edge)) {
    throw new CommandValidationError(
      commandType,
      `edge ${anchor.edge} is not in piece ${piece.id}`,
    );
  }
  if (anchor.at !== 'start' && anchor.at !== 'end' && anchor.at !== 'edge') {
    throw new CommandValidationError(
      commandType,
      `anchor ${String(anchor.at)} must be 'start', 'end' or 'edge'`,
    );
  }
  if (anchor.loop !== undefined && anchor.loop !== 'stitch' && anchor.loop !== 'cut') {
    throw new CommandValidationError(
      commandType,
      `anchor loop ${String(anchor.loop)} must be 'stitch' or 'cut'`,
    );
  }
  // A stitch edge anchor would duplicate a cut edge and has no stitch equivalent.
  if (anchor.loop === 'stitch' && anchor.at === 'edge') {
    throw new CommandValidationError(
      commandType,
      "a stitch anchor must be 'start' or 'end', not 'edge'",
    );
  }
}

/** The command error for each shared cut-anchor rejection. */
const CUT_ANCHOR_MESSAGES: Record<CutAnchorIssueReason, string> = {
  missing: 'the piece cut loop cannot resolve these anchors',
  'not-straight': 'an edge anchor must be a straight line edge',
  'different-piece': 'both anchors must belong to the same piece',
  'same-anchor': 'the two anchors must be different',
  'not-parallel': 'two edge anchors must be parallel',
  'zero-span': 'the two anchors must not resolve to the same point',
};

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

/** The preset `create_piece`/`set_piece_loop` copies onto new loop edges, or `null`. */
function resolveCreateAllowance(
  document: PatternDocument,
  allowance: 'default' | 'none' | AllowancePreset | undefined,
  type: CommandType,
  piece: Piece,
): AllowancePreset | null {
  if (allowance === 'none') return null;
  if (allowance === undefined || allowance === 'default') {
    return effectivePieceAllowance(document, piece);
  }

  return requireAllowancePreset(document, type, allowance);
}

/** Validate and copy one allowance preset, recording a formula's current value. */
function requireAllowancePreset(
  document: PatternDocument,
  commandType: CommandType,
  preset: { width: ParamInput; kind?: AllowanceKind },
): AllowancePreset {
  if (typeof preset !== 'object' || preset === null) {
    throw new CommandValidationError(
      commandType,
      'allowance must be "default", "none" or a preset',
    );
  }
  const width = requireLengthParam(document, commandType, preset.width, 'allowance width');
  if (preset.kind !== undefined && !ALLOWANCE_KINDS.includes(preset.kind)) {
    throw new CommandValidationError(commandType, `unknown allowance kind: ${String(preset.kind)}`);
  }

  return {
    width,
    ...(preset.kind === undefined ? {} : { kind: preset.kind }),
  };
}

/** Validate a per-piece defaults object, copying its preset. */
function requirePieceDefaults(
  document: PatternDocument,
  commandType: CommandType,
  defaults: PieceDefaults | undefined,
): PieceDefaults | undefined {
  if (defaults === undefined) return undefined;
  if (defaults.allowance === null) return { allowance: null };
  return { allowance: requireAllowancePreset(document, commandType, defaults.allowance) };
}

/** Reject a non-finite coordinate or rotation. */
function requireFinite(commandType: CommandType, value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new CommandValidationError(commandType, `${label} must be a finite number`);
  }
  return value;
}

/** Trim optional free text; an empty string clears the field. */
function requireOptionalText(
  commandType: CommandType,
  value: string | null | undefined,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new CommandValidationError(commandType, `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    throw new CommandValidationError(commandType, `${label} must be at most ${max} characters`);
  }
  return trimmed;
}

/** Reject anything that is not exactly `#` plus six lowercase hex digits. */
function requirePieceColor(
  commandType: CommandType,
  value: string | null | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new CommandValidationError(
      commandType,
      'color must be #rrggbb with lowercase hex digits',
    );
  }
  return value;
}

/** Find an assembly or explain which id is unknown. */
function requireAssembly(document: PatternDocument, id: EntityId, type: CommandType): Assembly {
  const assembly = document.assemblies.find((candidate) => candidate.id === id);
  if (assembly === undefined) {
    throw new CommandValidationError(type, `unknown assembly: ${id}`);
  }
  return assembly;
}

/** Trim and validate an assembly name; empty names are rejected. */
function requireAssemblyName(commandType: CommandType, name: unknown): string {
  if (typeof name !== 'string') {
    throw new CommandValidationError(commandType, 'name must be a string');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ASSEMBLY_NAME_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `name must be 1–${MAX_ASSEMBLY_NAME_LENGTH} characters after trimming`,
    );
  }
  return trimmed;
}

/** Replace one assembly in the document, preserving assembly order. */
function replaceAssembly(document: PatternDocument, assembly: Assembly): PatternDocument {
  return {
    ...document,
    assemblies: document.assemblies.map((candidate) =>
      candidate.id === assembly.id ? assembly : candidate,
    ),
  };
}

/** Append a tab unless the object already has one. */
function withTab(document: PatternDocument, tab: TabRef): TabRef[] {
  return document.tabs.some((candidate) => candidate.kind === tab.kind && candidate.id === tab.id)
    ? document.tabs
    : [...document.tabs, tab];
}

/** Drop one object's tab from the order. */
function withoutTab(document: PatternDocument, tab: TabRef): TabRef[] {
  return document.tabs.filter(
    (candidate) => candidate.kind !== tab.kind || candidate.id !== tab.id,
  );
}

/** The defaults a piece override represents, turned into a restoring command. */
function restorePieceDefaults(piece: EntityId, defaults: PieceDefaults | undefined): Command {
  if (defaults === undefined) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'inherit' },
    };
  }
  if (defaults.allowance === null) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'none' },
    };
  }
  return {
    id: `${piece}:default-allowance`,
    type: 'set_piece_default_allowance',
    params: {
      piece,
      mode: 'preset',
      width: defaults.allowance.width,
      ...(defaults.allowance.kind === undefined ? {} : { kind: defaults.allowance.kind }),
    },
  };
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

/** Create an empty piece; its loop is captured later with `set_piece_loop`. */
function applyCreatePiece(
  document: PatternDocument,
  command: CommandOf<'create_piece'>,
): CommandApplication {
  const { name, quantity, color, defaults } = command.params;
  if (pieceById(document, command.id) !== undefined) {
    return noOp(document);
  }

  requireQuantity('create_piece', quantity);
  requirePieceName('create_piece', name);
  const nextColor = requirePieceColor('create_piece', color);
  const nextDefaults = requirePieceDefaults(document, 'create_piece', defaults);

  const piece: Piece = { id: command.id, edges: [], allowances: [] };
  if (name !== undefined) piece.name = name.trim();
  if (quantity !== undefined) piece.quantity = quantity;
  if (nextColor !== undefined) piece.color = nextColor;
  if (nextDefaults !== undefined) piece.defaults = nextDefaults;

  return {
    document: {
      ...document,
      pieces: [...document.pieces, piece],
      tabs: withTab(document, { kind: 'piece', id: command.id }),
    },
    inverse: { id: command.id, type: 'delete_piece', params: { id: command.id } },
  };
}

/** Change a piece's parameters; `null` or empty text clears a field. */
function applyUpdatePiece(
  document: PatternDocument,
  command: CommandOf<'update_piece'>,
): CommandApplication {
  const { id, name, quantity, notes, fabric, color } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    throw new CommandValidationError('update_piece', `unknown piece: ${id}`);
  }
  if (
    name === undefined &&
    quantity === undefined &&
    notes === undefined &&
    fabric === undefined &&
    color === undefined
  ) {
    throw new CommandValidationError(
      'update_piece',
      'provide name, quantity, notes, fabric or color',
    );
  }

  requirePieceName('update_piece', name);
  requireQuantity('update_piece', quantity);
  const nextNotes = requireOptionalText('update_piece', notes, MAX_PIECE_NOTES_LENGTH, 'notes');
  const nextFabric = requireOptionalText('update_piece', fabric, MAX_PIECE_FABRIC_LENGTH, 'fabric');
  const nextColor = requirePieceColor('update_piece', color);

  const next: Piece = { ...piece };
  if (name !== undefined) {
    if (name === null) delete next.name;
    else next.name = name.trim();
  }
  if (quantity !== undefined) {
    if (quantity === null) delete next.quantity;
    else next.quantity = quantity;
  }
  if (notes !== undefined) {
    if (nextNotes === undefined) delete next.notes;
    else next.notes = nextNotes;
  }
  if (fabric !== undefined) {
    if (nextFabric === undefined) delete next.fabric;
    else next.fabric = nextFabric;
  }
  if (color !== undefined) {
    if (nextColor === undefined) delete next.color;
    else next.color = nextColor;
  }

  if (
    next.name === piece.name &&
    next.quantity === piece.quantity &&
    next.notes === piece.notes &&
    next.fabric === piece.fabric &&
    next.color === piece.color
  ) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, next),
    inverse: {
      id: command.id,
      type: 'update_piece',
      params: {
        id,
        name: piece.name ?? null,
        quantity: piece.quantity ?? null,
        notes: piece.notes ?? null,
        fabric: piece.fabric ?? null,
        color: piece.color ?? null,
      },
    },
  };
}

/**
 * Delete a piece and everything it owns: its geometry, constraints, texts,
 * corner rounds and cut dimensions. Other pieces are untouched, and undo uses
 * the journal snapshot because a cascade is not one command.
 */
function applyDeletePiece(
  document: PatternDocument,
  command: CommandOf<'delete_piece'>,
): CommandApplication {
  const { id } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    return noOp(document);
  }

  const removed = new Set<EntityId>([
    ...piece.edges,
    ...document.entities.filter((entity) => entity.piece === id).map((entity) => entity.id),
  ]);
  const removedRounds = cornerRounds(document).filter((round) =>
    [
      round.corner,
      round.arc,
      ...round.controls,
      ...(round.center === undefined ? [] : [round.center]),
      ...round.ends.flatMap((end) => [end.line, end.anchor, end.tangent]),
    ].some((entityId) => removed.has(entityId)),
  );
  for (const round of removedRounds) {
    removed.add(round.corner);
    removed.add(round.arc);
    for (const control of round.controls) removed.add(control);
    if (round.center !== undefined) removed.add(round.center);
    for (const end of round.ends) {
      removed.add(end.line);
      removed.add(end.anchor);
      removed.add(end.tangent);
    }
  }
  const entities = document.entities.filter(
    (entity) =>
      !removed.has(entity.id) &&
      !(
        entity.kind === 'text' &&
        (removed.has(entity.anchor) || (entity.leader !== undefined && removed.has(entity.leader)))
      ),
  );
  const constraints = document.constraints.filter(
    (constraint) =>
      constraint.piece !== id &&
      !constraintEntityIds(constraint).some((entityId) => removed.has(entityId)),
  );
  const rounds = cornerRounds(document).filter((round) => !removedRounds.includes(round));

  return {
    document: {
      ...document,
      entities,
      constraints,
      pieces: document.pieces.filter((candidate) => candidate.id !== id),
      assemblies: document.assemblies.map((assembly) =>
        assembly.instances.some((instance) => instance.piece === id)
          ? {
              ...assembly,
              instances: assembly.instances.filter((instance) => instance.piece !== id),
            }
          : assembly,
      ),
      tabs: withoutTab(document, { kind: 'piece', id }),
      ...(document.cornerRounds === undefined ? {} : { cornerRounds: rounds }),
      ...(document.seams === undefined
        ? {}
        : { seams: documentSeams(document).filter((seam) => !removed.has(seam.edge)) }),
    },
    // Restoring a piece together with its cascade is not a single command.
    inverse: null,
  };
}

/** Set, change or clear the allowance copied onto newly created pieces. */
/**
 * Store an ordered cut loop on a piece, or clear it. The loop is validated as one
 * closed chain of the piece's own cut edges; the allowance preset fills edges
 * that do not have an allowance yet, so re-setting a loop keeps its widths.
 */
function applySetPieceLoop(
  document: PatternDocument,
  command: CommandOf<'set_piece_loop'>,
): CommandApplication {
  const { piece: pieceId, edges } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_loop');

  const cornerAllowances = piece.cornerAllowances ?? [];

  if (edges.length === 0) {
    if (
      piece.edges.length === 0 &&
      piece.allowances.length === 0 &&
      cornerAllowances.length === 0
    ) {
      return noOp(document);
    }
    return {
      document: replacePiece(document, {
        ...piece,
        edges: [],
        allowances: [],
        ...(piece.cornerAllowances === undefined ? {} : { cornerAllowances: [] }),
      }),
      inverse: null,
    };
  }

  const validation = validatePiece(document, edges, { piece: pieceId });
  if (!validation.ok) {
    throw new CommandValidationError('set_piece_loop', validation.message);
  }

  const preset = resolveCreateAllowance(
    document,
    command.params.allowance ?? 'default',
    'set_piece_loop',
    piece,
  );
  const existing = new Map(piece.allowances.map((allowance) => [allowance.edge, allowance]));
  const allowances = edges.flatMap((edge) => {
    const current = existing.get(edge);
    if (current !== undefined) return [current];
    return preset === null
      ? []
      : [{ edge, width: preset.width, kind: preset.kind ?? ('seam' as const) }];
  });

  // The loop is the first point at which an older fixture's edges can be adopted;
  // new documents already carry the owner from their create command.
  const entities = document.entities.map((entity) =>
    edges.includes(entity.id) && entity.piece === undefined
      ? { ...entity, piece: pieceId }
      : entity,
  );

  const keptCorners = cornerAllowances.filter((allowance) => {
    const round = cornerRounds(document).find((candidate) => candidate.id === allowance.round);
    return round !== undefined && round.ends.every((end) => edges.includes(end.line));
  });

  return {
    document: {
      ...replacePiece(document, {
        ...piece,
        edges: [...edges],
        allowances,
        ...(piece.cornerAllowances === undefined ? {} : { cornerAllowances: keptCorners }),
      }),
      entities,
    },
    inverse: null,
  };
}

/** Change one entity's role, refusing to demote a rounded cut line. */
function applySetRole(
  document: PatternDocument,
  command: CommandOf<'set_role'>,
): CommandApplication {
  const { id, role } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('set_role', `unknown entity: ${id}`);
  }
  if (entity.kind === 'text') {
    throw new CommandValidationError('set_role', 'text is always annotation geometry');
  }
  if (role !== 'cut' && role !== 'construction' && role !== 'annotation') {
    throw new CommandValidationError('set_role', `unknown role: ${String(role)}`);
  }

  const current = roleOf(entity);
  if (current === role) return noOp(document);

  if (
    current === 'cut' &&
    role !== 'cut' &&
    entity.kind === 'line' &&
    cornerRoundsForEntity(document, id).some((round) => round.ends.some((end) => end.line === id))
  ) {
    throw new CommandValidationError('set_role', 'Remove the corner round first.');
  }

  const rest = withoutKeys(entity, ['role', 'construction']);
  const next = (role === 'cut' ? rest : { ...rest, role }) as Entity;
  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));

  return {
    document: { ...document, entities },
    inverse: { id: command.id, type: 'set_role', params: { id, role: current } },
  };
}

/** Store or clear a piece's allowance override. */
function applySetPieceDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_default_allowance'>,
): CommandApplication {
  const { piece: pieceId, mode } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_default_allowance');

  let defaults: PieceDefaults | undefined;
  if (mode === 'inherit') {
    defaults = undefined;
  } else if (mode === 'none') {
    defaults = { allowance: null };
  } else if (mode === 'preset') {
    defaults = {
      allowance: requireAllowancePreset(document, 'set_piece_default_allowance', {
        width: command.params.width ?? Number.NaN,
        ...(command.params.kind === undefined ? {} : { kind: command.params.kind }),
      }),
    };
  } else {
    throw new CommandValidationError(
      'set_piece_default_allowance',
      `unknown mode: ${String(mode)}`,
    );
  }

  const next: Piece = { ...piece };
  if (defaults === undefined) delete next.defaults;
  else next.defaults = defaults;

  if (JSON.stringify(next.defaults) === JSON.stringify(piece.defaults)) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, next),
    inverse: restorePieceDefaults(pieceId, piece.defaults),
  };
}

/** Create an empty assembly and append its tab. */

/** The longest variable name a command accepts. */
export const MAX_VARIABLE_NAME_LENGTH = 60;
/** The longest variable comment a command accepts. */
export const MAX_VARIABLE_COMMENT_LENGTH = 120;
/** The longest variable slug a command mints. */
const MAX_VARIABLE_SLUG_LENGTH = 40;

const UNIT_MM_PER: Record<Unit, number> = { mm: 1, cm: 10 };

/** Mint a slug from a display name: ascii-folded, lowercased, underscore-joined. */
function slugFromName(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const base = folded
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_VARIABLE_SLUG_LENGTH);
  if (base === '') return 'v';
  const prefixed = /^[a-z]/.test(base) ? base : `v${base}`;
  return prefixed.slice(0, MAX_VARIABLE_SLUG_LENGTH);
}

/** A slug no variable in the document uses yet. */
function uniqueVariableSlug(document: PatternDocument, base: string): string {
  const taken = new Set((document.variables ?? []).map((variable) => variable.slug));
  let candidate = base;
  let index = 2;
  while (taken.has(candidate)) {
    const suffix = `_${index}`;
    candidate = `${base.slice(0, MAX_VARIABLE_SLUG_LENGTH - suffix.length)}${suffix}`;
    index += 1;
  }
  return candidate;
}

/** Validate a display name: trimmed, non-empty, within bounds and unique. */
function requireVariableName(
  document: PatternDocument,
  commandType: CommandType,
  name: string,
  currentSlug?: string,
): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > MAX_VARIABLE_NAME_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `variable name must be 1-${MAX_VARIABLE_NAME_LENGTH} characters`,
    );
  }
  const clash = (document.variables ?? []).find(
    (variable) =>
      variable.slug !== currentSlug && variable.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash !== undefined) {
    throw new CommandValidationError(
      commandType,
      `variable name "${trimmed}" is already used by ${clash.slug}`,
    );
  }
  return trimmed;
}

/** Validate a comment: trimmed, bounded, empty becomes absent. */
function requireVariableComment(commandType: CommandType, comment: string): string | undefined {
  const trimmed = comment.trim();
  if (trimmed.length > MAX_VARIABLE_COMMENT_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `variable comment must be at most ${MAX_VARIABLE_COMMENT_LENGTH} characters`,
    );
  }
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Validate a variable value and record what it resolves to. A literal is a length
 * in the variable's unit; a formula may be a length or a ratio, but never an area.
 */
function requireVariableValue(
  document: PatternDocument,
  commandType: CommandType,
  value: ParamInput,
): Param {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new CommandValidationError(
        commandType,
        'variable value must be a finite number of at least 0',
      );
    }
    return value;
  }

  let quantity: Quantity;
  try {
    quantity = evaluateQuantity(value.expr, {
      lookup: (slug) => resolveVariable(document, slug),
    });
  } catch (error) {
    // `evaluateQuantity` only throws `ExpressionError`, so its message is the detail.
    throw new CommandValidationError(
      commandType,
      `value is not a valid formula: ${(error as ExpressionError).message}`,
    );
  }
  if (quantity.exponent !== 0 && quantity.exponent !== 1) {
    const found =
      quantity.exponent === 2 ? 'an area' : `a quantity with exponent ${quantity.exponent}`;
    throw new CommandValidationError(
      commandType,
      `a variable must be a length or a ratio, not ${found}`,
    );
  }
  return { expr: value.expr, lastKnown: quantity.value };
}

/** A variable's literal converted between units, keeping the measurement. */
function convertLiteral(value: number, from: Unit, to: Unit): number {
  return (value * UNIT_MM_PER[from]) / UNIT_MM_PER[to];
}

/** Whether two variables would store the same fields. */
function sameVariable(a: Variable, b: Variable): boolean {
  return (
    a.slug === b.slug &&
    a.name === b.name &&
    a.unit === b.unit &&
    sameParam(a.value, b.value) &&
    a.comment === b.comment
  );
}

/** Rewrite every formula parameter in the document through `rewrite`. */
function mapFormulaParams(
  document: PatternDocument,
  rewrite: (param: Param) => Param,
): PatternDocument {
  const mapped: PatternDocument = {
    ...document,
    constraints: document.constraints.map((constraint) =>
      constraint.type === 'distance' && constraint.value !== undefined
        ? { ...constraint, value: rewrite(constraint.value) }
        : constraint,
    ),
    pieces: document.pieces.map((piece) => {
      const allowances = piece.allowances.map((allowance) => ({
        ...allowance,
        width: rewrite(allowance.width),
      }));
      const allowance = piece.defaults?.allowance;
      const defaults =
        piece.defaults === undefined || allowance === undefined || allowance === null
          ? piece.defaults
          : { ...piece.defaults, allowance: { ...allowance, width: rewrite(allowance.width) } };
      return { ...piece, allowances, ...(defaults === undefined ? {} : { defaults }) };
    }),
  };

  if (document.variables !== undefined) {
    mapped.variables = document.variables.map((variable) => ({
      ...variable,
      value: rewrite(variable.value),
    }));
  }
  if (document.cornerRounds !== undefined) {
    mapped.cornerRounds = document.cornerRounds.map((round) => ({
      ...round,
      radius: rewrite(round.radius),
    }));
  }
  const preset = document.defaults?.allowance;
  if (preset !== undefined && preset !== null) {
    mapped.defaults = {
      ...document.defaults,
      allowance: { ...preset, width: rewrite(preset.width) },
    };
  }
  return mapped;
}

/**
 * Record what every formula currently resolves to before a variable disappears,
 * so a dependent keeps the number it was showing rather than an older one.
 */
function captureFormulaValues(document: PatternDocument): PatternDocument {
  return mapFormulaParams(document, (param) =>
    isExpressionParam(param)
      ? { expr: param.expr, lastKnown: resolveParam(document, param) }
      : param,
  );
}

/** Create a variable, or update the one already stored under the same slug. */
function applySetVariable(
  document: PatternDocument,
  command: CommandOf<'set_variable'>,
): CommandApplication {
  const { slug: requestedSlug, name, unit, value, comment } = command.params;
  const variables = document.variables ?? [];
  const existing =
    requestedSlug === undefined
      ? undefined
      : variables.find((variable) => variable.slug === requestedSlug);

  if (existing !== undefined) {
    return applyUpdateVariable(document, {
      ...command,
      type: 'update_variable',
      params: {
        slug: existing.slug,
        ...(name === undefined ? {} : { name }),
        ...(unit === undefined ? {} : { unit }),
        value,
        ...(comment === undefined ? {} : { comment }),
      },
    });
  }

  if (name === undefined && requestedSlug === undefined) {
    throw new CommandValidationError('set_variable', 'slug or name is required');
  }
  if (requestedSlug !== undefined && !/^[a-z][a-z0-9_]{0,39}$/.test(requestedSlug)) {
    throw new CommandValidationError(
      'set_variable',
      'slug must be lowercase letters, digits and underscores, starting with a letter',
    );
  }
  const displayName = requireVariableName(document, 'set_variable', name ?? requestedSlug!);
  const slug = requestedSlug ?? uniqueVariableSlug(document, slugFromName(displayName));

  const next: Variable = {
    slug,
    name: displayName,
    unit: unit ?? 'mm',
    value: requireVariableValue(document, 'set_variable', value),
    ...(comment === undefined || comment === null
      ? {}
      : (() => {
          const trimmed = requireVariableComment('set_variable', comment);
          return trimmed === undefined ? {} : { comment: trimmed };
        })()),
  };

  return {
    document: { ...document, variables: [...variables, next] },
    inverse: { id: `${command.id}:remove`, type: 'remove_variable', params: { slug } },
  };
}

/** Change a variable's name, unit, value or comment; its slug never moves. */
function applyUpdateVariable(
  document: PatternDocument,
  command: CommandOf<'update_variable'>,
): CommandApplication {
  const { slug, name, unit, value, comment } = command.params;
  const variables = document.variables ?? [];
  const existing = variables.find((variable) => variable.slug === slug);
  if (existing === undefined) {
    throw new CommandValidationError('update_variable', `unknown variable: ${slug}`);
  }

  const nextName =
    name === undefined
      ? existing.name
      : requireVariableName(document, 'update_variable', name, slug);
  const nextUnit = unit ?? existing.unit;
  let nextValue: Param;
  if (value !== undefined) {
    nextValue = requireVariableValue(document, 'update_variable', value);
  } else if (nextUnit !== existing.unit && !isExpressionParam(existing.value)) {
    // A unit switch converts a literal so the measurement does not move.
    nextValue = convertLiteral(existing.value, existing.unit, nextUnit);
  } else {
    nextValue = existing.value;
  }
  const nextComment =
    comment === undefined
      ? existing.comment
      : comment === null
        ? undefined
        : requireVariableComment('update_variable', comment);

  const next: Variable = {
    slug,
    name: nextName,
    unit: nextUnit,
    value: nextValue,
    ...(nextComment === undefined ? {} : { comment: nextComment }),
  };
  if (sameVariable(existing, next)) return noOp(document);

  return {
    document: {
      ...document,
      variables: variables.map((variable) => (variable.slug === slug ? next : variable)),
    },
    inverse: {
      id: `${command.id}:restore`,
      type: 'update_variable',
      params: {
        slug,
        name: existing.name,
        unit: existing.unit,
        value: existing.value,
        ...(existing.comment === undefined ? { comment: null } : { comment: existing.comment }),
      },
    },
  };
}

/** Remove a variable, leaving every dependent on the number it last showed. */
function applyRemoveVariable(
  document: PatternDocument,
  command: CommandOf<'remove_variable'>,
): CommandApplication {
  const { slug } = command.params;
  const variables = document.variables ?? [];
  const existing = variables.find((variable) => variable.slug === slug);
  if (existing === undefined) return noOp(document);

  const captured = captureFormulaValues(document);
  // The variable exists, so the document has a variable list to filter.
  const remaining = captured.variables!.filter((variable) => variable.slug !== slug);

  return {
    document: { ...captured, variables: remaining },
    inverse: {
      id: `${command.id}:restore`,
      type: 'set_variable',
      params: {
        slug: existing.slug,
        name: existing.name,
        unit: existing.unit,
        value: existing.value,
        ...(existing.comment === undefined ? {} : { comment: existing.comment }),
      },
    },
  };
}

function applyCreateAssembly(
  document: PatternDocument,
  command: CommandOf<'create_assembly'>,
): CommandApplication {
  if (document.assemblies.some((assembly) => assembly.id === command.id)) {
    return noOp(document);
  }

  const name =
    command.params.name === undefined
      ? `Assembly ${document.assemblies.length + 1}`
      : requireAssemblyName('create_assembly', command.params.name);

  return {
    document: {
      ...document,
      assemblies: [...document.assemblies, { id: command.id, name, instances: [] }],
      tabs: withTab(document, { kind: 'assembly', id: command.id }),
    },
    inverse: { id: command.id, type: 'delete_assembly', params: { id: command.id } },
  };
}

/** Rename an assembly. */
function applyUpdateAssembly(
  document: PatternDocument,
  command: CommandOf<'update_assembly'>,
): CommandApplication {
  const { id } = command.params;
  const assembly = requireAssembly(document, id, 'update_assembly');
  const name = requireAssemblyName('update_assembly', command.params.name);

  if (name === assembly.name) return noOp(document);

  return {
    document: replaceAssembly(document, { ...assembly, name }),
    inverse: {
      id: command.id,
      type: 'update_assembly',
      params: { id, name: assembly.name },
    },
  };
}

/** Delete an assembly and its tab; placed pieces are untouched. */
function applyDeleteAssembly(
  document: PatternDocument,
  command: CommandOf<'delete_assembly'>,
): CommandApplication {
  const { id } = command.params;
  if (!document.assemblies.some((assembly) => assembly.id === id)) {
    return noOp(document);
  }

  return {
    document: {
      ...document,
      assemblies: document.assemblies.filter((assembly) => assembly.id !== id),
      tabs: withoutTab(document, { kind: 'assembly', id }),
    },
    // Restoring an assembly and its instances is not a single command.
    inverse: null,
  };
}

/** Place one instance of a piece in an assembly. */
function applyAddInstance(
  document: PatternDocument,
  command: CommandOf<'add_instance'>,
): CommandApplication {
  const { assembly: assemblyId, piece: pieceId, x, y, rotation, mirrored } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'add_instance');
  requirePiece(document, pieceId, 'add_instance');
  requireFinite('add_instance', x, 'x');
  requireFinite('add_instance', y, 'y');
  if (rotation !== undefined) requireFinite('add_instance', rotation, 'rotation');

  if (assembly.instances.some((instance) => instance.id === command.id)) {
    return noOp(document);
  }

  const instance: AssemblyInstance = { id: command.id, piece: pieceId, x, y };
  if (rotation !== undefined) instance.rotation = rotation;
  if (mirrored !== undefined) instance.mirrored = mirrored;

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: [...assembly.instances, instance],
    }),
    inverse: {
      id: command.id,
      type: 'remove_instance',
      params: { assembly: assemblyId, instance: command.id },
    },
  };
}

/** Remove one placed instance. */
function applyRemoveInstance(
  document: PatternDocument,
  command: CommandOf<'remove_instance'>,
): CommandApplication {
  const { assembly: assemblyId, instance: instanceId } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'remove_instance');
  const instance = assembly.instances.find((candidate) => candidate.id === instanceId);
  if (instance === undefined) return noOp(document);

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: assembly.instances.filter((candidate) => candidate.id !== instanceId),
    }),
    inverse: {
      id: instance.id,
      type: 'add_instance',
      params: {
        assembly: assemblyId,
        piece: instance.piece,
        x: instance.x,
        y: instance.y,
        ...(instance.rotation === undefined ? {} : { rotation: instance.rotation }),
        ...(instance.mirrored === undefined ? {} : { mirrored: instance.mirrored }),
      },
    },
  };
}

/** Move, rotate or mirror one placed instance. */
function applyUpdateInstance(
  document: PatternDocument,
  command: CommandOf<'update_instance'>,
): CommandApplication {
  const { assembly: assemblyId, instance: instanceId, x, y, rotation, mirrored } = command.params;
  const assembly = requireAssembly(document, assemblyId, 'update_instance');
  const instance = assembly.instances.find((candidate) => candidate.id === instanceId);
  if (instance === undefined) {
    throw new CommandValidationError('update_instance', `unknown instance: ${instanceId}`);
  }
  if (x === undefined && y === undefined && rotation === undefined && mirrored === undefined) {
    throw new CommandValidationError('update_instance', 'provide x, y, rotation or mirrored');
  }
  if (x !== undefined) requireFinite('update_instance', x, 'x');
  if (y !== undefined) requireFinite('update_instance', y, 'y');
  if (rotation !== undefined) requireFinite('update_instance', rotation, 'rotation');

  const next: AssemblyInstance = { ...instance };
  if (x !== undefined) next.x = x;
  if (y !== undefined) next.y = y;
  if (rotation !== undefined) next.rotation = rotation;
  if (mirrored !== undefined) next.mirrored = mirrored;

  if (
    next.x === instance.x &&
    next.y === instance.y &&
    next.rotation === instance.rotation &&
    next.mirrored === instance.mirrored
  ) {
    return noOp(document);
  }

  return {
    document: replaceAssembly(document, {
      ...assembly,
      instances: assembly.instances.map((candidate) =>
        candidate.id === instanceId ? next : candidate,
      ),
    }),
    inverse: {
      id: command.id,
      type: 'update_instance',
      params: {
        assembly: assemblyId,
        instance: instanceId,
        x: instance.x,
        y: instance.y,
        rotation: instance.rotation ?? 0,
        mirrored: instance.mirrored ?? false,
      },
    },
  };
}

/** Replace the tab order with a permutation of the current refs. */
function applyReorderTabs(
  document: PatternDocument,
  command: CommandOf<'reorder_tabs'>,
): CommandApplication {
  const { tabs } = command.params;
  if (tabs.length !== document.tabs.length) {
    throw new CommandValidationError(
      'reorder_tabs',
      'tabs must be a permutation of the current order',
    );
  }

  const known = new Set(document.tabs.map((tab) => `${tab.kind}:${tab.id}`));
  const seen = new Set<string>();
  for (const tab of tabs) {
    const key = `${tab.kind}:${tab.id}`;
    if (!known.has(key) || seen.has(key)) {
      throw new CommandValidationError(
        'reorder_tabs',
        'tabs must be a permutation of the current order',
      );
    }
    seen.add(key);
  }

  const unchanged = tabs.every(
    (tab, index) => tab.kind === document.tabs[index]!.kind && tab.id === document.tabs[index]!.id,
  );
  if (unchanged) return noOp(document);

  return {
    document: { ...document, tabs: tabs.map((tab) => ({ kind: tab.kind, id: tab.id })) },
    inverse: {
      id: command.id,
      type: 'reorder_tabs',
      params: { tabs: document.tabs.map((tab) => ({ kind: tab.kind, id: tab.id })) },
    },
  };
}

/** Trim and validate one line of label text. */
function requireTextContent(commandType: CommandType, content: unknown): string {
  if (typeof content !== 'string') {
    throw new CommandValidationError(commandType, 'content must be a string');
  }
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_TEXT_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `content must be 1–${MAX_TEXT_LENGTH} characters after trimming`,
    );
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new CommandValidationError(commandType, 'content must be a single line');
  }
  return trimmed;
}

function requireTextAlignment(
  commandType: CommandType,
  alignment: TextAlignment | undefined,
): TextAlignment {
  const value = alignment ?? 'left';
  if (!TEXT_ALIGNMENTS.includes(value)) {
    throw new CommandValidationError(commandType, `unknown text alignment: ${String(value)}`);
  }
  return value;
}

function requireTextSize(commandType: CommandType, fontSize: number | undefined): number {
  const value = fontSize ?? DEFAULT_TEXT_SIZE;
  if (!Number.isFinite(value) || value < MIN_TEXT_SIZE || value > MAX_TEXT_SIZE) {
    throw new CommandValidationError(
      commandType,
      `fontSize must be between ${MIN_TEXT_SIZE} and ${MAX_TEXT_SIZE} mm`,
    );
  }
  return value;
}

function requireTextRotation(commandType: CommandType, rotation: number | undefined): number {
  const value = rotation ?? 0;
  if (!Number.isFinite(value)) {
    throw new CommandValidationError(commandType, 'rotation must be a finite number');
  }
  return value;
}

/** Create one annotation label anchored to a point of its piece. */
function applyAddText(
  document: PatternDocument,
  command: CommandOf<'add_text'>,
): CommandApplication {
  const { piece: pieceId, anchor, content, alignment, rotation, fontSize, leader } = command.params;
  requirePiece(document, pieceId, 'add_text');
  const anchorPoint = requireOwnedPoint(document, anchor, pieceId, 'add_text');
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  let leaderPoint: PointEntity | undefined;
  if (leader !== undefined) {
    if (leader === anchorPoint.id) {
      throw new CommandValidationError('add_text', 'the leader must differ from the anchor');
    }
    leaderPoint = requireOwnedPoint(document, leader, pieceId, 'add_text');
  }

  const text: TextEntity = {
    id: command.id,
    kind: 'text',
    piece: pieceId,
    anchor,
    content: requireTextContent('add_text', content),
    alignment: requireTextAlignment('add_text', alignment),
    rotation: requireTextRotation('add_text', rotation),
    fontSize: requireTextSize('add_text', fontSize),
  };
  if (leaderPoint !== undefined) text.leader = leaderPoint.id;

  return {
    document: { ...document, entities: [...document.entities, text] },
    inverse: deleteEntityCommand(command.id),
  };
}

/** Edit a label's text, anchor, presentation or leader. */
function applyUpdateText(
  document: PatternDocument,
  command: CommandOf<'update_text'>,
): CommandApplication {
  const { id, content, anchor, alignment, rotation, fontSize, leader } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_text', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'text') {
    throw new CommandValidationError('update_text', `entity ${id} is not text`);
  }
  if (
    content === undefined &&
    anchor === undefined &&
    alignment === undefined &&
    rotation === undefined &&
    fontSize === undefined &&
    leader === undefined
  ) {
    throw new CommandValidationError('update_text', 'provide content, anchor or presentation');
  }

  const piece = entity.piece;
  if (piece === undefined) {
    throw new CommandValidationError('update_text', 'text is not owned by a piece');
  }
  const nextAnchor =
    anchor === undefined
      ? entity.anchor
      : requireOwnedPoint(document, anchor, piece, 'update_text').id;
  let nextLeader = entity.leader;
  if (leader === null) {
    nextLeader = undefined;
  } else if (leader !== undefined) {
    if (leader === nextAnchor) {
      throw new CommandValidationError('update_text', 'the leader must differ from the anchor');
    }
    nextLeader = requireOwnedPoint(document, leader, piece, 'update_text').id;
  }

  const next: TextEntity = {
    ...entity,
    anchor: nextAnchor,
    content: content === undefined ? entity.content : requireTextContent('update_text', content),
    alignment:
      alignment === undefined
        ? (entity.alignment ?? 'left')
        : requireTextAlignment('update_text', alignment),
    rotation:
      rotation === undefined
        ? (entity.rotation ?? 0)
        : requireTextRotation('update_text', rotation),
    fontSize:
      fontSize === undefined
        ? (entity.fontSize ?? DEFAULT_TEXT_SIZE)
        : requireTextSize('update_text', fontSize),
  };
  delete next.leader;
  if (nextLeader !== undefined) next.leader = nextLeader;

  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));

  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_text',
      params: {
        id,
        content: entity.content,
        anchor: entity.anchor,
        alignment: entity.alignment ?? 'left',
        rotation: entity.rotation ?? 0,
        fontSize: entity.fontSize ?? DEFAULT_TEXT_SIZE,
        leader: entity.leader ?? null,
      },
    },
  };
}

/** A drafting point of this piece a mark may attach to. */
function requireMarkPoint(
  document: PatternDocument,
  id: EntityId,
  piece: EntityId,
  type: CommandType,
): PointEntity {
  const point = requireDraftingPoint(document, id, type);
  if (point.piece !== undefined && point.piece !== piece) {
    throw new CommandValidationError(type, `point ${id} belongs to another piece`);
  }
  return point;
}

/** Reject an edge that is not a cut line, curve or arc of this piece's loop. */
function requireMarkEdge(
  document: PatternDocument,
  piece: Piece,
  edge: EntityId,
  type: CommandType,
): void {
  if (!piece.edges.includes(edge)) {
    throw new CommandValidationError(type, `edge ${edge} is not in piece ${piece.id}`);
  }
  const entity = getEntity(document, edge);
  if (
    entity === undefined ||
    (entity.kind !== 'line' && entity.kind !== 'curve' && entity.kind !== 'arc')
  ) {
    throw new CommandValidationError(type, `edge ${edge} is not a line, curve or arc`);
  }
}

/** A finite depth share; out-of-range values are clamped on read, not rejected. */
function requireNotchDepth(type: CommandType, depth: number): number {
  if (typeof depth !== 'number' || !Number.isFinite(depth)) {
    throw new CommandValidationError(type, 'depth must be a finite number');
  }
  return depth;
}

function applyAddNotch(
  document: PatternDocument,
  command: CommandOf<'add_notch'>,
): CommandApplication {
  const { piece: pieceId, edge, point, depth } = command.params;
  const piece = requirePiece(document, pieceId, 'add_notch');
  requireMarkEdge(document, piece, edge, 'add_notch');
  const anchor = requireMarkPoint(document, point, pieceId, 'add_notch');
  if (allowanceForEdge(piece, edge) === undefined) {
    throw new CommandValidationError('add_notch', 'This edge has no seam allowance');
  }
  if (!pointOnEdge(document, edge, anchor.id)) {
    throw new CommandValidationError('add_notch', `point ${point} does not lie on edge ${edge}`);
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const notch: NotchMark = {
    id: command.id,
    kind: 'mark',
    type: 'notch',
    piece: pieceId,
    edge,
    point: anchor.id,
  };
  if (depth !== undefined) notch.depth = requireNotchDepth('add_notch', depth);

  return {
    document: { ...document, entities: [...document.entities, notch] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyUpdateNotch(
  document: PatternDocument,
  command: CommandOf<'update_notch'>,
): CommandApplication {
  const { id, depth } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_notch', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'mark' || entity.type !== 'notch') {
    throw new CommandValidationError('update_notch', `entity ${id} is not a notch`);
  }
  if (depth === undefined) {
    throw new CommandValidationError('update_notch', 'provide a depth or null');
  }

  const next: NotchMark = { ...entity };
  if (depth === null) {
    delete next.depth;
  } else {
    next.depth = requireNotchDepth('update_notch', depth);
  }
  if (next.depth === entity.depth) {
    return noOp(document);
  }

  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));
  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_notch',
      params: { id, depth: entity.depth ?? null },
    },
  };
}

function applyAddCentreLine(
  document: PatternDocument,
  command: CommandOf<'add_centre_line'>,
): CommandApplication {
  const { piece: pieceId, start, end } = command.params;
  requirePiece(document, pieceId, 'add_centre_line');
  const first = requireMarkPoint(document, start, pieceId, 'add_centre_line');
  const second = requireMarkPoint(document, end, pieceId, 'add_centre_line');
  if (first.id === second.id) {
    throw new CommandValidationError('add_centre_line', 'the endpoints must differ');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const line: CentreLineMark = {
    id: command.id,
    kind: 'mark',
    type: 'centre_line',
    piece: pieceId,
    start: first.id,
    end: second.id,
  };
  return {
    document: { ...document, entities: [...document.entities, line] },
    inverse: deleteEntityCommand(command.id),
  };
}

function applyUpdateCentreLine(
  document: PatternDocument,
  command: CommandOf<'update_centre_line'>,
): CommandApplication {
  const { id, start, end } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_centre_line', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'mark' || entity.type !== 'centre_line') {
    throw new CommandValidationError('update_centre_line', `entity ${id} is not a centre line`);
  }
  if (start === undefined && end === undefined) {
    throw new CommandValidationError('update_centre_line', 'provide start or end');
  }

  const piece = entity.piece;
  if (piece === undefined) {
    throw new CommandValidationError('update_centre_line', 'the mark is not owned by a piece');
  }
  const nextStart =
    start === undefined
      ? entity.start
      : requireMarkPoint(document, start, piece, 'update_centre_line').id;
  const nextEnd =
    end === undefined
      ? entity.end
      : requireMarkPoint(document, end, piece, 'update_centre_line').id;
  if (nextStart === nextEnd) {
    throw new CommandValidationError('update_centre_line', 'the endpoints must differ');
  }
  if (nextStart === entity.start && nextEnd === entity.end) {
    return noOp(document);
  }

  const next: CentreLineMark = { ...entity, start: nextStart, end: nextEnd };
  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));
  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_centre_line',
      params: { id, start: entity.start, end: entity.end },
    },
  };
}

function applySetDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_default_allowance'>,
): CommandApplication {
  const { width, kind, remove } = command.params;
  const current = effectiveDefaultAllowance(document);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_default_allowance', 'remove takes no width or kind');
    }
    if (current === null) {
      return noOp(document);
    }

    return {
      document: { ...document, defaults: { allowance: null } },
      inverse: restoreDefaultAllowance(command.id, current),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_default_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_default_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_default_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const nextKind = kind ?? 'seam';
  if (
    current !== null &&
    sameParam(current.width, nextWidth) &&
    (current.kind ?? 'seam') === nextKind
  ) {
    return noOp(document);
  }

  return {
    document: { ...document, defaults: { allowance: { width: nextWidth, kind: nextKind } } },
    inverse:
      current === null
        ? {
            id: `${command.id}:remove`,
            type: 'set_default_allowance',
            params: { remove: true },
          }
        : restoreDefaultAllowance(command.id, current),
  };
}

/** A command that restores the document's previous default allowance preset. */
function restoreDefaultAllowance(id: EntityId, preset: AllowancePreset): Command {
  return {
    id: `${id}:restore`,
    type: 'set_default_allowance',
    params: {
      width: preset.width,
      ...(preset.kind === undefined ? {} : { kind: preset.kind }),
    },
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

  if (width === undefined) {
    throw new CommandValidationError(
      'set_piece_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_piece_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const next: Allowance = { edge, width: nextWidth, ...(kind === undefined ? {} : { kind }) };
  if (
    existing !== undefined &&
    sameParam(existing.width, nextWidth) &&
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

/** A command that restores a corner round's own cut width. */
function restoreCornerAllowance(
  id: EntityId,
  piece: EntityId,
  allowance: CornerAllowance,
): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_corner_allowance',
    params: { piece, round: allowance.round, cutWidth: allowance.cutWidth },
  };
}

/** Set, change or remove one rounded corner's own allowance width. */
function applySetPieceCornerAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_corner_allowance'>,
): CommandApplication {
  const { piece: pieceId, round: roundId, cutWidth, remove } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_corner_allowance');

  const round = cornerRounds(document).find((candidate) => candidate.id === roundId);
  if (round === undefined) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `unknown corner round: ${roundId}`,
    );
  }
  if (!round.ends.every((end) => piece.edges.includes(end.line))) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `corner round ${roundId} is not a corner of piece ${pieceId}`,
    );
  }

  const existing = cornerAllowanceForRound(piece, roundId);

  if (remove === true) {
    if (cutWidth !== undefined) {
      throw new CommandValidationError('set_piece_corner_allowance', 'remove takes no cutWidth');
    }
    if (existing === undefined) return noOp(document);
    return {
      document: replacePiece(document, {
        ...piece,
        // `existing` was found, so the array exists.
        cornerAllowances: piece.cornerAllowances!.filter((entry) => entry.round !== roundId),
      }),
      inverse: restoreCornerAllowance(command.id, pieceId, existing),
    };
  }

  if (cutWidth === undefined || !Number.isFinite(cutWidth) || cutWidth <= 0) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      'cutWidth must be a finite number greater than 0',
    );
  }
  if (existing !== undefined && existing.cutWidth === cutWidth) return noOp(document);

  const next: CornerAllowance = { round: roundId, cutWidth };
  const cornerAllowances =
    existing === undefined
      ? [...(piece.cornerAllowances ?? []), next]
      : // `existing` was found, so the array exists.
        piece.cornerAllowances!.map((allowance) =>
          allowance.round === roundId ? next : allowance,
        );

  return {
    document: replacePiece(document, { ...piece, cornerAllowances }),
    inverse:
      existing === undefined
        ? {
            id: `${command.id}:restore`,
            type: 'set_piece_corner_allowance',
            params: { piece: pieceId, round: roundId, remove: true },
          }
        : restoreCornerAllowance(command.id, pieceId, existing),
  };
}

/** Add a read-only dimension measuring the cut loop between two anchors of one piece. */
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
