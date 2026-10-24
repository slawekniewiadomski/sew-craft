export type EntityId = string;

export const PATTERN_SCHEMA = 'sewcraft.pattern/0.2';

export type PatternSchema = typeof PATTERN_SCHEMA;

/**
 * A single drafting point. Points are the only solver variables in v0.1;
 * lines and curves reference points by id.
 */
export interface PointEntity {
  id: EntityId;
  kind: 'point';
  x: number;
  y: number;
  /** Construction points are guides only and never become cut edges. */
  construction: boolean;
  /** Fixed points are excluded from the solver's variable vector. */
  fixed: boolean;
}

export interface LineEntity {
  id: EntityId;
  kind: 'line';
  start: EntityId;
  end: EntityId;
  construction: boolean;
}

export interface CurveEntity {
  id: EntityId;
  kind: 'curve';
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
  construction: boolean;
}

/**
 * A true circular arc through three ordinary solver points: `start` and `end`
 * bound it and `through` lies on it between them, so it fixes both the bulge and
 * the sweep direction. The circle, radius, angles and extents are always derived.
 */
export interface ArcEntity {
  id: EntityId;
  kind: 'arc';
  /** Start of the arc, in traversal order. */
  start: EntityId;
  /** End of the arc, in traversal order. */
  end: EntityId;
  /** A point on the arc between start and end; fixes the bulge and the sweep. */
  through: EntityId;
  construction: boolean;
}

/**
 * A true circle. The centre and a point on the rim are ordinary solver points;
 * the radius is always the distance between them and is never stored.
 */
export interface CircleEntity {
  id: EntityId;
  kind: 'circle';
  center: EntityId;
  rim: EntityId;
  construction: boolean;
}

export type Entity = PointEntity | LineEntity | CurveEntity | CircleEntity | ArcEntity;

export const CONSTRAINT_TYPES = [
  'coincident',
  'horizontal',
  'vertical',
  'point_on_line',
  'distance',
  'angle',
  'equal',
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
  /**
   * Driving length in millimetres. Absent means **driven**: the dimension is a
   * reference measurement with no solver residual. A present value makes it a
   * **set** dimension that drives the sketch.
   *
   * Mutually exclusive with `reference`: a referenced dimension derives its value
   * from its source and stores no literal.
   */
  value?: number;
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

export type Constraint =
  | { id: EntityId; type: 'coincident'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'horizontal'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'vertical'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'point_on_line'; point: EntityId; a: EntityId; b: EntityId }
  | DistanceConstraint
  | { id: EntityId; type: 'angle'; a: EntityId; b: EntityId; c: EntityId; value: number }
  | { id: EntityId; type: 'equal'; a1: EntityId; a2: EntityId; b1: EntityId; b2: EntityId }
  | DerivedDistanceConstraint;

export const ALLOWANCE_KINDS = ['seam', 'single', 'double'] as const;

export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

/** The allowance of one piece loop edge; `width` is the finished width. */
export interface Allowance {
  edge: EntityId;
  /** Finished (visible) width in millimetres; must be > 0. */
  width: number;
  /** Omitted means `seam`. */
  kind?: AllowanceKind;
}

/** The allowance copied onto a new piece; `width` is the finished width. */
export interface AllowancePreset {
  width: number;
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
  /** How many to cut; omitted means 1. */
  quantity?: number;
}

/** One end of a cut dimension, addressed by loop vertex rather than by point id. */
export interface CutAnchor {
  edge: EntityId;
  /** The loop vertex at this edge's natural start or end. */
  at: 'start' | 'end';
}

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
  radius: number;
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
  /**
   * Deprecated legacy allowances for edges that close no loop. Read-only,
   * rendered as before, removed in 0.3.
   */
  seams?: Seam[];
  /** Optional so documents written before corner rounds load unchanged. */
  cornerRounds?: CornerRound[];
  /** Optional and additive; a document without it resolves the built-in preset. */
  defaults?: PatternDefaults;
}
