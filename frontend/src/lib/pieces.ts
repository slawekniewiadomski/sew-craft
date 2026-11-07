import {
  allowanceDistance,
  resolveParam,
  allowanceForEdge,
  cornerAllowanceForRound,
  cornerAllowanceState,
  cornerRounds,
  getEntity,
  markIsBroken,
  notchDepthShare,
  pieceEntities,
  pieceLoop,
  pieceMarks,
  pieceMetrics,
  validatePiece,
  type AllowanceKind,
  type CutAnchor,
  type DerivedDistanceConstraint,
  type Entity,
  type EntityId,
  type MarkEntity,
  type PatternDocument,
  type Piece,
  type PieceMetrics,
  type Vec2,
} from '@sewcraft/geometry';

import { uniformAllowance, type AllowanceChoice } from './allowance-defaults';
import { formatDimensionValue } from './dimensions';

/** One row of the piece allowance editor. */
export interface PieceAllowanceRow {
  edge: EntityId;
  /** `none` means the edge has no allowance strip. */
  kind: AllowanceKind | 'none';
  width: number;
  /** The distance the cut line moves for this kind: `2 × width` for a double fold. */
  cutDistance: number;
}

/** One rounded corner's allowance row. */
export interface PieceCornerRow {
  round: EntityId;
  /** Radius in millimetres, for the row label. */
  radius: number;
  /** The corner's own cut width, or `null` when it inherits its edges. */
  cutWidth: number | null;
  /** The cut distance both edges agree on, or `null` when they differ or are absent. */
  inherited: number | null;
  /** Each half's cut distance when the crescent splits, in the round's end order. */
  halves: number[];
  state: 'own' | 'inherited' | 'split' | 'none' | 'broken';
}

/** One row of the piece's marks list: a notch or a centre line. */
export interface PieceMarkRow {
  id: EntityId;
  type: MarkEntity['type'];
  /** The notch's share of the allowance; `0` for a centre line. */
  depth: number;
  /** The cut distance a notch reaches into, in millimetres; `0` otherwise. */
  cutDistance: number;
  /** A short human label: the share as a percentage, or the line's ends. */
  detail: string;
  /** Whether the mark has nothing to draw right now. */
  broken: boolean;
}

/** The marks rows for a piece, resolved against the document on every read. */
export function pieceMarkRows(document: PatternDocument, piece: Piece): PieceMarkRow[] {
  return pieceMarks(document, piece.id).map((mark): PieceMarkRow => {
    if (mark.type === 'centre_line') {
      return {
        id: mark.id,
        type: 'centre_line',
        depth: 0,
        cutDistance: 0,
        detail: 'Centre line',
        broken: markIsBroken(document, piece, mark),
      };
    }

    const allowance = allowanceForEdge(piece, mark.edge);
    const share = notchDepthShare(mark.depth);
    return {
      id: mark.id,
      type: 'notch',
      depth: share,
      cutDistance: allowance === undefined ? 0 : allowanceDistance(allowance, document) * share,
      detail: `${Math.round(share * 100)}%`,
      broken: markIsBroken(document, piece, mark),
    };
  });
}

/** Everything the inspector reports for a piece that owns the selected edge. */
export interface PieceSummary {
  id: EntityId;
  name: string | null;
  quantity: number;
  edges: EntityId[];
  allowances: PieceAllowanceRow[];
  /** One row per corner round inside the piece, in document order. */
  corners: PieceCornerRow[];
  /** The allowance every edge shares, or `null` when the edges differ. */
  uniform: AllowanceChoice | null;
  metrics: PieceMetrics | null;
  /** Whether the piece has captured a cut loop at all. */
  hasLoop: boolean;
  /** Whether a captured loop no longer resolves (a deleted or re-roled edge). */
  broken: boolean;
  /** How many entities the piece owns, including annotations and text. */
  entityCount: number;
}

/** The allowance editor rows for a piece, one per loop edge. */
export function pieceAllowanceRows(document: PatternDocument, piece: Piece): PieceAllowanceRow[] {
  return piece.edges.map((edge) => {
    const allowance = allowanceForEdge(piece, edge);
    if (allowance === undefined) {
      return { edge, kind: 'none', width: 0, cutDistance: 0 };
    }
    return {
      edge,
      kind: allowance.kind ?? 'seam',
      width: resolveParam(document, allowance.width),
      cutDistance: allowanceDistance(allowance, document),
    };
  });
}

/** The allowance rows for a piece's rounded corners. */
export function pieceCornerRows(document: PatternDocument, piece: Piece): PieceCornerRow[] {
  const broken = piece.edges.length > 0 && pieceLoop(document, piece) === null;

  return cornerRounds(document)
    .filter((round) => round.ends.every((end) => piece.edges.includes(end.line)))
    .map((round) => {
      const lines = [round.ends[0].line, round.ends[1].line] as const;
      const own = cornerAllowanceForRound(piece, round.id);
      const before = allowanceForEdge(piece, lines[0]);
      const after = allowanceForEdge(piece, lines[1]);
      const state = broken ? 'broken' : cornerAllowanceState(piece, round.id, lines);
      const beforeCut = before === undefined ? null : allowanceDistance(before, document);
      const afterCut = after === undefined ? null : allowanceDistance(after, document);

      return {
        round: round.id,
        radius: resolveParam(document, round.radius),
        cutWidth: own?.cutWidth ?? null,
        inherited:
          state === 'inherited' && before !== undefined
            ? allowanceDistance(before, document)
            : null,
        halves: state === 'split' ? [beforeCut ?? 0, afterCut ?? 0] : [],
        state,
      };
    });
}

/** The inspector's piece card for a piece, with derived measurements. */
export function pieceSummary(document: PatternDocument, piece: Piece): PieceSummary {
  const metrics = pieceMetrics(document, piece);
  const hasLoop = piece.edges.length > 0;
  return {
    id: piece.id,
    name: piece.name ?? null,
    quantity: piece.quantity ?? 1,
    edges: [...piece.edges],
    allowances: pieceAllowanceRows(document, piece),
    corners: pieceCornerRows(document, piece),
    uniform: uniformAllowance(document, piece),
    metrics,
    hasLoop,
    broken: hasLoop && metrics === null,
    entityCount: pieceEntities(document, piece.id).length,
  };
}

/** Every piece's inspector view model, in document order. */
export function pieceSummaries(document: PatternDocument): PieceSummary[] {
  return document.pieces.map((piece) => pieceSummary(document, piece));
}

/** The display label for a piece: its name, or `Piece <n>` by 1-based position. */
export function pieceLabel(summary: PieceSummary, index: number): string {
  return summary.name ?? `Piece ${index + 1}`;
}

/** The title line of a drawer row; the quantity stays a separate pill. */
export function pieceTitleLine(summary: PieceSummary, index: number): string {
  return pieceLabel(summary, index);
}

/** One measured size: `220 × 210 mm`, or `—` when the piece cannot be measured. */
export function pieceSizeText(size: { width: number; height: number } | null | undefined): string {
  return size === undefined || size === null
    ? '—'
    : `${formatDimensionValue(size.width)} × ${formatDimensionValue(size.height)} mm`;
}

/** The secondary drawer line: `220 × 210 mm finished · 240 × 230 mm cut`. */
export function pieceSizeLine(metrics: PieceMetrics | null | undefined): string {
  return `${pieceSizeText(metrics?.finished)} finished · ${pieceSizeText(metrics?.cut)} cut`;
}

/** The piece that owns an edge, or `null`. */
export function pieceOwningEdge(document: PatternDocument, edge: EntityId): Piece | null {
  return document.pieces.find((piece) => piece.edges.includes(edge)) ?? null;
}

/** The piece that contains an entity: its owner field, or its loop edge. */
export function pieceForEntity(document: PatternDocument, id: EntityId): Piece | null {
  const entity = getEntity(document, id);
  if (entity !== undefined && entity.piece !== undefined) {
    return document.pieces.find((piece) => piece.id === entity.piece) ?? null;
  }
  return pieceOwningEdge(document, id);
}

/**
 * Whether the active piece may edit an entity. An entity with no owner stays
 * editable, so a legacy document is not locked; an entity owned by another
 * piece is refused and the UI explains which piece to switch to.
 */
export function canEditEntity(
  document: PatternDocument,
  id: EntityId,
  activePieceId: EntityId | null,
): boolean {
  if (activePieceId === null) return true;
  const owner = pieceForEntity(document, id);
  return owner === null || owner.id === activePieceId;
}

/** The two point ids a line, curve or arc joins, in its own direction. */
function endpointIds(entity: Entity): [EntityId, EntityId] | null {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'curve':
      return [entity.p0, entity.p3];
    case 'arc':
      return [entity.start, entity.end];
    case 'point':
    case 'circle':
    case 'text':
    case 'mark':
      return null;
  }
}

function positionOf(document: PatternDocument, id: EntityId): { x: number; y: number } | null {
  const entity = getEntity(document, id);
  return entity?.kind === 'point' ? { x: entity.x, y: entity.y } : null;
}

/** Point positions within the cut tolerance used by the command validator. */
function samePosition(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 0.001;
}

function endpointsAt(
  document: PatternDocument,
  id: EntityId,
):
  | [
      { id: EntityId; position: { x: number; y: number } },
      { id: EntityId; position: { x: number; y: number } },
    ]
  | null {
  const entity = getEntity(document, id);
  if (entity === undefined) return null;
  const ids = endpointIds(entity);
  if (ids === null) return null;
  const start = positionOf(document, ids[0]);
  const end = positionOf(document, ids[1]);
  if (start === null || end === null) return null;
  return [
    { id: ids[0], position: start },
    { id: ids[1], position: end },
  ];
}

export type PieceCreation = { ok: true; edges: EntityId[] } | { ok: false; message: string };

/**
 * Validate and order a selection of cut edges into one closed loop. Errors name
 * the first edge that cannot continue the chain, so the ribbon can explain why
 * Create piece is unavailable.
 */
export function pieceCreationFromSelection(
  document: PatternDocument,
  ids: readonly EntityId[],
  piece?: EntityId,
): PieceCreation {
  if (ids.length < 3) {
    return { ok: false, message: 'Select at least three cut edges to create a piece.' };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: 'An edge is selected more than once.' };
  }

  const first = ids[0]!;
  const firstEnds = endpointsAt(document, first);
  if (firstEnds === null) {
    return { ok: false, message: `Edge ${first} is not a cut line, curve or arc.` };
  }

  const ordered: EntityId[] = [first];
  const remaining = new Set(ids.slice(1));
  let tail = firstEnds[1];

  while (remaining.size > 0) {
    const next = [...remaining].find((id) => {
      const ends = endpointsAt(document, id);
      return (
        ends !== null &&
        (samePosition(tail.position, ends[0].position) ||
          samePosition(tail.position, ends[1].position))
      );
    });

    if (next === undefined) {
      return {
        ok: false,
        message: `Edge ${ordered[ordered.length - 1]} does not connect to another selected edge.`,
      };
    }

    const ends = endpointsAt(document, next)!;
    tail = samePosition(tail.position, ends[0].position) ? ends[1] : ends[0];
    ordered.push(next);
    remaining.delete(next);
  }

  if (!samePosition(tail.position, firstEnds[0].position)) {
    return {
      ok: false,
      message: `Edge ${ordered[ordered.length - 1]} does not connect to edge ${first}.`,
    };
  }

  const validation = validatePiece(document, ordered, { piece });
  return validation.ok ? { ok: true, edges: ordered } : { ok: false, message: validation.message };
}

/**
 * The cut-loop anchor at one end of a piece edge, addressed by the point the
 * selected loop vertex belongs to. Returns `null` when the point is not a loop
 * vertex of this piece.
 */
export function anchorForPoint(
  document: PatternDocument,
  piece: Piece,
  pointId: EntityId,
): CutAnchor | null {
  for (const edge of piece.edges) {
    const entity = getEntity(document, edge);
    if (entity === undefined) continue;
    const ids = endpointIds(entity);
    if (ids === null) continue;
    if (ids[0] === pointId) return { edge, at: 'start' };
    if (ids[1] === pointId) return { edge, at: 'end' };
  }
  return null;
}

/**
 * The cut anchor a piece's whole straight edge contributes. `null` for an edge
 * outside the piece or an edge that is not a cut line: a curve's or arc's cut
 * segment is a chord, so it is never a straight edge anchor.
 */
export function anchorForEdge(
  document: PatternDocument,
  piece: Piece,
  edgeId: EntityId,
): CutAnchor | null {
  if (!piece.edges.includes(edgeId)) return null;
  const entity = getEntity(document, edgeId);
  return entity?.kind === 'line' && !entity.construction ? { edge: edgeId, at: 'edge' } : null;
}

/**
 * Order two anchors canonically: edge-to-edge by the piece's edge order, a
 * vertex and an edge vertex-first, and two vertices as picked. Storing the
 * canonical order keeps a reversed re-placement idempotent.
 */
export function canonicalCutAnchors(
  piece: Piece,
  a: CutAnchor,
  b: CutAnchor,
): [CutAnchor, CutAnchor] {
  if (a.at === 'edge' && b.at === 'edge') {
    return piece.edges.indexOf(a.edge) <= piece.edges.indexOf(b.edge) ? [a, b] : [b, a];
  }
  if (a.at === 'edge') return [b, a];
  return [a, b];
}

/** Every piece that has this point on its loop, in document order. */
export function piecesAtPoint(document: PatternDocument, pointId: EntityId): Piece[] {
  return document.pieces.filter((piece) => anchorForPoint(document, piece, pointId) !== null);
}

/** The two point ids a line, curve or arc joins, or `null` for anything else. */
export function edgeEndpoints(
  document: PatternDocument,
  edgeId: EntityId,
): [EntityId, EntityId] | null {
  const entity = getEntity(document, edgeId);
  return entity === undefined ? null : endpointIds(entity);
}

/** How an edge reads in a row: `a → b`, falling back to its id when it has no ends. */
export function edgeLabel(document: PatternDocument, edgeId: EntityId): string {
  const ends = edgeEndpoints(document, edgeId);
  return ends === null ? edgeId : `${ends[0]} → ${ends[1]}`;
}

function sameAnchor(a: CutAnchor, b: CutAnchor): boolean {
  return a.edge === b.edge && a.at === b.at && (a.loop ?? 'cut') === (b.loop ?? 'cut');
}

/**
 * The nearest candidate whose screen point lies within `radius` pixels of the
 * pointer, or `null`. Ties keep the first candidate, so a caller that orders its
 * candidates by piece and then edge order gets a stable pick.
 */
export function nearestLoopHandle<T extends { point: Vec2 }>(
  candidates: readonly T[],
  pointer: Vec2,
  radius: number,
): T | null {
  let best: T | null = null;
  let bestDistance = 0;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.point.x - pointer.x, candidate.point.y - pointer.y);
    if (distance > radius) continue;
    if (best === null || distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** A cut dimension already measuring this piece span, in either direction. */
export function findDerivedDimension(
  document: PatternDocument,
  piece: EntityId,
  a: CutAnchor,
  b: CutAnchor,
): DerivedDistanceConstraint | undefined {
  return document.constraints.find(
    (constraint): constraint is DerivedDistanceConstraint =>
      constraint.type === 'derived_distance' &&
      constraint.piece === piece &&
      ((sameAnchor(constraint.a, a) && sameAnchor(constraint.b, b)) ||
        (sameAnchor(constraint.a, b) && sameAnchor(constraint.b, a))),
  );
}
