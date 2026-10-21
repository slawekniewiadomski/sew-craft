export type EntityId = string;

export const PATTERN_SCHEMA = 'sewcraft.pattern/0.1';

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

export type Entity = PointEntity | LineEntity | CurveEntity;

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
   */
  value?: number;
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
  | { id: EntityId; type: 'equal'; a1: EntityId; a2: EntityId; b1: EntityId; b2: EntityId };

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
  seams: Seam[];
  /** Optional so documents written before corner rounds load unchanged. */
  cornerRounds?: CornerRound[];
}
