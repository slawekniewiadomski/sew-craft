import {
  derivedDimensionGeometry,
  derivedDimensionState,
  derivedDimensionValue,
  dimensionGeometry,
  dimensionState,
  dimensionValue,
  type DerivedDistanceConstraint,
  type DimensionLayout,
  type DimensionState,
  type DistanceConstraint,
  type EntityId,
  type PatternDocument,
  type Vec2,
} from '@sewcraft/geometry';

import {
  dimensionAccessibleName,
  dimensionLabelWidth,
  dimensionSegments,
  formatDimensionLabel,
  formatDimensionValue,
  type DimensionSegment,
} from './dimensions';

/**
 * The dimension drawing models the canvas renders. Like the geometry view
 * models, these are pure derivations: the caller passes the document, the
 * selection and the drag it is previewing, and gets back what to draw.
 */

/** A fully resolved dimension, ready to render in world and screen space. */
export interface DimensionDrawing {
  id: EntityId;
  constraint: DistanceConstraint;
  layout: DimensionLayout;
  segments: DimensionSegment[];
  /** Label text: `120`, `(120)` or `[120]`, by state. */
  value: string;
  /** The effective number without decoration, for accessible names. */
  measured: string;
  state: Exclude<DimensionState, 'derived'>;
  /** The linked source, when the dimension records one. */
  sourceId?: EntityId;
  /** The label's full accessible name, including the state and source. */
  accessibleName: string;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  editable: boolean;
  dragging: boolean;
}

/** A dimension value positioned and oriented in screen space. */
export interface DimensionLabelView {
  id: EntityId;
  constraint: DistanceConstraint;
  value: string;
  measured: string;
  state: Exclude<DimensionState, 'derived'>;
  sourceId?: EntityId;
  accessibleName: string;
  width: number;
  x: number;
  y: number;
  angle: number;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  editable: boolean;
}

/** A read-only cut dimension, resolved from a piece's cut loop. */
export interface DerivedDimensionDrawing {
  id: EntityId;
  constraint: DerivedDistanceConstraint;
  layout: DimensionLayout;
  segments: DimensionSegment[];
  value: string;
  state: Extract<DimensionState, 'derived' | 'broken'>;
  accessibleName: string;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
}

/** A cut dimension label positioned and oriented in screen space. */
export interface DerivedDimensionLabelView {
  id: EntityId;
  value: string;
  state: Extract<DimensionState, 'derived' | 'broken'>;
  accessibleName: string;
  width: number;
  x: number;
  y: number;
  angle: number;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
}

/** The offset one dimension is being dragged to, in millimetres. */
export interface DimensionDrag {
  id: EntityId;
  offset: number;
}

/** Everything a dimension drawing reads besides the constraint itself. */
export interface DimensionDrawingOptions {
  document: PatternDocument;
  /** The committed dimension selection, for the selected flag. */
  selectedIds: ReadonlySet<EntityId>;
  /** The drag previewing a new offset, if one is in flight. */
  drag: DimensionDrag | null;
  /** Whether a committed label may be dragged at all. */
  dragEnabled: boolean;
  /** True while a tool owns the canvas, which makes labels read-only. */
  constraintActive: boolean;
}

/** Where a world point sits in canvas pixels. */
export type ToScreen = (point: Vec2) => Vec2;

/** One distance dimension, with the drag's offset applied while it is in flight. */
export function dimensionDrawing(
  constraint: DistanceConstraint,
  preview: boolean,
  options: DimensionDrawingOptions,
): DimensionDrawing | null {
  const drag = options.drag;
  const placed =
    drag !== null && drag.id === constraint.id
      ? { ...constraint, offset: drag.offset }
      : constraint;
  const layout = dimensionGeometry(options.document, placed);
  if (layout === null) return null;

  // `layout` resolves the same points, so the effective value is always present.
  const value = dimensionValue(options.document, placed)!;
  const state = dimensionState(options.document, placed) as Exclude<DimensionState, 'derived'>;

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, state),
    measured: formatDimensionValue(value),
    state,
    ...(constraint.reference === undefined ? {} : { sourceId: constraint.reference }),
    accessibleName: dimensionAccessibleName(value, state, constraint.reference),
    preview,
    selected: !preview && options.selectedIds.has(constraint.id),
    draggable: !preview && options.dragEnabled,
    editable: !preview && !options.constraintActive,
    dragging: drag !== null && drag.id === constraint.id,
  };
}

/** Position every dimension label in canvas pixels. */
export function dimensionLabelViews(
  drawings: readonly DimensionDrawing[],
  toScreen: ToScreen,
): DimensionLabelView[] {
  return drawings.map((drawing) => {
    const screen = toScreen(drawing.layout.label.position);
    return {
      id: drawing.id,
      constraint: drawing.constraint,
      value: drawing.value,
      measured: drawing.measured,
      state: drawing.state,
      ...(drawing.sourceId === undefined ? {} : { sourceId: drawing.sourceId }),
      accessibleName: drawing.accessibleName,
      width: dimensionLabelWidth(drawing.value),
      x: screen.x,
      y: screen.y,
      angle: drawing.layout.label.angleDegrees,
      preview: drawing.preview,
      selected: drawing.selected,
      draggable: drawing.draggable,
      editable: drawing.editable,
    };
  });
}

/** One derived cut dimension, with its drag applied only when it is committed. */
export function derivedDimensionDrawing(
  constraint: DerivedDistanceConstraint,
  preview: boolean,
  options: DimensionDrawingOptions,
): DerivedDimensionDrawing | null {
  const drag = options.drag;
  const placed =
    !preview && drag !== null && drag.id === constraint.id
      ? { ...constraint, offset: drag.offset }
      : constraint;
  const layout = derivedDimensionGeometry(options.document, placed);
  if (layout === null) return null;

  // A resolved layout always has a resolved span, so the measurement exists.
  const value = derivedDimensionValue(options.document, constraint)!;
  const state = derivedDimensionState(options.document, constraint);

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, state),
    state,
    accessibleName: dimensionAccessibleName(value, state),
    preview,
    selected: !preview && options.selectedIds.has(constraint.id),
    draggable: !preview && options.dragEnabled,
    dragging: !preview && drag !== null && drag.id === constraint.id,
  };
}

/** Position every cut dimension label in canvas pixels. */
export function derivedDimensionLabelViews(
  drawings: readonly DerivedDimensionDrawing[],
  toScreen: ToScreen,
): DerivedDimensionLabelView[] {
  return drawings.map((drawing) => {
    const screen = toScreen(drawing.layout.label.position);
    return {
      id: drawing.id,
      value: drawing.value,
      state: drawing.state,
      accessibleName: drawing.accessibleName,
      width: dimensionLabelWidth(drawing.value),
      x: screen.x,
      y: screen.y,
      angle: drawing.layout.label.angleDegrees,
      preview: drawing.preview,
      selected: drawing.selected,
      draggable: drawing.draggable,
    };
  });
}
