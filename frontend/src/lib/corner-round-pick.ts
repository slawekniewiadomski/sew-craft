import {
  cornerRoundGeometry,
  cornerRounds,
  documentSeams,
  getEntity,
  incidentLines,
  isCornerRoundDerived,
  lineEndpointAnchor,
  maxCornerRadius,
  MIN_CORNER_ROUND,
  sharedCorner,
  type CornerRound,
  type EntityId,
  type LineEntity,
  type PatternDocument,
} from '@sewcraft/geometry';
import { lineOf } from './corner-round-geometry';

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
