import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import OutlineFloat from '@/components/editor/OutlineFloat.vue';

const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, fixed: false, piece: 'p1' },
    { id: 'b', kind: 'point', x: 100, y: 0, fixed: false, piece: 'p1' },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'loose', kind: 'point', x: 5, y: 5, fixed: false },
  ],
  constraints: [{ id: 'width', type: 'distance', a: 'a', b: 'b', piece: 'p1', value: 100 }],
  pieces: [{ id: 'p1', name: 'Front', edges: ['ab'], allowances: [] }],
};

function mountFloat(overrides: Record<string, unknown> = {}) {
  return mount(OutlineFloat, {
    props: {
      document,
      selectedIds: new Set<string>(),
      selectedDimensionIds: new Set<string>(),
      activePieceId: 'p1',
      focusId: null,
      ...overrides,
    },
  });
}

describe('OutlineFloat', () => {
  it('floats the outline with a total row count', () => {
    const wrapper = mountFloat();

    expect(wrapper.find('[data-testid="outline-float-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="outline-count"]').text()).toBe('5');
    expect(wrapper.find('[data-testid="outline-select-ab"]').text()).toContain('a → b');
  });

  it('hides to a reopen button and comes back', async () => {
    const wrapper = mountFloat();

    await wrapper.find('[data-testid="outline-hide"]').trigger('click');
    expect(wrapper.find('[data-testid="outline-float-panel"]').exists()).toBe(false);

    await wrapper.find('[data-testid="outline-show"]').trigger('click');
    expect(wrapper.find('[data-testid="outline-float-panel"]').exists()).toBe(true);
  });

  it('forwards entity, dimension and piece interactions', async () => {
    const wrapper = mountFloat();

    await wrapper.find('[data-testid="outline-select-ab"]').trigger('click');
    await wrapper.find('[data-testid="outline-select-width"]').trigger('click');
    await wrapper.find('[data-testid="outline-toggle-piece-p1"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([[['ab'], 'replace']]);
    expect(wrapper.emitted('select-dimension')).toEqual([['width', 'replace']]);
    expect(wrapper.emitted('open-piece')).toEqual([['p1']]);
  });

  it('shows the empty state when the document has nothing to outline', () => {
    const wrapper = mountFloat({ document: createEmptyDocument() });

    expect(wrapper.find('[data-testid="outline-count"]').text()).toBe('0');
    expect(wrapper.text()).toContain('Nothing to outline yet.');
  });
});
