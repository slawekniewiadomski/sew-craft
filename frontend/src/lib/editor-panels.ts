import type { RibbonIconName } from './ribbon-icons';

/** The editor's sidebar sections. The id is also the slot name in EditorView. */
export type PanelId =
  | 'properties'
  | 'pieces'
  | 'pattern'
  | 'assembly'
  | 'outline'
  | 'dimensions'
  | 'constraints'
  | 'variables';

/** The tab kinds that carry a sidebar, matching the bottom editor tabs. */
export type PanelMode = 'piece' | 'assembly';

export interface PanelDefinition {
  id: PanelId;
  label: string;
  /** Rail glyph; typed against the registry so a typo is a compile error. */
  icon: RibbonIconName;
}

/** Every section, in rail order. */
export const EDITOR_PANELS: PanelDefinition[] = [
  { id: 'properties', label: 'Properties', icon: 'select' },
  { id: 'pieces', label: 'Piece', icon: 'piece' },
  { id: 'pattern', label: 'Pattern', icon: 'eye' },
  { id: 'assembly', label: 'Assembly', icon: 'piece' },
  { id: 'outline', label: 'Outline', icon: 'line' },
  { id: 'dimensions', label: 'Dimensions', icon: 'dimension' },
  { id: 'constraints', label: 'Constraints', icon: 'constraints' },
  { id: 'variables', label: 'Variables', icon: 'constraints' },
];

const PANEL_IDS: Record<PanelMode, PanelId[]> = {
  piece: ['properties', 'pieces', 'pattern', 'outline', 'dimensions', 'constraints', 'variables'],
  assembly: ['assembly'],
};

/**
 * The sections a tab kind offers. A piece tab keeps the sketch surfaces; an
 * assembly tab replaces them with its own inspector.
 */
export function panelsFor(mode: PanelMode): PanelDefinition[] {
  const ids = PANEL_IDS[mode];
  return EDITOR_PANELS.filter((panel) => ids.includes(panel.id));
}

/** The section a fresh project opens: the entity inspector or the assembly card. */
export function defaultPanelFor(mode: PanelMode): PanelId {
  return mode === 'assembly' ? 'assembly' : 'properties';
}

/** Whether a stored value names a section this mode still offers. */
export function parsePanel(value: string | null | undefined, mode: PanelMode): PanelId {
  const panel = panelsFor(mode).find((candidate) => candidate.id === value);
  return panel?.id ?? defaultPanelFor(mode);
}

/** The localStorage key the active section is stored under, per project and mode. */
export function persistedPanelKey(patternId: string, mode: PanelMode): string {
  return `sewcraft:sidebar:panel:${mode}:${patternId}`;
}

/** The persisted section for a project, or the mode's default when none applies. */
export function readPersistedPanel(
  storage: Pick<Storage, 'getItem'>,
  patternId: string,
  mode: PanelMode,
): PanelId {
  try {
    return parsePanel(storage.getItem(persistedPanelKey(patternId, mode)), mode);
  } catch {
    return defaultPanelFor(mode);
  }
}

/** Persist the active section; storage being unavailable is not worth failing over. */
export function writePersistedPanel(
  storage: Pick<Storage, 'setItem'>,
  patternId: string,
  mode: PanelMode,
  panel: PanelId,
): void {
  try {
    storage.setItem(persistedPanelKey(patternId, mode), panel);
  } catch {
    // Private mode can refuse the write; the in-memory choice still applies.
  }
}
