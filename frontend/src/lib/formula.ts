import {
  evaluateLength,
  resolveVariable,
  type Param,
  type PatternDocument,
  type Variable,
} from '@sewcraft/geometry';

/** The document fields a formula needs; a partial document resolves no variables. */
export interface FormulaScope {
  variables?: readonly Variable[] | undefined;
}

import { formatDimensionValue } from './dimensions';

/** One interpretation of a text field that takes a millimetre parameter. */
export type ParamEdit =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'formula'; expr: string }
  | { kind: 'invalid' };

/**
 * Read a parameter field. A plain number is a literal, a leading `=` forces a
 * formula, and any other text is a formula so `$bust/4` and `2cm` both work.
 */
export function parseParamEdit(input: string): ParamEdit {
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return { kind: 'number', value: Number(trimmed) };
  const expr = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
  return expr === '' ? { kind: 'invalid' } : { kind: 'formula', expr };
}

/** Why a formula cannot be used here, or `null` when it resolves to a length. */
export function formulaIssue(document: FormulaScope, expr: string): string | null {
  let value: number;
  try {
    value = evaluateLength(expr, { lookup: (slug) => resolveVariable(document, slug) });
  } catch (error) {
    // `evaluateLength` only throws `ExpressionError`, whose message says why.
    return (error as Error).message;
  }
  return value > 0 ? null : 'value must be greater than 0';
}

/** Why a stored or typed parameter cannot drive geometry, or `null` when it can. */
export function paramIssue(document: FormulaScope, param: Param): string | null {
  if (typeof param === 'number') {
    return Number.isFinite(param) && param > 0 ? null : 'value must be greater than 0';
  }
  return formulaIssue(document, param.expr);
}

/** One row of the `$` picker. */
export interface VariableOption {
  slug: string;
  name: string;
  /** The resolved value, so the picker shows what a slug means. */
  resolved: string;
}

/** Every variable the picker can insert, in document order. */
export function variableOptions(document: PatternDocument): VariableOption[] {
  return (document.variables ?? []).map((variable) => {
    const quantity = resolveVariable(document, variable.slug);
    const resolved =
      quantity === null
        ? 'broken'
        : quantity.exponent === 0
          ? `${formatDimensionValue(quantity.value)} (ratio)`
          : `${formatDimensionValue(quantity.value)} mm`;
    return { slug: variable.slug, name: variable.name, resolved };
  });
}

/** The `$partial` being typed at the end of a field, or `null`. */
export function variableQuery(text: string): string | null {
  const match = /\$([a-z0-9_]*)$/.exec(text);
  return match === null ? null : match[1]!;
}

/** Whether a typed `$query` already names a whole variable slug. */
export function variableQueryIsComplete(document: FormulaScope, query: string): boolean {
  return (document.variables ?? []).some((variable) => variable.slug === query);
}

/** Replace the `$partial` at the caret with a full token. */
export function insertVariableToken(text: string, slug: string): string {
  return text.replace(/\$[a-z0-9_]*$/, `$${slug}`);
}
