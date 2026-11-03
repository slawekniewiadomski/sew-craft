import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  formulaIssue,
  insertVariableToken,
  paramIssue,
  parseParamEdit,
  variableOptions,
  variableQuery,
} from '@/lib/formula';

const documentOf = (variables: PatternDocument['variables']): PatternDocument => ({
  ...createEmptyDocument(),
  variables,
});

const bust = { slug: 'bust', name: 'Bust', unit: 'mm' as const, value: 880 };

describe('parseParamEdit', () => {
  it('reads empty text, a number and a formula', () => {
    expect(parseParamEdit('  ')).toEqual({ kind: 'empty' });
    expect(parseParamEdit(' 12.5 ')).toEqual({ kind: 'number', value: 12.5 });
    expect(parseParamEdit('-2')).toEqual({ kind: 'number', value: -2 });
    expect(parseParamEdit('$bust/4')).toEqual({ kind: 'formula', expr: '$bust/4' });
    expect(parseParamEdit('= 2cm + 5mm')).toEqual({ kind: 'formula', expr: '2cm + 5mm' });
  });

  it('rejects a bare equals sign', () => {
    expect(parseParamEdit('=')).toEqual({ kind: 'invalid' });
    expect(parseParamEdit('=   ')).toEqual({ kind: 'invalid' });
  });
});

describe('formulaIssue', () => {
  const document = documentOf([bust, { ...bust, slug: 'waist', name: 'Waist', value: 720 }]);

  it('accepts a formula that resolves to a positive length', () => {
    expect(formulaIssue(document, '$bust / 4')).toBeNull();
    expect(formulaIssue(document, '2cm + 5mm')).toBeNull();
  });

  it('explains an unknown variable, a ratio and a non-positive result', () => {
    expect(formulaIssue(document, '$gone')).toBe('unknown variable $gone at 0');
    expect(formulaIssue(document, '$waist / $bust')).toBe('expected a length, got a ratio');
    expect(formulaIssue(document, '0mm')).toBe('value must be greater than 0');
    expect(formulaIssue(document, '2 +')).toBe('expected an expression at 3');
  });
});

describe('paramIssue', () => {
  it('checks a literal and a stored formula', () => {
    expect(paramIssue({}, 10)).toBeNull();
    expect(paramIssue({}, 0)).toBe('value must be greater than 0');
    expect(paramIssue({}, Number.NaN)).toBe('value must be greater than 0');
    expect(paramIssue({}, { expr: '$gone', lastKnown: 10 })).toBe('unknown variable $gone at 0');
  });
});

describe('variableOptions', () => {
  it('lists each variable with its resolved value', () => {
    const options = variableOptions(
      documentOf([
        bust,
        { slug: 'ease', name: 'Ease', unit: 'mm', value: { expr: '$bust/10', lastKnown: 88 } },
        { slug: 'fit', name: 'Fit', unit: 'mm', value: { expr: '$bust/$bust', lastKnown: 1 } },
        { slug: 'gone', name: 'Gone', unit: 'mm', value: { expr: '$missing', lastKnown: 4 } },
      ]),
    );
    expect(options).toEqual([
      { slug: 'bust', name: 'Bust', resolved: '880 mm' },
      { slug: 'ease', name: 'Ease', resolved: '88 mm' },
      { slug: 'fit', name: 'Fit', resolved: '1 (ratio)' },
      { slug: 'gone', name: 'Gone', resolved: 'broken' },
    ]);
  });

  it('is empty without variables', () => {
    expect(variableOptions(createEmptyDocument())).toEqual([]);
  });
});

describe('variableQuery / insertVariableToken', () => {
  it('finds a partial token at the end only', () => {
    expect(variableQuery('$bust/4')).toBeNull();
    expect(variableQuery('$bu')).toBe('bu');
    expect(variableQuery('2 * $')).toBe('');
    expect(variableQuery('no token')).toBeNull();
  });

  it('replaces the partial token with a full one', () => {
    expect(insertVariableToken('$bu', 'bust')).toBe('$bust');
    expect(insertVariableToken('$bust/4 + $ea', 'ease')).toBe('$bust/4 + $ease');
    expect(insertVariableToken('plain', 'bust')).toBe('plain');
  });
});
