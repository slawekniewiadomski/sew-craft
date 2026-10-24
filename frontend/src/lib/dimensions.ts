import {
  dimensionValue,
  isLineAnchor,
  referenceCandidates,
  type CutAnchor,
  type DimensionLayout,
  type DimensionOrientation,
  type DimensionState,
  type DistanceConstraint,
  type EntityId,
  type PatternDocument,
} from '@sewcraft/geometry';

/** What the canvas emits when a dimension line is placed. */
export interface DimensionPlacement {
  a: EntityId;
  b: EntityId;
  orientation: DimensionOrientation;
  offset: number;
}

/** What the canvas emits when a cut dimension is placed on a piece. */
export interface CutDimensionPlacement {
  piece: EntityId;
  a: CutAnchor;
  b: CutAnchor;
  orientation: DimensionOrientation;
  offset: number;
}

/** A partial change to a dimension constraint, driven from the canvas or sidebar. */
export interface DimensionPatch {
  /** A number sets the value; `null` clears it back to driven. */
  value?: number | null;
  /** A source dimension id links this one; `null` unlinks it. */
  reference?: EntityId | null;
  orientation?: DimensionOrientation;
  offset?: number;
}

/** One row of the `#` reference picker: a dimension this one may link to. */
export interface DimensionReferenceOption {
  id: EntityId;
  value: number;
  entities: [EntityId, EntityId];
  /** Human labels for the two anchors; a line anchor reads `<id> (line)`. */
  labels: [string, string];
  orientation: DimensionOrientation;
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

/**
 * One edit of a dimension value, shared by the canvas and sidebar: empty text
 * means driven, a leading `#` starts a reference, a finite positive number means
 * set, `unlink` is the explicit Remove reference action, anything else is a typo.
 */
export type DimensionEdit =
  | { kind: 'set'; value: number }
  | { kind: 'driven' }
  | { kind: 'reference'; text: string }
  | { kind: 'unlink' }
  | { kind: 'invalid' };

/** Parse a dimension edit into the command intent it represents. */
export function parseDimensionEdit(input: string): DimensionEdit {
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'driven' };
  if (trimmed.startsWith('#')) return { kind: 'reference', text: trimmed.slice(1).trim() };
  const value = parseDimensionValue(trimmed);
  return isValidDimensionValue(value) ? { kind: 'set', value } : { kind: 'invalid' };
}

/** True when the picker should be open for this editable text. */
export function isReferenceEditText(input: string): boolean {
  return input.trim().startsWith('#');
}

/** The text typed after `#`, ready to filter the picker. */
export function referenceSearchText(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('#') ? trimmed.slice(1).trim() : '';
}

/** A dimension anchor label: a line id is marked so it cannot read as a point. */
export function anchorLabel(document: PatternDocument, id: EntityId): string {
  return isLineAnchor(document, id) ? `${id} (line)` : id;
}

/** The dimensions a dimension may link to, resolved for the picker. */
export function referenceOptions(
  document: PatternDocument,
  constraint: DistanceConstraint,
): DimensionReferenceOption[] {
  return referenceCandidates(document, constraint).map((candidate) => ({
    id: candidate.id,
    // A candidate is eligible only when it resolves, so this is always a number.
    value: dimensionValue(document, candidate)!,
    entities: [candidate.a, candidate.b] as [EntityId, EntityId],
    labels: [anchorLabel(document, candidate.a), anchorLabel(document, candidate.b)] as [
      string,
      string,
    ],
    orientation: candidate.orientation ?? 'aligned',
  }));
}

/** Filter picker rows by the id or the formatted value typed after `#`. */
export function filterReferenceOptions(
  options: DimensionReferenceOption[],
  text: string,
): DimensionReferenceOption[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return options;
  return options.filter(
    (option) =>
      option.id.toLowerCase().includes(needle) ||
      formatDimensionValue(option.value).includes(needle),
  );
}

/** The label of one picker row: `A · 120 mm · p1 → p2 · Horizontal`. */
export function referenceOptionLabel(option: DimensionReferenceOption): string {
  const orientation = DIMENSION_ORIENTATION_OPTIONS.find(
    (entry) => entry.value === option.orientation,
  )!.label;
  return `${option.id} · ${formatDimensionValue(option.value)} mm · ${option.labels[0]} → ${option.labels[1]} · ${orientation}`;
}

/** The value field's text: a link shows `#source`, everything else its number. */
export function formatDimensionField(
  constraint: DistanceConstraint,
  value: number | null,
  state: DimensionState,
): string {
  if (state === 'referenced' && constraint.reference !== undefined)
    return `#${constraint.reference}`;
  return value === null ? '' : formatDimensionValue(value);
}

/** The canvas label text: shape, not color, distinguishes each state. */
export function formatDimensionLabel(value: number, state: DimensionState): string {
  const formatted = formatDimensionValue(value);
  switch (state) {
    case 'driven':
      return `(${formatted})`;
    case 'referenced':
    case 'broken':
      return `[${formatted}]`;
    case 'derived':
      return `${formatted} cut`;
    case 'set':
      return formatted;
  }
}

/** Human name of a dimension state, used by badges and selectors. */
export function dimensionStateLabel(state: DimensionState): string {
  switch (state) {
    case 'set':
      return 'Set';
    case 'driven':
      return 'Driven';
    case 'referenced':
      return 'Referenced';
    case 'broken':
      return 'Broken';
    case 'derived':
      return 'Cut';
  }
}

/** The pill tone for a dimension state: broken is danger, linked/cut accent, rest neutral. */
export function dimensionTone(state: DimensionState): 'neutral' | 'accent' | 'danger' {
  if (state === 'broken') return 'danger';
  if (state === 'referenced' || state === 'derived') return 'accent';
  return 'neutral';
}

/** The accessible name of a label: the state is never conveyed by color alone. */
export function dimensionAccessibleName(
  value: number,
  state: DimensionState,
  sourceId?: EntityId,
): string {
  const formatted = formatDimensionValue(value);
  switch (state) {
    case 'set':
      return `Dimension ${formatted} millimetres`;
    case 'driven':
      return `Driven dimension, measured ${formatted} millimetres`;
    case 'referenced':
      return `Referenced dimension, ${formatted} millimetres, from dimension ${sourceId}`;
    case 'broken':
      return `Broken reference, last known ${formatted} millimetres; source dimension ${sourceId} is missing`;
    case 'derived':
      return `Cut dimension, ${formatted} millimetres`;
  }
}

/**
 * Map a parsed edit to the command patch. `null` means the text cannot be
 * applied yet: an invalid number, or a `#text` that names no eligible row.
 */
export function dimensionPatchForEdit(
  edit: Exclude<DimensionEdit, { kind: 'invalid' }>,
  options: DimensionReferenceOption[],
): DimensionPatch | null {
  switch (edit.kind) {
    case 'set':
      return { value: edit.value };
    case 'driven':
      return { value: null };
    case 'unlink':
      return { reference: null };
    case 'reference': {
      const match = options.find((option) => option.id === edit.text);
      return match === undefined ? null : { reference: match.id };
    }
  }
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
