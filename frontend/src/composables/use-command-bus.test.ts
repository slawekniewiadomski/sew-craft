import { createEmptyDocument } from '@sewcraft/geometry';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useCommandBus } from './use-command-bus';

describe('useCommandBus', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('exposes the document and journal', () => {
    const bus = useCommandBus();

    expect(bus.document.value).toEqual(createEmptyDocument());
    expect(bus.journal.value).toEqual([]);
    expect(bus.canUndo.value).toBe(false);
    expect(bus.canRedo.value).toBe(false);
  });

  it('dispatches, undoes and redoes through the editor store', () => {
    const bus = useCommandBus();

    bus.dispatch({ id: 'p', type: 'add_point', params: { x: 1, y: 2 } });

    expect(bus.journal.value).toHaveLength(1);
    expect(bus.canUndo.value).toBe(true);

    bus.undo();
    expect(bus.canUndo.value).toBe(false);
    expect(bus.canRedo.value).toBe(true);

    bus.redo();
    expect(bus.canRedo.value).toBe(false);
    expect(bus.canUndo.value).toBe(true);
  });
});
