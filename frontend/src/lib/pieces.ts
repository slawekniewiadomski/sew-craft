import {
  allowanceDistance,
  allowanceForEdge,
  getEntity,
  pieceMetrics,
  validatePiece,
  type AllowanceKind,
  type CutAnchor,
  type DerivedDistanceConstraint,
  type Entity,
  type EntityId,
  type PatternDocument,
  type Piece,
  type PieceMetrics,
} from '@sewcraft/geometry';

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

/** Everything the inspector reports for a piece that owns the selected edge. */
export interface PieceSummary {
  id: EntityId;
  name: string | null;
  quantity: number;
  edges: EntityId[];
  allowances: PieceAllowanceRow[];
  metrics: PieceMetrics | null;
}

/** The allowance editor rows for a piece, one per loop edge. */
export function pieceAllowanceRows(piece: Piece): PieceAllowanceRow[] {
  return piece.edges.map((edge) => {
    const allowance = allowanceForEdge(piece, edge);
    if (allowance === undefined) {
      return { edge, kind: 'none', width: 0, cutDistance: 0 };
    }
    return {
      edge,
      kind: allowance.kind ?? 'seam',
      width: allowance.width,
      cutDistance: allowanceDistance(allowance),
    };
  });
}

/** The inspector's piece card for a piece, with derived measurements. */
export function pieceSummary(document: PatternDocument, piece: Piece): PieceSummary {
  return {
    id: piece.id,
    name: piece.name ?? null,
    quantity: piece.quantity ?? 1,
    edges: [...piece.edges],
    allowances: pieceAllowanceRows(piece),
    metrics: pieceMetrics(document, piece),
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

  const validation = validatePiece(document, ordered);
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
  return a.edge === b.edge && a.at === b.at;
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
