import type { ConstraintType } from '@sewcraft/geometry';

import { CONSTRAINT_ICONS, type ConstraintIcon } from './constraint-view';

/** A stroke path and optional filled dots, authored in a 24 × 24 box. */
export type RibbonIcon = ConstraintIcon;

/** Every glyph the editor ribbon can render: tools, actions and constraints. */
export type RibbonIconName =
  | 'select'
  | 'point'
  | 'line'
  | 'curve'
  | 'arc'
  | 'circle'
  | 'text'
  | 'text-leader'
  | 'rectangle'
  | 'rectangle-center'
  | 'rectangle-aligned'
  | 'chevron-down'
  | 'dimension'
  | 'cut-dimension'
  | 'piece'
  | 'piece-add'
  | 'constraints'
  | 'eye'
  | 'round-corner'
  | 'split'
  | 'notch'
  | 'centre-line'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'fit'
  | 'download'
  | 'mirror'
  | 'rotate'
  | ConstraintType;

type ActionIconName = Exclude<RibbonIconName, ConstraintType>;

/** Tool and action glyphs; constraint glyphs are reused from the canvas set. */
const ACTION_ICONS: Record<ActionIconName, RibbonIcon> = {
  select: { paths: ['M6 3 L6 21 L10.8 16 L14.2 22 L16.8 20.6 L13.4 14.8 L19.2 14.4 Z'] },
  point: { paths: [], dots: [{ cx: 12, cy: 12, r: 3.8 }] },
  line: { paths: ['M5 19 L19 5'] },
  curve: { paths: ['M3.6 18.8 C8 6 16 18 20.4 5.2'] },
  arc: { paths: ['M4.4 19.2 A14.6 14.6 0 0 1 19.6 4.8'] },
  circle: { paths: ['M3 12 A9 9 0 0 1 21 12 A9 9 0 0 1 3 12'] },
  text: { paths: ['M5 5 H19', 'M12 5 V19', 'M8 19 H16'] },
  'text-leader': {
    paths: [
      'M3.6 5 H14',
      'M8.8 5 V19',
      'M6 19 H11.6',
      'M15.2 15 H21.2',
      'M18.8 12.6 L21.6 15 L18.8 17.4',
    ],
  },
  rectangle: { paths: ['M4 7 H20 V17 H4 Z'] },
  'rectangle-center': {
    paths: ['M4 7 H20 V17 H4 Z'],
    dots: [{ cx: 12, cy: 12, r: 2.4 }],
  },
  'rectangle-aligned': { paths: ['M3.6 14.8 L13.2 4.4 L20.4 10.8 L10.8 21.2 Z'] },
  dimension: {
    paths: [
      'M5 4 V20',
      'M19 4 V20',
      'M5 12 H19',
      'M9 8.4 L5 12 L9 15.6',
      'M15 8.4 L19 12 L15 15.6',
    ],
  },
  'cut-dimension': {
    paths: ['M5 4 V20', 'M19 4 V20', 'M5 12 H12', 'M15 12 H19', 'M9.6 18.8 L18.4 5.2'],
  },
  notch: { paths: ['M6 19 H9.2 L12 11.6 L14.8 19 H18'] },
  'centre-line': { paths: ['M12 3.2 V20.8'], dots: [{ cx: 12, cy: 12, r: 2.2 }] },
  'chevron-down': { paths: ['M6 9.2 L12 15.2 L18 9.2'] },
  piece: {
    paths: [
      'M4.8 6.8 L12 3.2 L19.2 6.8 V17.2 L12 20.8 L4.8 17.2 Z',
      'M4.8 6.8 L12 10.4 L19.2 6.8',
      'M12 10.4 V20.8',
    ],
  },
  'piece-add': {
    paths: [
      'M4.8 6.8 L12 3.2 L19.2 6.8 V17.2 L12 20.8 L4.8 17.2 Z',
      'M4.8 6.8 L12 10.4 L19.2 6.8',
      'M12 10.4 V20.8',
      'M19.8 18 V21.6',
      'M18 19.8 H21.6',
    ],
  },
  constraints: {
    paths: ['M6.4 10.8 H17.6 V20.4 H6.4 Z', 'M9.2 10.8 V7.6 A2.8 2.8 0 0 1 14.8 7.6 V10.8'],
  },
  eye: {
    paths: ['M3.2 12 C6 7.2 18 7.2 20.8 12 C18 16.8 6 16.8 3.2 12 Z'],
    dots: [{ cx: 12, cy: 12, r: 2.6 }],
  },
  'round-corner': { paths: ['M4 20 V10 A6 6 0 0 1 10 4 H20'] },
  split: {
    paths: ['M4 12 H20', 'M12 7.2 V9', 'M12 15 V16.8'],
    dots: [{ cx: 12, cy: 12, r: 2.2 }],
  },
  undo: {
    paths: ['M8.8 7.2 L3.6 12 L8.8 16.8', 'M3.6 12 H14.6 A5 5 0 0 1 14.6 22 H12'],
  },
  redo: {
    paths: ['M15.2 7.2 L20.4 12 L15.2 16.8', 'M20.4 12 H9.4 A5 5 0 0 0 9.4 22 H12'],
  },
  delete: { paths: ['M5 7 H19', 'M9 7 V20 H15 V7', 'M10 7 V4.4 H14 V7'] },
  fit: { paths: ['M6 3 H3 V6', 'M18 3 H21 V6', 'M3 18 V21 H6', 'M21 18 V21 H18'] },
  download: { paths: ['M12 3.2 V15.2', 'M7.2 10.4 L12 15.2 L16.8 10.4', 'M4 20.8 H20'] },
  mirror: {
    paths: ['M12 3.2 V20.8', 'M8.8 6.4 L3.2 12 L8.8 17.6 Z', 'M15.2 6.4 L20.8 12 L15.2 17.6 Z'],
  },
  rotate: {
    paths: ['M19.2 12 A7.2 7.2 0 1 1 12 4.8', 'M12 2 L16 4.8 L12 7.8'],
  },
};

/** One registry for every ribbon glyph, so a missing icon is a type error. */
export const RIBBON_ICONS: Record<RibbonIconName, RibbonIcon> = {
  ...ACTION_ICONS,
  ...CONSTRAINT_ICONS,
};

/** Resolve an icon descriptor by name. */
export function ribbonIcon(name: RibbonIconName): RibbonIcon {
  return RIBBON_ICONS[name];
}
