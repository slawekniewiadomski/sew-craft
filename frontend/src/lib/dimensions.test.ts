import type { DimensionLayout, DistanceConstraint, PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  DIMENSION_ORIENTATION_OPTIONS,
  anchorLabel,
  dimensionAccessibleName,
  dimensionLabelWidth,
  dimensionPatchForEdit,
  dimensionSegments,
  dimensionStateLabel,
  dimensionTone,
  filterReferenceOptions,
  formatDimensionField,
  formatDimensionLabel,
  formatDimensionValue,
  isReferenceEditText,
  isValidDimensionValue,
  parseDimensionEdit,
  parseDimensionValue,
  referenceOptionLabel,
  referenceOptions,
  referenceSearchText,
  type DimensionReferenceOption,
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

describe('parseDimensionEdit', () => {
  it('maps empty and whitespace input to driven', () => {
    expect(parseDimensionEdit('')).toEqual({ kind: 'driven' });
    expect(parseDimensionEdit('   ')).toEqual({ kind: 'driven' });
  });

  it('maps a finite positive number to a set value', () => {
    expect(parseDimensionEdit(' 12.5 ')).toEqual({ kind: 'set', value: 12.5 });
  });

  it('rejects zero, negative, infinite and non-numeric input', () => {
    expect(parseDimensionEdit('0')).toEqual({ kind: 'invalid' });
    expect(parseDimensionEdit('-5')).toEqual({ kind: 'invalid' });
    expect(parseDimensionEdit('Infinity')).toEqual({ kind: 'invalid' });
    expect(parseDimensionEdit('abc')).toEqual({ kind: 'invalid' });
  });

  it('maps a leading # to a reference search text', () => {
    expect(parseDimensionEdit('#')).toEqual({ kind: 'reference', text: '' });
    expect(parseDimensionEdit(' #A ')).toEqual({ kind: 'reference', text: 'A' });
    expect(isReferenceEditText(' #width')).toBe(true);
    expect(isReferenceEditText('100')).toBe(false);
    expect(referenceSearchText('#width ')).toBe('width');
    expect(referenceSearchText('100')).toBe('');
  });
});

describe('formatDimensionLabel', () => {
  it('distinguishes each state by shape', () => {
    expect(formatDimensionLabel(100.1234, 'set')).toBe('100.123');
    expect(formatDimensionLabel(100.1234, 'driven')).toBe('(100.123)');
    expect(formatDimensionLabel(100.1234, 'referenced')).toBe('[100.123]');
    expect(formatDimensionLabel(100.1234, 'broken')).toBe('[100.123]');
    expect(formatDimensionLabel(100.1234, 'derived')).toBe('100.123 cut');
  });
});

describe('dimension state presentation', () => {
  it('names every state', () => {
    expect(dimensionStateLabel('set')).toBe('Set');
    expect(dimensionStateLabel('driven')).toBe('Driven');
    expect(dimensionStateLabel('referenced')).toBe('Referenced');
    expect(dimensionStateLabel('broken')).toBe('Broken');
    expect(dimensionStateLabel('derived')).toBe('Cut');
  });

  it('maps every state to a pill tone', () => {
    expect(dimensionTone('set')).toBe('neutral');
    expect(dimensionTone('driven')).toBe('neutral');
    expect(dimensionTone('referenced')).toBe('accent');
    expect(dimensionTone('derived')).toBe('accent');
    expect(dimensionTone('broken')).toBe('danger');
  });

  it('builds an accessible name that does not rely on color', () => {
    expect(dimensionAccessibleName(120, 'set')).toBe('Dimension 120 millimetres');
    expect(dimensionAccessibleName(120, 'driven')).toBe(
      'Driven dimension, measured 120 millimetres',
    );
    expect(dimensionAccessibleName(120, 'referenced', 'A')).toBe(
      'Referenced dimension, 120 millimetres, from dimension A',
    );
    expect(dimensionAccessibleName(120, 'broken', 'A')).toBe(
      'Broken reference, last known 120 millimetres; source dimension A is missing',
    );
    expect(dimensionAccessibleName(120, 'derived')).toBe('Cut dimension, 120 millimetres');
  });

  it('shows a link as #source and everything else as its number', () => {
    const linked = {
      id: 'd',
      type: 'distance',
      a: 'p1',
      b: 'p2',
      reference: 'A',
    } as const;

    expect(formatDimensionField(linked, 120, 'referenced')).toBe('#A');
    expect(formatDimensionField(linked, 100, 'broken')).toBe('100');
    expect(
      formatDimensionField({ id: 'd', type: 'distance', a: 'p1', b: 'p2' }, 100, 'driven'),
    ).toBe('100');
    expect(
      formatDimensionField({ id: 'd', type: 'distance', a: 'p1', b: 'p2' }, null, 'driven'),
    ).toBe('');
  });

  it('maps an edit to a command patch and refuses a missing target', () => {
    const options: DimensionReferenceOption[] = [
      {
        id: 'A',
        value: 120,
        entities: ['p1', 'p2'],
        labels: ['p1', 'p2'],
        orientation: 'horizontal',
      },
    ];

    expect(dimensionPatchForEdit({ kind: 'set', value: 10 }, options)).toEqual({ value: 10 });
    expect(dimensionPatchForEdit({ kind: 'driven' }, options)).toEqual({ value: null });
    expect(dimensionPatchForEdit({ kind: 'unlink' }, options)).toEqual({ reference: null });
    expect(dimensionPatchForEdit({ kind: 'reference', text: 'A' }, options)).toEqual({
      reference: 'A',
    });
    expect(dimensionPatchForEdit({ kind: 'reference', text: 'B' }, options)).toBeNull();
  });
});

describe('reference options', () => {
  const document: PatternDocument = {
    schema: 'sewcraft.pattern/0.4',
    units: 'mm',
    entities: [
      { id: 'p1', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
      { id: 'p2', kind: 'point', x: 120, y: 0, construction: false, fixed: false },
      { id: 'p3', kind: 'point', x: 0, y: 50, construction: false, fixed: false },
      { id: 'p4', kind: 'point', x: 80, y: 50, construction: false, fixed: false },
    ],
    constraints: [
      { id: 'A', type: 'distance', a: 'p1', b: 'p2', value: 120, orientation: 'horizontal' },
      { id: 'B', type: 'distance', a: 'p3', b: 'p4', value: 80 },
      { id: 'measure', type: 'distance', a: 'p2', b: 'p3' },
    ],
    pieces: [],
    assemblies: [],
    tabs: [],
    seams: [],
  };
  const edited = document.constraints[1] as DistanceConstraint;

  it('lists only eligible sources with their resolved value', () => {
    expect(referenceOptions(document, edited)).toEqual([
      {
        id: 'A',
        value: 120,
        entities: ['p1', 'p2'],
        labels: ['p1', 'p2'],
        orientation: 'horizontal',
      },
    ]);
  });

  it('filters by id or formatted value', () => {
    const options = referenceOptions(document, edited);

    expect(filterReferenceOptions(options, '')).toHaveLength(1);
    expect(filterReferenceOptions(options, 'a')).toHaveLength(1);
    expect(filterReferenceOptions(options, '120')).toHaveLength(1);
    expect(filterReferenceOptions(options, '999')).toHaveLength(0);
  });

  it('labels a row with its value, span and orientation', () => {
    const option = referenceOptions(document, edited)[0]!;

    expect(referenceOptionLabel(option)).toBe('A · 120 mm · p1 → p2 · Horizontal');
  });

  it('marks a line anchor so it cannot read as a point', () => {
    const withLine: PatternDocument = {
      ...document,
      entities: [
        ...document.entities,
        { id: 'L', kind: 'line', start: 'p1', end: 'p2', construction: false },
      ],
      constraints: [
        ...document.constraints,
        { id: 'lineSource', type: 'distance', a: 'L', b: 'p3', value: 70 },
      ],
    };

    expect(anchorLabel(withLine, 'L')).toBe('L (line)');
    expect(anchorLabel(withLine, 'p1')).toBe('p1');

    const option = referenceOptions(withLine, edited).find((entry) => entry.id === 'lineSource')!;
    expect(option.labels).toEqual(['L (line)', 'p3']);
    expect(referenceOptionLabel(option)).toBe('lineSource · 70 mm · L (line) → p3 · Aligned');
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
