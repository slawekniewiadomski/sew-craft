import type { EntityId, PatternDocument, TabRef } from '@sewcraft/geometry';

/**
 * The six palette colours a new piece cycles through. A colour is a stored
 * choice, not a theme token, so a tab dot and an assembly fill never shift with
 * the theme.
 */
export const PIECE_COLORS = [
  '#2563eb',
  '#0e8a16',
  '#b60205',
  '#fbca04',
  '#6f42c1',
  '#00838f',
] as const;

/** A stable key for one tab reference. */
export function tabKey(tab: TabRef): string {
  return `${tab.kind}:${tab.id}`;
}

/** The tab for a piece. */
export function pieceTab(id: EntityId): TabRef {
  return { kind: 'piece', id };
}

/** The tab for an assembly. */
export function assemblyTab(id: EntityId): TabRef {
  return { kind: 'assembly', id };
}

/** Whether two refs name the same object. */
export function sameTab(a: TabRef | null | undefined, b: TabRef | null | undefined): boolean {
  return a != null && b != null && a.kind === b.kind && a.id === b.id;
}

/** Whether a ref still names an object in the document. */
export function tabExists(document: PatternDocument, tab: TabRef): boolean {
  return document.tabs.some((candidate) => sameTab(candidate, tab));
}

/**
 * The label a tab shows: the object's trimmed name, or `Piece N` / `Assembly N`
 * by its creation index when the name is empty.
 */
export function tabLabel(document: PatternDocument, tab: TabRef): string {
  if (tab.kind === 'piece') {
    const index = document.pieces.findIndex((piece) => piece.id === tab.id);
    if (index < 0) return 'Piece';
    const piece = document.pieces[index]!;
    return piece.name?.trim() || `Piece ${index + 1}`;
  }

  const index = document.assemblies.findIndex((assembly) => assembly.id === tab.id);
  if (index < 0) return 'Assembly';
  const assembly = document.assemblies[index]!;
  return assembly.name.trim() || `Assembly ${index + 1}`;
}

/** The stored colour of a piece tab, or `null` for an assembly or a bare piece. */
export function tabColor(document: PatternDocument, tab: TabRef): string | null {
  if (tab.kind !== 'piece') return null;
  return document.pieces.find((piece) => piece.id === tab.id)?.color ?? null;
}

/** The palette colour the next created piece receives. */
export function nextPieceColor(document: PatternDocument): string {
  return PIECE_COLORS[document.pieces.length % PIECE_COLORS.length]!;
}

/** The localStorage key an active tab is persisted under, per pattern. */
export function persistedTabKey(patternId: string): string {
  return `sewcraft:active-tab:${patternId}`;
}

/** Serialize a tab for storage; `null` removes the preference. */
export function encodeTab(tab: TabRef | null): string | null {
  return tab === null ? null : tabKey(tab);
}

/** Parse a stored tab, ignoring an empty or malformed value. */
export function parseTab(value: string | null | undefined): TabRef | null {
  if (value == null) return null;
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (kind !== 'piece' && kind !== 'assembly') return null;
  return { kind, id };
}

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The persisted active tab for a pattern, or `null` when none is stored. */
export function readPersistedTab(storage: TabStorage, patternId: string): TabRef | null {
  return parseTab(storage.getItem(persistedTabKey(patternId)));
}

/** Persist the active tab; `null` clears the preference. */
export function writePersistedTab(
  storage: TabStorage,
  patternId: string,
  tab: TabRef | null,
): void {
  const key = persistedTabKey(patternId);
  const value = encodeTab(tab);
  if (value === null) storage.setItem(key, '');
  else storage.setItem(key, value);
}

/**
 * Resolve the active tab after a document change: keep the current tab when it
 * still exists, otherwise take the tab at the same index (or the last one), and
 * finally `null` for a document with no tabs.
 */
export function reconcileTab(
  document: PatternDocument,
  current: TabRef | null,
  previousIndex?: number,
): TabRef | null {
  if (current !== null && tabExists(document, current)) return current;
  if (document.tabs.length === 0) return null;
  if (previousIndex === undefined) return document.tabs[0]!;
  const index = Math.min(Math.max(previousIndex, 0), document.tabs.length - 1);
  return document.tabs[index]!;
}

/** The index of a tab in the document order, or `-1`. */
export function tabIndex(document: PatternDocument, tab: TabRef | null): number {
  if (tab === null) return -1;
  return document.tabs.findIndex((candidate) => sameTab(candidate, tab));
}

/** The new order after moving one tab to another index, clamped. */
export function moveTab(document: PatternDocument, from: number, to: number): TabRef[] {
  const tabs = document.tabs.map((tab) => ({ ...tab }));
  if (from < 0 || from >= tabs.length) return tabs;
  const target = Math.min(Math.max(to, 0), tabs.length - 1);
  if (target === from) return tabs;
  const [moved] = tabs.splice(from, 1);
  tabs.splice(target, 0, moved!);
  return tabs;
}
