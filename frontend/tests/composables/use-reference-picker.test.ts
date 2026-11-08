import type { PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it, vi } from 'vitest';

import { useReferencePicker } from '@/composables/use-reference-picker';

const document: PatternDocument = {
  schema: 'sewcraft.pattern/0.9',
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
    { id: 'h', type: 'horizontal', a: 'p1', b: 'p2' },
  ],
  pieces: [],
  assemblies: [],
  tabs: [],
  seams: [],
};

const key = (value: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: value, cancelable: true });

function setup() {
  const onSelect = vi.fn();
  const picker = useReferencePicker(() => document, onSelect);
  return { picker, onSelect };
}

describe('useReferencePicker', () => {
  it('offers nothing before it is opened', () => {
    const { picker } = setup();

    expect(picker.options.value).toEqual([]);
    expect(picker.activeOption.value).toBeNull();
    expect(picker.activeIndex.value).toBe(-1);
  });

  it('offers nothing for an id that is not a distance dimension', () => {
    const { picker } = setup();

    expect(picker.optionsFor('h')).toEqual([]);
    expect(picker.optionsFor('missing')).toEqual([]);
  });

  it('lists the other dimensions as reference sources', () => {
    const { picker } = setup();
    picker.open('B');

    expect(picker.options.value.map((option) => option.id)).toEqual(['A']);
  });

  it('filters the list by the text typed after the hash', () => {
    const { picker } = setup();
    picker.open('B', 'zzz');

    expect(picker.options.value).toEqual([]);
    expect(picker.activeOption.value).toBeNull();
  });

  it('moves the highlight with the arrow keys and links on Enter', () => {
    const { picker, onSelect } = setup();
    picker.open('B');

    expect(picker.onKeydown('B', key('ArrowDown'))).toBe(true);
    expect(picker.activeIndex.value).toBe(0);

    expect(picker.onKeydown('B', key('Enter'))).toBe(true);
    expect(onSelect).toHaveBeenCalledWith('B', 'A');
    expect(picker.picker.value).toBeNull();
  });

  it('closes on Escape and ignores keys aimed at another dimension', () => {
    const { picker } = setup();
    picker.open('B');

    expect(picker.onKeydown('A', key('Escape'))).toBe(false);
    expect(picker.picker.value).not.toBeNull();

    expect(picker.onKeydown('B', key('Escape'))).toBe(true);
    expect(picker.picker.value).toBeNull();
  });

  it('does not move or link when the filtered list is empty', () => {
    const { picker, onSelect } = setup();
    picker.open('B', 'zzz');

    expect(picker.onKeydown('B', key('ArrowDown'))).toBe(true);
    expect(picker.picker.value!.activeIndex).toBe(0);
    expect(picker.onKeydown('B', key('Enter'))).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens on a hash token and closes when the token is gone', () => {
    const { picker } = setup();
    const input = (value: string) => ({ target: { value } }) as unknown as Event;

    picker.onInput('B', input('#A'));
    expect(picker.picker.value?.id).toBe('B');

    picker.onInput('B', input('100'));
    expect(picker.picker.value).toBeNull();
  });

  it('links the row the caller picks from the list', () => {
    const { picker, onSelect } = setup();
    picker.open('B');

    picker.select('B', 'A');

    expect(onSelect).toHaveBeenCalledWith('B', 'A');
    expect(picker.picker.value).toBeNull();
  });
});
