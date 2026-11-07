import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { describe, expect, it } from 'vitest';

import {
  derivedDimensionDrawing,
  dimensionDrawing,
  dimensionLabelViews,
  type DimensionDrawingOptions,
} from '@/lib/pattern-canvas-dimensions';

const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'p1', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'p2', kind: 'point', x: 120, y: 0, construction: false, fixed: false },
  ],
  constraints: [
    { id: 'A', type: 'distance', a: 'p1', b: 'p2', value: 120, orientation: 'horizontal' },
  ],
};

const options = (overrides: Partial<DimensionDrawingOptions> = {}): DimensionDrawingOptions => ({
  document,
  selectedIds: new Set(),
  drag: null,
  dragEnabled: true,
  constraintActive: false,
  ...overrides,
});

const constraint = document.constraints[0]!;
const distance = constraint.type === 'distance' ? constraint : null!;

describe('dimensionDrawing', () => {
  it('resolves the layout, label text and flags', () => {
    const drawing = dimensionDrawing(distance, false, options({ selectedIds: new Set(['A']) }))!;

    expect(drawing.value).toBe('120');
    expect(drawing.measured).toBe('120');
    expect(drawing.selected).toBe(true);
    expect(drawing.draggable).toBe(true);
    expect(drawing.editable).toBe(true);
    expect(drawing.dragging).toBe(false);
  });

  it('applies the drag offset and marks the label as dragging', () => {
    const drawing = dimensionDrawing(distance, false, options({ drag: { id: 'A', offset: 40 } }))!;

    expect(drawing.dragging).toBe(true);
    expect(drawing.layout.label.position.y).not.toBe(20);
  });

  it('makes a preview read-only and unselected', () => {
    const drawing = dimensionDrawing(distance, true, options({ selectedIds: new Set(['A']) }))!;

    expect(drawing.preview).toBe(true);
    expect(drawing.selected).toBe(false);
    expect(drawing.draggable).toBe(false);
    expect(drawing.editable).toBe(false);
  });

  it('is null when the dimension cannot resolve', () => {
    const broken: PatternDocument = {
      ...document,
      constraints: [
        { id: 'A', type: 'distance', a: 'p1', b: 'gone', value: 120, orientation: 'horizontal' },
      ],
    };

    const dangling = broken.constraints[0]!;
    expect(
      dimensionDrawing(
        dangling.type === 'distance' ? dangling : null!,
        false,
        options({ document: broken }),
      ),
    ).toBeNull();
  });
});

describe('dimensionLabelViews', () => {
  it('places each label through the screen mapping', () => {
    const drawing = dimensionDrawing(distance, false, options())!;
    const [label] = dimensionLabelViews([drawing], (point) => ({ x: point.x, y: point.y }));

    expect(label!.id).toBe('A');
    expect(label!.x).toBe(drawing.layout.label.position.x);
    expect(label!.width).toBeGreaterThan(0);
  });
});

describe('derivedDimensionDrawing', () => {
  const cut = {
    id: 'C',
    type: 'derived_distance' as const,
    piece: 'piece',
    a: { edge: 'l1', at: 'start' as const },
    b: { edge: 'l1', at: 'end' as const },
    orientation: 'aligned' as const,
  };

  it('is null when the piece has no cut loop to measure', () => {
    expect(derivedDimensionDrawing(cut, false, options())).toBeNull();
  });
});
