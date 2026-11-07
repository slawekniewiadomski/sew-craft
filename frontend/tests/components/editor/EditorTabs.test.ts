import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import EditorTabs from '@/components/editor/EditorTabs.vue';

const documentOf = (): PatternDocument => ({
  ...createEmptyDocument(),
  pieces: [
    { id: 'p1', name: 'Front', edges: [], allowances: [], color: '#336699' },
    { id: 'p2', name: '  ', edges: [], allowances: [] },
  ],
  assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'piece', id: 'p2' },
    { kind: 'assembly', id: 'a1' },
  ],
});

function mountTabs(props: Record<string, unknown> = {}) {
  return mount(EditorTabs, {
    props: {
      document: documentOf(),
      modelValue: { kind: 'piece', id: 'p1' },
      ...props,
    },
  });
}

function dragData() {
  return {
    setData: vi.fn(),
    effectAllowed: '',
  };
}

describe('EditorTabs rendering', () => {
  it('renders one tab per object with colour dots, names and the active state', () => {
    const wrapper = mountTabs();
    const tabs = wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])');

    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.text()).toBe('Front');
    expect(tabs[1]!.text()).toBe('Piece 2');
    expect(tabs[2]!.text()).toContain('Shell');
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(tabs[1]!.attributes('aria-selected')).toBe('false');
    expect(tabs[0]!.attributes('tabindex')).toBe('0');
    expect(tabs[1]!.attributes('tabindex')).toBe('-1');
    expect(wrapper.find('[data-testid="tab-dot-p1"]').attributes('style')).toContain(
      'background-color: rgb(51, 102, 153)',
    );
    expect(wrapper.findAll('[data-testid="tab-assembly-glyph"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="tab-sketch"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-sketch"]').attributes('aria-selected')).toBe('false');
  });

  it('shows the Sketch entry and emits when it is opened', async () => {
    const wrapper = mountTabs();
    const sketch = wrapper.find('[data-testid="tab-sketch"]');

    expect(sketch.exists()).toBe(true);
    expect(sketch.attributes('aria-selected')).toBe('false');

    await sketch.trigger('click');
    expect(wrapper.emitted('show-sketch')).toHaveLength(1);

    await wrapper.setProps({ sketch: true });
    expect(sketch.attributes('aria-selected')).toBe('true');
    expect(
      wrapper
        .findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!
        .attributes('aria-selected'),
    ).toBe('true');
  });

  it('renders an empty bar when there are no tabs', () => {
    const wrapper = mountTabs({ document: createEmptyDocument(), modelValue: null });

    expect(wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')).toHaveLength(0);
    expect(wrapper.find('[data-testid="editor-tabs"]').exists()).toBe(true);
  });
});

describe('EditorTabs menu', () => {
  it('opens, emits a new piece or assembly and closes', async () => {
    const wrapper = mountTabs();

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tabs-menu-drawing"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="tabs-menu-drawing"]').text()).toContain('Soon');

    await wrapper.find('[data-testid="tabs-menu-piece"]').trigger('click');
    expect(wrapper.emitted('new-piece')).toHaveLength(1);
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    await wrapper.find('[data-testid="tabs-menu-assembly"]').trigger('click');
    expect(wrapper.emitted('new-assembly')).toHaveLength(1);
  });

  it('closes on Escape and on an outside pointer down', async () => {
    const wrapper = mountTabs();

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    const outside = document.createElement('div');
    document.body.append(outside);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    wrapper.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(true);
    outside.remove();
  });

  it('never opens while read-only', async () => {
    const wrapper = mountTabs({ readOnly: true });

    expect(wrapper.find('[data-testid="tabs-new"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    expect(wrapper.find('[data-testid="tabs-menu"]').exists()).toBe(false);
  });
});

describe('EditorTabs keyboard', () => {
  it('activates with Enter and Space and navigates with arrows, Home and End', async () => {
    const wrapper = mountTabs();
    const first = wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!;

    await first.trigger('keydown', { key: 'Enter' });
    await first.trigger('keydown', { key: ' ' });
    await first.trigger('keydown', { key: 'ArrowRight' });
    await first.trigger('keydown', { key: 'ArrowLeft' });
    await first.trigger('keydown', { key: 'Home' });
    await first.trigger('keydown', { key: 'End' });

    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ kind: 'piece', id: 'p1' }],
      [{ kind: 'piece', id: 'p1' }],
      [{ kind: 'piece', id: 'p2' }],
      [{ kind: 'assembly', id: 'a1' }],
      [{ kind: 'piece', id: 'p1' }],
      [{ kind: 'assembly', id: 'a1' }],
    ]);
  });

  it('reorders with Alt+Shift+Arrow and refuses while read-only', async () => {
    const wrapper = mountTabs();
    const first = wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!;

    await first.trigger('keydown', { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(wrapper.emitted('reorder')).toEqual([
      [
        [
          { kind: 'piece', id: 'p2' },
          { kind: 'piece', id: 'p1' },
          { kind: 'assembly', id: 'a1' },
        ],
      ],
    ]);

    const readOnly = mountTabs({ readOnly: true });
    await readOnly
      .findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!
      .trigger('keydown', { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(readOnly.emitted('reorder')).toBeUndefined();
  });

  it('focuses the first tab when no tab is active and scrolls the active tab into view', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const wrapper = mountTabs({ modelValue: null });

    expect(
      wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!.attributes('tabindex'),
    ).toBe('0');
    expect(
      wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')[1]!.attributes('tabindex'),
    ).toBe('-1');

    await wrapper.setProps({ modelValue: { kind: 'assembly', id: 'a1' } });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('ignores navigation when there are no tabs', async () => {
    const wrapper = mountTabs({ document: createEmptyDocument(), modelValue: null });

    expect(wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])')).toHaveLength(0);
  });
});

describe('EditorTabs drag', () => {
  it('emits one reorder on a real move and nothing on a same-index drop', async () => {
    const wrapper = mountTabs();
    const tabs = wrapper.findAll('[role="tab"]:not([data-testid="tab-sketch"])');

    await tabs[0]!.trigger('dragstart', { dataTransfer: dragData() });
    await tabs[2]!.trigger('drop', { dataTransfer: dragData() });
    expect(wrapper.emitted('reorder')).toEqual([
      [
        [
          { kind: 'piece', id: 'p2' },
          { kind: 'assembly', id: 'a1' },
          { kind: 'piece', id: 'p1' },
        ],
      ],
    ]);

    await tabs[1]!.trigger('dragstart', { dataTransfer: dragData() });
    await tabs[1]!.trigger('drop', { dataTransfer: dragData() });
    expect(wrapper.emitted('reorder')).toHaveLength(1);

    await tabs[0]!.trigger('drop', { dataTransfer: dragData() });
    expect(wrapper.emitted('reorder')).toHaveLength(1);
  });

  it('prevents a drag while read-only', async () => {
    const wrapper = mountTabs({ readOnly: true });
    const event = new Event('dragstart', { bubbles: true, cancelable: true });

    wrapper
      .findAll('[role="tab"]:not([data-testid="tab-sketch"])')[0]!
      .element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('EditorTabs seam errors', () => {
  const rectangle = (piece: string, width: number, prefix: string) => ({
    entities: [
      { id: `${prefix}a`, kind: 'point' as const, x: 0, y: 0, piece, fixed: false },
      { id: `${prefix}b`, kind: 'point' as const, x: width, y: 0, piece, fixed: false },
      { id: `${prefix}c`, kind: 'point' as const, x: width, y: 100, piece, fixed: false },
      { id: `${prefix}d`, kind: 'point' as const, x: 0, y: 100, piece, fixed: false },
      { id: `${prefix}ab`, kind: 'line' as const, start: `${prefix}a`, end: `${prefix}b`, piece },
      { id: `${prefix}bc`, kind: 'line' as const, start: `${prefix}b`, end: `${prefix}c`, piece },
      { id: `${prefix}cd`, kind: 'line' as const, start: `${prefix}c`, end: `${prefix}d`, piece },
      { id: `${prefix}da`, kind: 'line' as const, start: `${prefix}d`, end: `${prefix}a`, piece },
    ],
    piece: {
      id: piece,
      name: piece === 'p1' ? 'Front' : 'Back',
      edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
      allowances: [],
    },
  });

  const sewnDocument = (eased: boolean): PatternDocument => {
    const front = rectangle('p1', 100, '');
    const back = rectangle('p2', 106, 'b-');
    const restFront = front.piece.edges.slice(1);
    const restBack = back.piece.edges.slice(1);
    return {
      ...createEmptyDocument(),
      entities: [...front.entities, ...back.entities],
      pieces: [front.piece, back.piece],
      assemblies: [
        {
          id: 'a1',
          name: 'Shell',
          instances: [
            { id: 'i1', piece: 'p1', x: 0, y: 0 },
            { id: 'i2', piece: 'p2', x: 200, y: 0 },
          ],
          seams: [
            {
              id: 's1',
              eased,
              sides: [
                { instance: 'i1', edges: ['ab'] },
                { instance: 'i2', edges: ['b-ab'] },
              ],
            },
          ],
          finishedEdges: [
            ...restFront.map((edge) => ({ instance: 'i1', edge, kind: 'hem' as const })),
            ...restBack.map((edge) => ({ instance: 'i2', edge, kind: 'hem' as const })),
          ],
        },
      ],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    };
  };

  it('shows a destructive pill with the error count on an assembly tab', () => {
    const wrapper = mountTabs({ document: sewnDocument(false) });

    const pill = wrapper.find('[data-testid="tab-seam-errors-a1"]');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe('1');
    expect(pill.attributes('aria-label')).toBe('1 seam issues');
    expect(pill.classes()).toContain('bg-destructive');
  });

  it('leaves the assembly tab bare when there are warnings only', () => {
    const wrapper = mountTabs({ document: sewnDocument(true) });

    expect(wrapper.find('[data-testid="tab-seam-errors-a1"]').exists()).toBe(false);
  });

  it('never puts a pill on a piece tab', () => {
    const wrapper = mountTabs({ document: sewnDocument(false) });

    expect(wrapper.find('[data-testid="tab-seam-errors-p1"]').exists()).toBe(false);
  });
});
