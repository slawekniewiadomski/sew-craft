import { createEmptyDocument, type PatternDocument, type Variable } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import { parseVariableValueInput, variableRows } from '@/lib/variables';

const documentOf = (variables: Variable[]): PatternDocument => ({
  ...createEmptyDocument(),
  variables,
});

const variable = (overrides: Partial<Variable> = {}): Variable => ({
  slug: 'bust',
  name: 'Bust (cm)',
  unit: 'cm',
  value: 88,
  ...overrides,
});

describe('variableRows', () => {
  it('reads a literal in its unit and reports its type', () => {
    const rows = variableRows(documentOf([variable()]));
    expect(rows).toEqual([
      {
        slug: 'bust',
        name: 'Bust (cm)',
        unit: 'cm',
        valueText: '88',
        resolved: '880 mm',
        type: 'number',
        broken: false,
        comment: '',
      },
    ]);
  });

  it('shows a formula as written and its resolved value', () => {
    const rows = variableRows(
      documentOf([
        variable({ slug: 'bust', unit: 'mm', value: 880 }),
        variable({ slug: 'ease', name: 'Ease', value: { expr: '$bust / 10', lastKnown: 88 } }),
      ]),
    );
    expect(rows[1]).toMatchObject({
      valueText: '$bust / 10',
      resolved: '88 mm',
      type: 'formula',
      broken: false,
    });
  });

  it('marks a ratio and a broken formula', () => {
    const rows = variableRows(
      documentOf([
        variable({ slug: 'bust', unit: 'mm', value: 880 }),
        variable({ slug: 'fit', name: 'Fit', value: { expr: '$bust / $bust', lastKnown: 1 } }),
        variable({ slug: 'gone', name: 'Gone', value: { expr: '$missing', lastKnown: 42 } }),
      ]),
    );
    expect(rows[1]).toMatchObject({ type: 'ratio', resolved: '1 (ratio)', broken: false });
    expect(rows[2]).toMatchObject({ type: 'formula', resolved: '42', broken: true });
  });

  it('shows a dash for a literal that is not a usable number', () => {
    const rows = variableRows(documentOf([variable({ value: Number.NaN })]));
    expect(rows[0]).toMatchObject({ resolved: '—', broken: true });
  });

  it('keeps a comment and has no rows without variables', () => {
    expect(variableRows(createEmptyDocument())).toEqual([]);
    expect(variableRows(documentOf([variable({ comment: 'over bust' })]))[0]?.comment).toBe(
      'over bust',
    );
  });
});

describe('parseVariableValueInput', () => {
  it('reads a literal number', () => {
    expect(parseVariableValueInput(' 88 ')).toBe(88);
    expect(parseVariableValueInput('-2.5')).toBe(-2.5);
  });

  it('reads anything else as a formula', () => {
    expect(parseVariableValueInput('$bust / 4')).toEqual({ expr: '$bust / 4' });
    expect(parseVariableValueInput('= 2cm + 5mm')).toEqual({ expr: '2cm + 5mm' });
  });

  it('rejects empty and sign-only text', () => {
    expect(parseVariableValueInput('   ')).toBeNull();
    expect(parseVariableValueInput('=')).toBeNull();
    expect(parseVariableValueInput('=   ')).toBeNull();
  });
});
