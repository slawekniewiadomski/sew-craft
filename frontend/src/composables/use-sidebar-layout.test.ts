import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { SIDEBAR_STORAGE_KEY, type KeyValueStore } from '@/lib/sidebar-layout';

import { useSidebarLayout } from './use-sidebar-layout';

const DEFAULT_LAYOUT = { width: 320, collapsed: false };

function storeWith(initial: string | null): KeyValueStore {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
}

describe('useSidebarLayout', () => {
  it('starts from the stored layout and persists changes', async () => {
    const store = storeWith(JSON.stringify({ width: 400, collapsed: true }));
    const spy = vi.spyOn(store, 'setItem');

    const { width, collapsed, setWidth } = useSidebarLayout(store);
    expect(width.value).toBe(400);
    expect(collapsed.value).toBe(true);

    setWidth(500);
    await nextTick();

    expect(width.value).toBe(500);
    expect(spy).toHaveBeenCalledWith(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 500, collapsed: true }),
    );
  });

  it('starts from defaults when storage is empty', () => {
    const { width, collapsed } = useSidebarLayout(storeWith(null));

    expect(width.value).toBe(DEFAULT_LAYOUT.width);
    expect(collapsed.value).toBe(DEFAULT_LAYOUT.collapsed);
  });

  it('clamps a width passed to setWidth', async () => {
    const store = storeWith(null);
    const { width, setWidth } = useSidebarLayout(store);

    setWidth(10);
    expect(width.value).toBe(240);

    setWidth(10_000);
    expect(width.value).toBe(560);
  });

  it('falls back to the default width for a non-finite value', () => {
    const { width, setWidth } = useSidebarLayout(storeWith(null));

    setWidth(Number.NaN);

    expect(width.value).toBe(DEFAULT_LAYOUT.width);
  });

  it('toggles the collapsed state and persists it', async () => {
    const store = storeWith(null);
    const spy = vi.spyOn(store, 'setItem');
    const { collapsed, toggleCollapsed } = useSidebarLayout(store);

    toggleCollapsed();
    await nextTick();
    expect(collapsed.value).toBe(true);

    toggleCollapsed();
    await nextTick();
    expect(collapsed.value).toBe(false);
    expect(spy).toHaveBeenLastCalledWith(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ width: 320, collapsed: false }),
    );
  });
});
