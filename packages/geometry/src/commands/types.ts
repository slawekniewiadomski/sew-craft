/** Command params, the command union and the application result types. */
import type { SolveResult } from '../solver.js';
import type {
  AllowanceKind,
  AllowancePreset,
  AssignableRole,
  ConstraintType,
  CutAnchor,
  DimensionOrientation,
  EntityId,
  EntityRole,
  FinishKind,
  PatternDocument,
  PieceDefaults,
  SeamRun,
  SeamSide,
  TabRef,
  TextAlignment,
  Unit,
  VariableKind,
} from '../types.js';

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

export interface SplitLineParams {
  /** The straight line to split. */
  line: EntityId;
  /** An existing authored point on the line, strictly between its ends. */
  point: EntityId;
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
  /** Omitted means a written variable. */
  kind?: VariableKind;
  /** Written variable: a literal in `unit` or a formula over other variables. */
  value?: ParamInput;
  /** Measured variable: line/curve/arc/circle ids, any order. */
  sources?: EntityId[];
  /** Free text; `null` or empty clears it. */
  comment?: string | null;
}

export interface UpdateVariableParams {
  slug: string;
  name?: string;
  unit?: Unit;
  value?: ParamInput;
  /** Replace a measured variable's chain; rejected on a written variable. */
  sources?: EntityId[];
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

export interface AddSeamMatchParams {
  assembly: EntityId;
  /** Two or more sides, in layer order. */
  sides: SeamRun[];
  /** A deliberate length difference; downgrades a mismatch to a warning. */
  eased?: boolean;
}

export interface UpdateSeamMatchParams {
  assembly: EntityId;
  seam: EntityId;
  eased?: boolean;
  /** Replaces the whole side list when present. */
  sides?: SeamRun[];
}

export interface RemoveSeamMatchParams {
  assembly: EntityId;
  seam: EntityId;
}

export interface SetEdgeFinishedParams {
  assembly: EntityId;
  instance: EntityId;
  edge: EntityId;
  /** `null` clears the mark. */
  kind: FinishKind | null;
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

export interface PlacePieceParams {
  id: EntityId;
  /** Position in the shared sketch space, in millimetres. */
  x: number;
  y: number;
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
  | { id: EntityId; type: 'split_line'; params: SplitLineParams; issuedAt?: string }
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
  | { id: EntityId; type: 'place_piece'; params: PlacePieceParams; issuedAt?: string }
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
  | { id: EntityId; type: 'add_seam_match'; params: AddSeamMatchParams; issuedAt?: string }
  | {
      id: EntityId;
      type: 'update_seam_match';
      params: UpdateSeamMatchParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'remove_seam_match';
      params: RemoveSeamMatchParams;
      issuedAt?: string;
    }
  | {
      id: EntityId;
      type: 'set_edge_finished';
      params: SetEdgeFinishedParams;
      issuedAt?: string;
    }
  | { id: EntityId; type: 'solve'; params: SolveParams; issuedAt?: string };

export type CommandType = Command['type'];

export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

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
