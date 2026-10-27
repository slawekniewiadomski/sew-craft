import { describe, expect, it } from 'vitest';

import { nextCommandId } from '@/lib/command-ids';

describe('nextCommandId', () => {
  it('returns a unique id for each call', () => {
    const first = nextCommandId();
    const second = nextCommandId('move');

    expect(first).not.toBe(second);
    expect(second.startsWith('move-')).toBe(true);
  });
});
