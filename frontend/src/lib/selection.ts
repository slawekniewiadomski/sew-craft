import type { EntityId, PatternDocument } from '@sewcraft/geometry';

/** How a click or marquee combines with the current selection. */
export type SelectionMode = 'replace' | 'add' | 'subtract';

/**
 * Read the modifier set once at pointerdown: Ctrl/Cmd adds, Ctrl/Cmd with Alt or
 * Shift subtracts, and everything else replaces.
 */
export function selectionModeFrom(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): SelectionMode {
  if (!event.ctrlKey && !event.metaKey) return 'replace';
  return event.altKey || event.shiftKey ? 'subtract' : 'add';
}

/** A marquee dragged right is crossing; dragged left it is window. */
export function rectMode(startX: number, currentX: number): 'crossing' | 'window' {
  return currentX >= startX ? 'crossing' : 'window';
}

/** Ordered set arithmetic with no duplicates: replace, append, or remove. */
export function applySelection(
  current: EntityId[],
  hits: EntityId[],
  mode: SelectionMode,
): EntityId[] {
  if (mode === 'replace') return [...new Set(hits)];
  if (mode === 'add') {
    const present = new Set(current);
    return [...current, ...hits.filter((id) => !present.has(id))];
  }
  const removed = new Set(hits);
  return current.filter((id) => !removed.has(id));
}

/** Ctrl/Cmd+click: append when absent, remove when present. */
export function toggleSelection(current: EntityId[], id: EntityId): EntityId[] {
  return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
}

/**
 * Edges that deleting `ids` would leave dangling: a line or curve whose point
 * is selected while the edge itself is not. Construction edges count, because
 * `delete_entity` does not remove them either.
 */
export function orphanedEdges(document: PatternDocument, ids: EntityId[]): EntityId[] {
  const selected = new Set(ids);
  const orphans: EntityId[] = [];

  for (const entity of document.entities) {
    if (entity.kind === 'point' || selected.has(entity.id)) continue;
    const points =
      entity.kind === 'line'
        ? [entity.start, entity.end]
        : [entity.p0, entity.p1, entity.p2, entity.p3];
    if (points.some((point) => selected.has(point))) orphans.push(entity.id);
  }

  return orphans;
}
