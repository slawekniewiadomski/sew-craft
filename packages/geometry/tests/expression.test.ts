import { describe, expect, it, vi } from 'vitest';

import {
  ExpressionError,
  MAX_EXPRESSION_DEPTH,
  evaluateLength,
  evaluateQuantity,
  type ExpressionContext,
  type Quantity,
} from '../src/index.js';

const NO_VARIABLES: ExpressionContext = { lookup: () => null };

function contextOf(values: Record<string, Quantity>): ExpressionContext {
  const bySlug = new Map(Object.entries(values));
  return { lookup: (slug) => bySlug.get(slug) ?? null };
}

/** Run an expression and return the error it must throw. */
function capture(run: () => unknown): ExpressionError {
  try {
    run();
  } catch (error) {
    if (error instanceof ExpressionError) return error;
    throw error;
  }
  throw new Error('expected an ExpressionError');
}

function expectSyntax(source: string, message: string, offset: number): void {
  const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
  expect(error.code).toBe('syntax');
  expect(error.message).toBe(message);
  expect(error.offset).toBe(offset);
}

describe('evaluateQuantity', () => {
  describe('literals and units', () => {
    it('reads a bare literal as a ratio', () => {
      expect(evaluateQuantity('42', NO_VARIABLES)).toEqual({ value: 42, exponent: 0 });
    });

    it('reads a decimal and ignores surrounding whitespace', () => {
      expect(evaluateQuantity('  2.75  ', NO_VARIABLES)).toEqual({ value: 2.75, exponent: 0 });
    });

    it('converts a millimetre literal one-to-one', () => {
      expect(evaluateQuantity('10mm', NO_VARIABLES)).toEqual({ value: 10, exponent: 1 });
    });

    it('converts a centimetre literal to millimetres', () => {
      expect(evaluateQuantity('2.5cm', NO_VARIABLES)).toEqual({ value: 25, exponent: 1 });
    });

    it('accepts a space before the unit', () => {
      expect(evaluateQuantity('10 cm', NO_VARIABLES)).toEqual({ value: 100, exponent: 1 });
      expect(evaluateQuantity('1 cm + 2 mm', NO_VARIABLES)).toEqual({ value: 12, exponent: 1 });
    });

    it('accepts units case-insensitively', () => {
      expect(evaluateQuantity('10CM', NO_VARIABLES)).toEqual({ value: 100, exponent: 1 });
      expect(evaluateQuantity('10Mm', NO_VARIABLES)).toEqual({ value: 10, exponent: 1 });
    });
  });

  describe('operators and precedence', () => {
    it('multiplies before adding', () => {
      expect(evaluateQuantity('2 + 3 * 4', NO_VARIABLES)).toEqual({ value: 14, exponent: 0 });
      expect(evaluateQuantity('2 * 3 + 4', NO_VARIABLES)).toEqual({ value: 10, exponent: 0 });
    });

    it('honours parentheses', () => {
      expect(evaluateQuantity('(2 + 3) * 4', NO_VARIABLES)).toEqual({ value: 20, exponent: 0 });
    });

    it('is left-associative', () => {
      expect(evaluateQuantity('10 - 3 - 2', NO_VARIABLES)).toEqual({ value: 5, exponent: 0 });
      expect(evaluateQuantity('8 / 4 / 2', NO_VARIABLES)).toEqual({ value: 1, exponent: 0 });
    });

    it('applies a unary sign without changing the dimension', () => {
      expect(evaluateQuantity('-5', NO_VARIABLES)).toEqual({ value: -5, exponent: 0 });
      expect(evaluateQuantity('+5', NO_VARIABLES)).toEqual({ value: 5, exponent: 0 });
      expect(evaluateQuantity('--5', NO_VARIABLES)).toEqual({ value: 5, exponent: 0 });
      expect(evaluateQuantity('-2cm', NO_VARIABLES)).toEqual({ value: -20, exponent: 1 });
      expect(evaluateQuantity('-(2cm + 3mm)', NO_VARIABLES)).toEqual({ value: -23, exponent: 1 });
    });

    it('binds a unary sign tighter than multiplication', () => {
      expect(evaluateQuantity('2 * -2cm', NO_VARIABLES)).toEqual({ value: -40, exponent: 1 });
    });

    it('adds and subtracts like dimensions', () => {
      expect(evaluateQuantity('2cm + 3mm', NO_VARIABLES)).toEqual({ value: 23, exponent: 1 });
      expect(evaluateQuantity('2cm - 5mm', NO_VARIABLES)).toEqual({ value: 15, exponent: 1 });
    });

    it('scales a length by a ratio', () => {
      expect(evaluateQuantity('2cm * 3', NO_VARIABLES)).toEqual({ value: 60, exponent: 1 });
      expect(evaluateQuantity('3 * 2cm', NO_VARIABLES)).toEqual({ value: 60, exponent: 1 });
      expect(evaluateQuantity('10cm / 2', NO_VARIABLES)).toEqual({ value: 50, exponent: 1 });
    });

    it('multiplies dimensions into areas and volumes', () => {
      expect(evaluateQuantity('2cm * 3cm', NO_VARIABLES)).toEqual({ value: 600, exponent: 2 });
      expect(evaluateQuantity('2cm * 3cm * 4cm', NO_VARIABLES)).toEqual({
        value: 24000,
        exponent: 3,
      });
    });

    it('divides like dimensions into a ratio', () => {
      expect(evaluateQuantity('10cm / 2cm', NO_VARIABLES)).toEqual({ value: 5, exponent: 0 });
    });

    it('divides a ratio by a length into a reciprocal length', () => {
      expect(evaluateQuantity('1 / 2cm', NO_VARIABLES)).toEqual({ value: 0.05, exponent: -1 });
    });
  });

  describe('variables', () => {
    it('substitutes a slug and keeps its dimension', () => {
      const context = contextOf({ bust: { value: 880, exponent: 1 } });
      expect(evaluateQuantity('$bust / 4', context)).toEqual({ value: 220, exponent: 1 });
      expect(evaluateQuantity('$bust / 4 + 2cm', context)).toEqual({ value: 240, exponent: 1 });
    });

    it('accepts an area variable', () => {
      const context = contextOf({ dart: { value: 300, exponent: 2 } });
      expect(evaluateQuantity('$dart + 1cm * 1cm', context)).toEqual({
        value: 400,
        exponent: 2,
      });
    });

    it('looks up the slug without its leading $', () => {
      const lookup = vi.fn(() => null);
      capture(() => evaluateQuantity('$bust', { lookup }));
      expect(lookup).toHaveBeenCalledWith('bust');
    });
  });

  describe('syntax errors', () => {
    const cases: Array<[source: string, message: string, offset: number]> = [
      ['', 'expected an expression at 0', 0],
      ['   ', 'expected an expression at 3', 3],
      ['2cm +', 'expected an expression at 5', 5],
      ['2cm % 2', "unexpected character '%' at 4", 4],
      ['1in', "unexpected character 'i' at 1", 1],
      ['1e10', "unexpected character 'e' at 1", 1],
      ['.5', "unexpected character '.' at 0", 0],
      ['2.', 'expected a digit at 2', 2],
      ['2.x', 'expected a digit at 2', 2],
      ['10 m', "unexpected character 'm' at 3", 3],
      ['10cmm', "unexpected character 'm' at 4", 4],
      ['$', "expected a variable name after '$' at 1", 1],
      ['$Bust', "expected a variable name after '$' at 1", 1],
      ['$1bust', "expected a variable name after '$' at 1", 1],
      ['$bust + $', "expected a variable name after '$' at 9", 9],
      ['1mm 2mm', "unexpected number '2' at 4", 4],
      ['1mm $x', "unexpected variable '$x' at 4", 4],
      ['1mm)', "unexpected ')' at 3", 3],
      ['(1mm))', "unexpected ')' at 5", 5],
      ['()', "unexpected ')' at 1", 1],
      ['1mm * / 2', "unexpected operator '/' at 6", 6],
      ['(1mm', "expected ')' at 4", 4],
      ['(1mm 2mm)', "expected ')' at 5", 5],
      ['(1mm (2mm)', "expected ')' at 5", 5],
    ];

    for (const [source, message, offset] of cases) {
      it(`rejects ${JSON.stringify(source)}`, () => {
        expectSyntax(source, message, offset);
      });
    }
  });

  describe('unknown variables', () => {
    it('names the slug and its offset', () => {
      const error = capture(() => evaluateQuantity('1 + $bst', NO_VARIABLES));
      expect(error.code).toBe('unknown-variable');
      expect(error.message).toBe('unknown variable $bst at 4');
      expect(error.offset).toBe(4);
    });
  });

  describe('dimension errors', () => {
    it('refuses to add a length and a plain number', () => {
      const source = '2cm + 3';
      const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
      expect(error.code).toBe('dimension');
      expect(error.message).toBe('cannot add a length and a plain number');
      expect(error.offset).toBe(source.indexOf('+'));
    });

    it('refuses to subtract mismatched dimensions', () => {
      const source = '2cm - 3';
      const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
      expect(error.code).toBe('dimension');
      expect(error.message).toBe('cannot subtract a length and a plain number');
      expect(error.offset).toBe(source.indexOf('-'));
    });

    it('names an area, a volume and an unusual exponent', () => {
      expect(capture(() => evaluateQuantity('1cm*1cm + 1cm', NO_VARIABLES)).message).toBe(
        'cannot add an area and a length',
      );
      expect(capture(() => evaluateQuantity('1mm*1mm*1mm + 1mm', NO_VARIABLES)).message).toBe(
        'cannot add a volume and a length',
      );
      expect(capture(() => evaluateQuantity('1/1mm + 1mm', NO_VARIABLES)).message).toBe(
        'cannot add a quantity with exponent -1 and a length',
      );
    });
  });

  describe('range errors', () => {
    it('rejects division by zero at the operator', () => {
      const source = '1cm / 0';
      const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.message).toBe('result is not finite');
      expect(error.offset).toBe(source.indexOf('/'));
    });

    it('rejects zero divided by zero', () => {
      const error = capture(() => evaluateQuantity('0 / 0', NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(2);
    });

    it('rejects a literal too large for a double', () => {
      const error = capture(() => evaluateQuantity('9'.repeat(400), NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(0);
    });

    it('rejects a unit conversion that overflows', () => {
      const error = capture(() => evaluateQuantity(`1${'0'.repeat(308)}cm`, NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(0);
    });

    it('rejects an arithmetic result that overflows', () => {
      const source = `1${'0'.repeat(308)} * 10`;
      const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(source.indexOf('*'));
    });

    it('rejects a non-finite value from a variable', () => {
      const context = contextOf({ huge: { value: Infinity, exponent: 1 } });
      const error = capture(() => evaluateQuantity('$huge', context));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(0);
    });
  });

  describe('nesting bound', () => {
    function nestedParentheses(levels: number): string {
      return '('.repeat(levels) + '1mm' + ')'.repeat(levels);
    }

    it('accepts exactly the maximum nesting', () => {
      expect(evaluateQuantity(nestedParentheses(MAX_EXPRESSION_DEPTH), NO_VARIABLES)).toEqual({
        value: 1,
        exponent: 1,
      });
      expect(evaluateQuantity(`${'-'.repeat(MAX_EXPRESSION_DEPTH)}1mm`, NO_VARIABLES)).toEqual({
        value: 1,
        exponent: 1,
      });
    });

    it('rejects deeper parentheses', () => {
      const levels = MAX_EXPRESSION_DEPTH + 1;
      const error = capture(() => evaluateQuantity(nestedParentheses(levels), NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.message).toBe(`expression is nested deeper than ${MAX_EXPRESSION_DEPTH} levels`);
      expect(error.offset).toBe(MAX_EXPRESSION_DEPTH);
    });

    it('rejects a longer unary chain', () => {
      const source = `${'-'.repeat(MAX_EXPRESSION_DEPTH + 1)}1mm`;
      const error = capture(() => evaluateQuantity(source, NO_VARIABLES));
      expect(error.code).toBe('range');
      expect(error.offset).toBe(MAX_EXPRESSION_DEPTH);
    });
  });

  describe('cycle reporting', () => {
    it('carries a cycle code for a variable resolver', () => {
      const error = new ExpressionError('cycle', 'cyclic variable $a at 0', 0);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ExpressionError');
      expect(error.code).toBe('cycle');
      expect(error.message).toBe('cyclic variable $a at 0');
      expect(error.offset).toBe(0);
    });

    it('propagates a cycle thrown by a lookup', () => {
      const context: ExpressionContext = {
        lookup: () => {
          throw new ExpressionError('cycle', 'cyclic variable $a at 0', 0);
        },
      };
      expect(capture(() => evaluateQuantity('$a', context)).code).toBe('cycle');
    });
  });
});

describe('evaluateLength', () => {
  it('returns the millimetres of a length', () => {
    expect(evaluateLength('2cm + 5mm', NO_VARIABLES)).toBe(25);
  });

  it('resolves variables through the context', () => {
    const context = contextOf({ bust: { value: 880, exponent: 1 } });
    expect(evaluateLength('$bust / 4', context)).toBe(220);
  });

  it('rejects a ratio', () => {
    const error = capture(() => evaluateLength('5', NO_VARIABLES));
    expect(error.code).toBe('dimension');
    expect(error.message).toBe('expected a length, got a ratio');
    expect(error.offset).toBe(0);
  });

  it('rejects an area', () => {
    const error = capture(() => evaluateLength('2cm * 2cm', NO_VARIABLES));
    expect(error.code).toBe('dimension');
    expect(error.message).toBe('expected a length, got an area');
  });
});
