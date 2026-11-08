import { resolveParam, sameParam, type VariableScope } from './expression.js';
import type {
  Allowance,
  AllowanceKind,
  CornerAllowance,
  EntityId,
  PatternDocument,
  Piece,
} from './types.js';

/** The finished width a kind contributes to the cut distance. */
export function allowanceDistance(allowance: Allowance, scope: VariableScope = {}): number {
  const width = resolveParam(scope, allowance.width);
  return allowance.kind === 'double' ? width * 2 : width;
}

/** The allowance for one loop edge, or `undefined` when it has none. */
export function allowanceForEdge(piece: Piece, edge: EntityId): Allowance | undefined {
  return piece.allowances.find((allowance) => allowance.edge === edge);
}

/** The piece a loop edge belongs to, or `undefined`. */
export function pieceForEdge(
  document: PatternDocument,
  edge: EntityId,
  ignorePiece?: EntityId,
): Piece | undefined {
  return document.pieces.find((piece) => piece.id !== ignorePiece && piece.edges.includes(edge));
}

/** The corner round's own allowance, or `undefined` when it has none. */
export function cornerAllowanceForRound(
  piece: Piece,
  round: EntityId,
): CornerAllowance | undefined {
  return piece.cornerAllowances?.find((allowance) => allowance.round === round);
}

/** A corner width that can be used, or `null` for a missing or invalid value. */
export function usableCornerWidth(allowance: CornerAllowance | undefined): number | null {
  if (allowance === undefined || !Number.isFinite(allowance.cutWidth)) return null;
  return allowance.cutWidth > 0 ? allowance.cutWidth : null;
}

/** How one corner round's allowance resolves. */
export type CornerAllowanceState = 'own' | 'inherited' | 'split' | 'none';

/**
 * The state of a round's band: its own width, the width its two adjacent edges
 * agree on, a split between differing edges, or no band at all.
 */
export function cornerAllowanceState(
  piece: Piece,
  round: EntityId,
  lines: readonly [EntityId, EntityId],
): CornerAllowanceState {
  if (usableCornerWidth(cornerAllowanceForRound(piece, round)) !== null) return 'own';
  const before = allowanceForEdge(piece, lines[0]);
  const after = allowanceForEdge(piece, lines[1]);
  if (sameAllowance(before, after)) return before === undefined ? 'none' : 'inherited';
  return 'split';
}

const kindOf = (allowance: Allowance | undefined): AllowanceKind => allowance?.kind ?? 'seam';

/** Whether two loop-edge allowances carry the same width and effective kind. */
export function sameAllowance(a: Allowance | undefined, b: Allowance | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameParam(a.width, b.width) && kindOf(a) === kindOf(b);
}

/** One boundary segment's resolved allowances, in cut millimetres. */
export interface SegmentAllowance {
  /** Distance the cut line moves. */
  distance: number;
  /** Distance the fold line sits inside the cut line; `0` unless a double fold. */
  fold: number;
}

/** The cut and fold distance of one edge's allowance. */
export function edgeAllowance(
  document: PatternDocument,
  allowance: Allowance | undefined,
): SegmentAllowance {
  if (allowance === undefined) return { distance: 0, fold: 0 };
  return {
    distance: allowanceDistance(allowance, document),
    fold: allowance.kind === 'double' ? resolveParam(document, allowance.width) : 0,
  };
}
