export type EntityId = string;

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

export type Constraint =
  | { id: EntityId; type: 'coincident'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'horizontal'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'vertical'; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'point_on_line'; point: EntityId; a: EntityId; b: EntityId }
  | { id: EntityId; type: 'distance'; a: EntityId; b: EntityId; value: number }
  | { id: EntityId; type: 'angle'; a: EntityId; b: EntityId; c: EntityId; value: number }
  | { id: EntityId; type: 'equal'; a1: EntityId; a2: EntityId; b1: EntityId; b2: EntityId };
