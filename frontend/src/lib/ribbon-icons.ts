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
  | 'dimension'
  | 'allowance'
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
  dimension: {
    paths: [
      'M2.5 2 V10',
      'M9.5 2 V10',
      'M2.5 6 H9.5',
      'M4.5 4.2 L2.5 6 L4.5 7.8',
      'M7.5 4.2 L9.5 6 L7.5 7.8',
    ],
  },
  allowance: {
    paths: ['M1.8 3.2 H10.2', 'M1.8 8.8 H10.2', 'M1.8 3.2 V8.8', 'M10.2 3.2 V8.8'],
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
