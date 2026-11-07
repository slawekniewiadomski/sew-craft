import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it, vi } from 'vitest';

import { useVariablePicker } from '@/composables/use-variable-picker';

const document: PatternDocument = {
  ...createEmptyDocument(),
  variables: [
    { slug: 'seam', name: 'Seam allowance', unit: 'mm', value: 10 },
    { slug: 'hem', name: 'Hem depth', unit: 'mm', value: 25 },
  ],
};

const key = (value: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: value, cancelable: true });

function setup() {
  const onPick = vi.fn();
  const picker = useVariablePicker(() => document, onPick);
  return { picker, onPick };
}

describe('useVariablePicker', () => {
  it('offers every variable before a token is typed', () => {
    const { picker } = setup();

    expect(picker.options.value.map((option) => option.slug)).toEqual(['seam', 'hem']);
  });

  it('filters by slug and by name once a token is typed', () => {
    const { picker } = setup();

    picker.open('dimension', 'd1', 'sea');
    expect(picker.options.value.map((option) => option.slug)).toEqual(['seam']);

    picker.open('dimension', 'd1', 'hem');
    expect(picker.options.value.map((option) => option.slug)).toEqual(['hem']);
  });

  it('stays closed without a token, or when the token already names a variable', () => {
    const { picker } = setup();

    picker.open('dimension', 'd1', 'seam');
    expect(picker.picker.value).toBeNull();

    picker.open('dimension', 'd1', null);
    expect(picker.picker.value).toBeNull();
  });

  it('opens for a partial token and scopes itself to one field', () => {
    const { picker } = setup();

    picker.open('dimension', 'd1', 's');

    expect(picker.isOpen('dimension', 'd1')).toBe(true);
    expect(picker.isOpen('dimension', 'd2')).toBe(false);
    expect(picker.isOpen('round', 'd1')).toBe(false);
  });

  it('wraps the highlight in both directions', () => {
    const { picker } = setup();
    picker.open('dimension', 'd1', '');

    expect(picker.onKeydown('dimension', 'd1', key('ArrowUp'))).toBe(true);
    expect(picker.picker.value!.activeIndex).toBe(1);

    picker.onKeydown('dimension', 'd1', key('ArrowDown'));
    expect(picker.picker.value!.activeIndex).toBe(0);
  });

  it('inserts the highlighted variable on Enter', () => {
    const { picker, onPick } = setup();
    picker.open('dimension', 'd1', '');
    picker.onKeydown('dimension', 'd1', key('ArrowDown'));

    expect(picker.onKeydown('dimension', 'd1', key('Enter'))).toBe(true);
    expect(onPick).toHaveBeenCalledWith('dimension', 'd1', 'hem');
    expect(picker.picker.value).toBeNull();
  });

  it('closes on Escape and ignores keys aimed at another field', () => {
    const { picker } = setup();
    picker.open('dimension', 'd1', '');

    expect(picker.onKeydown('dimension', 'd2', key('Escape'))).toBe(false);
    expect(picker.picker.value).not.toBeNull();

    expect(picker.onKeydown('dimension', 'd1', key('Escape'))).toBe(true);
    expect(picker.picker.value).toBeNull();
  });

  it('has nothing to pick while closed', () => {
    const { picker, onPick } = setup();

    expect(picker.active()).toBeNull();
    picker.pickActive('dimension', 'd1');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    const { picker } = setup();
    picker.open('dimension', 'd1', '');

    expect(picker.onKeydown('dimension', 'd1', key('a'))).toBe(false);
  });
});
