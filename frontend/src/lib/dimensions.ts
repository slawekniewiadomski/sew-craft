import type { DimensionLayout, DimensionOrientation, EntityId } from '@sewcraft/geometry';

/** What the canvas emits when a dimension line is placed. */
export interface DimensionPlacement {
  a: EntityId;
  b: EntityId;
  orientation: DimensionOrientation;
  offset: number;
}

/** A partial change to a dimension constraint, driven from the canvas or sidebar. */
export interface DimensionPatch {
  value?: number;
  orientation?: DimensionOrientation;
  offset?: number;
}

export interface DimensionOrientationOption {
  value: DimensionOrientation;
  label: string;
}

/** Every measurement axis, in the editor's presentation order. */
export const DIMENSION_ORIENTATION_OPTIONS: DimensionOrientationOption[] = [
  { value: 'aligned', label: 'Aligned' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

/** Millimetre text for a dimension, rounded to 1 µm while staying a number input. */
export function formatDimensionValue(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

/** Parse an editable dimension value; `null` for empty or non-numeric text. */
export function parseDimensionValue(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Mirror of the command's rule: a distance dimension must be finite and > 0. */
export function isValidDimensionValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

/** Approximate width of the screen-space value label, in pixels. */
export function dimensionLabelWidth(value: string): number {
  return value.length * 6 + 8;
}

/** One straight stroke of a dimension drawing, in world coordinates. */
export interface DimensionSegment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** True only for the dimension line itself, which gets the stronger stroke. */
  main: boolean;
}

/**
 * Flatten a layout into strokes: the extension lines, the dimension line and
 * the two arms of each end chevron.
 */
export function dimensionSegments(layout: DimensionLayout): DimensionSegment[] {
  const segments: DimensionSegment[] = layout.extensions.map((extension, index) => ({
    key: `extension-${index}`,
    x1: extension.start.x,
    y1: extension.start.y,
    x2: extension.end.x,
    y2: extension.end.y,
    main: false,
  }));

  segments.push({
    key: 'line',
    x1: layout.dimensionStart.x,
    y1: layout.dimensionStart.y,
    x2: layout.dimensionEnd.x,
    y2: layout.dimensionEnd.y,
    main: true,
  });

  layout.chevrons.forEach((chevron, index) => {
    segments.push({
      key: `chevron-${index}-a`,
      x1: chevron.tip.x,
      y1: chevron.tip.y,
      x2: chevron.armA.x,
      y2: chevron.armA.y,
      main: false,
    });
    segments.push({
      key: `chevron-${index}-b`,
      x1: chevron.tip.x,
      y1: chevron.tip.y,
      x2: chevron.armB.x,
      y2: chevron.armB.y,
      main: false,
    });
  });

  return segments;
}
