import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import type { DrawerId } from '@/lib/editor-drawers';

import EditorSidebar from './EditorSidebar.vue';

enableAutoUnmount(afterEach);

interface Extras {
  counts?: Partial<Record<DrawerId, number>>;
  stats?: boolean;
}

function mountSidebar(width = 320, collapsed = false, extras: Extras = {}): VueWrapper {
  return mount(EditorSidebar, {
    props: {
      width,
      collapsed,
      ...(extras.counts === undefined ? {} : { counts: extras.counts }),
    },
    slots: {
      properties: '<p data-testid="slot-properties">Props</p>',
      pieces: '<p data-testid="slot-pieces">Pieces</p>',
      outline: '<p data-testid="slot-outline">Outline</p>',
      view: '<p data-testid="slot-view">View</p>',
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

describe('EditorSidebar', () => {
  it('opens properties, pieces and outline by default and collapses view', () => {
    const wrapper = mountSidebar();

    expect(wrapper.find('[data-testid="drawer-content-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-content-pieces"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="slot-pieces"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-content-outline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(false);
  });

  it('opens a collapsed drawer when its trigger is clicked', async () => {
    const wrapper = mountSidebar();

    await wrapper.find('[data-testid="drawer-toggle-view"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="slot-view"]').exists()).toBe(true);
  });

  it('forwards per-drawer counts as header badges and hides a zero', () => {
    const wrapper = mountSidebar(320, false, { counts: { properties: 2, pieces: 0 } });

    expect(wrapper.find('[data-testid="drawer-toggle-properties"]').text()).toContain('2');
    expect(
      wrapper
        .find('[data-testid="drawer-toggle-pieces"]')
        .find('[data-testid="drawer-count"]')
        .exists(),
    ).toBe(false);
  });

  it('renders the stats slot below the drawer list only when provided', () => {
    expect(mountSidebar().find('[data-testid="workspace-summary"]').exists()).toBe(false);

    const wrapper = mountSidebar(320, false, { stats: true });
    const aside = wrapper.find('[data-testid="sidebar"]');

    expect(wrapper.find('[data-testid="workspace-summary"]').exists()).toBe(true);
    expect(aside.text()).toContain('Select');
  });

  it('applies the width while expanded and skips it when collapsed', () => {
    expect(mountSidebar(420, false).find('[data-testid="sidebar"]').attributes('style')).toContain(
      'width: 420px',
    );
    expect(
      mountSidebar(420, true).find('[data-testid="sidebar"]').attributes('style'),
    ).toBeUndefined();
  });

  it('emits collapse and expand intents from the rail', async () => {
    const expanded = mountSidebar();
    await expanded.find('[data-testid="sidebar-collapse"]').trigger('click');
    expect(expanded.emitted('update:collapsed')).toEqual([[true]]);

    const collapsed = mountSidebar(320, true);
    expect(collapsed.find('[data-testid="sidebar-resize"]').exists()).toBe(false);
    expect(collapsed.find('[data-testid="drawer-toggle-view"]').exists()).toBe(false);
    await collapsed.find('[data-testid="sidebar-expand"]').trigger('click');
    expect(collapsed.emitted('update:collapsed')).toEqual([[false]]);
  });

  it('turns the collapsed strip into one named icon button per drawer', () => {
    const wrapper = mountSidebar(320, true);

    for (const [id, label] of [
      ['properties', 'Properties'],
      ['pieces', 'Pieces'],
      ['outline', 'Outline'],
      ['dimensions', 'Dimensions'],
      ['constraints', 'Constraints'],
      ['view', 'View'],
    ] as const) {
      const button = wrapper.find(`[data-testid="sidebar-rail-${id}"]`);
      expect(button.exists()).toBe(true);
      expect(button.attributes('aria-label')).toBe(`Open ${label} drawer`);
    }
  });

  it('expands and opens the chosen drawer from the rail', async () => {
    const wrapper = mountSidebar(320, true);

    await wrapper.find('[data-testid="sidebar-rail-view"]').trigger('click');
    expect(wrapper.emitted('update:collapsed')).toEqual([[false]]);

    await wrapper.setProps({ collapsed: false });
    await nextTick();
    expect(wrapper.find('[data-testid="drawer-content-view"]').exists()).toBe(true);
  });

  it('leaves an already-open drawer open when its rail button is used', async () => {
    const wrapper = mountSidebar(320, true);

    await wrapper.find('[data-testid="sidebar-rail-properties"]').trigger('click');
    await wrapper.setProps({ collapsed: false });
    await nextTick();

    expect(wrapper.find('[data-testid="drawer-content-properties"]').exists()).toBe(true);
  });

  it('emits a clamped-agnostic width delta while dragging the handle', async () => {
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

  it('stops listening for drags when unmounted mid-resize', async () => {
    const wrapper = mountSidebar(320);

    pointerdown(wrapper.find('[data-testid="sidebar-resize"]').element, 600);
    wrapper.unmount();

    expect(() => move(500)).not.toThrow();
    expect(wrapper.emitted('update:width')).toBeUndefined();
  });
});
