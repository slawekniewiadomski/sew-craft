import type { ConstraintType } from '@sewcraft/geometry';

import { CONSTRAINT_ICONS, type ConstraintIcon } from './constraint-view';

/** A stroke path and optional filled dots, authored in a 12 × 12 box. */
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
  | 'constraints'
  | 'eye'
  | 'round-corner'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'fit'
  | 'download'
  | ConstraintType;

type ActionIconName = Exclude<RibbonIconName, ConstraintType>;

/** Tool and action glyphs; constraint glyphs are reused from the canvas set. */
const ACTION_ICONS: Record<ActionIconName, RibbonIcon> = {
  select: { paths: ['M3 1.5 L3 10.5 L5.4 8 L7.1 11 L8.4 10.3 L6.7 7.4 L9.6 7.2 Z'] },
  point: { paths: [], dots: [{ cx: 6, cy: 6, r: 1.9 }] },
  line: { paths: ['M2.5 9.5 L9.5 2.5'] },
  curve: { paths: ['M1.8 9.4 C4 3, 8 9, 10.2 2.6'] },
  arc: { paths: ['M2.2 9.6 A 7.3 7.3 0 0 1 9.8 2.4'] },
  circle: { paths: ['M1.5 6 A4.5 4.5 0 0 1 10.5 6 A4.5 4.5 0 0 1 1.5 6'] },
  text: { paths: ['M2.5 2.5 H9.5', 'M6 2.5 V9.5', 'M4 9.5 H8'] },
  'text-leader': {
    paths: [
      'M1.8 2.5 H7',
      'M4.4 2.5 V9.5',
      'M3 9.5 H5.8',
      'M7.6 7.5 H10.6',
      'M9.4 6.3 L10.8 7.5 L9.4 8.7',
    ],
  },
  rectangle: { paths: ['M2 3.5 H10 V8.5 H2 Z'] },
  'rectangle-center': {
    paths: ['M2 3.5 H10 V8.5 H2 Z'],
    dots: [{ cx: 6, cy: 6, r: 1.2 }],
  },
  'rectangle-aligned': { paths: ['M1.8 7.4 L6.6 2.2 L10.2 5.4 L5.4 10.6 Z'] },
  dimension: {
    paths: [
      'M2.5 2 V10',
      'M9.5 2 V10',
      'M2.5 6 H9.5',
      'M4.5 4.2 L2.5 6 L4.5 7.8',
      'M7.5 4.2 L9.5 6 L7.5 7.8',
    ],
  },
  'cut-dimension': {
    paths: ['M2.5 2 V10', 'M9.5 2 V10', 'M2.5 6 H6', 'M7.5 6 H9.5', 'M4.8 9.4 L9.2 2.6'],
  },
  'chevron-down': { paths: ['M3 4.6 L6 7.6 L9 4.6'] },
  piece: {
    paths: [
      'M2.4 3.4 L6 1.6 L9.6 3.4 V8.6 L6 10.4 L2.4 8.6 Z',
      'M2.4 3.4 L6 5.2 L9.6 3.4',
      'M6 5.2 V10.4',
    ],
  },
  constraints: {
    paths: ['M3.2 5.4 H8.8 V10.2 H3.2 Z', 'M4.6 5.4 V3.8 A1.4 1.4 0 0 1 7.4 3.8 V5.4'],
  },
  eye: {
    paths: ['M1.6 6 C3 3.6 9 3.6 10.4 6 C9 8.4 3 8.4 1.6 6 Z'],
    dots: [{ cx: 6, cy: 6, r: 1.3 }],
  },
  'round-corner': { paths: ['M2 10 V5 A3 3 0 0 1 5 2 H10'] },
  undo: { paths: ['M4.4 3.6 L1.8 6 L4.4 8.4', 'M1.8 6 H7.3 A2.5 2.5 0 0 1 7.3 11 H6'] },
  redo: { paths: ['M7.6 3.6 L10.2 6 L7.6 8.4', 'M10.2 6 H4.7 A2.5 2.5 0 0 0 4.7 11 H6'] },
  delete: { paths: ['M2.5 3.5 H9.5', 'M4.5 3.5 V10 H7.5 V3.5', 'M5 3.5 V2.2 H7 V3.5'] },
  fit: { paths: ['M3 1.5 H1.5 V3', 'M9 1.5 H10.5 V3', 'M1.5 9 V10.5 H3', 'M10.5 9 V10.5 H9'] },
  download: { paths: ['M6 1.6 V7.6', 'M3.6 5.2 L6 7.6 L8.4 5.2', 'M2 10.4 H10'] },
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
