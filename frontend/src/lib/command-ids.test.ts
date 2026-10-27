import { describe, expect, it, vi } from 'vitest';

import { nextCommandId } from './command-ids';

describe('nextCommandId', () => {
  it('returns a unique id for each call', () => {
    const first = nextCommandId();
    const second = nextCommandId('move');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^cmd-\d+-[a-z0-9]{4}$/);
    expect(second).toMatch(/^move-\d+-[a-z0-9]{4}$/);
  });

  it('tags ids per page load, so a reload never reuses a stored id', async () => {
    const random = vi.spyOn(Math, 'random');

    random.mockReturnValue(0.111);
    vi.resetModules();
    const first = await import('./command-ids');

    random.mockReturnValue(0.999);
    vi.resetModules();
    const second = await import('./command-ids');

    const before = first.nextCommandId('point');
    const after = second.nextCommandId('point');
    random.mockRestore();

    // Both sessions start their counter at 1; only the tag keeps them apart.
    expect(before).toMatch(/^point-1-/);
    expect(after).toMatch(/^point-1-/);
    expect(after).not.toBe(before);
  });
});
