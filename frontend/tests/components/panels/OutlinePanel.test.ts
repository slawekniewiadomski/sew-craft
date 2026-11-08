import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import OutlinePanel from '@/components/panels/OutlinePanel.vue';
import { outlineTree } from '@/lib/outline-tree';

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, fixed: false, piece: 'p1' },
    { id: 'b', kind: 'point', x: 100, y: 0, fixed: false, piece: 'p1' },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'note', kind: 'text', piece: 'p1', anchor: 'a', content: 'Grain line' },
    { id: 'loose', kind: 'point', x: 5, y: 5, fixed: false },
  ],
  constraints: [
    { id: 'width', type: 'distance', a: 'a', b: 'b', piece: 'p1', value: 100 },
    { id: 'level', type: 'horizontal', a: 'a', b: 'b', piece: 'p1' },
  ],
  pieces: [{ id: 'p1', name: 'Front', edges: ['ab'], allowances: [] }],
};

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(OutlinePanel, {
    props: {
      outline: outlineTree(document),
      selectedIds: new Set<string>(),
      selectedDimensionIds: new Set<string>(),
      activePieceId: 'p1',
      focusId: null,
      ...overrides,
    },
  });
}

describe('OutlinePanel', () => {
  it('renders each piece as a root with its groups and row counts', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-testid="outline-piece-p1"]').text()).toContain('Front');
    expect(wrapper.find('[data-testid="outline-piece-unassigned"]').text()).toContain('Unassigned');
    expect(wrapper.find('[data-testid="outline-toggle-group-p1-geometry"]').text()).toContain(
      'Geometry',
    );
    expect(wrapper.find('[data-testid="outline-toggle-group-p1-geometry"]').text()).toContain('3');
    expect(wrapper.find('[data-testid="outline-select-ab"]').text()).toContain('a → b');
    expect(wrapper.find('[data-testid="outline-select-ab"]').text()).not.toContain('Line');
  });

  it('marks only the active piece as current', () => {
    expect(mountPanel().find('[data-testid="outline-toggle-piece-p1"]').classes()).toContain(
      'bg-primary/10',
    );
    expect(
      mountPanel({ activePieceId: 'p2' }).find('[data-testid="outline-toggle-piece-p1"]').classes(),
    ).not.toContain('bg-primary/10');
  });

  it('collapses and expands a group', async () => {
    const wrapper = mountPanel();
    const toggle = wrapper.find('[data-testid="outline-toggle-group-p1-geometry"]');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="outline-rows-p1-geometry"]').attributes('style')).toContain(
      'display: none',
    );

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(
      wrapper.find('[data-testid="outline-rows-p1-geometry"]').attributes('style'),
    ).not.toContain('display: none');
  });

  it('collapses a piece and opens it as the active tab', async () => {
    const wrapper = mountPanel();
    const toggle = wrapper.find('[data-testid="outline-toggle-piece-p1"]');

    await toggle.trigger('click');

    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="outline-groups-p1"]').attributes('style')).toContain(
      'display: none',
    );
    expect(wrapper.emitted('open-piece')).toEqual([['p1']]);

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('open-piece')).toEqual([['p1'], ['p1']]);
  });

  it('collapses the unowned bucket without opening a piece', async () => {
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="outline-toggle-piece-unassigned"]').trigger('click');

    expect(wrapper.find('[data-testid="outline-groups-unassigned"]').attributes('style')).toContain(
      'display: none',
    );
    expect(wrapper.emitted('open-piece')).toBeUndefined();
  });

  it('selects an entity row with the click modifiers', async () => {
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="outline-select-ab"]').trigger('click');
    await wrapper.find('[data-testid="outline-select-a"]').trigger('click', { ctrlKey: true });
    await wrapper
      .find('[data-testid="outline-select-b"]')
      .trigger('click', { ctrlKey: true, shiftKey: true });

    expect(wrapper.emitted('select')).toEqual([
      [['ab'], 'replace'],
      [['a'], 'add'],
      [['b'], 'subtract'],
    ]);
  });

  it('selects a dimension row and highlights the selected dimension', async () => {
    const wrapper = mountPanel({ selectedDimensionIds: new Set(['width']) });
    const row = wrapper.find('[data-testid="outline-select-width"]');

    expect(row.attributes('aria-current')).toBe('true');
    await row.trigger('click');

    expect(wrapper.emitted('select-dimension')).toEqual([['width', 'replace']]);
  });

  it('selects a constraint row when every referenced entity is selected', async () => {
    const wrapper = mountPanel({ selectedIds: new Set(['a', 'b']) });
    const row = wrapper.find('[data-testid="outline-select-level"]');

    expect(row.attributes('aria-current')).toBe('true');
    await row.trigger('click');
    expect(wrapper.emitted('select')).toEqual([[['a', 'b'], 'replace']]);

    expect(
      mountPanel({ selectedIds: new Set(['a']) })
        .find('[data-testid="outline-select-level"]')
        .attributes('aria-current'),
    ).toBeUndefined();
  });

  it('shows the empty state for a document with nothing to outline', () => {
    const wrapper = mountPanel({ outline: [] });

    expect(wrapper.text()).toContain('Nothing to outline yet.');
  });

  it('reveals a focused row by opening its piece and group and scrolling to it', async () => {
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="outline-toggle-group-p1-geometry"]').trigger('click');
    await wrapper.find('[data-testid="outline-toggle-piece-p1"]').trigger('click');

    await wrapper.setProps({ focusId: 'ab' });
    await nextTick();
    await nextTick();

    expect(
      wrapper.find('[data-testid="outline-toggle-piece-p1"]').attributes('aria-expanded'),
    ).toBe('true');
    expect(
      wrapper.find('[data-testid="outline-toggle-group-p1-geometry"]').attributes('aria-expanded'),
    ).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('reveals the initial focus when the outline opens', async () => {
    mountPanel({ focusId: 'a' });
    await nextTick();
    await nextTick();

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('ignores a focus id that is not in the tree', async () => {
    const wrapper = mountPanel();

    await wrapper.setProps({ focusId: 'missing' });
    await nextTick();
    await nextTick();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
