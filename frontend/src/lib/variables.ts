import {
  isMeasuredVariable,
  isExpressionParam,
  measurementLength,
  resolveParam,
  resolveVariable,
  type EntityId,
  type PatternDocument,
  type Unit,
  type Variable,
} from '@sewcraft/geometry';

import { formatDimensionValue } from './dimensions';

/** What a variable's value column says it is, derived from the stored value. */
export type VariableRowType = 'number' | 'formula' | 'ratio' | 'measured';

/** One row of the Variables panel table. */
export interface VariableRow {
  slug: string;
  name: string;
  unit: Unit;
  /**
   * What the value cell shows. A written variable shows its literal or formula
   * text; a measured variable shows its live length in the row's display unit.
   */
  valueText: string;
  /** The resolved number for display: millimetres, or a ratio with no unit. */
  resolved: string;
  /** The resolved number for sorting, or `null` when it does not resolve. */
  sortValue: number | null;
  type: VariableRowType;
  /** The chain a measured variable reads, in traversal order; empty otherwise. */
  sources: EntityId[];
  /** A formula that no longer resolves, or a chain whose source disappeared. */
  broken: boolean;
  comment: string;
}

/** Millimetres rendered in a variable's display unit. */
function displayValue(millimetres: number, unit: Unit): string {
  return formatDimensionValue(unit === 'cm' ? millimetres / 10 : millimetres);
}

/** The number a written variable currently resolves to, for the table's tooltip. */
function resolvedText(
  document: PatternDocument,
  variable: Extract<Variable, { kind?: 'value' }>,
): string {
  const quantity = resolveVariable(document, variable.slug);
  if (quantity === null) {
    return isExpressionParam(variable.value) ? formatDimensionValue(variable.value.lastKnown) : '—';
  }
  const text = formatDimensionValue(quantity.value);
  return quantity.exponent === 0 ? `${text} (ratio)` : `${text} mm`;
}

/** A measured row: the live chain length, falling back to the last reading. */
function measuredRow(document: PatternDocument, variable: Variable): VariableRow {
  const measured = variable as Extract<Variable, { kind: 'measurement' }>;
  const live = measurementLength(document.entities, measured.sources);
  const total = live ?? measured.lastKnown ?? null;
  return {
    slug: measured.slug,
    name: measured.name,
    unit: measured.unit,
    valueText: total === null ? '—' : displayValue(total, measured.unit),
    resolved: total === null ? '—' : `${formatDimensionValue(total)} mm`,
    sortValue: total,
    type: 'measured',
    sources: measured.sources,
    broken: live === null,
    comment: measured.comment ?? '',
  };
}

/** The panel's rows, one per variable, in document order. */
export function variableRows(document: PatternDocument): VariableRow[] {
  return (document.variables ?? []).map((variable) => {
    if (isMeasuredVariable(variable)) return measuredRow(document, variable);

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
      sortValue: quantity === null ? null : quantity.value,
      type,
      sources: [],
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
