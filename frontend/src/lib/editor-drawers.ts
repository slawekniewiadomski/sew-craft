import type { RibbonIconName } from './ribbon-icons';

export type DrawerId =
  | 'properties'
  | 'pieces'
  | 'pattern'
  | 'assembly'
  | 'outline'
  | 'dimensions'
  | 'constraints'
  | 'view';

export interface DrawerDefinition {
  id: DrawerId;
  label: string;
  defaultOpen: boolean;
  /** Rail glyph; typed against the registry so a typo is a compile error. */
  icon: RibbonIconName;
}

export const EDITOR_DRAWERS: DrawerDefinition[] = [
  { id: 'properties', label: 'Properties', defaultOpen: true, icon: 'select' },
  { id: 'pieces', label: 'Piece', defaultOpen: true, icon: 'piece' },
  { id: 'pattern', label: 'Pattern', defaultOpen: false, icon: 'eye' },
  { id: 'assembly', label: 'Assembly', defaultOpen: true, icon: 'piece' },
  { id: 'outline', label: 'Outline', defaultOpen: true, icon: 'line' },
  { id: 'dimensions', label: 'Dimensions', defaultOpen: false, icon: 'dimension' },
  { id: 'constraints', label: 'Constraints', defaultOpen: false, icon: 'constraints' },
  { id: 'view', label: 'View', defaultOpen: false, icon: 'eye' },
];

/**
 * The drawers a tab kind shows. A piece tab keeps the sketch surfaces; an
 * assembly tab replaces them with its own inspector and keeps View.
 */
export function drawersFor(mode: 'piece' | 'assembly'): DrawerDefinition[] {
  const ids: DrawerId[] =
    mode === 'assembly'
      ? ['assembly', 'view']
      : ['properties', 'pieces', 'pattern', 'outline', 'dimensions', 'constraints', 'view'];
  return EDITOR_DRAWERS.filter((drawer) => ids.includes(drawer.id));
}

/** Which drawers start open, keyed by id, derived from the drawer definitions. */
export function initialDrawerState(): Record<DrawerId, boolean> {
  const state = {} as Record<DrawerId, boolean>;
  for (const drawer of EDITOR_DRAWERS) {
    state[drawer.id] = drawer.defaultOpen;
  }
  return state;
}
