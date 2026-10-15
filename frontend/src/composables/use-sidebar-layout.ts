import { ref, watch } from 'vue';

import {
  clampSidebarWidth,
  loadSidebarLayout,
  saveSidebarLayout,
  type KeyValueStore,
} from '@/lib/sidebar-layout';

/**
 * Reactive sidebar width/collapsed state backed by a key/value store. Reads the
 * persisted value once, writes on every change, and clamps widths to range.
 */
export function useSidebarLayout(store: KeyValueStore) {
  const initial = loadSidebarLayout(store);
  const width = ref(initial.width);
  const collapsed = ref(initial.collapsed);

  watch([width, collapsed], () => {
    saveSidebarLayout(store, { width: width.value, collapsed: collapsed.value });
  });

  function setWidth(next: number): void {
    width.value = clampSidebarWidth(next);
  }

  function toggleCollapsed(): void {
    collapsed.value = !collapsed.value;
  }

  return { width, collapsed, setWidth, toggleCollapsed };
}
