import type { DimensionLayout } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  DIMENSION_ORIENTATION_OPTIONS,
  dimensionLabelWidth,
  dimensionSegments,
  formatDimensionValue,
  isValidDimensionValue,
  parseDimensionValue,
} from './dimensions';

const layout: DimensionLayout = {
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  dimensionStart: { x: 0, y: 10 },
  dimensionEnd: { x: 100, y: 10 },
  extensions: [
    { start: { x: 0, y: 1.5 }, end: { x: 0, y: 12 } },
    { start: { x: 100, y: 1.5 }, end: { x: 100, y: 12 } },
  ],
  chevrons: [
    {
      tip: { x: 0, y: 10 },
      armA: { x: 2.6, y: 11.5 },
      armB: { x: 2.6, y: 8.5 },
    },
    {
      tip: { x: 100, y: 10 },
      armA: { x: 97.4, y: 8.5 },
      armB: { x: 97.4, y: 11.5 },
    },
  ],
  label: { position: { x: 50, y: 12.5 }, angleDegrees: 0 },
};

describe('DIMENSION_ORIENTATION_OPTIONS', () => {
  it('lists every axis in presentation order', () => {
    expect(DIMENSION_ORIENTATION_OPTIONS).toEqual([
      { value: 'aligned', label: 'Aligned' },
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' },
    ]);
  });
});

describe('formatDimensionValue', () => {
  it('rounds to micrometres and trims trailing zeros', () => {
    expect(formatDimensionValue(100)).toBe('100');
    expect(formatDimensionValue(100.1234)).toBe('100.123');
    expect(formatDimensionValue(0.0004)).toBe('0');
  });
});

describe('parseDimensionValue', () => {
  it('parses finite numeric text and rejects empty or non-numeric text', () => {
    expect(parseDimensionValue(' 12.5 ')).toBe(12.5);
    expect(parseDimensionValue('')).toBeNull();
    expect(parseDimensionValue('   ')).toBeNull();
    expect(parseDimensionValue('abc')).toBeNull();
    expect(parseDimensionValue('Infinity')).toBeNull();
  });
});

describe('isValidDimensionValue', () => {
  it('accepts finite positive distances only', () => {
    expect(isValidDimensionValue(5)).toBe(true);
    expect(isValidDimensionValue(0)).toBe(false);
    expect(isValidDimensionValue(-1)).toBe(false);
    expect(isValidDimensionValue(Number.NaN)).toBe(false);
    expect(isValidDimensionValue(null)).toBe(false);
  });
});

describe('dimensionLabelWidth', () => {
  it('grows with the number of characters', () => {
    expect(dimensionLabelWidth('100')).toBe(26);
    expect(dimensionLabelWidth('100.5')).toBe(38);
  });
});

describe('dimensionSegments', () => {
  it('flattens extensions, the dimension line and both chevrons', () => {
    const segments = dimensionSegments(layout);

    expect(segments.map((segment) => segment.key)).toEqual([
      'extension-0',
      'extension-1',
      'line',
      'chevron-0-a',
      'chevron-0-b',
      'chevron-1-a',
      'chevron-1-b',
    ]);
    expect(segments.filter((segment) => segment.main)).toEqual([
      { key: 'line', x1: 0, y1: 10, x2: 100, y2: 10, main: true },
    ]);
    expect(segments[0]).toEqual({
      key: 'extension-0',
      x1: 0,
      y1: 1.5,
      x2: 0,
      y2: 12,
      main: false,
    });
    expect(segments[3]).toEqual({
      key: 'chevron-0-a',
      x1: 0,
      y1: 10,
      x2: 2.6,
      y2: 11.5,
      main: false,
    });
  });
});
