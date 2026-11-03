import {
  allowanceForEdge,
  cornerRoundGeometry,
  cornerRounds,
  documentSeams,
  getEntity,
  incidentLines,
  isCornerRoundDerived,
  lineEndpointAnchor,
  maxCornerRadius,
  MIN_CORNER_ROUND,
  type CornerRound,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  type Vec2,
} from '@sewcraft/geometry';

import { curvePath } from './canvas-render';

/** The two-line slot state of the Round corner tool. */
export interface CornerRoundPicks {
  first: EntityId | null;
  second: EntityId | null;
}

export type CornerRoundRejectionReason =
  | 'needs-lines'
  | 'not-corner'
  | 'distinct'
  | 'no-corner'
  | 'already-rounded'
  | 'mixed'
  | 'third-edge'
  | 'seam'
  | 'sharp'
  | 'straight'
  | 'no-direction'
  | 'radius';

export type CornerRoundPickResult =
  | { status: 'picking'; picks: CornerRoundPicks }
  | { status: 'ready'; picks: CornerRoundPicks; corner: EntityId; maxRadius: number }
  | { status: 'rejected'; picks: CornerRoundPicks; reason: CornerRoundRejectionReason };

export function emptyCornerRoundPicks(): CornerRoundPicks {
  return { first: null, second: null };
}

function lineOf(document: PatternDocument, id: EntityId): LineEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'line' ? entity : undefined;
}

function sharedCorner(first: LineEntity, second: LineEntity): EntityId | null {
  const shared = [first.start, first.end].filter((id) => id === second.start || id === second.end);
  return shared.length === 1 ? shared[0]! : null;
}

/** The largest radius the two picked lines can take, or `null` when unusable. */
export function maxCornerRadiusForLines(
  document: PatternDocument,
  first: EntityId,
  second: EntityId,
): number | null {
  const lineA = lineOf(document, first);
  const lineB = lineOf(document, second);
  if (lineA === undefined || lineB === undefined || first === second) return null;

  const corner = sharedCorner(lineA, lineB);
  if (corner === null) return null;

  const provisional: CornerRound = {
    id: 'corner-round-preview',
    corner,
    ends: [
      {
        line: first,
        anchor: lineEndpointAnchor(
          document,
          first,
          lineA.start === corner ? lineA.end : lineA.start,
        ),
        tangent: 'preview:a',
      },
      {
        line: second,
        anchor: lineEndpointAnchor(
          document,
          second,
          lineB.start === corner ? lineB.end : lineB.start,
        ),
        tangent: 'preview:b',
      },
    ],
    radius: 1,
    arc: 'preview:arc',
    controls: ['preview:c1', 'preview:c2'],
    cornerConstruction: false,
  };

  return maxCornerRadius(document, provisional);
}

/** The interior angle of a round, used to convert a tangent drag to a radius. */
export function cornerRoundAngle(document: PatternDocument, round: CornerRound): number | null {
  const result = cornerRoundGeometry(
    document,
    round.corner,
    round.ends[0].anchor,
    round.ends[1].anchor,
    1,
  );
  return result.geometry?.angle ?? null;
}

/** `radius = t · tan(θ / 2)`; the inverse of the tangent-distance formula. */
export function radiusFromTangentDistance(tangentDistance: number, angle: number): number {
  return tangentDistance * Math.tan(angle / 2);
}

/** A safe field default: five millimetres, or the largest radius that fits. */
export function defaultCornerRadius(maxRadius: number): number {
  return Math.round(Math.min(5, maxRadius) * 1000) / 1000;
}

/** A valid radius from field text, or `null` when invalid. */
export function parseCornerRadius(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() === '' || !Number.isFinite(value) || value < 0.001 ? null : value;
}

/** Millimetre text rounded to the field precision. */
export function formatCornerRadius(radius: number): string {
  return String(Math.round(radius * 1000) / 1000);
}

/** Prompt text for the tool's current pick state. */
export function cornerRoundPrompt(picks: CornerRoundPicks): string {
  if (picks.first === null) return 'Round corner — pick two lines or a corner.';
  if (picks.second === null) return 'Round corner — pick the second line.';
  return 'Round corner — set the radius.';
}

/** Human reason for a rejected pick. */
export function cornerRoundRejection(reason: CornerRoundRejectionReason): string {
  switch (reason) {
    case 'needs-lines':
      return 'Rounding needs two straight lines.';
    case 'not-corner':
      return 'Pick a corner between two lines.';
    case 'distinct':
      return 'Pick two different lines.';
    case 'no-corner':
      return 'The lines must meet at a corner.';
    case 'already-rounded':
      return 'This corner is already rounded.';
    case 'mixed':
      return 'Both lines must be cut edges or both construction.';
    case 'third-edge':
      return 'The corner is shared by more than two edges of this kind.';
    case 'seam':
      return 'Remove the seam allowance first.';
    case 'sharp':
      return 'The corner is too sharp for a round.';
    case 'straight':
      return 'The lines are straight; there is no corner to round.';
    case 'no-direction':
      return 'The line has no direction.';
    case 'radius':
      return 'The corner cannot be rounded.';
  }
}

/** Every point that can define a roundable corner right now. */
export function roundableCorners(document: PatternDocument): EntityId[] {
  const seamEdges = new Set(documentSeams(document).map((seam) => seam.edge));
  const roundedCorners = new Set(cornerRounds(document).map((round) => round.corner));
  const corners: EntityId[] = [];

  for (const point of document.entities) {
    if (point.kind !== 'point') continue;
    if (isCornerRoundDerived(document, point.id) || roundedCorners.has(point.id)) continue;

    const lines = incidentLines(document, point.id);
    if (lines.length !== 2) continue;
    if (lines[0]!.construction !== lines[1]!.construction) continue;
    if (lines.some((line) => seamEdges.has(line.id))) continue;
    corners.push(point.id);
  }

  return corners;
}

/** Resolve a picked corner point into its two lines, or explain why it cannot. */
function applyCornerPointPick(
  picks: CornerRoundPicks,
  pointId: EntityId,
  document: PatternDocument,
): CornerRoundPickResult {
  if (cornerRounds(document).some((round) => round.corner === pointId)) {
    return { status: 'rejected', picks, reason: 'already-rounded' };
  }

  const lines = incidentLines(document, pointId);
  if (lines.length !== 2) {
    return {
      status: 'rejected',
      picks,
      reason: lines.length > 2 ? 'third-edge' : 'not-corner',
    };
  }

  const [lineA, lineB] = lines as [LineEntity, LineEntity];
  if (lineA.construction !== lineB.construction) {
    return { status: 'rejected', picks, reason: 'mixed' };
  }
  if (documentSeams(document).some((seam) => seam.edge === lineA.id || seam.edge === lineB.id)) {
    return { status: 'rejected', picks, reason: 'seam' };
  }
  const anchorA = lineEndpointAnchor(
    document,
    lineA.id,
    lineA.start === pointId ? lineA.end : lineA.start,
  );
  const anchorB = lineEndpointAnchor(
    document,
    lineB.id,
    lineB.start === pointId ? lineB.end : lineB.start,
  );
  const geometry = cornerRoundGeometry(document, pointId, anchorA, anchorB, 1);
  if (geometry.geometry === null) {
    return { status: 'rejected', picks, reason: geometryReason(geometry.error) };
  }

  const maxRadius = maxCornerRadiusForLines(document, lineA.id, lineB.id);
  if (maxRadius === null || maxRadius < MIN_CORNER_ROUND) {
    return { status: 'rejected', picks, reason: 'radius' };
  }

  return {
    status: 'ready',
    picks: { first: lineA.id, second: lineB.id },
    corner: pointId,
    maxRadius,
  };
}

/** Map a geometry error to the reason the prompt bar shows. */
function geometryReason(error: string): CornerRoundRejectionReason {
  return error === 'The corner is too sharp for a round.'
    ? 'sharp'
    : error === 'The lines are straight; there is no corner to round.'
      ? 'straight'
      : error === 'The line has no direction.'
        ? 'no-direction'
        : 'radius';
}

/**
 * Apply one pick. A line fills a slot; a corner point resolves both slots at
 * once and replaces any pending line pick.
 */
export function applyCornerRoundPick(
  picks: CornerRoundPicks,
  id: EntityId,
  document: PatternDocument,
): CornerRoundPickResult {
  const entity = getEntity(document, id);
  if (entity?.kind === 'point') {
    return applyCornerPointPick(picks, id, document);
  }

  const line = lineOf(document, id);
  if (line === undefined) {
    return { status: 'rejected', picks, reason: 'needs-lines' };
  }
  if (picks.first === null) {
    return { status: 'picking', picks: { first: id, second: null } };
  }
  if (picks.first === id) {
    return { status: 'rejected', picks, reason: 'distinct' };
  }

  const firstLine = lineOf(document, picks.first);
  if (firstLine === undefined) {
    return { status: 'picking', picks: { first: id, second: null } };
  }

  // A committed round trims both lines away from the shared corner, so the
  // corner id is no longer an endpoint; the round itself is the evidence.
  const sharedRound = cornerRounds(document).find(
    (round) =>
      round.ends.some((end) => end.line === picks.first) &&
      round.ends.some((end) => end.line === id),
  );
  if (sharedRound !== undefined) {
    return { status: 'rejected', picks, reason: 'already-rounded' };
  }

  const corner = sharedCorner(firstLine, line);
  if (corner === null) {
    return { status: 'rejected', picks, reason: 'no-corner' };
  }
  if (cornerRounds(document).some((round) => round.corner === corner)) {
    return { status: 'rejected', picks, reason: 'already-rounded' };
  }
  if (firstLine.construction !== line.construction) {
    return { status: 'rejected', picks, reason: 'mixed' };
  }
  if (
    documentSeams(document).some((seam) => seam.edge === picks.first) ||
    documentSeams(document).some((seam) => seam.edge === id)
  ) {
    return { status: 'rejected', picks, reason: 'seam' };
  }
  const meeting = document.entities.filter(
    (entity) =>
      entity.kind === 'line' &&
      entity.construction === line.construction &&
      (entity.start === corner || entity.end === corner),
  );
  if (meeting.length > 2) {
    return { status: 'rejected', picks, reason: 'third-edge' };
  }

  const anchorA = lineEndpointAnchor(
    document,
    picks.first,
    firstLine.start === corner ? firstLine.end : firstLine.start,
  );
  const anchorB = lineEndpointAnchor(document, id, line.start === corner ? line.end : line.start);
  const geometry = cornerRoundGeometry(document, corner, anchorA, anchorB, 1);
  if (geometry.geometry === null) {
    return { status: 'rejected', picks, reason: geometryReason(geometry.error) };
  }

  const maxRadius = maxCornerRadiusForLines(document, picks.first, id);
  if (maxRadius === null || maxRadius < 0.001) {
    return { status: 'rejected', picks, reason: 'radius' };
  }

  return {
    status: 'ready',
    picks: { first: picks.first, second: id },
    corner,
    maxRadius,
  };
}

/** One trimmed line in the live preview. */
export interface CornerRoundPreviewLine {
  id: EntityId;
  /** The line's unchanged far endpoint. */
  from: Vec2;
  /** The proposed tangent point at the rounded corner. */
  to: Vec2;
}

/** Everything the canvas needs to draw a round that has not been committed. */
export interface CornerRoundPreview {
  corner: EntityId;
  tangents: [Vec2, Vec2];
  lines: [CornerRoundPreviewLine, CornerRoundPreviewLine];
  /** The proposed arc, as a cubic Bézier path. */
  arc: string;
}

function pointOf(document: PatternDocument, id: EntityId): PointEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'point' ? entity : undefined;
}

/**
 * The live preview of a round: trimmed lines, tangent points and the dashed arc.
 * Pure; `null` when the picks or the radius cannot form a round yet.
 */
export function cornerRoundPreview(
  document: PatternDocument,
  picks: CornerRoundPicks,
  radius: number,
): CornerRoundPreview | null {
  if (picks.first === null || picks.second === null) return null;
  if (!Number.isFinite(radius) || radius < MIN_CORNER_ROUND) return null;

  const lineA = lineOf(document, picks.first);
  const lineB = lineOf(document, picks.second);
  if (lineA === undefined || lineB === undefined || lineA.id === lineB.id) return null;

  const corner = sharedCorner(lineA, lineB);
  if (corner === null) return null;

  const oppositeA = lineA.start === corner ? lineA.end : lineA.start;
  const oppositeB = lineB.start === corner ? lineB.end : lineB.start;
  const farA = pointOf(document, oppositeA);
  const farB = pointOf(document, oppositeB);
  if (farA === undefined || farB === undefined) return null;

  const geometry = cornerRoundGeometry(
    document,
    corner,
    lineEndpointAnchor(document, picks.first, oppositeA),
    lineEndpointAnchor(document, picks.second, oppositeB),
    radius,
  );
  if (geometry.geometry === null) return null;

  return {
    corner,
    tangents: [geometry.geometry.tangentA, geometry.geometry.tangentB],
    lines: [
      { id: picks.first, from: { x: farA.x, y: farA.y }, to: geometry.geometry.tangentA },
      { id: picks.second, from: { x: farB.x, y: farB.y }, to: geometry.geometry.tangentB },
    ],
    arc: curvePath([
      geometry.geometry.tangentA,
      geometry.geometry.control1,
      geometry.geometry.control2,
      geometry.geometry.tangentB,
    ]),
  };
}

/** Midpoint of a cubic Bézier at `t = 0.5`. */
function cubicMidpoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Vec2 {
  return {
    x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
    y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
  };
}

/** The render data for a committed round's `R 12` label. */
export interface CornerRoundLabel {
  id: EntityId;
  radius: number;
  /** World-space midpoint of the arc. */
  x: number;
  y: number;
  /** Unit direction from the sharp corner through the label, away from the arc. */
  outwardX: number;
  outwardY: number;
  text: string;
  accessible: string;
}

/** The `R 12` overlay label for a round, or `null` when it cannot be located. */
export function cornerRoundLabel(
  document: PatternDocument,
  round: CornerRound,
): CornerRoundLabel | null {
  const corner = pointOf(document, round.corner);
  if (corner === undefined) return null;

  const geometry = cornerRoundGeometry(
    document,
    round.corner,
    round.ends[0].anchor,
    round.ends[1].anchor,
    round.radius,
  );
  if (geometry.geometry === null) return null;

  const mid = cubicMidpoint(
    geometry.geometry.tangentA,
    geometry.geometry.control1,
    geometry.geometry.control2,
    geometry.geometry.tangentB,
  );
  const dx = mid.x - corner.x;
  const dy = mid.y - corner.y;
  const length = Math.hypot(dx, dy);

  const text = formatCornerRadius(round.radius);

  return {
    id: round.id,
    radius: round.radius,
    x: mid.x,
    y: mid.y,
    outwardX: dx / length,
    outwardY: dy / length,
    text: `R ${text}`,
    accessible: `Corner radius ${text} millimetres`,
  };
}

/**
 * The radius a tangent handle drag asks for: the pointer projected onto the
 * line direction, converted with `r = t · tan(θ / 2)` and clamped to the fit.
 * `null` when the round or the direction is unusable.
 */
export function tangentDragRadius(
  document: PatternDocument,
  round: CornerRound,
  endIndex: 0 | 1,
  world: Vec2,
): number | null {
  const corner = pointOf(document, round.corner);
  const anchor = pointOf(document, round.ends[endIndex].anchor);
  if (corner === undefined || anchor === undefined) return null;

  const angle = cornerRoundAngle(document, round);
  const maximum = maxCornerRadius(document, round);
  if (angle === null || maximum === null || maximum < MIN_CORNER_ROUND) return null;

  const dx = anchor.x - corner.x;
  const dy = anchor.y - corner.y;
  const length = Math.hypot(dx, dy);

  const tangentDistance = ((world.x - corner.x) * dx + (world.y - corner.y) * dy) / length;
  const raw = radiusFromTangentDistance(tangentDistance, angle);

  const clamped = Math.min(Math.max(raw, MIN_CORNER_ROUND), maximum);
  return Math.min(Math.round(clamped * 1000) / 1000, maximum);
}
