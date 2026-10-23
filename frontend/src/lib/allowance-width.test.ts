import { describe, expect, it } from 'vitest';

import { isValidAllowanceWidth, parseAllowanceWidth } from './allowance-width';

describe('parseAllowanceWidth', () => {
  it('accepts positive finite numbers and surrounding whitespace', () => {
    expect(parseAllowanceWidth('10')).toBe(10);
    expect(parseAllowanceWidth('10.5')).toBe(10.5);
    expect(parseAllowanceWidth('.5')).toBe(0.5);
    expect(parseAllowanceWidth('1e3')).toBe(1000);
    expect(parseAllowanceWidth('  12.5  ')).toBe(12.5);
  });

  it('rejects empty, non-numeric, non-positive and non-finite values', () => {
    expect(parseAllowanceWidth('')).toBeNull();
    expect(parseAllowanceWidth('   ')).toBeNull();
    expect(parseAllowanceWidth('abc')).toBeNull();
    expect(parseAllowanceWidth('0')).toBeNull();
    expect(parseAllowanceWidth('-1')).toBeNull();
    expect(parseAllowanceWidth('NaN')).toBeNull();
    expect(parseAllowanceWidth('Infinity')).toBeNull();
  });
});

describe('isValidAllowanceWidth', () => {
  it('mirrors the parse boundary', () => {
    expect(isValidAllowanceWidth(10)).toBe(true);
    expect(isValidAllowanceWidth(0.1)).toBe(true);
    expect(isValidAllowanceWidth('10')).toBe(false);
    expect(isValidAllowanceWidth(0)).toBe(false);
    expect(isValidAllowanceWidth(-1)).toBe(false);
    expect(isValidAllowanceWidth(Number.NaN)).toBe(false);
    expect(isValidAllowanceWidth(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
