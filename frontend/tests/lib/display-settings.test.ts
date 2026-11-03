import { describe, expect, it } from 'vitest';

import {
  defaultDisplaySettings,
  parseDisplaySettings,
  persistedDisplayKey,
  readDisplaySettings,
  writeDisplaySettings,
} from '@/lib/display-settings';

describe('defaultDisplaySettings', () => {
  it('shows every layer and exports stitch and fold by default', () => {
    expect(defaultDisplaySettings()).toEqual({
      piece: { construction: true, allowances: true, constraints: true, dimensions: true },
      assembly: { cutShapes: true, allowances: true, stitch: true, folds: true, labels: true },
      export: { construction: false, stitch: true, fold: true },
    });
  });

  it('returns a fresh copy so one edit never changes another project', () => {
    const first = defaultDisplaySettings();
    first.piece.construction = false;

    expect(defaultDisplaySettings().piece.construction).toBe(true);
  });
});

describe('parseDisplaySettings', () => {
  it('falls back to the defaults for a missing, empty or malformed value', () => {
    expect(parseDisplaySettings(null)).toEqual(defaultDisplaySettings());
    expect(parseDisplaySettings('')).toEqual(defaultDisplaySettings());
    expect(parseDisplaySettings('{not json')).toEqual(defaultDisplaySettings());
    expect(parseDisplaySettings('42')).toEqual(defaultDisplaySettings());
  });

  it('keeps valid booleans and replaces the rest field by field', () => {
    const parsed = parseDisplaySettings(
      JSON.stringify({
        piece: { construction: false, allowances: 'no', constraints: true },
        assembly: { stitch: false },
        export: { fold: false, stitch: null },
      }),
    );

    expect(parsed).toEqual({
      piece: { construction: false, allowances: true, constraints: true, dimensions: true },
      assembly: { cutShapes: true, allowances: true, stitch: false, folds: true, labels: true },
      export: { construction: false, stitch: true, fold: false },
    });
  });

  it('ignores a group that is not an object', () => {
    expect(parseDisplaySettings(JSON.stringify({ piece: 3, assembly: [], export: 'on' }))).toEqual(
      defaultDisplaySettings(),
    );
  });
});

describe('persisted display settings', () => {
  it('keys the preferences by project', () => {
    expect(persistedDisplayKey('42')).toBe('sewcraft:display:42');
  });

  it('round-trips through storage and starts from the defaults when absent', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readDisplaySettings(storage, '7')).toEqual(defaultDisplaySettings());

    const settings = defaultDisplaySettings();
    settings.piece.dimensions = false;
    settings.assembly.labels = false;
    settings.export.construction = true;
    writeDisplaySettings(storage, '7', settings);

    expect(store.get('sewcraft:display:7')).toBe(JSON.stringify(settings));
    expect(readDisplaySettings(storage, '7')).toEqual(settings);
    expect(readDisplaySettings(storage, '8')).toEqual(defaultDisplaySettings());
  });
});
