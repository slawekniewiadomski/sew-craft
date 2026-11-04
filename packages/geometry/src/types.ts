export type EntityId = string;

/**
 * A linear unit a formula literal may carry. Every stored value is millimetres,
 * so a unit only scales its literal at parse time.
 */
export type Unit = 'mm' | 'cm';

/**
 * A parameter: a literal millimetres value, or a formula over document variables
 * with the last number it resolved to. The formula is kept so the maker can edit
 * it; every reader resolves through `resolveParam`, never the raw field.
 */
export type Param = number | ExpressionParam;

export interface ExpressionParam {
  /** Formula source in the expression grammar. */
  expr: string;
  /** The last resolved millimetres, kept so a broken formula still has a value. */
  lastKnown: number;
}

/**
 * A named measurement the document's formulas may use. `slug` is the stable
 * token (`$bust_cm` in a formula); `name` is what the maker sees and may rename.
 */
export interface Variable {
  /** Stable identifier, bare: a formula writes it as `$` + slug. */
  slug: string;
  /** Free-form display name, unique case-insensitively. */
  name: string;
  /** The unit a literal `value` is written in; a formula ignores it. */
  unit: Unit;
  value: Param;
  /** Optional free text; absent or empty means none. */
  comment?: string;
}

export const PATTERN_SCHEMA = 'sewcraft.pattern/0.5';

export type PatternSchema = typeof PATTERN_SCHEMA;

/**
 * How a non-cut entity is used. `cut` is the absence of a role, so every
 * consumer can ask one predicate instead of reading a boolean.
 */
export type EntityRole = 'construction' | 'annotation';

/** The role a user may assign to a non-text entity. */
export type AssignableRole = 'cut' | EntityRole;

export const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;

export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/**
 * Ownership and role shared by every sketch entity. `piece` is required on a
 * document written by this build; it stays optional in the type so a hand-made
 * or legacy fixture degrades to unowned geometry instead of failing to load.
 */
interface OwnedEntity {
  /** The piece that contains this entity. */
  piece?: EntityId;
  /** Omitted means `cut`. */
  role?: EntityRole;
  /**
   * Deprecated alias for `role: 'construction'`, accepted on read for
   * documents written before 0.3. New commands never write it.
   */
  construction?: boolean;
}

/**
 * A single drafting point. Points are the only solver variables in v0.1;
 * lines and curves reference points by id.
 */
export interface PointEntity extends OwnedEntity {
  id: EntityId;
  kind: 'point';
  x: number;
  y: number;
  /** Fixed points are excluded from the solver's variable vector. */
  fixed: boolean;
}

export interface LineEntity extends OwnedEntity {
  id: EntityId;
  kind: 'line';
  start: EntityId;
  end: EntityId;
}

export interface CurveEntity extends OwnedEntity {
  id: EntityId;
  kind: 'curve';
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
}

/**
 * A true circular arc through three ordinary solver points: `start` and `end`
 * bound it and `through` lies on it between them, so it fixes both the bulge and
 * the sweep direction. The circle, radius, angles and extents are always derived.
 */
export interface ArcEntity extends OwnedEntity {
  id: EntityId;
  kind: 'arc';
  /** Start of the arc, in traversal order. */
  start: EntityId;
  /** End of the arc, in traversal order. */
  end: EntityId;
  /** A point on the arc between start and end; fixes the bulge and the sweep. */
  through: EntityId;
}

/**
 * A true circle. The centre and a point on the rim are ordinary solver points;
 * the radius is always the distance between them and is never stored.
 */
export interface CircleEntity extends OwnedEntity {
  id: EntityId;
  kind: 'circle';
  center: EntityId;
  rim: EntityId;
}

/**
 * A one-line annotation label. Text is annotation by kind and never a solver
 * variable; its anchor and leader points are ordinary solver points.
 */
export interface TextEntity {
  id: EntityId;
  kind: 'text';
  /** The piece that contains this text. */
  piece?: EntityId;
  /** The point the label is placed at; must belong to the same piece. */
  anchor: EntityId;
  /** One line, trimmed, 1–120 characters. */
  content: string;
  /** Horizontal anchoring at the anchor point; omitted means `left`. */
  alignment?: TextAlignment;
  /** Radians, counter-clockwise; omitted means 0. */
  rotation?: number;
  /** Cap height in millimetres; omitted means 10, range 1–100. */
  fontSize?: number;
  /** Optional point the leader line runs to; same piece, not the anchor. */
  leader?: EntityId;
}

export type Entity = PointEntity | LineEntity | CurveEntity | CircleEntity | ArcEntity | TextEntity;

export const CONSTRAINT_TYPES = [
  'coincident',
  'horizontal',
  'vertical',
  'point_on_line',
  'distance',
  'angle',
  'equal',
  'midpoint',
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/**
 * How a linear dimension measures the span between its two points. `aligned`
 * reports the true point-to-point length; `horizontal`/`vertical` report the
 * absolute distance along that axis. Dimensions are distance constraints with
 * optional presentation, so `orientation` and `offset` only apply to `distance`.
 */
export const DIMENSION_ORIENTATIONS = ['aligned', 'horizontal', 'vertical'] as const;

export type DimensionOrientation = (typeof DIMENSION_ORIENTATIONS)[number];

export type DistanceConstraint = {
  id: EntityId;
  type: 'distance';
  a: EntityId;
  b: EntityId;
  /** The piece this dimension belongs to; required on documents written by this build. */
  piece?: EntityId;
  /**
   * Driving length in millimetres. Absent means **driven**: the dimension is a
   * reference measurement with no solver residual. A present value makes it a
   * **set** dimension that drives the sketch.
   *
   * Mutually exclusive with `reference`: a referenced dimension derives its value
   * from its source and stores no literal. A formula resolves through the
   * document's variables.
   */
  value?: Param;
  /**
   * Id of the `distance` constraint this dimension copies its value from. The
   * effective value is resolved from the source chain on every read, so a source
   * edit moves every dependent in one solve.
   */
  reference?: EntityId;
  /**
   * Last resolved value, kept only so a **broken** reference (missing, driven or
   * cyclic source) can still show a number. Never read by the solver.
   */
  lastKnownValue?: number;
  /** Measurement axis; omitted means `aligned`. */
  orientation?: DimensionOrientation;
  /** Signed millimetres from the measured span to the dimension line. */
  offset?: number;
};

/**
 * A point pinned to the middle of a straight line (line form) or halfway between
 * two points (two-point form). The target is **derived**: the solver excludes it
 * from its variables and recomputes it from its sources, so the relation is exact
 * and the source geometry keeps its shape.
 */
export type MidpointConstraint = {
  id: EntityId;
  type: 'midpoint';
  /** The derived point; never a corner-round-derived point or another target. */
  point: EntityId;
  piece?: EntityId;
} & (
  | { /** The source line; its current visible endpoints are the sources. */ line: EntityId }
  | { a: EntityId; b: EntityId }
);

export type Constraint =
  | { id: EntityId; type: 'coincident'; a: EntityId; b: EntityId; piece?: EntityId }
  | { id: EntityId; type: 'horizontal'; a: EntityId; b: EntityId; piece?: EntityId }
  | { id: EntityId; type: 'vertical'; a: EntityId; b: EntityId; piece?: EntityId }
  | {
      id: EntityId;
      type: 'point_on_line';
      point: EntityId;
      a: EntityId;
      b: EntityId;
      piece?: EntityId;
    }
  | DistanceConstraint
  | {
      id: EntityId;
      type: 'angle';
      a: EntityId;
      b: EntityId;
      c: EntityId;
      value: number;
      piece?: EntityId;
    }
  | {
      id: EntityId;
      type: 'equal';
      a1: EntityId;
      a2: EntityId;
      b1: EntityId;
      b2: EntityId;
      piece?: EntityId;
    }
  | MidpointConstraint
  | DerivedDistanceConstraint;

export const ALLOWANCE_KINDS = ['seam', 'single', 'double'] as const;

export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

/** The allowance of one piece loop edge; `width` is the finished width. */
export interface Allowance {
  edge: EntityId;
  /** Finished (visible) width in millimetres; must be > 0. */
  width: Param;
  /** Omitted means `seam`. */
  kind?: AllowanceKind;
}

/**
 * One rounded corner's own allowance. Unlike `Allowance` there is no kind: a
 * corner is always seam-like, so the stored number is the distance the cut line
 * moves.
 */
export interface CornerAllowance {
  /** The corner round the width belongs to. */
  round: EntityId;
  /** Cut distance in millimetres; must be > 0. */
  cutWidth: number;
}

/** The allowance copied onto a new piece; `width` is the finished width. */
export interface AllowancePreset {
  width: Param;
  /** Omitted means `seam`. */
  kind?: AllowanceKind;
}

export interface PatternDefaults {
  /**
   * `null` means new pieces start with no allowance. An absent `defaults`
   * object resolves to the built-in 10 mm seam preset.
   */
  allowance: AllowancePreset | null;
}

/** A closed loop of existing cut edges cut from fabric. */
export interface Piece {
  id: EntityId;
  /** Optional; the UI falls back to "Piece 1". */
  name?: string;
  /** Ordered, closed loop of line/curve/arc ids. */
  edges: EntityId[];
  /** Allowances for loop edges; an edge with no entry has none. */
  allowances: Allowance[];
  /**
   * Cut widths for corner rounds; a round with no entry inherits the width its
   * two adjacent edges agree on. Absent means no corner has its own width.
   */
  cornerAllowances?: CornerAllowance[];
  /** How many to cut; omitted means 1. */
  quantity?: number;
  /** Free text, trimmed, max 500 characters; absent or empty means none. */
  notes?: string;
  /** Trimmed, max 120 characters; absent or empty means none. */
  fabric?: string;
  /** `#rrggbb`; absent means the neutral fallback. */
  color?: string;
  /**
   * Per-piece overrides. Absent means inherit the document default; an explicit
   * `{ allowance: null }` means this piece starts with no allowance.
   */
  defaults?: PieceDefaults;
}

/** A piece's own overrides; only the allowance default exists in v1. */
export interface PieceDefaults {
  allowance: AllowancePreset | null;
}

/** One placed copy of a piece inside an assembly. */
export interface AssemblyInstance {
  id: EntityId;
  /** The piece it places. Must exist in the same document. */
  piece: EntityId;
  /** Assembly-space position of the piece's derived anchor, in millimetres. */
  x: number;
  y: number;
  /** Radians, SVG convention (positive turns clockwise on screen); omitted means 0. */
  rotation?: number;
  /** Horizontal flip about the anchor's vertical axis; omitted means false. */
  mirrored?: boolean;
}

/** A named layout that places instances of the pattern's pieces. */
export interface Assembly {
  id: EntityId;
  /** Required, trimmed, 1–80 characters; defaults to "Assembly N" on creation. */
  name: string;
  instances: AssemblyInstance[];
}

/** One entry of the authoritative tab order; every piece and assembly appears once. */
export interface TabRef {
  kind: 'piece' | 'assembly';
  id: EntityId;
}

/** One end of a cut dimension, addressed by loop vertex or whole edge, not by point id. */
export interface CutAnchor {
  edge: EntityId;
  /**
   * `start`/`end` address a loop vertex; `edge` addresses the whole straight
   * cut edge's own offset segment (its cut line).
   */
  at: 'start' | 'end' | 'edge';
  /**
   * Which loop the anchor resolves against. Omitted means `cut`, the meaning an
   * anchor has always had. `stitch` addresses the seamline itself, so it can
   * never take `at: 'edge'` (a stitch edge has no defined cut equivalent).
   */
  loop?: LoopKind;
}

/** A piece loop an anchor can resolve against. */
export type LoopKind = 'stitch' | 'cut';

/**
 * A read-only dimension measuring a piece's cut loop. It adds no solver
 * equation; its value is recomputed from the cut geometry on every read.
 */
export interface DerivedDistanceConstraint {
  id: EntityId;
  type: 'derived_distance';
  /** Both anchors must belong to this piece. */
  piece: EntityId;
  a: CutAnchor;
  b: CutAnchor;
  orientation?: DimensionOrientation;
  offset?: number;
  /** Optional stored reading for a broken anchor. v1 never writes it. */
  lastKnownValue?: number;
}

export const SEAM_SIDES = ['left', 'right'] as const;

/** The side of an edge's start→end direction an allowance is offset to. */
export type SeamSide = (typeof SEAM_SIDES)[number];

export interface Seam {
  id: EntityId;
  edge: EntityId;
  width: number;
  /**
   * Offset side relative to the edge direction. Absent on documents written
   * before sides existed, where it means `left` (the original rendering).
   */
  side?: SeamSide;
}

/** The effective side of a seam; an omitted side keeps the original `left` offset. */
export function seamSide(seam: Seam): SeamSide {
  return seam.side ?? 'left';
}

/** One selected line of a corner round, trimmed at the shared sharp corner. */
export interface CornerRoundEnd {
  /** The selected line, trimmed at the shared corner. */
  line: EntityId;
  /**
   * The original point at the line's opposite end. It defines the line
   * direction even after the line has been trimmed at both ends.
   */
  anchor: EntityId;
  /** The derived point where this line becomes the arc. */
  tangent: EntityId;
}

/**
 * The persisted record of a rounded corner: the sharp corner, its two lines, the
 * radius and the derived tangent/control points and arc. Derived geometry is
 * regenerated after every solve.
 */
export interface CornerRound {
  id: EntityId;
  /** The sharp corner, kept as a construction point. */
  corner: EntityId;
  ends: [CornerRoundEnd, CornerRoundEnd];
  /** Arc radius in millimetres. */
  radius: Param;
  /** Derived cubic Bézier, cut geometry like the lines it joins. */
  arc: EntityId;
  /** Derived Bézier control points p1 and p2. */
  controls: [EntityId, EntityId];
  /**
   * Derived point at the centre of the radius. Optional so documents written
   * before feature points load unchanged; every new round sets it and the load
   * path mints it for older documents.
   */
  center?: EntityId;
  /** The sharp corner's construction flag before the round. */
  cornerConstruction: boolean;
}

/**
 * The canonical, versioned geometry document stored in `patterns.geometry`.
 * Its schema version is explicit so migrations can be written when it changes.
 */
export interface PatternDocument {
  schema: PatternSchema;
  units: 'mm';
  entities: Entity[];
  constraints: Constraint[];
  /** Every authored piece. Documents written before 0.2 gain an empty list on load. */
  pieces: Piece[];
  /** Every assembly; a hand-edited document may omit it, which normalises to `[]`. */
  assemblies: Assembly[];
  /** Authoritative tab order: every piece and assembly exactly once. */
  tabs: TabRef[];
  /**
   * Deprecated legacy allowances for edges that close no loop. Read-only,
   * rendered as before, removed in 0.3.
   */
  seams?: Seam[];
  /** Optional so documents written before corner rounds load unchanged. */
  cornerRounds?: CornerRound[];
  /** Optional and additive; a document without it resolves the built-in preset. */
  defaults?: PatternDefaults;
  /** Named measurements formulas may use; absent means the document has none. */
  variables?: Variable[];
}
