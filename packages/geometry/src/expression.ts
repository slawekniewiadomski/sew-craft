import type { Unit } from './types.js';

/** Largest nesting of parentheses or unary signs the parser accepts. */
export const MAX_EXPRESSION_DEPTH = 64;

/** Canonical millimetres per formula unit. */
const UNIT_SCALE: Record<Unit, number> = { mm: 1, cm: 10 };

const WHITESPACE = /\s/;
const DIGIT = /[0-9]/;
const SLUG_START = /[a-z]/;
const SLUG_PART = /[a-z0-9_]/;

/**
 * Why a formula was rejected. `cycle` is not raised by the parser itself: a
 * variable resolver reports it when a slug chain revisits a variable.
 */
export type ExpressionFailureCode = 'syntax' | 'unknown-variable' | 'cycle' | 'dimension' | 'range';

/**
 * A rejected formula. `offset` is the zero-based index of the character that
 * caused it; token errors name that offset in the message, while dimension
 * failures describe the operands and leave the index to `offset`.
 */
export class ExpressionError extends Error {
  readonly code: ExpressionFailureCode;
  readonly offset: number;

  constructor(code: ExpressionFailureCode, message: string, offset: number) {
    super(message);
    this.name = 'ExpressionError';
    this.code = code;
    this.offset = offset;
  }
}

/**
 * A dimensioned number. `value` is canonical millimetres raised to `exponent`,
 * so `3 cm²` is `{ value: 300, exponent: 2 }`.
 */
export interface Quantity {
  value: number;
  /** 0 is a ratio, 1 a length, 2 an area. */
  exponent: number;
}

/** Resolves the slugs a formula names. */
export interface ExpressionContext {
  /** `slug` is the variable name without its leading `$`; `null` means undefined. */
  lookup(slug: string): Quantity | null;
}

type Operator = '+' | '-' | '*' | '/';

type Token =
  | { kind: 'number'; value: number; unit: Unit | null; offset: number }
  | { kind: 'slug'; name: string; offset: number }
  | { kind: 'operator'; operator: Operator; offset: number }
  | { kind: 'paren'; paren: '(' | ')'; offset: number };

/** Rejects a value the evaluator cannot carry, naming the offset that made it. */
function finite(value: number, offset: number): number {
  if (!Number.isFinite(value)) {
    throw new ExpressionError('range', 'result is not finite', offset);
  }
  return value;
}

function quantity(value: number, exponent: number, offset: number): Quantity {
  return { value: finite(value, offset), exponent };
}

function syntax(message: string, offset: number): ExpressionError {
  return new ExpressionError('syntax', message, offset);
}

function readNumber(source: string, start: number, tokens: Token[]): number {
  let index = start;
  while (index < source.length && DIGIT.test(source[index]!)) index += 1;

  if (source[index] === '.') {
    index += 1;
    if (index >= source.length || !DIGIT.test(source[index]!)) {
      throw syntax(`expected a digit at ${index}`, index);
    }
    while (index < source.length && DIGIT.test(source[index]!)) index += 1;
  }

  const value = finite(Number(source.slice(start, index)), start);

  // A unit binds to the number literal across optional whitespace.
  let unitIndex = index;
  while (unitIndex < source.length && WHITESPACE.test(source[unitIndex]!)) unitIndex += 1;
  const unitText = source.slice(unitIndex, unitIndex + 2).toLowerCase();
  let unit: Unit | null = null;
  if (unitText === 'mm' || unitText === 'cm') {
    unit = unitText;
    index = unitIndex + 2;
  }

  tokens.push({ kind: 'number', value, unit, offset: start });
  return index;
}

function readSlug(source: string, start: number, tokens: Token[]): number {
  const nameStart = start + 1;
  if (nameStart >= source.length || !SLUG_START.test(source[nameStart]!)) {
    throw syntax(`expected a variable name after '$' at ${nameStart}`, nameStart);
  }

  let index = nameStart;
  while (index < source.length && SLUG_PART.test(source[index]!)) index += 1;

  tokens.push({ kind: 'slug', name: source.slice(nameStart, index), offset: start });
  return index;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (WHITESPACE.test(char)) {
      index += 1;
      continue;
    }
    if (DIGIT.test(char)) {
      index = readNumber(source, index, tokens);
      continue;
    }
    if (char === '$') {
      index = readSlug(source, index, tokens);
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'operator', operator: char, offset: index });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', paren: char, offset: index });
      index += 1;
      continue;
    }

    throw syntax(`unexpected character '${char}' at ${index}`, index);
  }

  return tokens;
}

/** One level per nested parenthesis or unary sign, refusing to recurse past the bound. */
function descend(depth: number, offset: number): number {
  if (depth >= MAX_EXPRESSION_DEPTH) {
    throw new ExpressionError(
      'range',
      `expression is nested deeper than ${MAX_EXPRESSION_DEPTH} levels`,
      offset,
    );
  }
  return depth + 1;
}

function describeExponent(exponent: number): string {
  switch (exponent) {
    case 0:
      return 'a plain number';
    case 1:
      return 'a length';
    case 2:
      return 'an area';
    case 3:
      return 'a volume';
    default:
      return `a quantity with exponent ${exponent}`;
  }
}

function additive(left: Quantity, right: Quantity, operator: '+' | '-', offset: number): Quantity {
  if (left.exponent !== right.exponent) {
    const verb = operator === '+' ? 'add' : 'subtract';
    throw new ExpressionError(
      'dimension',
      `cannot ${verb} ${describeExponent(left.exponent)} and ${describeExponent(right.exponent)}`,
      offset,
    );
  }
  const value = operator === '+' ? left.value + right.value : left.value - right.value;
  return quantity(value, left.exponent, offset);
}

function multiplicative(
  left: Quantity,
  right: Quantity,
  operator: '*' | '/',
  offset: number,
): Quantity {
  const exponent =
    operator === '*' ? left.exponent + right.exponent : left.exponent - right.exponent;
  const value = operator === '*' ? left.value * right.value : left.value / right.value;
  return quantity(value, exponent, offset);
}

function describeToken(token: Token): string {
  switch (token.kind) {
    case 'number':
      return `number '${token.value}'`;
    case 'slug':
      return `variable '$${token.name}'`;
    case 'operator':
      return `operator '${token.operator}'`;
    case 'paren':
      return `'${token.paren}'`;
  }
}

function unexpected(token: Token): ExpressionError {
  return syntax(`unexpected ${describeToken(token)} at ${token.offset}`, token.offset);
}

class ExpressionParser {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly end: number,
    private readonly context: ExpressionContext,
  ) {}

  parse(): Quantity {
    const result = this.expression(0);
    const trailing = this.tokens[this.position];
    if (trailing !== undefined) throw unexpected(trailing);
    return result;
  }

  private expression(depth: number): Quantity {
    let left = this.term(depth);
    for (;;) {
      const token = this.tokens[this.position];
      if (token?.kind !== 'operator' || (token.operator !== '+' && token.operator !== '-')) {
        return left;
      }
      this.position += 1;
      left = additive(left, this.term(depth), token.operator, token.offset);
    }
  }

  private term(depth: number): Quantity {
    let left = this.factor(depth);
    for (;;) {
      const token = this.tokens[this.position];
      if (token?.kind !== 'operator' || (token.operator !== '*' && token.operator !== '/')) {
        return left;
      }
      this.position += 1;
      left = multiplicative(left, this.factor(depth), token.operator, token.offset);
    }
  }

  private factor(depth: number): Quantity {
    const token = this.tokens[this.position];
    if (token?.kind === 'operator' && (token.operator === '+' || token.operator === '-')) {
      this.position += 1;
      const operand = this.factor(descend(depth, token.offset));
      return quantity(
        token.operator === '-' ? -operand.value : operand.value,
        operand.exponent,
        token.offset,
      );
    }
    return this.primary(depth);
  }

  private primary(depth: number): Quantity {
    const token = this.tokens[this.position];

    if (token === undefined) {
      throw syntax(`expected an expression at ${this.end}`, this.end);
    }

    if (token.kind === 'number') {
      this.position += 1;
      return token.unit === null
        ? quantity(token.value, 0, token.offset)
        : quantity(token.value * UNIT_SCALE[token.unit], 1, token.offset);
    }

    if (token.kind === 'slug') {
      this.position += 1;
      const resolved = this.context.lookup(token.name);
      if (resolved === null) {
        throw new ExpressionError(
          'unknown-variable',
          `unknown variable $${token.name} at ${token.offset}`,
          token.offset,
        );
      }
      return quantity(resolved.value, resolved.exponent, token.offset);
    }

    if (token.kind === 'paren' && token.paren === '(') {
      this.position += 1;
      const inner = this.expression(descend(depth, token.offset));
      const closing = this.tokens[this.position];
      if (closing?.kind !== 'paren' || closing.paren !== ')') {
        const offset = closing === undefined ? this.end : closing.offset;
        throw syntax(`expected ')' at ${offset}`, offset);
      }
      this.position += 1;
      return inner;
    }

    throw unexpected(token);
  }
}

/**
 * Parse and evaluate a formula into a dimensioned quantity in canonical
 * millimetres. A literal is a ratio unless it carries `mm` or `cm`; `$slug`
 * operands come from `context`. Throws `ExpressionError` for a syntax error, an
 * unknown slug, a dimension mismatch, exceeded nesting or a non-finite result.
 */
export function evaluateQuantity(source: string, context: ExpressionContext): Quantity {
  return new ExpressionParser(tokenize(source), source.length, context).parse();
}

/**
 * Evaluate a formula that must produce a length and return its millimetres.
 * A dimension failure points at offset 0 because it belongs to the whole formula.
 */
export function evaluateLength(source: string, context: ExpressionContext): number {
  const result = evaluateQuantity(source, context);
  if (result.exponent !== 1) {
    const found = result.exponent === 0 ? 'a ratio' : describeExponent(result.exponent);
    throw new ExpressionError('dimension', `expected a length, got ${found}`, 0);
  }
  return result.value;
}
