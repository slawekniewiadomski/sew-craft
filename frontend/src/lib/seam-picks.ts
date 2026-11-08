/** The ephemeral draft a sewing gesture builds before one `add_seam_match`. */
import type { EntityId, SeamRun } from '@sewcraft/geometry';

/** One picked edge on one placed instance. */
export interface SeamPick {
  instance: EntityId;
  edge: EntityId;
}

/** One side of the draft: a run of loop edges and its direction. */
export interface SeamDraftSide {
  instance: EntityId;
  edges: EntityId[];
  reversed: boolean;
}

export interface SeamDraft {
  /** Sides the maker finished by starting another or pressing New side. */
  sealed: SeamDraftSide[];
  /** The side the next adjacent pick extends; `null` after New side. */
  current: SeamDraftSide | null;
}

/** The loop order each placed instance resolves against. */
export type SeamEdgeOrder = ReadonlyMap<EntityId, readonly EntityId[]>;

export function emptySeamDraft(): SeamDraft {
  return { sealed: [], current: null };
}

/** Every side in layer order, including the open one. */
export function seamDraftSides(draft: SeamDraft): SeamDraftSide[] {
  return draft.current === null ? draft.sealed : [...draft.sealed, draft.current];
}

/** The run for one draft side, omitting an explicit `false` direction. */
export function seamDraftRun(side: SeamDraftSide): SeamRun {
  return {
    instance: side.instance,
    edges: [...side.edges],
    ...(side.reversed ? { reversed: true } : {}),
  };
}

/** Every side as a command-ready run, in layer order. */
export function seamDraftRuns(draft: SeamDraft): SeamRun[] {
  return seamDraftSides(draft).map(seamDraftRun);
}

/** Whether the run can take the edge at either end without a gap. */
function canExtend(side: SeamDraftSide, pick: SeamPick, order: SeamEdgeOrder): boolean {
  if (side.instance !== pick.instance) return false;
  const edges = order.get(side.instance);
  if (edges === undefined) return false;

  const next = edges.indexOf(pick.edge);
  const first = edges.indexOf(side.edges[0]!);
  const last = edges.indexOf(side.edges[side.edges.length - 1]!);
  if (next < 0 || first < 0 || last < 0) return false;

  return next === (last + 1) % edges.length || next === (first - 1 + edges.length) % edges.length;
}

/** Extend one end of a run in loop order. */
function extend(side: SeamDraftSide, pick: SeamPick, order: SeamEdgeOrder): SeamDraftSide {
  const edges = order.get(side.instance)!;
  const next = edges.indexOf(pick.edge);
  const last = edges.indexOf(side.edges[side.edges.length - 1]!);
  return {
    ...side,
    edges:
      next === (last + 1) % edges.length ? [...side.edges, pick.edge] : [pick.edge, ...side.edges],
  };
}

/** Remove a pick from whichever side holds it, dropping a side that empties. */
export function removeSeamPick(draft: SeamDraft, pick: SeamPick): SeamDraft {
  const strip = (side: SeamDraftSide): SeamDraftSide => ({
    ...side,
    edges: side.edges.filter((edge) => edge !== pick.edge),
  });

  if (
    draft.current !== null &&
    draft.current.instance === pick.instance &&
    draft.current.edges.includes(pick.edge)
  ) {
    const current = strip(draft.current);
    return {
      sealed: draft.sealed,
      current: current.edges.length === 0 ? null : current,
    };
  }

  return {
    sealed: draft.sealed
      .map((side) => (side.instance === pick.instance ? strip(side) : side))
      .filter((side) => side.edges.length > 0),
    current: draft.current,
  };
}

/**
 * Apply one click. A picked edge toggles off; an edge adjacent to the open side
 * extends it; every other edge starts the next side, which is how a different
 * instance or a dart's second edge becomes a separate layer.
 */
export function addSeamPick(draft: SeamDraft, pick: SeamPick, order: SeamEdgeOrder): SeamDraft {
  const picked = seamDraftSides(draft).find(
    (side) => side.instance === pick.instance && side.edges.includes(pick.edge),
  );
  if (picked !== undefined) return removeSeamPick(draft, pick);

  if (draft.current !== null && canExtend(draft.current, pick, order)) {
    return { sealed: draft.sealed, current: extend(draft.current, pick, order) };
  }

  const sealed =
    draft.current !== null && draft.current.edges.length > 0
      ? [...draft.sealed, draft.current]
      : draft.sealed;

  return {
    sealed,
    current: { instance: pick.instance, edges: [pick.edge], reversed: false },
  };
}

/** Seal the open side, so the next click starts a new one even on the same instance. */
export function newSeamSide(draft: SeamDraft): SeamDraft {
  if (draft.current === null || draft.current.edges.length === 0) return draft;
  return { sealed: [...draft.sealed, draft.current], current: null };
}

/** Toggle the direction of the last side, open or sealed. */
export function flipLastSide(draft: SeamDraft): SeamDraft {
  if (draft.current !== null) {
    return { ...draft, current: { ...draft.current, reversed: !draft.current.reversed } };
  }
  if (draft.sealed.length === 0) return draft;

  const sealed = [...draft.sealed];
  const last = sealed[sealed.length - 1]!;
  sealed[sealed.length - 1] = { ...last, reversed: !last.reversed };
  return { sealed, current: null };
}
