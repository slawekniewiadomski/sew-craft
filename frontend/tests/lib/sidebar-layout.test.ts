import { describe, expect, it, vi } from 'vitest';

import {
  clampSidebarWidth,
  defaultSidebarLayout,
  loadSidebarLayout,
  parseSidebarLayout,
  saveSidebarLayout,
  serializeSidebarLayout,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_STORAGE_KEY,
  type KeyValueStore,
} from '@/lib/sidebar-layout';

function storeWith(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('clampSidebarWidth', () => {
  it('keeps widths inside the range unchanged', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it('raises widths below the minimum', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('caps widths above the maximum', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('falls back to the default for a non-finite width', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});

describe('defaultSidebarLayout', () => {
  it('returns the default width and expanded state', () => {
    expect(defaultSidebarLayout()).toEqual({
      width: SIDEBAR_DEFAULT_WIDTH,
      collapsed: false,
    });
  });
});

describe('parseSidebarLayout', () => {
  it('returns the default when nothing is stored', () => {
    expect(parseSidebarLayout(null)).toEqual(defaultSidebarLayout());
  });

  it('returns the default for malformed JSON', () => {
    expect(parseSidebarLayout('{not json')).toEqual(defaultSidebarLayout());
  });

  it('returns the default for a non-object value', () => {
    expect(parseSidebarLayout('null')).toEqual(defaultSidebarLayout());
  });

  it('returns the default when the shape is wrong', () => {
    expect(parseSidebarLayout('{"width":"wide","collapsed":true}')).toEqual(defaultSidebarLayout());
  });

  it('parses a valid stored layout', () => {
    expect(parseSidebarLayout('{"width":400,"collapsed":true}')).toEqual({
      width: 400,
      collapsed: true,
    });
  });

  it('clamps an out-of-range stored width', () => {
    expect(parseSidebarLayout('{"width":10,"collapsed":false}')).toEqual({
      width: SIDEBAR_MIN_WIDTH,
      collapsed: false,
    });
  });
});

describe('serializeSidebarLayout', () => {
  it('round-trips through JSON', () => {
    expect(serializeSidebarLayout({ width: 320, collapsed: false })).toBe(
      '{"width":320,"collapsed":false}',
    );
  });
});

describe('loadSidebarLayout', () => {
  it('reads a valid layout from the store', () => {
    const store = storeWith({ [SIDEBAR_STORAGE_KEY]: '{"width":450,"collapsed":true}' });

    expect(loadSidebarLayout(store)).toEqual({ width: 450, collapsed: true });
  });

  it('falls back to the default when the store throws', () => {
    const store: KeyValueStore = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => undefined,
    };

    expect(loadSidebarLayout(store)).toEqual(defaultSidebarLayout());
  });
});

describe('saveSidebarLayout', () => {
  it('writes the serialized layout to the store', () => {
    const store = storeWith();
    const spy = vi.spyOn(store, 'setItem');

    saveSidebarLayout(store, { width: 360, collapsed: true });

    expect(spy).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY, '{"width":360,"collapsed":true}');
  });

  it('swallows a throwing store', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled');
      },
    };

    expect(() => saveSidebarLayout(store, { width: 360, collapsed: true })).not.toThrow();
  });
});
