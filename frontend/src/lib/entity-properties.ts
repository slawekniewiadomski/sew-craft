import {
  arcGeometry,
  constraintEntityIds,
  constraintOrientation,
  cornerRoundsForEntity,
  derivedDimensionState,
  derivedDimensionValue,
  dimensionState,
  dimensionValue,
  getEntity,
  isConstruction,
  roleOf,
  measureLinearDimension,
  type CircleEntity,
  type Constraint,
  type ConstraintType,
  type CutAnchor,
  type DimensionOrientation,
  type DimensionState,
  type Entity,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

import { constraintLabel } from './constraint-view';
import { pieceForEntity, pieceSummary, type PieceSummary } from './pieces';

const RADIANS_TO_DEGREES = 180 / Math.PI;

/** Geometry a point contributes to the inspector. */
export type PointGeometry = { kind: 'point'; x: number; y: number };

/** Geometry a line contributes to the inspector. */
export type LineGeometry = { kind: 'line'; start: EntityId; end: EntityId };

/** Geometry a curve contributes to the inspector. */
export type CurveGeometry = {
  kind: 'curve';
  p0: EntityId;
  p1: EntityId;
  p2: EntityId;
  p3: EntityId;
};

/** Geometry an arc contributes to the inspector. */
export type ArcGeometry = {
  kind: 'arc';
  start: EntityId;
  end: EntityId;
  through: EntityId;
};

/** Geometry a circle contributes to the inspector. */
export type CircleGeometry = { kind: 'circle'; center: EntityId; rim: EntityId };

/** A label's anchor and content, shown as read-only metadata. */
export type TextGeometry = { kind: 'text'; anchor: EntityId; content: string };

export type EntityGeometry =
  PointGeometry | LineGeometry | CurveGeometry | CircleGeometry | ArcGeometry | TextGeometry;

/**
 * The derived circle measurements of an arc, all recomputed from its three
 * points: nothing here is stored on the entity.
 */
export type ArcMeasurement = {
  /** Circle radius in millimetres. */
  radius: number;
  /** The swept angle in degrees, always positive. */
  includedAngle: number;
  /** Arc length in millimetres. */
  length: number;
};

/** A dimension that acts on the selected entity. */
export type DimensionSummary = {
  id: EntityId;
  entities: [EntityId, EntityId];
  /** The resolved value: literal, source value, measurement or last known. */
  value: number | null;
  /** Set, driven, referenced or broken. */
  state: DimensionState;
  /** The linked source id, or `null` when this dimension holds no reference. */
  sourceId: EntityId | null;
  orientation: DimensionOrientation;
};

/** A non-dimension constraint that acts on the selected entity. */
export type ConstraintSummary = {
  id: EntityId;
  type: Exclude<ConstraintType, 'distance'>;
  label: string;
  entities: EntityId[];
};

/** A corner round that acts on the selected line or arc. */
export type CornerRoundSummary = {
  id: EntityId;
  radius: number;
  corner: EntityId;
  lines: [EntityId, EntityId];
  anchors: [EntityId, EntityId];
  arc: EntityId;
};

/** A read-only cut dimension anchored to the selected edge. */
export type CutDimensionSummary = {
  id: EntityId;
  piece: EntityId;
  /** Resolved cut measurement, or the last reading when broken. */
  value: number | null;
  state: 'derived' | 'broken';
  orientation: DimensionOrientation;
  anchors: [string, string];
};

/** The editable fields of an annotation label. */
export type TextSummary = {
  content: string;
  alignment: 'left' | 'center' | 'right';
  rotation: number;
  fontSize: number;
  leader: EntityId | null;
};

/** Everything the Properties inspector shows for one selected entity. */
export type EntityProperties = {
  id: EntityId;
  kind: Entity['kind'];
  /** The assignable role; text is always annotation. */
  role: 'cut' | 'construction' | 'annotation';
  construction: boolean;
  /** Annotation text only; `null` for every other kind. */
  text: TextSummary | null;
  /** Points only; lines and curves have no fixed flag. */
  fixed: boolean | null;
  geometry: EntityGeometry;
  /** Measured length in millimetres for lines only. */
  length: number | null;
  /**
   * Derived arc measurements, `null` for other kinds and for an arc whose three
   * points no longer define a circle (collinear after a constraint solve).
   */
  arc: ArcMeasurement | null;
  /** Derived radius in millimetres for circles only. */
  radius: number | null;
  /** The piece that owns the selected edge, with its derived metrics. */
  piece: PieceSummary | null;
  /** Read-only cut dimensions anchored to the selected edge. */
  cutDimensions: CutDimensionSummary[];
  /** Rounds that reference the selected line or arc. */
  rounds: CornerRoundSummary[];
  dimensions: DimensionSummary[];
  constraints: ConstraintSummary[];
};

/**
 * How an anchor reads in the inspector: a stitch anchor names its loop, while a
 * cut anchor keeps the shape it has always had.
 */
function cutAnchorText(anchor: CutAnchor): string {
  return (anchor.loop ?? 'cut') === 'stitch'
    ? `stitch:${anchor.edge}:${anchor.at}`
    : `${anchor.edge}:${anchor.at}`;
}

function geometryOf(entity: Entity): EntityGeometry {
  switch (entity.kind) {
    case 'point':
      return { kind: 'point', x: entity.x, y: entity.y };
    case 'line':
      return { kind: 'line', start: entity.start, end: entity.end };
    case 'curve':
      return { kind: 'curve', p0: entity.p0, p1: entity.p1, p2: entity.p2, p3: entity.p3 };
    case 'arc':
      return { kind: 'arc', start: entity.start, end: entity.end, through: entity.through };
    case 'circle':
      return { kind: 'circle', center: entity.center, rim: entity.rim };
    case 'text':
      return { kind: 'text', anchor: entity.anchor, content: entity.content };
  }
}

/**
 * The derived radius, included angle and arc length of an arc, or `null` when it
 * is not an arc or its three points no longer define a circle.
 */
function arcMeasurementOf(document: PatternDocument, entity: Entity): ArcMeasurement | null {
  if (entity.kind !== 'arc') return null;

  const geometry = arcGeometry(document, entity);
  if (geometry === null) return null;

  const sweep = Math.abs(geometry.sweep);
  return {
    radius: geometry.radius,
    includedAngle: sweep * RADIANS_TO_DEGREES,
    length: sweep * geometry.radius,
  };
}

/**
 * The circle's derived radius in millimetres, or `null` when a referenced point
 * is missing or is not a point. Unlike `circleGeometry`, a collapsed circle
 * still reports its (near-)zero radius so the inspector can show it.
 */
function circleRadius(document: PatternDocument, circle: CircleEntity): number | null {
  const center = getEntity(document, circle.center);
  const rim = getEntity(document, circle.rim);
  if (center?.kind !== 'point' || rim?.kind !== 'point') return null;

  const radius = Math.hypot(rim.x - center.x, rim.y - center.y);
  return Number.isFinite(radius) ? radius : null;
}

/** Order-insensitive endpoint comparison: `{a,b}` equals `{s,e}`. */
function samePair(a: EntityId, b: EntityId, s: EntityId, e: EntityId): boolean {
  return (a === s && b === e) || (a === e && b === s);
}

/**
 * Whether a constraint acts on the selected entity's own segment. A line matches
 * only its endpoint pair, so a neighbouring edge sharing a corner does not pull
 * its constraints in; points, curves and arcs keep the broader any-reference
 * rule (an arc is defined by all three of its points). Matching reads the stored
 * ids without resolving them, so a dangling reference still lists on the line
 * that stores it and never throws.
 */
function constraintActsOnEntity(
  constraint: Exclude<Constraint, { type: 'derived_distance' }>,
  entity: Entity,
): boolean {
  if (entity.kind === 'point') {
    return constraintEntityIds(constraint).includes(entity.id);
  }

  if (entity.kind === 'curve') {
    const controlPoints = [entity.p0, entity.p1, entity.p2, entity.p3];
    return constraintEntityIds(constraint).some((id) => controlPoints.includes(id));
  }

  if (entity.kind === 'arc') {
    const points = [entity.start, entity.end, entity.through];
    return constraintEntityIds(constraint).some((id) => points.includes(id));
  }

  if (entity.kind === 'circle') {
    const referencePoints = [entity.center, entity.rim];
    return constraintEntityIds(constraint).some((id) => referencePoints.includes(id));
  }

  if (entity.kind === 'text') return false;

  switch (constraint.type) {
    case 'distance':
      // A line matches its endpoint pair or is itself an anchor of the dimension.
      return (
        samePair(constraint.a, constraint.b, entity.start, entity.end) ||
        constraint.a === entity.id ||
        constraint.b === entity.id
      );
    case 'coincident':
    case 'horizontal':
    case 'vertical':
    case 'point_on_line':
      return samePair(constraint.a, constraint.b, entity.start, entity.end);
    case 'angle':
      return (
        samePair(constraint.a, constraint.b, entity.start, entity.end) ||
        samePair(constraint.b, constraint.c, entity.start, entity.end)
      );
    case 'equal':
      return (
        samePair(constraint.a1, constraint.a2, entity.start, entity.end) ||
        samePair(constraint.b1, constraint.b2, entity.start, entity.end)
      );
  }
}

/**
 * Selection-scoped view model over the existing document. Pure and
 * framework-free: the panel receives the result and never reads the store.
 * A missing id returns `null` so a deleted selection degrades to the workspace
 * summary instead of rendering stale data.
 */
export function entityProperties(
  document: PatternDocument,
  id: EntityId | null,
): EntityProperties | null {
  if (id === null) return null;

  const entity = getEntity(document, id);
  if (entity === undefined) return null;

  const dimensions: DimensionSummary[] = [];
  const constraints: ConstraintSummary[] = [];

  for (const constraint of document.constraints) {
    if (constraint.type === 'derived_distance') continue;
    if (!constraintActsOnEntity(constraint, entity)) continue;
    const entities = constraintEntityIds(constraint);

    if (constraint.type === 'distance') {
      dimensions.push({
        id: constraint.id,
        entities: [constraint.a, constraint.b],
        value: dimensionValue(document, constraint),
        state: dimensionState(document, constraint),
        sourceId: constraint.reference ?? null,
        orientation: constraintOrientation(constraint),
      });
      continue;
    }

    constraints.push({
      id: constraint.id,
      type: constraint.type,
      label: constraintLabel(constraint),
      entities,
    });
  }

  const owningPiece = entity.kind === 'point' ? null : pieceForEntity(document, entity.id);
  const cutDimensions: CutDimensionSummary[] =
    entity.kind === 'point'
      ? []
      : document.constraints.flatMap((constraint) => {
          if (
            constraint.type !== 'derived_distance' ||
            (constraint.a.edge !== entity.id && constraint.b.edge !== entity.id)
          ) {
            return [];
          }
          return [
            {
              id: constraint.id,
              piece: constraint.piece,
              value: derivedDimensionValue(document, constraint),
              state: derivedDimensionState(document, constraint),
              orientation: constraintOrientation(constraint),
              anchors: [cutAnchorText(constraint.a), cutAnchorText(constraint.b)] as [
                string,
                string,
              ],
            },
          ];
        });

  // A round shows on its two lines and on its arc, not on points or the sharp
  // corner; the sharp corner stays a construction point of the sketch.
  const rounds: CornerRoundSummary[] =
    entity.kind === 'point'
      ? []
      : cornerRoundsForEntity(document, entity.id)
          .filter(
            (round) => round.arc === entity.id || round.ends.some((end) => end.line === entity.id),
          )
          .map((round) => ({
            id: round.id,
            radius: round.radius,
            corner: round.corner,
            lines: [round.ends[0].line, round.ends[1].line],
            anchors: [round.ends[0].anchor, round.ends[1].anchor],
            arc: round.arc,
          }));

  return {
    id: entity.id,
    kind: entity.kind,
    role: roleOf(entity),
    construction: isConstruction(entity),
    text:
      entity.kind === 'text'
        ? {
            content: entity.content,
            alignment: entity.alignment ?? 'left',
            rotation: entity.rotation ?? 0,
            fontSize: entity.fontSize ?? 6,
            leader: entity.leader ?? null,
          }
        : null,
    fixed: entity.kind === 'point' ? entity.fixed : null,
    geometry: geometryOf(entity),
    length:
      entity.kind === 'line'
        ? measureLinearDimension(document, entity.start, entity.end, 'aligned')
        : null,
    arc: arcMeasurementOf(document, entity),
    radius: entity.kind === 'circle' ? circleRadius(document, entity) : null,
    piece: owningPiece === null ? null : pieceSummary(document, owningPiece),
    cutDimensions,
    rounds,
    dimensions,
    constraints,
  };
}
