import { describe, expect, it } from 'vitest';

import { isValidSeamWidth, parseSeamWidth } from './seam-width';

describe('parseSeamWidth', () => {
  it('accepts positive finite numbers and surrounding whitespace', () => {
    expect(parseSeamWidth('10')).toBe(10);
    expect(parseSeamWidth('10.5')).toBe(10.5);
    expect(parseSeamWidth('.5')).toBe(0.5);
    expect(parseSeamWidth('1e3')).toBe(1000);
    expect(parseSeamWidth('  12.5  ')).toBe(12.5);
  });

  it('rejects empty, non-numeric, non-positive and non-finite values', () => {
    expect(parseSeamWidth('')).toBeNull();
    expect(parseSeamWidth('   ')).toBeNull();
    expect(parseSeamWidth('abc')).toBeNull();
    expect(parseSeamWidth('0')).toBeNull();
    expect(parseSeamWidth('-1')).toBeNull();
    expect(parseSeamWidth('NaN')).toBeNull();
    expect(parseSeamWidth('Infinity')).toBeNull();
  });
});

describe('isValidSeamWidth', () => {
  it('mirrors the parse boundary', () => {
    expect(isValidSeamWidth(10)).toBe(true);
    expect(isValidSeamWidth(0.1)).toBe(true);
    expect(isValidSeamWidth('10')).toBe(false);
    expect(isValidSeamWidth(0)).toBe(false);
    expect(isValidSeamWidth(-1)).toBe(false);
    expect(isValidSeamWidth(Number.NaN)).toBe(false);
    expect(isValidSeamWidth(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
