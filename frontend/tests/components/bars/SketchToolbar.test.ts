import type { Piece } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SketchToolbar from '@/components/bars/SketchToolbar.vue';

const pieces: Piece[] = [
  { id: 'p1', name: 'Front', edges: [], allowances: [] },
  { id: 'p2', edges: [], allowances: [] },
];

function mountToolbar(props: Partial<InstanceType<typeof SketchToolbar>['$props']> = {}) {
  return mount(SketchToolbar, {
    props: { pieces, target: 'p1', arrange: false, ...props },
  });
}

describe('SketchToolbar', () => {
  it('lists every piece and marks the target', () => {
    const wrapper = mountToolbar();
    const options = wrapper.findAll('option');

    expect(options).toHaveLength(2);
    expect(options[0]!.text()).toBe('Front');
    expect(options[1]!.text()).toBe('Piece 2');
    expect((wrapper.find('[data-testid="sketch-target"]').element as HTMLSelectElement).value).toBe(
      'p1',
    );
  });

  it('emits the chosen target', async () => {
    const wrapper = mountToolbar();

    await wrapper.find('[data-testid="sketch-target"]').setValue('p2');

    expect(wrapper.emitted('update:target')).toEqual([['p2']]);
  });

  it('toggles Arrange and explains it', async () => {
    const wrapper = mountToolbar();

    expect(wrapper.find('[data-testid="sketch-arrange"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-testid="sketch-arrange-hint"]').exists()).toBe(false);

    await wrapper.find('[data-testid="sketch-arrange"]').trigger('click');
    expect(wrapper.emitted('update:arrange')).toEqual([[true]]);

    await wrapper.setProps({ arrange: true });
    expect(wrapper.find('[data-testid="sketch-arrange"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="sketch-arrange-hint"]').text()).toContain(
      'Drag a piece to move it',
    );
  });

  it('emits fit', async () => {
    const wrapper = mountToolbar();

    await wrapper.find('[data-testid="sketch-fit"]').trigger('click');

    expect(wrapper.emitted('fit')).toHaveLength(1);
  });

  it('disables the picker and Arrange while read-only', () => {
    const wrapper = mountToolbar({ readOnly: true });

    expect(wrapper.find('[data-testid="sketch-target"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="sketch-arrange"]').attributes('disabled')).toBeDefined();
  });

  it('disables the picker and Arrange when there is no target', () => {
    const wrapper = mountToolbar({ pieces: [], target: null });

    expect(wrapper.find('[data-testid="sketch-target"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="sketch-arrange"]').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('option')).toHaveLength(0);
  });
});
