import {
  cornerRoundGeometry,
  getEntity,
  lineEndpointAnchor,
  maxCornerRadius,
  MIN_CORNER_ROUND,
  sharedCorner,
  formatMillimetres,
  resolveParam,
  roundToThousandth,
  type CornerRound,
  type EntityId,
  type LineEntity,
  type Param,
  type ParamInput,
  type PatternDocument,
  type PointEntity,
  type Vec2,
  type VariableScope,
} from '@sewcraft/geometry';

import { curvePath } from './canvas-render';
import { formulaIssue, parseParamEdit } from './formula';
import type { CornerRoundPicks } from './corner-round-pick';

export function lineOf(document: PatternDocument, id: EntityId): LineEntity | undefined {
  const entity = getEntity(document, id);
  return entity?.kind === 'line' ? entity : undefined;
}

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
  return roundToThousandth(Math.min(5, maxRadius));
}

/** A valid radius from field text, or `null` when invalid. */
export function parseCornerRadius(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() === '' || !Number.isFinite(value) || value < 0.001 ? null : value;
}

/** A radius field read as a parameter: a literal or a resolving formula. */
export type CornerRadiusField =
  { kind: 'param'; param: ParamInput; radius: number } | { kind: 'invalid'; message: string };

/**
 * Read the radius field. A plain number is a literal and any other text is a
 * formula over the document's variables; both must resolve to a positive length.
 * The parameter is what a command stores, the radius what the preview draws.
 */
export function parseCornerRadiusField(scope: VariableScope, text: string): CornerRadiusField {
  const edit = parseParamEdit(text);
  if (edit.kind === 'number') {
    return edit.value >= MIN_CORNER_ROUND
      ? { kind: 'param', param: edit.value, radius: edit.value }
      : { kind: 'invalid', message: 'Enter a radius of at least 0.001 mm.' };
  }
  if (edit.kind !== 'formula') {
    return { kind: 'invalid', message: 'Enter a radius of at least 0.001 mm.' };
  }

  const issue = formulaIssue(scope, edit.expr);
  if (issue !== null) return { kind: 'invalid', message: issue };

  const radius = resolveParam(scope, { expr: edit.expr, lastKnown: MIN_CORNER_ROUND });
  return radius >= MIN_CORNER_ROUND
    ? { kind: 'param', param: { expr: edit.expr }, radius }
    : { kind: 'invalid', message: 'Enter a radius of at least 0.001 mm.' };
}

/** Millimetre text rounded to the field precision. */
export function formatCornerRadius(radius: number): string {
  return formatMillimetres(radius);
}

/** The radius field's text: the stored formula, else the rounded number. */
export function formatCornerRadiusParam(param: Param): string {
  return typeof param === 'number' ? formatCornerRadius(param) : param.expr;
}

/** Whether a field's read parameter already matches the stored one. */
export function sameCornerRadiusParam(stored: Param, next: ParamInput): boolean {
  return typeof stored === 'number' || typeof next === 'number'
    ? stored === next
    : stored.expr === next.expr;
}

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

  const radius = resolveParam(document, round.radius);
  const geometry = cornerRoundGeometry(
    document,
    round.corner,
    round.ends[0].anchor,
    round.ends[1].anchor,
    radius,
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

  const text = formatCornerRadius(radius);

  return {
    id: round.id,
    radius,
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
  return Math.min(roundToThousandth(clamped), maximum);
}
