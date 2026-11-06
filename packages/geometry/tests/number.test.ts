import { describe, expect, it } from 'vitest';

import { formatMillimetres, formatSvgNumber, roundToThousandth } from '../src/index.js';

describe('formatSvgNumber', () => {
  it('prints an integer without a decimal point', () => {
    expect(formatSvgNumber(12)).toBe('12');
  });

  it('rounds to 1e-4 mm so floating-point noise never leaks out', () => {
    expect(formatSvgNumber(1.000049999)).toBe('1');
    expect(formatSvgNumber(1.23456)).toBe('1.2346');
  });

  it('normalises both zero and negative zero to "0"', () => {
    expect(formatSvgNumber(0)).toBe('0');
    expect(formatSvgNumber(-0)).toBe('0');
    expect(formatSvgNumber(-1e-9)).toBe('0');
  });

  it('keeps a negative value negative', () => {
    expect(formatSvgNumber(-2.5)).toBe('-2.5');
  });
});

describe('roundToThousandth', () => {
  it('rounds to the 1e-3 mm field precision', () => {
    expect(roundToThousandth(1.23456)).toBe(1.235);
    expect(roundToThousandth(0.1 + 0.2)).toBe(0.3);
  });
});

describe('formatMillimetres', () => {
  it('prints field text at 1e-3 mm', () => {
    expect(formatMillimetres(12)).toBe('12');
    expect(formatMillimetres(1.23456)).toBe('1.235');
  });

  it('normalises both zero and negative zero to "0"', () => {
    expect(formatMillimetres(0)).toBe('0');
    expect(formatMillimetres(-0)).toBe('0');
  });

  it('keeps a negative value negative', () => {
    expect(formatMillimetres(-2.5)).toBe('-2.5');
  });
});
