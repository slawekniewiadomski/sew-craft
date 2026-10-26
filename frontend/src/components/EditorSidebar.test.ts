import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { persistedPanelKey, type PanelId } from '@/lib/editor-panels';

import EditorSidebar from './EditorSidebar.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
  window.localStorage.clear();
});

interface Extras {
  counts?: Partial<Record<PanelId, number>>;
  stats?: boolean;
  readOnly?: boolean;
}

function mountSidebar(
  width = 320,
  collapsed = false,
  extras: Extras = {},
  props: { patternId?: string; mode?: 'piece' | 'assembly' } = {},
): VueWrapper {
  return mount(EditorSidebar, {
    props: {
      width,
      collapsed,
      patternId: props.patternId ?? '1',
      ...(props.mode === undefined ? {} : { mode: props.mode }),
      ...(extras.counts === undefined ? {} : { counts: extras.counts }),
      ...(extras.readOnly === undefined ? {} : { readOnly: extras.readOnly }),
    },
    slots: {
      properties: '<p data-testid="slot-properties">Properties</p>',
      pieces: '<p data-testid="slot-pieces">Pieces</p>',
      pattern: '<p data-testid="slot-pattern">Pattern</p>',
      assembly: '<p data-testid="slot-assembly">Assembly</p>',
      outline: '<p data-testid="slot-outline">Outline</p>',
      dimensions: '<p data-testid="slot-dimensions">Dimensions</p>',
      constraints: '<p data-testid="slot-constraints">Constraints</p>',
      ...(extras.stats === true
        ? {
            stats:
              '<div data-testid="workspace-summary"><span data-testid="active-tool">Select</span></div>',
          }
        : {}),
    },
  });
}

function pointerdown(element: Element, clientX: number): void {
  element.dispatchEvent(
    new MouseEvent('pointerdown', { clientX, bubbles: true, cancelable: true }),
  );
}

function move(clientX: number): void {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
}

function up(): void {
  window.dispatchEvent(new MouseEvent('pointerup'));
}

describe('EditorSidebar rail', () => {
  it('opens Properties on a piece and shows one section slot', () => {
    const wrapper = mountSidebar();

    for (const id of ['properties', 'pieces', 'pattern', 'outline', 'dimensions', 'constraints']) {
      expect(wrapper.find(`[data-testid="sidebar-tab-${id}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-testid="sidebar-tab-properties"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Properties');
    expect(wrapper.find('[data-testid="slot-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="slot-outline"]').exists()).toBe(false);
  });

  it('switches the one visible section, remembers it and keeps an active click open', async () => {
    const wrapper = mountSidebar();

    await wrapper.find('[data-testid="sidebar-tab-outline"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Outline');
    expect(wrapper.find('[data-testid="slot-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="slot-properties"]').exists()).toBe(false);
    expect(window.localStorage.getItem(persistedPanelKey('1', 'piece'))).toBe('outline');
    expect(wrapper.emitted('update:collapsed')).toBeUndefined();

    await wrapper.find('[data-testid="sidebar-tab-outline"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="slot-outline"]').exists()).toBe(true);
    expect(wrapper.emitted('update:collapsed')).toBeUndefined();
  });

  it('restores the stored section and follows project and mode changes', async () => {
    window.localStorage.setItem(persistedPanelKey('1', 'piece'), 'dimensions');
    const wrapper = mountSidebar();

    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Dimensions');

    await wrapper.setProps({ patternId: '2' });
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Properties');

    window.localStorage.setItem(persistedPanelKey('2', 'assembly'), 'assembly');
    await wrapper.setProps({ mode: 'assembly' });
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Assembly');
    expect(wrapper.find('[data-testid="sidebar-tab-properties"]').exists()).toBe(false);
  });

  it('shows counts on the rail and in the active panel header', async () => {
    const wrapper = mountSidebar(320, false, { counts: { outline: 12, dimensions: 0 } });

    expect(wrapper.find('[data-testid="sidebar-tab-count-outline"]').text()).toBe('12');
    expect(wrapper.find('[data-testid="sidebar-tab-count-dimensions"]').exists()).toBe(false);

    await wrapper.find('[data-testid="sidebar-tab-outline"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar-panel-count"]').text()).toBe('12');
    expect(wrapper.find('[data-testid="sidebar-tab-outline"]').attributes('aria-label')).toBe(
      'Outline, 12 items',
    );
  });

  it('keeps the panel at its persisted width beside the fixed rail', () => {
    const wrapper = mountSidebar(320);

    expect(wrapper.find('[data-testid="sidebar"]').attributes('style')).toContain('width: 360px');
    expect(wrapper.find('[data-testid="sidebar"]').attributes('style')).not.toContain(
      'width: 320px',
    );
  });

  it('offers only Assembly on an assembly tab', () => {
    const wrapper = mountSidebar(320, false, {}, { mode: 'assembly' });

    expect(wrapper.findAll('[data-testid^="sidebar-tab-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="sidebar-tab-assembly"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="slot-assembly"]').exists()).toBe(true);
  });
});

describe('EditorSidebar collapse', () => {
  it('collapses from the chevron and keeps the rail on the canvas edge', async () => {
    const wrapper = mountSidebar();

    await wrapper.find('[data-testid="sidebar-collapse"]').trigger('click');
    expect(wrapper.emitted('update:collapsed')).toEqual([[true]]);

    await wrapper.setProps({ collapsed: true });
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sidebar-resize"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sidebar-tab-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sidebar-expand"]').exists()).toBe(true);
  });

  it('reopens the panel on a clicked tab and from the expand chevron', async () => {
    const wrapper = mountSidebar(320, true);

    await wrapper.find('[data-testid="sidebar-tab-constraints"]').trigger('click');
    expect(wrapper.emitted('update:collapsed')).toEqual([[false]]);

    await wrapper.find('[data-testid="sidebar-expand"]').trigger('click');
    expect(wrapper.emitted('update:collapsed')).toEqual([[false], [false]]);
  });
});

describe('EditorSidebar details', () => {
  it('reports width deltas while dragging the separator', async () => {
    const wrapper = mountSidebar(320);
    const handle = wrapper.find('[data-testid="sidebar-resize"]');

    pointerdown(handle.element, 600);
    await nextTick();
    expect(handle.classes()).toContain('bg-primary');

    move(560);
    expect(wrapper.emitted('update:width')).toEqual([[360]]);

    up();
    await nextTick();
    expect(handle.classes()).toContain('bg-transparent');

    move(500);
    expect(wrapper.emitted('update:width')).toEqual([[360]]);
  });

  it('stops listening for a resize when unmounted mid-drag', () => {
    const wrapper = mountSidebar(320);

    pointerdown(wrapper.find('[data-testid="sidebar-resize"]').element, 600);
    wrapper.unmount();

    expect(() => move(500)).not.toThrow();
    expect(wrapper.emitted('update:width')).toBeUndefined();
  });

  it('disables the panel body while read-only but keeps the rail usable', async () => {
    const wrapper = mountSidebar(320, false, { readOnly: true });

    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined();
    expect(
      wrapper.find('[data-testid="sidebar-tab-outline"]').attributes('disabled'),
    ).toBeUndefined();

    await wrapper.find('[data-testid="sidebar-tab-outline"]').trigger('click');
    expect(wrapper.find('[data-testid="slot-outline"]').exists()).toBe(true);
  });

  it('renders the stats slot below the panel body only when provided', () => {
    expect(mountSidebar().find('[data-testid="workspace-summary"]').exists()).toBe(false);

    const wrapper = mountSidebar(320, false, { stats: true });
    expect(wrapper.find('[data-testid="workspace-summary"]').exists()).toBe(true);
  });
});
