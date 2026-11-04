import {
  isExpressionParam,
  resolveParam,
  resolveVariable,
  type PatternDocument,
  type Unit,
  type Variable,
} from '@sewcraft/geometry';

import { formatDimensionValue } from './dimensions';

/** What a variable's value column says it is, derived from the stored value. */
export type VariableRowType = 'number' | 'formula' | 'ratio';

/** One row of the Variables panel table. */
export interface VariableRow {
  slug: string;
  name: string;
  unit: Unit;
  /** The value as written: the literal number or the formula text. */
  valueText: string;
  /** The resolved number for display: millimetres, or a ratio with no unit. */
  resolved: string;
  type: VariableRowType;
  /** A formula that no longer resolves, so the row shows its last number. */
  broken: boolean;
  comment: string;
}

/** The number a variable currently resolves to, for the table's tooltip. */
function resolvedText(document: PatternDocument, variable: Variable): string {
  const quantity = resolveVariable(document, variable.slug);
  if (quantity === null) {
    return isExpressionParam(variable.value) ? formatDimensionValue(variable.value.lastKnown) : '—';
  }
  const text = formatDimensionValue(quantity.value);
  return quantity.exponent === 0 ? `${text} (ratio)` : `${text} mm`;
}

/** The panel's rows, one per variable, in document order. */
export function variableRows(document: PatternDocument): VariableRow[] {
  return (document.variables ?? []).map((variable) => {
    const quantity = resolveVariable(document, variable.slug);
    const type: VariableRowType = isExpressionParam(variable.value)
      ? quantity !== null && quantity.exponent === 0
        ? 'ratio'
        : 'formula'
      : 'number';
    return {
      slug: variable.slug,
      name: variable.name,
      unit: variable.unit,
      valueText: isExpressionParam(variable.value)
        ? variable.value.expr
        : formatDimensionValue(resolveParam(document, variable.value)),
      resolved: resolvedText(document, variable),
      type,
      broken: quantity === null,
      comment: variable.comment ?? '',
    };
  });
}

/** A value as the command layer accepts it: a literal, or a formula to resolve. */
export type VariableValueInput = number | { expr: string };

/**
 * Parse a value cell. Empty text is not a value; anything that is not a plain
 * number becomes a formula, so `$bust/4`, `2cm` and `=` prefixes all work.
 */
export function parseVariableValueInput(input: string): VariableValueInput | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const expr = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
  return expr === '' ? null : { expr };
}
