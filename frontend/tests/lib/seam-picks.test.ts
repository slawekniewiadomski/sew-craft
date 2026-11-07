import { describe, expect, it } from 'vitest';

import {
  addSeamPick,
  emptySeamDraft,
  flipLastSide,
  newSeamSide,
  removeSeamPick,
  seamDraftRuns,
  seamDraftSides,
  type SeamEdgeOrder,
} from '@/lib/seam-picks';

const order: SeamEdgeOrder = new Map([
  ['i1', ['bottom', 'right', 'top', 'left']],
  ['i2', ['bottom', 'right', 'top', 'left']],
]);

const pick = (instance: string, edge: string) => ({ instance, edge });

describe('addSeamPick', () => {
  it('starts the first side', () => {
    const draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);

    expect(draft).toEqual({
      sealed: [],
      current: { instance: 'i1', edges: ['bottom'], reversed: false },
    });
  });

  it('extends the open side at either end in loop order', () => {
    const first = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    const appended = addSeamPick(first, pick('i1', 'right'), order);
    const prepended = addSeamPick(appended, pick('i1', 'left'), order);

    expect(appended.current!.edges).toEqual(['bottom', 'right']);
    expect(prepended.current!.edges).toEqual(['left', 'bottom', 'right']);
  });

  it('wraps around the loop in both directions', () => {
    const first = addSeamPick(emptySeamDraft(), pick('i1', 'left'), order);
    const appended = addSeamPick(first, pick('i1', 'bottom'), order);
    const prepended = addSeamPick(appended, pick('i1', 'top'), order);

    expect(appended.current!.edges).toEqual(['left', 'bottom']);
    expect(prepended.current!.edges).toEqual(['top', 'left', 'bottom']);
  });

  it('seals the side and starts another on a non-adjacent edge', () => {
    const draft = addSeamPick(
      addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order),
      pick('i1', 'top'),
      order,
    );

    expect(draft.sealed).toEqual([{ instance: 'i1', edges: ['bottom'], reversed: false }]);
    expect(draft.current).toEqual({ instance: 'i1', edges: ['top'], reversed: false });
  });

  it('seals the side when the instance changes', () => {
    const draft = addSeamPick(
      addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order),
      pick('i2', 'bottom'),
      order,
    );

    expect(seamDraftSides(draft)).toEqual([
      { instance: 'i1', edges: ['bottom'], reversed: false },
      { instance: 'i2', edges: ['bottom'], reversed: false },
    ]);
  });

  it('toggles a picked edge off and drops an emptied side', () => {
    const draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    const removed = addSeamPick(draft, pick('i1', 'bottom'), order);

    expect(removed).toEqual(emptySeamDraft());
  });

  it('removes a pick from a sealed side and keeps the rest', () => {
    let draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    draft = addSeamPick(draft, pick('i1', 'right'), order);
    draft = newSeamSide(draft);
    draft = addSeamPick(draft, pick('i2', 'bottom'), order);

    const removed = removeSeamPick(draft, pick('i1', 'right'));

    expect(removed.sealed).toEqual([{ instance: 'i1', edges: ['bottom'], reversed: false }]);
    expect(removed.current).toEqual({ instance: 'i2', edges: ['bottom'], reversed: false });
  });
});

describe('newSeamSide', () => {
  it('seals the open side so the next pick starts another', () => {
    const draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    const sealed = newSeamSide(draft);
    const next = addSeamPick(sealed, pick('i1', 'right'), order);

    expect(sealed.current).toBeNull();
    expect(next.sealed).toEqual([{ instance: 'i1', edges: ['bottom'], reversed: false }]);
    expect(next.current).toEqual({ instance: 'i1', edges: ['right'], reversed: false });
  });

  it('does nothing without an open side', () => {
    expect(newSeamSide(emptySeamDraft())).toEqual(emptySeamDraft());
  });
});

describe('flipLastSide', () => {
  it('flips the open side', () => {
    const draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);

    expect(flipLastSide(draft).current!.reversed).toBe(true);
    expect(flipLastSide(flipLastSide(draft)).current!.reversed).toBe(false);
  });

  it('flips the last sealed side', () => {
    const draft = newSeamSide(addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order));

    expect(flipLastSide(draft).sealed[0]!.reversed).toBe(true);
  });

  it('does nothing when there is no side', () => {
    expect(flipLastSide(emptySeamDraft())).toEqual(emptySeamDraft());
  });
});

describe('seamDraftRuns', () => {
  it('converts every side and omits a forward flag', () => {
    let draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    draft = newSeamSide(draft);
    draft = addSeamPick(draft, pick('i2', 'bottom'), order);
    draft = flipLastSide(draft);

    expect(seamDraftRuns(draft)).toEqual([
      { instance: 'i1', edges: ['bottom'] },
      { instance: 'i2', edges: ['bottom'], reversed: true },
    ]);
  });
});

describe('unknown picks', () => {
  it('starts a new side for an instance the order does not know', () => {
    const first = addSeamPick(emptySeamDraft(), pick('i9', 'x'), order);
    const second = addSeamPick(first, pick('i9', 'y'), order);

    expect(first.current).toEqual({ instance: 'i9', edges: ['x'], reversed: false });
    expect(second.sealed).toEqual([{ instance: 'i9', edges: ['x'], reversed: false }]);
    expect(second.current).toEqual({ instance: 'i9', edges: ['y'], reversed: false });
  });

  it('starts a new side for an edge the loop does not know', () => {
    const first = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    const second = addSeamPick(first, pick('i1', 'ghost'), order);

    expect(second.sealed).toEqual([{ instance: 'i1', edges: ['bottom'], reversed: false }]);
    expect(second.current).toEqual({ instance: 'i1', edges: ['ghost'], reversed: false });
  });

  it('starts a new side when the open run itself no longer resolves', () => {
    const draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    const broken = { ...draft, current: { instance: 'i1', edges: ['ghost'], reversed: false } };
    const second = addSeamPick(broken, pick('i1', 'right'), order);

    expect(second.sealed).toEqual([{ instance: 'i1', edges: ['ghost'], reversed: false }]);
    expect(second.current).toEqual({ instance: 'i1', edges: ['right'], reversed: false });
  });
});

describe('removing picks across sides', () => {
  it('keeps the other sealed sides and drops an emptied one', () => {
    let draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    draft = newSeamSide(draft);
    draft = addSeamPick(draft, pick('i2', 'bottom'), order);
    draft = newSeamSide(draft);
    draft = addSeamPick(draft, pick('i1', 'right'), order);

    const removed = removeSeamPick(draft, pick('i1', 'bottom'));
    expect(removed.sealed).toEqual([{ instance: 'i2', edges: ['bottom'], reversed: false }]);
    expect(removed.current).toEqual({ instance: 'i1', edges: ['right'], reversed: false });

    const emptied = removeSeamPick(removed, pick('i2', 'bottom'));
    expect(emptied.sealed).toEqual([]);
    expect(emptied.current).toEqual({ instance: 'i1', edges: ['right'], reversed: false });
  });
});

describe('removing from the open side', () => {
  it('keeps the side while it still has edges', () => {
    let draft = addSeamPick(emptySeamDraft(), pick('i1', 'bottom'), order);
    draft = addSeamPick(draft, pick('i1', 'right'), order);

    const removed = removeSeamPick(draft, pick('i1', 'bottom'));
    expect(removed.current).toEqual({ instance: 'i1', edges: ['right'], reversed: false });
  });
});
