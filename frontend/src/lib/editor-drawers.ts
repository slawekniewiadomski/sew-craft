export type DrawerId = 'properties' | 'outline' | 'dimensions' | 'constraints' | 'view';

export interface DrawerDefinition {
  id: DrawerId;
  label: string;
  defaultOpen: boolean;
}

export const EDITOR_DRAWERS: DrawerDefinition[] = [
  { id: 'properties', label: 'Properties', defaultOpen: true },
  { id: 'outline', label: 'Outline', defaultOpen: true },
  { id: 'dimensions', label: 'Dimensions', defaultOpen: false },
  { id: 'constraints', label: 'Constraints', defaultOpen: false },
  { id: 'view', label: 'View', defaultOpen: false },
];

/** Which drawers start open, keyed by id, derived from the drawer definitions. */
export function initialDrawerState(): Record<DrawerId, boolean> {
  const state = {} as Record<DrawerId, boolean>;
  for (const drawer of EDITOR_DRAWERS) {
    state[drawer.id] = drawer.defaultOpen;
  }
  return state;
}
