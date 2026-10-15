export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 320;
export const SIDEBAR_STORAGE_KEY = 'sewcraft.editor.sidebar';

export interface SidebarLayoutState {
  width: number;
  collapsed: boolean;
}

/** The slice of the Web Storage API this module needs, so it can be faked. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSidebarLayout(): SidebarLayoutState {
  return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
}

/** Constrains a width to the supported range; non-finite input falls back. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function isSidebarLayout(value: unknown): value is SidebarLayoutState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.width === 'number' && typeof candidate.collapsed === 'boolean';
}

/** Reads a persisted layout, tolerating absent, malformed or stale values. */
export function parseSidebarLayout(raw: string | null): SidebarLayoutState {
  if (raw === null) return defaultSidebarLayout();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSidebarLayout(parsed)) return defaultSidebarLayout();
    return { width: clampSidebarWidth(parsed.width), collapsed: parsed.collapsed };
  } catch {
    return defaultSidebarLayout();
  }
}

export function serializeSidebarLayout(state: SidebarLayoutState): string {
  return JSON.stringify(state);
}

export function loadSidebarLayout(store: KeyValueStore): SidebarLayoutState {
  try {
    return parseSidebarLayout(store.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return defaultSidebarLayout();
  }
}

export function saveSidebarLayout(store: KeyValueStore, state: SidebarLayoutState): void {
  try {
    store.setItem(SIDEBAR_STORAGE_KEY, serializeSidebarLayout(state));
  } catch {
    // Storage can be disabled (private mode); the layout is not worth failing over.
  }
}
