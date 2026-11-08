import type {
  DerivedDistanceConstraint,
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  PatternDocument,
  Vec2,
} from '@sewcraft/geometry';
import { measureDistanceDimension } from '@sewcraft/geometry';
import { computed } from 'vue';

import type { CutDimensionPlacement, DimensionPlacement } from '@/lib/dimensions';
import {
  derivedDimensionDrawing,
  derivedDimensionLabelViews,
  dimensionDrawing,
  dimensionLabelViews,
  type DerivedDimensionDrawing,
  type DerivedDimensionLabelView,
  type DimensionDrawing,
  type DimensionDrawingOptions,
  type DimensionLabelView,
} from '@/lib/pattern-canvas-dimensions';
import { worldToScreen, type Viewport } from '@/lib/viewport';

export interface DimensionDrag {
  id: EntityId;
  a: EntityId;
  b: EntityId;
  orientation: DimensionOrientation;
  startOffset: number;
  offset: number;
}

export interface DerivedDimensionDrag {
  id: EntityId;
  orientation: DimensionOrientation;
  startOffset: number;
  offset: number;
  span: { a: Vec2; b: Vec2 };
}

export interface DimensionSceneOptions {
  document: () => PatternDocument;
  showDimensions: () => boolean;
  constraintActive: () => boolean;
  selectedDimensionIds: () => ReadonlySet<EntityId>;
  dimensionDrag: () => DimensionDrag | null;
  dimensionDragEnabled: () => boolean;
  derivedDrag: () => DerivedDimensionDrag | null;
  dimensionPlacement: () => DimensionPlacement | null;
  cutDimensionPlacement: () => CutDimensionPlacement | null;
  viewport: () => Viewport;
  editingDimension: () => { id: EntityId; value: string } | null;
}

/**
 * The dimension scene: distance and derived constraints, their drawing options,
 * the placement previews, the drawings and the label views the template binds.
 *
 * The inline editor's state and focus stay with the canvas; this only reads the
 * current editing id to place the editor's field.
 */
export function useDimensionScene({
  document,
  showDimensions,
  constraintActive,
  selectedDimensionIds,
  dimensionDrag,
  dimensionDragEnabled,
  derivedDrag,
  dimensionPlacement,
  cutDimensionPlacement,
  viewport,
  editingDimension,
}: DimensionSceneOptions) {
  const distanceConstraints = computed(() =>
    document().constraints.filter(
      (constraint): constraint is DistanceConstraint => constraint.type === 'distance',
    ),
  );

  /** The document, selection and drag every dimension drawing reads. */
  const dimensionDrawingOptions = computed<DimensionDrawingOptions>(() => ({
    document: document(),
    selectedIds: selectedDimensionIds(),
    drag: dimensionDrag(),
    dragEnabled: dimensionDragEnabled(),
    constraintActive: constraintActive(),
  }));

  function drawingFor(constraint: DistanceConstraint, preview: boolean): DimensionDrawing | null {
    return dimensionDrawing(constraint, preview, dimensionDrawingOptions.value);
  }

  /** The dimension currently being placed, or `null` when no placement is active. */
  const dimensionPreviewConstraint = computed<DistanceConstraint | null>(() => {
    const placement = dimensionPlacement();
    if (placement === null) return null;

    const measured = measureDistanceDimension(document(), {
      id: 'dimension-preview',
      type: 'distance',
      a: placement.a,
      b: placement.b,
      orientation: placement.orientation,
    });
    if (measured === null || measured <= 0) return null;

    // A dimension being placed is a driven preview: it measures without a value.
    return {
      id: 'dimension-preview',
      type: 'distance',
      a: placement.a,
      b: placement.b,
      orientation: placement.orientation,
      offset: placement.offset,
    };
  });

  /**
   * Every dimension stroke, plus the in-progress placement. Dimensions are a
   * render-only view of distance constraints: hiding them never changes the
   * document, and the preview only appears while the dimension tool is placing.
   */
  const dimensionDrawings = computed<DimensionDrawing[]>(() => {
    const committed = showDimensions()
      ? distanceConstraints.value.flatMap((constraint) => {
          const drawing = drawingFor(constraint, false);
          return drawing === null ? [] : [drawing];
        })
      : [];

    const previewConstraint = dimensionPreviewConstraint.value;
    const preview = previewConstraint === null ? null : drawingFor(previewConstraint, true);
    return preview === null ? committed : [...committed, preview];
  });

  const dimensionLabels = computed<DimensionLabelView[]>(() =>
    dimensionLabelViews(dimensionDrawings.value, (point) => worldToScreen(viewport(), point)),
  );

  /** Cut dimensions are read-only derived measurements of a piece's cut loop. */
  const derivedConstraints = computed(() =>
    document().constraints.filter(
      (constraint): constraint is DerivedDistanceConstraint =>
        constraint.type === 'derived_distance',
    ),
  );

  /** The cut dimension currently being placed, or `null` when none is active. */
  const cutDimensionPreviewConstraint = computed<DerivedDistanceConstraint | null>(() => {
    const placement = cutDimensionPlacement();
    if (placement === null) return null;
    return {
      id: 'cut-dimension-preview',
      type: 'derived_distance',
      piece: placement.piece,
      a: placement.a,
      b: placement.b,
      orientation: placement.orientation,
      offset: placement.offset,
    };
  });

  function derivedDrawingFor(
    constraint: DerivedDistanceConstraint,
    preview: boolean,
  ): DerivedDimensionDrawing | null {
    return derivedDimensionDrawing(constraint, preview, {
      ...dimensionDrawingOptions.value,
      drag: derivedDrag(),
    });
  }

  const derivedDimensionDrawings = computed<DerivedDimensionDrawing[]>(() => {
    if (!showDimensions()) return [];

    const committed = derivedConstraints.value.flatMap((constraint): DerivedDimensionDrawing[] => {
      const drawing = derivedDrawingFor(constraint, false);
      return drawing === null ? [] : [drawing];
    });

    const preview = cutDimensionPreviewConstraint.value;
    if (preview === null) return committed;

    const previewDrawing = derivedDrawingFor(preview, true);
    return previewDrawing === null ? committed : [...committed, previewDrawing];
  });

  const derivedDimensionLabels = computed<DerivedDimensionLabelView[]>(() =>
    derivedDimensionLabelViews(derivedDimensionDrawings.value, (point) =>
      worldToScreen(viewport(), point),
    ),
  );

  /** The cut dimension behind a label, which only renders when it resolves. */
  function derivedConstraint(id: EntityId): DerivedDistanceConstraint {
    return derivedConstraints.value.find((constraint) => constraint.id === id)!;
  }

  /** Where the inline editor sits, in canvas pixels. */
  const dimensionEditor = computed(() => {
    const editing = editingDimension();
    if (editing === null) return null;

    const label = dimensionLabels.value.find((entry) => entry.id === editing.id)!;
    return {
      id: editing.id,
      value: editing.value,
      x: label.x,
      y: label.y,
    };
  });

  function labelClass(label: DimensionLabelView): string {
    switch (label.state) {
      case 'referenced':
        return 'fill-dimension-reference';
      case 'broken':
        return 'fill-destructive';
      case 'driven':
        return 'fill-muted-foreground';
      case 'formula':
        return 'fill-dimension-formula';
      case 'set':
        return 'fill-foreground';
    }
  }

  return {
    distanceConstraints,
    dimensionDrawings,
    dimensionLabels,
    derivedConstraints,
    derivedDimensionDrawings,
    derivedDimensionLabels,
    dimensionEditor,
    derivedConstraint,
    labelClass,
  };
}
