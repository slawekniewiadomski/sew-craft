import {
  effectiveDefaultAllowance,
  resolveParam,
  type AllowanceKind,
  type PatternDocument,
  type Piece,
} from '@sewcraft/geometry';

/** A kind and width pair shown by the default row and the All edges row. */
export interface AllowanceChoice {
  kind: AllowanceKind | 'none';
  width: number;
}

const kindOf = (allowance: { kind?: AllowanceKind }): AllowanceKind => allowance.kind ?? 'seam';

/** The Pieces drawer's row for the default copied onto new pieces. */
export function defaultAllowanceSummary(document: PatternDocument): AllowanceChoice {
  const preset = effectiveDefaultAllowance(document);
  return preset === null
    ? { kind: 'none', width: 0 }
    : { kind: kindOf(preset), width: resolveParam(document, preset.width) };
}

/**
 * The one allowance every loop edge of a piece shares, or `null` when they
 * differ. A piece whose edges all have no allowance yields the `none` choice.
 */
export function uniformAllowance(document: PatternDocument, piece: Piece): AllowanceChoice | null {
  const byEdge = new Map(piece.allowances.map((allowance) => [allowance.edge, allowance]));
  const values = piece.edges.map((edge) => byEdge.get(edge));

  if (values.every((allowance) => allowance === undefined)) return { kind: 'none', width: 0 };

  const first = values[0];
  if (first === undefined) return null;
  if (values.some((allowance) => allowance === undefined)) return null;
  const firstWidth = resolveParam(document, first.width);
  if (
    values.some(
      (allowance) =>
        resolveParam(document, allowance!.width) !== firstWidth ||
        kindOf(allowance!) !== kindOf(first),
    )
  ) {
    return null;
  }

  return { kind: kindOf(first), width: firstWidth };
}
