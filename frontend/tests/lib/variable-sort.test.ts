import { describe, expect, it } from 'vitest';

import {
  compareNumber,
  compareText,
  nextVariableSort,
  sortVariableRows,
  variableSortAria,
  variableSortArrow,
  type VariableSort,
} from '@/lib/variable-sort';
import type { VariableRow } from '@/lib/variables';

const row = (overrides: Partial<VariableRow> = {}): VariableRow => ({
  slug: 'bust',
  name: 'Bust',
  unit: 'mm',
  valueText: '88',
  resolved: '88 mm',
  sortValue: 88,
  type: 'number',
  sources: [],
  broken: false,
  comment: '',
  ...overrides,
});

const slugs = (rows: VariableRow[]): string[] => rows.map((entry) => entry.slug);

describe('compareText', () => {
  it('compares case-insensitively and numerically', () => {
    expect(compareText('alpha', 'Beta')).toBeLessThan(0);
    expect(compareText('Item 2', 'item 10')).toBeLessThan(0);
  });

  it('sinks blanks in both argument positions', () => {
    expect(compareText('', '')).toBe(0);
    expect(compareText('', 'Alpha')).toBe(1);
    expect(compareText('Alpha', '')).toBe(-1);
  });
});

describe('compareNumber', () => {
  it('compares values and sinks unresolved ones', () => {
    expect(compareNumber(2, 10)).toBeLessThan(0);
    expect(compareNumber(null, null)).toBe(0);
    expect(compareNumber(null, 2)).toBe(1);
    expect(compareNumber(2, null)).toBe(-1);
  });
});

describe('sortVariableRows', () => {
  it('keeps document order without a sort and does not mutate the input', () => {
    const rows = [row({ slug: 'b', name: 'Beta' }), row({ slug: 'a', name: 'Alpha' })];
    const sorted = sortVariableRows(rows, null);

    expect(slugs(sorted)).toEqual(['b', 'a']);
    expect(sorted).not.toBe(rows);
  });

  it('sorts names in both directions and keeps blanks last', () => {
    const rows = [
      row({ slug: 'c', name: 'Gamma' }),
      row({ slug: 'blank', name: '' }),
      row({ slug: 'a', name: 'Alpha' }),
    ];

    expect(slugs(sortVariableRows(rows, { key: 'name', direction: 'asc' }))).toEqual([
      'a',
      'c',
      'blank',
    ]);
    expect(slugs(sortVariableRows(rows, { key: 'name', direction: 'desc' }))).toEqual([
      'c',
      'a',
      'blank',
    ]);
  });

  it('sorts values numerically with unresolved rows last', () => {
    const rows = [
      row({ slug: 'big', sortValue: 200 }),
      row({ slug: 'none', sortValue: null }),
      row({ slug: 'small', sortValue: 8 }),
      row({ slug: 'also-none', sortValue: null }),
    ];

    expect(slugs(sortVariableRows(rows, { key: 'value', direction: 'asc' }))).toEqual([
      'small',
      'big',
      'none',
      'also-none',
    ]);
    expect(slugs(sortVariableRows(rows, { key: 'value', direction: 'desc' }))).toEqual([
      'big',
      'small',
      'none',
      'also-none',
    ]);
  });

  it('sorts units', () => {
    const rows = [row({ slug: 'mm', unit: 'mm' }), row({ slug: 'cm', unit: 'cm' })];

    expect(slugs(sortVariableRows(rows, { key: 'unit', direction: 'asc' }))).toEqual(['cm', 'mm']);
  });

  it('sorts by type rank and breaks ties by name', () => {
    const rows = [
      row({ slug: 'measured', type: 'measured', name: 'A' }),
      row({ slug: 'ratio', type: 'ratio', name: 'Z' }),
      row({ slug: 'formula-b', type: 'formula', name: 'B' }),
      row({ slug: 'number', type: 'number', name: 'N' }),
      row({ slug: 'formula-a', type: 'formula', name: 'A' }),
    ];

    expect(slugs(sortVariableRows(rows, { key: 'type', direction: 'asc' }))).toEqual([
      'number',
      'ratio',
      'formula-a',
      'formula-b',
      'measured',
    ]);
  });

  it('sorts comments with blanks last in both directions', () => {
    const rows = [
      row({ slug: 'b', comment: 'beta' }),
      row({ slug: 'none', comment: '' }),
      row({ slug: 'a', comment: 'alpha' }),
    ];

    expect(slugs(sortVariableRows(rows, { key: 'comment', direction: 'asc' }))).toEqual([
      'a',
      'b',
      'none',
    ]);
    expect(slugs(sortVariableRows(rows, { key: 'comment', direction: 'desc' }))).toEqual([
      'b',
      'a',
      'none',
    ]);
  });
});

describe('sort state', () => {
  it('cycles a header through ascending, descending and document order', () => {
    const first = nextVariableSort(null, 'name');
    expect(first).toEqual({ key: 'name', direction: 'asc' });

    const second = nextVariableSort(first, 'name');
    expect(second).toEqual({ key: 'name', direction: 'desc' });

    expect(nextVariableSort(second, 'name')).toBeNull();

    const other = nextVariableSort(second, 'value');
    expect(other).toEqual({ key: 'value', direction: 'asc' });
  });

  it('reports aria and arrow state per column', () => {
    const sort: VariableSort = { key: 'name', direction: 'asc' };

    expect(variableSortAria(null, 'name')).toBe('none');
    expect(variableSortAria(sort, 'value')).toBe('none');
    expect(variableSortAria(sort, 'name')).toBe('ascending');
    expect(variableSortAria({ key: 'name', direction: 'desc' }, 'name')).toBe('descending');

    expect(variableSortArrow(null, 'name')).toBe('↕');
    expect(variableSortArrow(sort, 'value')).toBe('↕');
    expect(variableSortArrow(sort, 'name')).toBe('↑');
    expect(variableSortArrow({ key: 'name', direction: 'desc' }, 'name')).toBe('↓');
  });
});
