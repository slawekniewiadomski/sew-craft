import type { Entity } from '@sewcraft/geometry';
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SelectionSummary from '@/components/SelectionSummary.vue';

enableAutoUnmount(afterEach);

const point = (id: string): Entity => ({
  id,
  kind: 'point',
  x: 0,
  y: 0,
  construction: false,
  fixed: false,
});
const line = (id: string, start: string, end: string): Entity => ({
  id,
  kind: 'line',
  start,
  end,
  construction: false,
});
const curve = (id: string, points: [string, string, string, string]): Entity => ({
  id,
  kind: 'curve',
  p0: points[0],
  p1: points[1],
  p2: points[2],
  p3: points[3],
  construction: false,
});
const arc = (id: string, start: string, end: string, through: string): Entity => ({
  id,
  kind: 'arc',
  start,
  end,
  through,
  construction: false,
});

function mountSummary(
  entities: Entity[],
  options: { deleteDisabled?: boolean; deleteHint?: string } = {},
): VueWrapper {
  return mount(SelectionSummary, { props: { entities, ...options } });
}

describe('SelectionSummary', () => {
  it('shows the count and a pluralized breakdown by kind', () => {
    const wrapper = mountSummary([
      line('ab', 'a', 'b'),
      line('bc', 'b', 'c'),
      curve('curve', ['a', 'b', 'c', 'd']),
      point('a'),
    ]);

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('4 entities selected');
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe(
      '1 point · 2 lines · 1 curve',
    );
    expect(wrapper.find('[data-testid="selection-delete"]').attributes('disabled')).toBeUndefined();
  });

  it('names both counts for a mixed selection and keeps the entity breakdown', () => {
    const mixed = mount(SelectionSummary, {
      props: { entities: [line('ab', 'a', 'b'), point('a')], dimensions: 3 },
    });

    expect(mixed.find('[data-testid="selection-count"]').text()).toBe(
      '2 entities and 3 dimensions selected',
    );
    expect(mixed.find('[data-testid="selection-breakdown"]').text()).toBe('1 point · 1 line');
    expect(mixed.find('[data-testid="selection-pointer-note"]').text()).toBe(
      'Ctrl/Cmd-click adds or removes a dimension.',
    );
  });

  it('uses singular counts in a mixed selection', () => {
    const wrapper = mount(SelectionSummary, {
      props: { entities: [line('ab', 'a', 'b')], dimensions: 1 },
    });

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('1 line');
  });

  it('uses singular counts and emits delete', async () => {
    const wrapper = mountSummary([line('ab', 'a', 'b')]);

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('1 entity selected');
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('1 line');
    await wrapper.find('[data-testid="selection-delete"]').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[]]);
  });

  it('disables delete with an explanatory tooltip when an edge would be orphaned', () => {
    const wrapper = mountSummary([point('a')], {
      deleteDisabled: true,
      deleteHint: 'Include edge ab in the selection',
    });

    const button = wrapper.find('[data-testid="selection-delete"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe('Include edge ab in the selection');
  });

  it('omits kinds with no selected entity from the breakdown', () => {
    const wrapper = mountSummary([point('a'), point('b')]);

    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('2 points');
  });

  it('pluralizes curves and omits absent kinds', () => {
    const wrapper = mountSummary([
      curve('curve-a', ['a', 'b', 'c', 'd']),
      curve('curve-b', ['a', 'b', 'c', 'd']),
    ]);

    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('2 curves');
  });

  it('counts a selected arc after the other edge kinds', () => {
    const wrapper = mountSummary([arc('arc-a', 'a', 'b', 'c'), line('ab', 'a', 'b')]);

    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('1 line · 1 arc');
  });

  it('pluralizes arcs', () => {
    const wrapper = mountSummary([arc('arc-a', 'a', 'b', 'c'), arc('arc-b', 'b', 'c', 'd')]);

    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('2 arcs');
  });

  it('shows a singular dimension count with the dimension note and no breakdown', async () => {
    const wrapper = mount(SelectionSummary, { props: { dimensions: 1 } });

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('1 dimension selected');
    expect(wrapper.find('[data-testid="selection-breakdown"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-pointer-note"]').text()).toBe(
      'Ctrl/Cmd-click adds or removes a dimension.',
    );

    await wrapper.find('[data-testid="selection-delete"]').trigger('click');
    expect(wrapper.emitted('delete')).toEqual([[]]);
  });

  it('pluralizes the dimension count', () => {
    const wrapper = mount(SelectionSummary, { props: { dimensions: 3 } });

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('3 dimensions selected');
  });
});
