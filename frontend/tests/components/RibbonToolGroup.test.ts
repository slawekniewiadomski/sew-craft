import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RibbonToolGroupItem } from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';

import RibbonToolGroup from '@/components/RibbonToolGroup.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
  document.body.innerHTML = '';
});

const ITEM: RibbonToolGroupItem = {
  kind: 'tool-group',
  id: 'tool-rectangle',
  label: 'Rectangle',
  primary: {
    kind: 'tool',
    id: 'tool-add_rectangle',
    label: 'Rectangle',
    icon: 'rectangle',
    tool: 'add_rectangle',
  },
  items: [
    {
      kind: 'tool',
      id: 'tool-add_rectangle',
      label: 'Rectangle',
      icon: 'rectangle',
      tool: 'add_rectangle',
    },
    {
      kind: 'tool',
      id: 'tool-add_center_rectangle',
      label: 'Centre rectangle',
      icon: 'rectangle-center',
      tool: 'add_center_rectangle',
    },
    {
      kind: 'tool',
      id: 'tool-add_3point_rectangle',
      label: '3-point rectangle',
      icon: 'rectangle-aligned',
      tool: 'add_3point_rectangle',
    },
  ],
};

function mountGroup(
  props: Partial<{ activeTool: EditorTool; active: boolean; readOnly: boolean }> = {},
): VueWrapper {
  return mount(RibbonToolGroup, {
    props: { item: ITEM, activeTool: 'select', ...props },
    attachTo: document.body,
  });
}

function iconHalf(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="tool-rectangle"]');
}

function caret(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="tool-rectangle-modes"]');
}

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
}

async function openMenu(wrapper: VueWrapper): Promise<void> {
  await caret(wrapper).trigger('click');
  await flushPromises();
}

describe('RibbonToolGroup', () => {
  it('renders a split control showing the default mode', () => {
    const wrapper = mountGroup();

    expect(iconHalf(wrapper).attributes()).toMatchObject({
      'data-mode': 'add_rectangle',
      'aria-label': 'Rectangle',
    });
    expect(iconHalf(wrapper).attributes('aria-pressed')).toBeUndefined();
    expect(caret(wrapper).attributes()).toMatchObject({
      'aria-label': 'Rectangle modes',
      title: 'Rectangle modes',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
    });
  });

  it('follows the active member and marks the control active', () => {
    const wrapper = mountGroup({ activeTool: 'add_center_rectangle', active: true });

    expect(iconHalf(wrapper).attributes('data-mode')).toBe('add_center_rectangle');
    expect(iconHalf(wrapper).attributes('aria-label')).toBe('Centre rectangle');
    expect(iconHalf(wrapper).attributes('aria-pressed')).toBe('true');
    expect(iconHalf(wrapper).classes()).toContain('bg-primary');
  });

  it('keeps the last armed mode after the tool leaves the group', async () => {
    const wrapper = mountGroup({ activeTool: 'add_3point_rectangle', active: true });

    await wrapper.setProps({ activeTool: 'select', active: false });

    expect(iconHalf(wrapper).attributes('data-mode')).toBe('add_3point_rectangle');
    expect(iconHalf(wrapper).attributes('aria-pressed')).toBeUndefined();
  });

  it('returns to the primary when the group does not remember the last mode', async () => {
    const wrapper = mount(RibbonToolGroup, {
      props: { item: { ...ITEM, rememberLast: false }, activeTool: 'add_center_rectangle' },
      attachTo: document.body,
    });

    expect(iconHalf(wrapper).attributes('data-mode')).toBe('add_center_rectangle');

    await wrapper.setProps({ activeTool: 'select' });

    expect(iconHalf(wrapper).attributes('data-mode')).toBe('add_rectangle');
    expect(iconHalf(wrapper).attributes('aria-label')).toBe('Rectangle');
  });

  it('arms the displayed mode on a primary click', async () => {
    const wrapper = mountGroup();

    await iconHalf(wrapper).trigger('click');

    expect(wrapper.emitted('select-tool')).toEqual([['add_rectangle']]);
  });

  it('opens a menu of every mode with the displayed one checked', async () => {
    const wrapper = mountGroup({ activeTool: 'add_center_rectangle', active: true });

    await openMenu(wrapper);

    expect(caret(wrapper).attributes('aria-expanded')).toBe('true');
    expect(menuItems().map((item) => item.dataset.testid)).toEqual([
      'tool-add_rectangle',
      'tool-add_center_rectangle',
      'tool-add_3point_rectangle',
    ]);
    expect(menuItems().map((item) => item.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      'Rectangle',
      'Centre rectangle',
      '3-point rectangle',
    ]);
  });

  it('arms a different mode, closes the menu and shows its glyph', async () => {
    const wrapper = mountGroup();
    await openMenu(wrapper);

    menuItems()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted('select-tool')).toEqual([['add_center_rectangle']]);
    expect(menuItems()).toHaveLength(0);
    expect(iconHalf(wrapper).attributes('data-mode')).toBe('add_center_rectangle');
  });

  it('closes without toggling when the displayed mode is chosen', async () => {
    const wrapper = mountGroup({ activeTool: 'add_rectangle', active: true });
    await openMenu(wrapper);

    menuItems()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted('select-tool')).toBeUndefined();
    expect(menuItems()).toHaveLength(0);
  });

  it('closes on Escape, returns focus to the caret and keeps the event from the canvas', async () => {
    const wrapper = mountGroup();
    await openMenu(wrapper);
    const windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    menuItems()[0]!.dispatchEvent(escape);
    await flushPromises();

    expect(escape.defaultPrevented).toBe(true);
    expect(windowListener).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(0);
    expect(document.activeElement).toBe(caret(wrapper).element);

    window.removeEventListener('keydown', windowListener);
  });

  it('closes on Tab without changing the armed tool', async () => {
    const wrapper = mountGroup();
    await openMenu(wrapper);

    menuItems()[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    await flushPromises();

    expect(menuItems()).toHaveLength(0);
    expect(wrapper.emitted('select-tool')).toBeUndefined();
  });

  it('closes on an outside click without changing the armed tool', async () => {
    const wrapper = mountGroup();
    await openMenu(wrapper);
    const bubble = vi.fn();
    window.addEventListener('pointerdown', bubble);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();

    expect(menuItems()).toHaveLength(0);
    expect(wrapper.emitted('select-tool')).toBeUndefined();
    // The click is consumed so the canvas cannot start a drawing gesture.
    expect(bubble).not.toHaveBeenCalled();

    window.removeEventListener('pointerdown', bubble);
  });

  it('lets a pointerdown inside the split control or the menu through', async () => {
    const wrapper = mountGroup();
    const bubble = vi.fn();
    window.addEventListener('pointerdown', bubble);
    await openMenu(wrapper);

    iconHalf(wrapper).element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(bubble).toHaveBeenCalledTimes(1);
    expect(menuItems()).toHaveLength(3);

    menuItems()[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(bubble).toHaveBeenCalledTimes(2);
    expect(menuItems()).toHaveLength(3);

    window.removeEventListener('pointerdown', bubble);
  });

  it('stops consuming pointerdowns once the menu is closed', async () => {
    const wrapper = mountGroup();
    const bubble = vi.fn();
    window.addEventListener('pointerdown', bubble);
    await openMenu(wrapper);
    await wrapper.setProps({ activeTool: 'add_line' });
    await flushPromises();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(bubble).toHaveBeenCalledTimes(1);

    window.removeEventListener('pointerdown', bubble);
  });

  it('closes when the active tool changes while the menu is open', async () => {
    const wrapper = mountGroup();
    await openMenu(wrapper);

    await wrapper.setProps({ activeTool: 'add_line' });
    await flushPromises();

    expect(menuItems()).toHaveLength(0);
  });

  it('disables both halves in a read-only document', async () => {
    const wrapper = mountGroup({ readOnly: true });

    expect(iconHalf(wrapper).attributes('disabled')).toBeDefined();
    expect(caret(wrapper).attributes('disabled')).toBeDefined();

    await openMenu(wrapper);

    expect(menuItems()).toHaveLength(0);
  });
});
