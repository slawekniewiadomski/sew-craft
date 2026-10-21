import { describe, expect, it } from 'vitest';

import { formatSvgNumber } from '../src/index.js';

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
