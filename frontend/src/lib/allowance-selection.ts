import type { AllowanceKind, BandTarget, EntityId, PatternDocument } from '@sewcraft/geometry';

import { edgeLabel, type PieceCornerRow, type PieceSummary } from './pieces';

/** One selected edge's allowance, resolved against the active piece. */
export interface AllowanceEdgeRow {
  edge: EntityId;
  /** `a → b`, the same span the outline shows. */
  label: string;
  kind: AllowanceKind | 'none';
  /** Finished width in millimetres; `0` when there is no allowance. */
  width: number;
  /** The distance the cut line moves: `2 × width` for a double fold. */
  cutDistance: number;
}

/** One selected rounded corner's allowance state. */
export interface AllowanceCornerRow {
  round: EntityId;
  radius: number;
  cutWidth: number | null;
  inherited: number | null;
  halves: number[];
  state: PieceCornerRow['state'];
  /** The cut width the corner currently uses, own, inherited or split sum. */
  effective: number | null;
}

/** The selected allowance regions, split into edges and rounded corners. */
export interface AllowanceSelection {
  edges: AllowanceEdgeRow[];
  corners: AllowanceCornerRow[];
  /** The rows actually found on the piece. */
  count: number;
  /** Whether the selected edges disagree on their finished width. */
  edgeWidthsMixed: boolean;
  /** Whether the selected corners disagree on their own cut width. */
  cornerWidthsMixed: boolean;
}

/** The cut width a corner currently uses, or `null` when it has no allowance. */
function cornerEffective(row: PieceCornerRow): number | null {
  switch (row.state) {
    case 'own':
      return row.cutWidth;
    case 'inherited':
      return row.inherited;
    case 'split':
      return row.halves.reduce((total, half) => total + half, 0);
    case 'none':
    case 'broken':
      return null;
  }
}

/**
 * Resolve the selected allowance regions against the active piece's summary.
 * Targets the piece no longer owns are skipped, so a stale canvas pick degrades
 * to the regions that still exist.
 */
export function allowanceSelection(
  document: PatternDocument,
  summary: PieceSummary,
  targets: readonly BandTarget[],
): AllowanceSelection {
  const selectedEdges = new Set(
    targets.flatMap((target) => (target.kind === 'edge' ? [target.edge] : [])),
  );
  const selectedRounds = new Set(
    targets.flatMap((target) => (target.kind === 'round' ? [target.round] : [])),
  );

  const edges = summary.allowances
    .filter((row) => selectedEdges.has(row.edge))
    .map((row): AllowanceEdgeRow => ({
      edge: row.edge,
      label: edgeLabel(document, row.edge),
      kind: row.kind,
      width: row.width,
      cutDistance: row.cutDistance,
    }));

  const corners = summary.corners
    .filter((row) => selectedRounds.has(row.round))
    .map((row): AllowanceCornerRow => ({
      round: row.round,
      radius: row.radius,
      cutWidth: row.cutWidth,
      inherited: row.inherited,
      halves: row.halves,
      state: row.state,
      effective: cornerEffective(row),
    }));

  return {
    edges,
    corners,
    count: edges.length + corners.length,
    edgeWidthsMixed: new Set(edges.map((row) => row.width)).size > 1,
    cornerWidthsMixed: new Set(corners.map((row) => row.cutWidth)).size > 1,
  };
}
