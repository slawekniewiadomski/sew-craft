import { cornerRounds, getEntity } from './document.js';
import { CommandValidationError } from './errors.js';
import { edgePolyline } from './offset.js';
import { isConstruction } from './roles.js';
import type {
  CornerRound,
  CurveEntity,
  Entity,
  EntityId,
  LineEntity,
  PatternDocument,
  PointEntity,
} from './types.js';
import { add, distance, dot, magnitude, normalize, scale, sub, type Vec2 } from './vector.js';

/** The smallest usable line segment or radius, in millimetres. */
export const MIN_CORNER_ROUND = 0.001;

/** A corner must be strictly sharper/straighter than this guard, in radians. */
const ANGLE_GUARD = Math.PI / 180;

/** The derived geometry of one corner round, in millimetres. */
export interface CornerRoundGeometry {
  tangentA: Vec2;
  tangentB: Vec2;
  control1: Vec2;
  control2: Vec2;
  /** Centre of the radius arc, equidistant from both lines. */
  center: Vec2;
  /** Distance from the sharp corner to either tangent point. */
  tangentDistance: number;
  /** Interior angle at the sharp corner, in radians. */
  angle: number;
}

export type CornerRoundGeometryResult =
  { geometry: CornerRoundGeometry; error: null } | { geometry: null; error: string };

function pointEntity(document: PatternDocument, id: EntityId): PointEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'point' ? entity : undefined;
}

function lineEntity(document: PatternDocument, id: EntityId): LineEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'line' ? entity : undefined;
}

function curveEntity(document: PatternDocument, id: EntityId): CurveEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'curve' ? entity : undefined;
}

/**
 * Pure tangent fillet math for a corner and two anchors.
 *
 * The arc is a cubic Bézier from `tangentA` to `tangentB` whose controls lie on
 * the two line directions. Its error against a true circular arc is below
 * 0.03 % of the radius.
 */
export function cornerRoundGeometry(
  document: PatternDocument,
  cornerId: EntityId,
  anchorAId: EntityId,
  anchorBId: EntityId,
  radius: number,
): CornerRoundGeometryResult {
  const corner = pointEntity(document, cornerId);
  const anchorA = pointEntity(document, anchorAId);
  const anchorB = pointEntity(document, anchorBId);
  if (corner === undefined || anchorA === undefined || anchorB === undefined) {
    return { geometry: null, error: 'The corner round references a missing point.' };
  }

  if (!Number.isFinite(radius) || radius < MIN_CORNER_ROUND) {
    return { geometry: null, error: 'Radius must be a finite number of at least 0.001 mm.' };
  }

  const fromCorner = { x: corner.x, y: corner.y };
  const toAnchorA = sub(anchorA, fromCorner);
  const toAnchorB = sub(anchorB, fromCorner);
  if (magnitude(toAnchorA) === 0 || magnitude(toAnchorB) === 0) {
    return { geometry: null, error: 'The line has no direction.' };
  }

  const uA = normalize(toAnchorA);
  const uB = normalize(toAnchorB);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(uA, uB))));

  if (angle < ANGLE_GUARD) {
    return { geometry: null, error: 'The corner is too sharp for a round.' };
  }
  if (angle > Math.PI - ANGLE_GUARD) {
    return { geometry: null, error: 'The lines are straight; there is no corner to round.' };
  }

  const tangentDistance = radius / Math.tan(angle / 2);
  const controlDistance = (4 / 3) * Math.tan((Math.PI - angle) / 4) * radius;

  // The centre lies on the interior angle bisector, `r / sin(θ/2)` from the
  // sharp corner. Equivalently it is one radius along the inward normal of
  // either line at its tangent point.
  const bisector = normalize(add(uA, uB));
  const centerDistance = radius / Math.sin(angle / 2);

  return {
    geometry: {
      tangentA: add(fromCorner, scale(uA, tangentDistance)),
      tangentB: add(fromCorner, scale(uB, tangentDistance)),
      control1: add(fromCorner, scale(uA, tangentDistance - controlDistance)),
      control2: add(fromCorner, scale(uB, tangentDistance - controlDistance)),
      center: add(fromCorner, scale(bisector, centerDistance)),
      tangentDistance,
      angle,
    },
    error: null,
  };
}

/** Every feature that references a line, arc, derived point, corner or anchor. */
export function cornerRoundsForEntity(document: PatternDocument, id: EntityId): CornerRound[] {
  return cornerRounds(document).filter(
    (round) =>
      round.id === id ||
      round.corner === id ||
      round.arc === id ||
      round.center === id ||
      round.controls.includes(id) ||
      round.ends.some((end) => end.line === id || end.anchor === id || end.tangent === id),
  );
}

/** The committed round whose two ends are exactly these lines, in either order. */
export function roundBetween(
  document: PatternDocument,
  first: EntityId,
  second: EntityId,
): CornerRound | null {
  if (first === second) return null;
  return (
    cornerRounds(document).find(
      (round) =>
        (round.ends[0].line === first && round.ends[1].line === second) ||
        (round.ends[0].line === second && round.ends[1].line === first),
    ) ?? null
  );
}

/**
 * The arc a committed round contributes between two piece edges, oriented from
 * `first`'s tangent to `second`'s tangent. `null` when there is no round between
 * them or its arc cannot be resolved.
 */
export function roundBridge(
  document: PatternDocument,
  first: EntityId,
  second: EntityId,
): Vec2[] | null {
  const round = roundBetween(document, first, second);
  if (round === null) return null;

  const points = edgePolyline(document, round.arc);
  if (points === null) return null;
  return round.ends[0].line === first ? points : [...points].reverse();
}

/** Every line whose start or end is the given point, in document order. */
export function incidentLines(document: PatternDocument, pointId: EntityId): LineEntity[] {
  return document.entities.filter(
    (entity): entity is LineEntity =>
      entity.kind === 'line' && (entity.start === pointId || entity.end === pointId),
  );
}

/**
 * The authored point a line end still lies on: the sharp corner when a round
 * trimmed that end to its tangent, otherwise the endpoint itself. The corner,
 * the tangent and the line's opposite anchor stay collinear, so naming the
 * corner describes the same supporting line.
 */
export function lineEndpointAnchor(
  document: PatternDocument,
  lineId: EntityId,
  endpoint: EntityId,
): EntityId {
  const round = cornerRounds(document).find((candidate) =>
    candidate.ends.some((end) => end.line === lineId && end.tangent === endpoint),
  );
  return round?.corner ?? endpoint;
}

/**
 * The authored support anchors of a line: the two point ids that name its
 * supporting line. `null` when the id is not a line or either current endpoint
 * is no longer a point, so callers build nothing rather than dangling ids.
 */
export function lineSupportAnchors(
  document: PatternDocument,
  lineId: EntityId,
): { start: EntityId; end: EntityId } | null {
  const line = lineEntity(document, lineId);
  if (line === undefined) return null;
  if (pointEntity(document, line.start) === undefined) return null;
  if (pointEntity(document, line.end) === undefined) return null;

  return {
    start: lineEndpointAnchor(document, lineId, line.start),
    end: lineEndpointAnchor(document, lineId, line.end),
  };
}

/** Whether a point or arc is generated by a corner round rather than drafted. */
export function isCornerRoundDerived(document: PatternDocument, id: EntityId): boolean {
  return cornerRounds(document).some(
    (round) =>
      round.arc === id ||
      round.center === id ||
      round.controls.includes(id) ||
      round.ends.some((end) => end.tangent === id),
  );
}

/** The tangent distance of an existing round, or `null` when it cannot be computed. */
function tangentDistanceOf(document: PatternDocument, round: CornerRound): number | null {
  const anchorA = pointEntity(document, round.ends[0].anchor);
  const anchorB = pointEntity(document, round.ends[1].anchor);
  if (anchorA === undefined || anchorB === undefined) return null;

  const result = cornerRoundGeometry(document, round.corner, anchorA.id, anchorB.id, round.radius);
  return result.geometry === null ? null : result.geometry.tangentDistance;
}

/**
 * The largest radius that still leaves {@link MIN_CORNER_ROUND} of both selected
 * lines, taking the round at the opposite end of either line into account.
 * `null` when the corner itself is unusable.
 */
export function maxCornerRadius(document: PatternDocument, round: CornerRound): number | null {
  const corner = pointEntity(document, round.corner);
  if (corner === undefined) return null;

  const anchorA = pointEntity(document, round.ends[0].anchor);
  const anchorB = pointEntity(document, round.ends[1].anchor);
  if (anchorA === undefined || anchorB === undefined) return null;

  // Radius 1 only supplies the angle; the fit is computed from the line lengths.
  const probe = cornerRoundGeometry(document, round.corner, anchorA.id, anchorB.id, 1);
  if (probe.geometry === null) return null;

  const halfTan = Math.tan(probe.geometry.angle / 2);
  let maximum = Infinity;

  for (const end of round.ends) {
    const line = lineEntity(document, end.line);
    const anchor = pointEntity(document, end.anchor);
    if (line === undefined || anchor === undefined) return null;

    const length = distance({ x: corner.x, y: corner.y }, anchor);
    const opposite = cornerRounds(document).filter(
      (candidate) =>
        candidate.id !== round.id && candidate.ends.some((other) => other.line === end.line),
    );
    let used = 0;
    for (const other of opposite) {
      const tangentDistance = tangentDistanceOf(document, other);
      if (tangentDistance === null) return null;
      used += tangentDistance;
    }

    const available = length - used - MIN_CORNER_ROUND;
    if (available <= 0) return 0;
    maximum = Math.min(maximum, available * halfTan);
  }

  return maximum;
}

/**
 * Recompute every feature's tangent points, control points, arc and line
 * endpoints from its radius and source lines.
 *
 * Returns a new document. Throws `CommandValidationError` when a feature can no
 * longer be built, before any of the input document is changed.
 */
export function regenerateCornerRounds(document: PatternDocument): PatternDocument {
  const rounds = cornerRounds(document);
  if (rounds.length === 0) return document;

  const geometries = new Map<EntityId, CornerRoundGeometry>();
  for (const round of rounds) {
    const anchorA = pointEntity(document, round.ends[0].anchor);
    const anchorB = pointEntity(document, round.ends[1].anchor);
    if (anchorA === undefined || anchorB === undefined) {
      throw new CommandValidationError(
        'corner_round',
        `Corner round "${round.id}" references a missing point.`,
      );
    }
    const result = cornerRoundGeometry(
      document,
      round.corner,
      anchorA.id,
      anchorB.id,
      round.radius,
    );
    if (result.geometry === null) {
      throw new CommandValidationError(
        'corner_round',
        `Corner round "${round.id}": ${result.error}`,
      );
    }
    geometries.set(round.id, result.geometry);
  }

  // A line can carry one round at each end; the two tangent distances must leave
  // a piece of the original line between them.
  const perLine = new Map<EntityId, { length: number; used: number; round: EntityId }>();
  for (const round of rounds) {
    const geometry = geometries.get(round.id)!;
    for (const end of round.ends) {
      const line = lineEntity(document, end.line);
      const anchor = pointEntity(document, end.anchor)!;
      if (line === undefined) {
        throw new CommandValidationError(
          'corner_round',
          `Corner round "${round.id}" references a missing line.`,
        );
      }
      const length = distance(
        { x: pointEntity(document, round.corner)!.x, y: pointEntity(document, round.corner)!.y },
        anchor,
      );
      const current = perLine.get(end.line);
      perLine.set(end.line, {
        length,
        used: (current?.used ?? 0) + geometry.tangentDistance,
        round: current?.round ?? round.id,
      });
    }
  }

  for (const [lineId, fit] of perLine) {
    if (fit.length - fit.used < MIN_CORNER_ROUND) {
      throw new CommandValidationError(
        'corner_round',
        `Corner round "${fit.round}" no longer fits on line "${lineId}"; the radius is too large.`,
      );
    }
  }

  const entities = new Map<EntityId, Entity>(
    document.entities.map((entity) => [entity.id, { ...entity }]),
  );

  const replacePoint = (id: EntityId, coordinate: Vec2, construction: boolean): void => {
    const point = entities.get(id);
    if (point?.kind !== 'point') {
      throw new CommandValidationError(
        'corner_round',
        `Corner round derived point "${id}" is missing.`,
      );
    }
    entities.set(id, { ...point, x: coordinate.x, y: coordinate.y, construction, fixed: true });
  };

  for (const round of rounds) {
    const geometry = geometries.get(round.id)!;

    round.ends.forEach((end, index) => {
      const line = lineEntity(document, end.line)!;
      const tangent = index === 0 ? geometry.tangentA : geometry.tangentB;
      const control = index === 0 ? geometry.control1 : geometry.control2;
      replacePoint(end.tangent, tangent, isConstruction(line));
      replacePoint(round.controls[index]!, control, true);

      const current = entities.get(end.line) as LineEntity;
      const startsAtCorner = current.start === round.corner || current.start === end.tangent;
      entities.set(
        end.line,
        startsAtCorner ? { ...current, start: end.tangent } : { ...current, end: end.tangent },
      );
    });

    const arc = entities.get(round.arc);
    if (arc?.kind !== 'curve') {
      throw new CommandValidationError(
        'corner_round',
        `Corner round "${round.id}" references a missing arc.`,
      );
    }
    entities.set(round.arc, {
      ...arc,
      p0: round.ends[0].tangent,
      p1: round.controls[0],
      p2: round.controls[1],
      p3: round.ends[1].tangent,
      construction: isConstruction(lineEntity(document, round.ends[0].line)!),
    });

    if (round.center !== undefined) {
      replacePoint(round.center, geometry.center, true);
    }

    const corner = entities.get(round.corner) as PointEntity;
    entities.set(round.corner, { ...corner, construction: true });
  }

  return { ...document, entities: [...entities.values()] };
}

/** Whether a persisted feature still describes valid derived geometry. */
function isPersistedRoundValid(
  document: PatternDocument,
  round: CornerRound,
  seenCorners: Set<EntityId>,
): boolean {
  if (seenCorners.has(round.corner)) return false;
  if (!Number.isFinite(round.radius) || round.radius < MIN_CORNER_ROUND) return false;

  const corner = pointEntity(document, round.corner);
  if (corner === undefined) return false;

  const anchors = round.ends.map((end) => pointEntity(document, end.anchor));
  if (anchors.some((anchor) => anchor === undefined)) return false;

  const lines = round.ends.map((end) => lineEntity(document, end.line));
  if (lines.some((line) => line === undefined)) return false;
  if (round.ends[0].line === round.ends[1].line) return false;

  const geometry = cornerRoundGeometry(
    document,
    round.corner,
    anchors[0]!.id,
    anchors[1]!.id,
    round.radius,
  );
  if (geometry.geometry === null) return false;

  for (const [index, end] of round.ends.entries()) {
    const line = lines[index]!;
    const tangent = pointEntity(document, end.tangent);
    if (tangent === undefined || !tangent.fixed) return false;
    if (isConstruction(tangent) !== isConstruction(line)) return false;
    if (line.start !== end.tangent && line.end !== end.tangent) return false;

    const control = pointEntity(document, round.controls[index]!);
    if (control === undefined || !control.fixed || !control.construction) return false;

    const length = distance({ x: corner.x, y: corner.y }, anchors[index]!);
    const opposite = cornerRounds(document).filter(
      (candidate) =>
        candidate.id !== round.id && candidate.ends.some((other) => other.line === end.line),
    );
    let used = 0;
    for (const other of opposite) {
      const tangentDistance = tangentDistanceOf(document, other);
      if (tangentDistance !== null) used += tangentDistance;
    }
    if (length - used - geometry.geometry.tangentDistance < MIN_CORNER_ROUND) return false;
  }

  if (round.center !== undefined) {
    const centre = pointEntity(document, round.center);
    if (centre === undefined || !centre.fixed || !centre.construction) return false;
  }

  const arc = curveEntity(document, round.arc);
  if (arc === undefined) return false;
  if (arc.p0 !== round.ends[0].tangent || arc.p3 !== round.ends[1].tangent) return false;
  if (arc.p1 !== round.controls[0] || arc.p2 !== round.controls[1]) return false;
  if (arc.construction !== isConstruction(lines[0]!)) return false;

  seenCorners.add(round.corner);
  return true;
}

/**
 * Validate loaded features without moving geometry. A feature whose invariants
 * no longer hold is dropped and its persisted entities stay as static geometry.
 * Never throws.
 */
export function normalizeCornerRounds(document: PatternDocument): PatternDocument {
  const rounds = cornerRounds(document);
  if (rounds.length === 0) return document;

  const seenCorners = new Set<EntityId>();
  const kept = rounds.filter((round) => isPersistedRoundValid(document, round, seenCorners));
  const missingCentre = kept.filter((round) => round.center === undefined);
  if (kept.length === rounds.length && missingCentre.length === 0) return document;
  if (missingCentre.length === 0) return { ...document, cornerRounds: kept };

  // Mint the centre for a round that predates feature points. Load never moves
  // geometry: the minted point is computed once, and an existing entity with the
  // deterministic id is reused rather than overwritten.
  const entities = new Map<EntityId, Entity>(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const withCentre = kept.map((round): CornerRound => {
    if (round.center !== undefined) return round;

    const geometry = cornerRoundGeometry(
      document,
      round.corner,
      round.ends[0].anchor,
      round.ends[1].anchor,
      round.radius,
    ).geometry!;
    const id = `${round.id}:center`;

    if (!entities.has(id)) {
      entities.set(id, {
        id,
        kind: 'point',
        x: geometry.center.x,
        y: geometry.center.y,
        construction: true,
        fixed: true,
      });
    }

    return { ...round, center: id };
  });

  return { ...document, entities: [...entities.values()], cornerRounds: withCentre };
}
