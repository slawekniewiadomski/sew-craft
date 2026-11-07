import type * as Geometry from '@sewcraft/geometry';
import {
  bounds,
  createEmptyDocument,
  type CircleEntity,
  type CurveEntity,
  type DerivedDistanceConstraint,
  type Entity,
  type EntityId,
  entitiesInRect,
  executeCommand,
  getEntity,
  type LineEntity,
  type PatternDocument,
  pieceBandRegions,
  pieceCutVertex,
  type BandTarget,
  type PointEntity,
  seamAllowancePaths,
  type Vec2,
} from '@sewcraft/geometry';
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type DOMWrapper,
  type VueWrapper,
} from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { nextTick } from 'vue';

vi.mock('@sewcraft/geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof Geometry>();
  return { ...actual, seamAllowancePaths: vi.fn(actual.seamAllowancePaths) };
});

import type { ConstraintPick } from '@/lib/constraint-tools';
import type { CornerRoundPicks } from '@/lib/corner-round';
import { snapPoint, snapToGrid } from '@/lib/snap';
import {
  fitToBounds,
  panBy,
  screenToWorld,
  viewportTransform,
  worldToScreen,
  type Viewport,
} from '@/lib/viewport';

import PatternCanvas from '@/components/PatternCanvas.vue';

const SIZE = { width: 800, height: 600 };
const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  width: SIZE.width,
  height: SIZE.height,
  right: SIZE.width,
  bottom: SIZE.height,
  toJSON: () => ({}),
} as DOMRect;

enableAutoUnmount(afterEach);

function pt(id: string, x: number, y: number, construction = false): PointEntity {
  return { id, kind: 'point', x, y, construction, fixed: false };
}

function ln(id: string, start: string, end: string, construction = false): LineEntity {
  return { id, kind: 'line', start, end, construction };
}

function cv(
  id: string,
  p0: string,
  p1: string,
  p2: string,
  p3: string,
  construction = false,
): CurveEntity {
  return { id, kind: 'curve', p0, p1, p2, p3, construction };
}

function doc(entities: Entity[]): PatternDocument {
  return { ...createEmptyDocument(), entities };
}

function ci(id: string, center: string, rim: string, construction = false): CircleEntity {
  return { id, kind: 'circle', center, rim, construction };
}

const baseDoc = doc([
  pt('a', 0, 0),
  pt('b', 100, 0),
  pt('c', 100, 100),
  pt('d', 0, 100, true),
  ln('ab', 'a', 'b'),
  ln('bc', 'b', 'c', true),
  ln('badend', 'a', 'missing'),
  ln('badstart', 'missing', 'a'),
  cv('curve', 'a', 'b', 'c', 'd'),
  cv('ccurve', 'a', 'b', 'c', 'd', true),
  cv('badcurve', 'a', 'b', 'c', 'missing'),
]);

/** A cut square with a 10 mm round at corner `b` between `ab` and `bc`. */
function roundedSquare(radius = 10): PatternDocument {
  const square = doc([
    pt('a', 0, 0),
    pt('b', 100, 0),
    pt('c', 100, 100),
    pt('d', 0, 100),
    ln('ab', 'a', 'b'),
    ln('bc', 'b', 'c'),
    ln('cd', 'c', 'd'),
    ln('da', 'd', 'a'),
  ]);

  return executeCommand(square, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'ab', second: 'bc', radius },
  }).document;
}

let rectSpy: MockInstance;

beforeEach(() => {
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});

function mountCanvas(
  overrides: Partial<{
    document: PatternDocument;
    tool:
      | 'select'
      | 'add_point'
      | 'add_line'
      | 'add_curve'
      | 'add_arc'
      | 'add_circle'
      | 'add_rectangle'
      | 'add_center_rectangle'
      | 'add_3point_rectangle'
      | 'add_text'
      | 'add_text_leader'
      | 'notch'
      | 'split_line'
      | 'centre_line'
      | 'dimension'
      | 'cut_dimension';
    selectedEntityIds: EntityId[];
    selectedDimensionIds: EntityId[];
    selectedAllowanceTargets: BandTarget[];
    selectedPieceId: EntityId | null;
    fitToken: number;
    showAllowances: boolean;
    showConstraints: boolean;
    showDimensions: boolean;
    constraintActive: boolean;
    constraintPicks: ConstraintPick[];
    roundCornerActive: boolean;
    measureActive: boolean;
    roundCornerPicks: CornerRoundPicks;
    cornerRoundPreviewRadius: number | null;
    readOnly: boolean;
    activePieceId: EntityId | null;
    moveMode: boolean;
    highlightedEntityIds: EntityId[];
  }> = {},
): VueWrapper {
  return mount(PatternCanvas, {
    props: {
      document: baseDoc,
      tool: 'select',
      selectedEntityIds: [],
      selectedDimensionIds: [],
      selectedAllowanceTargets: [],
      highlightedEntityIds: [],
      fitToken: 0,
      ...overrides,
    },
  });
}

function fittedViewport(doc: PatternDocument): Viewport {
  return fitToBounds(bounds(doc)!, SIZE);
}

/** The screen position of a world point in the fitted base document. */
function screenAt(world: Vec2): Vec2 {
  return worldToScreen(fittedViewport(baseDoc), world);
}

function transformOf(wrapper: VueWrapper): string {
  return wrapper.find('svg > g').attributes('transform')!;
}

function pointCircle(wrapper: VueWrapper, id: EntityId): DOMWrapper<Element> {
  return wrapper.find(`[data-kind="point"][data-entity-id="${id}"]`);
}

function down(el: Element, x: number, y: number, button = 0, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
      ...init,
    }),
  );
}

function move(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
}

function pointerMove(wrapper: VueWrapper, x: number, y: number): void {
  wrapper
    .find('svg')
    .element.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }),
    );
}

/** A pointer move whose target is a specific entity, so hover sees it. */
function hover(el: Element, x = 300, y = 200): void {
  el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
}

/** The snapped world position a bare-canvas click at these screen coords resolves to. */
function snappedAt(x: number, y: number): Vec2 {
  const candidates = baseDoc.entities
    .filter((entity): entity is PointEntity => entity.kind === 'point')
    .map((point) => ({ x: point.x, y: point.y }));
  return snapPoint(screenToWorld(fittedViewport(baseDoc), { x, y }), candidates);
}

function up(): void {
  window.dispatchEvent(new MouseEvent('pointerup'));
}

function pressSpace(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', cancelable: true }));
}

function releaseSpace(): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
}

describe('PatternCanvas', () => {
  it('renders points, valid lines and curves with a grid and ruler ticks', () => {
    const wrapper = mountCanvas();

    expect(wrapper.findAll('[data-kind="point"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-kind="curve"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ruler-x"]').attributes('width')).toBe('800');
    expect(wrapper.find('[data-testid="ruler-y"]').attributes('height')).toBe('600');
  });

  it('renders a committed circle as a stroke-only element', () => {
    const wrapper = mountCanvas({
      document: doc([pt('a', 0, 0), pt('c', 100, 0), ci('k1', 'a', 'c')]),
    });

    const circle = wrapper.find('[data-kind="circle"][data-entity-id="k1"]');
    expect(circle.exists()).toBe(true);
    expect(circle.attributes('fill')).toBe('none');
    expect(circle.attributes('cx')).toBe('0');
    expect(circle.attributes('cy')).toBe('0');
    expect(circle.attributes('r')).toBe('100');
  });

  it('highlights a selected circle and dashes a construction circle', () => {
    const wrapper = mountCanvas({
      document: doc([pt('a', 0, 0), pt('c', 100, 0), ci('k1', 'a', 'c'), ci('k2', 'a', 'c', true)]),
      selectedEntityIds: ['k1'],
    });

    const cut = wrapper.find('[data-kind="circle"][data-entity-id="k1"]');
    expect(cut.classes()).toContain('text-primary');
    expect(cut.attributes('stroke-width')).toBe('3');

    const guide = wrapper.find('[data-kind="circle"][data-entity-id="k2"]');
    expect(guide.attributes('stroke-dasharray')).toBe('4 4');
  });

  it('skips a circle with a degenerate radius or a dangling reference', () => {
    const wrapper = mountCanvas({
      document: doc([pt('a', 0, 0), ci('zero', 'a', 'a'), ci('dangling', 'a', 'gone')]),
    });

    expect(wrapper.find('[data-kind="circle"]').exists()).toBe(false);
  });

  it('renders a dashed seam-allowance offset for a seam', () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc });

    const path = wrapper.find('[data-seam-edge="ab"]');
    expect(path.exists()).toBe(true);
    expect(path.attributes('d')).toContain('M ');
    expect(path.attributes('stroke-dasharray')).toBe('6 3');
    expect(path.classes()).toContain('text-muted-foreground');
  });

  it('hides the seam-allowance layer when the toggle is off', () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc, showAllowances: false });

    expect(wrapper.findAll('[data-seam-edge]')).toHaveLength(0);
  });

  it('paints the edges a measured variable reads above the geometry', () => {
    expect(mountCanvas().find('[data-testid="measured-highlight-layer"]').exists()).toBe(false);

    const wrapper = mountCanvas({ highlightedEntityIds: ['ab', 'curve', 'ccurve'] });
    const layer = wrapper.find('[data-testid="measured-highlight-layer"]');
    expect(layer.exists()).toBe(true);
    expect(layer.classes()).toContain('pointer-events-none');
    expect(
      layer.findAll('[data-measured-source]').map((el) => el.attributes('data-measured-source')),
    ).toEqual(['ab', 'curve', 'ccurve']);
    // An id that is not an edge of this document paints nothing extra.
    expect(
      mountCanvas({ highlightedEntityIds: ['gone'] })
        .find('[data-testid="measured-highlight-layer"]')
        .findAll('[data-measured-source]'),
    ).toHaveLength(0);
  });

  it('keeps the legacy allowance read-only: no hit path and no editor', async () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc });

    const path = wrapper.find('[data-seam-edge="ab"]');
    expect(path.exists()).toBe(true);
    expect(wrapper.find('[data-testid="seam-layer"]').classes()).toContain('pointer-events-none');
    expect(wrapper.find('[data-seam-hit]').exists()).toBe(false);

    await path.trigger('dblclick', { clientX: 120, clientY: 140 });
    await flushPromises();
    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('set-seam-width')).toBeUndefined();
  });

  it('flags a self-intersecting allowance as invalid', () => {
    vi.mocked(seamAllowancePaths).mockReturnValueOnce([
      {
        edge: 'ab',
        width: 10,
        side: 'left',
        join: 'miter',
        path: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        selfIntersections: [{ first: 0, second: 1, point: { x: 5, y: 0 } }],
      },
    ]);
    const wrapper = mountCanvas({
      document: { ...baseDoc, seams: [{ id: 's1', edge: 'ab', width: 10 }] },
    });

    expect(wrapper.find('[data-seam-edge="ab"]').classes()).toContain('text-destructive');
  });

  const constrainedDoc: PatternDocument = {
    ...baseDoc,
    constraints: [
      { id: 'h', type: 'horizontal', a: 'a', b: 'b' },
      { id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 },
      { id: 'ghost', type: 'vertical', a: 'a', b: 'missing' },
    ],
  };

  const dimensionDoc: PatternDocument = {
    ...baseDoc,
    constraints: [
      { id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 },
      {
        id: 'h',
        type: 'distance',
        a: 'b',
        b: 'c',
        value: 100,
        orientation: 'vertical',
        offset: 20,
      },
      { id: 'ghost', type: 'distance', a: 'a', b: 'missing', value: 10 },
    ],
  };

  const pieceDoc: PatternDocument = {
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
    ]),
    pieces: [
      {
        id: 'p1',
        edges: ['ab', 'bc', 'cd', 'da'],
        allowances: [
          { edge: 'ab', width: 10 },
          { edge: 'bc', width: 5, kind: 'double' },
        ],
      },
    ],
  };

  const selfIntersectingPieceDoc: PatternDocument = {
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 60, 100),
      pt('e', 60, 20),
      pt('f', 40, 20),
      pt('g', 40, 100),
      pt('h', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('de', 'd', 'e'),
      ln('ef', 'e', 'f'),
      ln('fg', 'f', 'g'),
      ln('gh', 'g', 'h'),
      ln('ha', 'h', 'a'),
    ]),
    pieces: [
      {
        id: 'p1',
        edges: ['ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'ha'],
        allowances: ['ab', 'bc', 'cd', 'de', 'ef', 'fg', 'gh', 'ha'].map((edge) => ({
          edge,
          width: 15,
        })),
      },
    ],
  };

  const derivedConstraint: DerivedDistanceConstraint = {
    id: 'cut',
    type: 'derived_distance',
    piece: 'p1',
    a: { edge: 'ab', at: 'start' },
    b: { edge: 'bc', at: 'end' },
    orientation: 'horizontal',
    offset: 20,
  };

  const derivedPieceDoc: PatternDocument = {
    ...pieceDoc,
    constraints: [derivedConstraint],
  };

  it('renders an icon per resolvable constraint when the toggle is on', () => {
    const wrapper = mountCanvas({ document: constrainedDoc, showConstraints: true });

    expect(wrapper.find('[data-testid="constraints-layer"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-constraint-id]')).toHaveLength(2);
    expect(wrapper.find('[data-constraint-id="h"]').attributes('data-constraint-type')).toBe(
      'horizontal',
    );
    expect(wrapper.find('[data-constraint-id="h"]').attributes('aria-label')).toBe('Horizontal');
    expect(wrapper.find('[data-constraint-id="w"]').attributes('data-constraint-type')).toBe(
      'distance',
    );
    expect(wrapper.find('[data-constraint-id="w"]').attributes('aria-label')).toBe(
      'Distance 100 mm',
    );
    expect(wrapper.find('[data-constraint-id="h"]').findAll('path').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-constraint-id="ghost"]').exists()).toBe(false);
  });

  it('keeps icons in screen space so their size does not follow the zoom', () => {
    const wrapper = mountCanvas({ document: constrainedDoc, showConstraints: true });

    expect(wrapper.find('svg > [data-testid="constraints-layer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="constraints-layer"]').find('circle').attributes('r')).toBe(
      '9',
    );
  });

  it('staggers icons for constraints that share a midpoint', () => {
    const wrapper = mountCanvas({ document: constrainedDoc, showConstraints: true });

    const transforms = wrapper
      .findAll('[data-constraint-id]')
      .map((marker) => marker.attributes('transform'));
    expect(new Set(transforms).size).toBe(2);
  });

  it('hides constraint icons when the toggle is off or absent', () => {
    expect(
      mountCanvas({ document: constrainedDoc, showConstraints: false }).findAll(
        '[data-constraint-id]',
      ),
    ).toHaveLength(0);
    expect(mountCanvas({ document: constrainedDoc }).findAll('[data-constraint-id]')).toHaveLength(
      0,
    );
  });

  it('fits the pattern on mount and again when fitToken changes', async () => {
    const wrapper = mountCanvas();
    const expected = viewportTransform(fittedViewport(baseDoc));

    await nextTick();
    expect(transformOf(wrapper)).toBe(expected);

    wrapper.setProps({ fitToken: 1 });
    await nextTick();
    expect(transformOf(wrapper)).toBe(expected);
  });

  it('leaves the viewport untouched when there is nothing to fit', async () => {
    const empty = doc([]);
    const wrapper = mountCanvas({ document: empty });

    expect(transformOf(wrapper)).toBe(viewportTransform({ x: -40, y: -40, scale: 1 }));

    wrapper.setProps({ fitToken: 1 });
    await nextTick();

    expect(transformOf(wrapper)).toBe(viewportTransform({ x: -40, y: -40, scale: 1 }));
  });

  it('styles points by selection, construction and cut state', () => {
    const wrapper = mountCanvas({ selectedEntityIds: ['a'] });

    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-primary');
    expect(pointCircle(wrapper, 'd').classes()).toContain('fill-muted-foreground');
    expect(pointCircle(wrapper, 'b').classes()).toContain('fill-foreground');
    expect(wrapper.find('[data-testid="selection-handle"]').exists()).toBe(true);
    expect(wrapper.find('[data-entity-id="bc"]').attributes('stroke-dasharray')).toBe('4 4');
    expect(wrapper.find('[data-entity-id="ab"]').attributes('stroke-dasharray')).toBeUndefined();
  });

  it('applies the selected stroke width to lines and curves', () => {
    const lineWrapper = mountCanvas({ selectedEntityIds: ['ab'] });
    expect(lineWrapper.find('[data-entity-id="ab"]').attributes('stroke-width')).toBe('3');
    expect(lineWrapper.find('[data-kind="curve"]').attributes('stroke-width')).toBe('2');

    const curveWrapper = mountCanvas({ selectedEntityIds: ['curve'] });
    expect(curveWrapper.find('[data-kind="curve"]').attributes('stroke-width')).toBe('3');
  });

  it('selects and drags a point, emitting a move-point on release', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const a = pointCircle(wrapper, 'a').element;

    down(a, 600, 400);
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['a']]]);
    await nextTick();
    expect(pointCircle(wrapper, 'a').attributes('cx')).toBe('0');
    expect(pointCircle(wrapper, 'a').attributes('cy')).toBe('0');

    move(700, 500);
    await nextTick();
    const target = snapToGrid(screenToWorld(vp, { x: 700, y: 500 }));
    expect(pointCircle(wrapper, 'a').attributes('cx')).toBe(String(target.x));
    expect(pointCircle(wrapper, 'a').attributes('cy')).toBe(String(target.y));

    up();
    expect(wrapper.emitted('move-point')).toEqual([['a', target.x, target.y]]);
  });

  it('does not move a point on a plain click without movement', () => {
    const wrapper = mountCanvas();

    down(pointCircle(wrapper, 'a').element, 600, 400);
    up();

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['a']]]);
    expect(wrapper.emitted('move-point')).toBeUndefined();
  });

  it('emits a move-point when only one axis changes', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);

    down(pointCircle(wrapper, 'a').element, 600, 400);
    move(140, 200);
    await nextTick();

    const target = snapToGrid(screenToWorld(vp, { x: 140, y: 200 }));
    expect(target.x).toBe(0);
    up();

    expect(wrapper.emitted('move-point')).toEqual([['a', 0, target.y]]);
  });

  it('selects a line and clears the selection on empty space', () => {
    const wrapper = mountCanvas();

    down(wrapper.find('[data-kind="line"]').element, 500, 300);
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['ab']]]);
    up();

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['ab']]]);
    up();
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['ab']], [[]]]);
  });

  it('emits constraint picks for points, lines and curves without selecting', () => {
    const wrapper = mountCanvas({ constraintActive: true });

    down(pointCircle(wrapper, 'a').element, 500, 300);
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 500, 300);
    down(wrapper.find('[data-kind="curve"]').element, 500, 300);

    expect(wrapper.emitted('constraint-pick')).toEqual([
      [{ id: 'a', kind: 'point' }],
      [{ id: 'ab', kind: 'line' }],
      [{ id: 'curve', kind: 'curve' }],
    ]);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
  });

  it('ignores an empty canvas click while a constraint is active', () => {
    const wrapper = mountCanvas({ constraintActive: true });

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);

    expect(wrapper.emitted('constraint-pick')).toBeUndefined();
  });

  it('highlights picked points and lines and uses a crosshair cursor', async () => {
    const wrapper = mountCanvas({
      constraintActive: true,
      constraintPicks: [
        { id: 'a', kind: 'point' },
        { id: 'ab', kind: 'line' },
      ],
    });

    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-primary');
    expect(pointCircle(wrapper, 'b').classes()).toContain('fill-foreground');
    expect(wrapper.find('[data-kind="line"][data-entity-id="ab"]').classes()).toContain(
      'text-primary',
    );
    expect(wrapper.find('[data-kind="line"][data-entity-id="ab"]').attributes('stroke-width')).toBe(
      '3',
    );
    expect(wrapper.classes()).toContain('cursor-crosshair');

    wrapper.setProps({ constraintActive: false });
    await nextTick();

    expect(wrapper.classes()).toContain('cursor-default');
  });

  it('pans the viewport when dragging the background with the middle button', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const before = transformOf(wrapper);

    down(wrapper.find('[data-testid="grid"]').element, 500, 300, 1);
    move(520, 330);
    await nextTick();

    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    expect(transformOf(wrapper)).not.toBe(before);
    up();
  });

  it('selects entities that overlap a marquee and highlights candidates live', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const start = worldToScreen(vp, { x: -5, y: -5 });
    const end = worldToScreen(vp, { x: 105, y: 5 });

    down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
    move(end.x, end.y);
    await nextTick();

    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);
    expect(pointCircle(wrapper, 'a').classes()).toContain('opacity-60');

    up();

    const hits = entitiesInRect(baseDoc, { minX: -5, minY: -5, maxX: 105, maxY: 5 }, 'crossing');
    expect(hits).toContain('a');
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[hits]]);
  });

  it('adds with Ctrl-click and subtracts with Ctrl+Shift-click', () => {
    const add = mountCanvas({ selectedEntityIds: ['a'] });
    down(add.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200, 0, {
      ctrlKey: true,
    });
    expect(add.emitted('update:selectedEntityIds')).toEqual([[['a', 'ab']]]);

    const subtract = mountCanvas({ selectedEntityIds: ['a', 'ab'] });
    down(pointCircle(subtract, 'a').element, 300, 200, 0, {
      ctrlKey: true,
      shiftKey: true,
    });
    expect(subtract.emitted('update:selectedEntityIds')).toEqual([[['ab']]]);
  });

  it('selects only fully contained entities when dragging right to left', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const start = worldToScreen(vp, { x: 5, y: 5 });
    const end = worldToScreen(vp, { x: -5, y: -5 });

    down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
    move(end.x, end.y);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);

    up();

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['a']]]);
  });

  it('adds and subtracts marquee hits with Ctrl and Ctrl+Shift', () => {
    const vp = fittedViewport(baseDoc);
    const start = worldToScreen(vp, { x: -5, y: -5 });
    const end = worldToScreen(vp, { x: 5, y: 5 });
    const marquee = (wrapper: VueWrapper, init: MouseEventInit): void => {
      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y, 0, init);
      move(end.x, end.y);
      up();
    };

    const add = mountCanvas({ selectedEntityIds: ['b'] });
    marquee(add, { ctrlKey: true });
    const added = add.emitted('update:selectedEntityIds')![0]![0] as EntityId[];
    expect(added).toEqual(expect.arrayContaining(['b', 'a']));

    const subtract = mountCanvas({ selectedEntityIds: ['a', 'b'] });
    marquee(subtract, { ctrlKey: true, shiftKey: true });
    const removed = subtract.emitted('update:selectedEntityIds')![0]![0] as EntityId[];
    expect(removed).toContain('b');
    expect(removed).not.toContain('a');
  });

  it('keeps a touch tap on empty space as a pan without a marquee', () => {
    const wrapper = mountCanvas({ selectedEntityIds: ['a'] });
    const grid = wrapper.find('[data-testid="grid"]').element;
    const tap = (init: MouseEventInit): void => {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 500,
        clientY: 300,
        button: 0,
        ...init,
      });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      grid.dispatchEvent(event);
    };

    tap({});
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[[]]]);
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(false);
    up();

    tap({ ctrlKey: true });
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[[]]]);
    up();
  });

  it('cancels a marquee on Escape and leaves the selection untouched', async () => {
    const wrapper = mountCanvas({ selectedEntityIds: ['a'] });
    const vp = fittedViewport(baseDoc);

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    move(worldToScreen(vp, { x: 40, y: 40 }).x, worldToScreen(vp, { x: 40, y: 40 }).y);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(false);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
  });

  it('cancels an in-flight marquee when the window loses focus', async () => {
    const wrapper = mountCanvas();

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    move(560, 340);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);

    window.dispatchEvent(new Event('blur'));
    await nextTick();

    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(false);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
  });

  it('ignores a non-primary button press', () => {
    const wrapper = mountCanvas({ selectedEntityIds: ['a'] });
    const before = transformOf(wrapper);

    down(wrapper.find('[data-testid="grid"]').element, 500, 300, 2);

    expect(transformOf(wrapper)).toBe(before);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(false);
  });

  it('ignores the wheel while a marquee is in flight', async () => {
    const wrapper = mountCanvas();

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    move(560, 340);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-marquee"]').exists()).toBe(true);
    const before = transformOf(wrapper);

    wrapper
      .find('svg')
      .element.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }),
      );
    await nextTick();

    expect(transformOf(wrapper)).toBe(before);
    up();
  });

  it('adds a snapped point with the add_point tool', () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const vp = fittedViewport(baseDoc);
    const candidates = baseDoc.entities
      .filter((entity): entity is PointEntity => entity.kind === 'point')
      .map((point) => ({ x: point.x, y: point.y }));
    const expected = snapPoint(screenToWorld(vp, { x: 600, y: 400 }), candidates);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);

    expect(wrapper.emitted('add-point')).toEqual([[expected.x, expected.y]]);
  });

  it('highlights the hovered line and previews the projected point', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = screenAt({ x: 50, y: 20 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="point-on-line-hint"]').text()).toBe(
      'Click to create a point constrained to this line.',
    );
    const ghost = wrapper.find('[data-testid="point-on-line-ghost"]');
    expect(ghost.attributes('cx')).toBe('50');
    expect(ghost.attributes('cy')).toBe('0');

    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    expect(line.classes()).toContain('text-primary');
    expect(line.attributes('stroke-width')).toBe('3');
  });

  it('emits add-point-on-line with the raw pointer for a line click', () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = screenAt({ x: 50, y: 20 });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);

    const [emitted] = wrapper.emitted('add-point-on-line')!;
    expect(emitted![0]).toBe('ab');
    expect(emitted![1]).toBeCloseTo(50, 6);
    expect(emitted![2]).toBeCloseTo(20, 6);
    expect(wrapper.emitted('add-point')).toBeUndefined();
  });

  it('keeps a point snap ahead of the line inference', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = screenAt({ x: 3, y: 2 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="point-on-line-ghost"]').exists()).toBe(false);

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);

    expect(wrapper.emitted('add-point-on-line')).toBeUndefined();
    expect(wrapper.emitted('add-point')).toEqual([[0, 0]]);
  });

  it('falls back to a free point on a degenerate line', () => {
    const degenerate = doc([pt('a', 0, 0), pt('z', 0, 0), ln('zero', 'a', 'z')]);
    const wrapper = mountCanvas({ tool: 'add_point', document: degenerate });
    const at = worldToScreen(fittedViewport(degenerate), { x: 0, y: 0 });

    down(wrapper.find('[data-kind="line"][data-entity-id="zero"]').element, at.x, at.y);

    expect(wrapper.emitted('add-point-on-line')).toBeUndefined();
    expect(wrapper.emitted('add-point')).toHaveLength(1);
  });

  it('clears the line inference on pointer leave, tool change and Escape', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const line = () => wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    const at = screenAt({ x: 50, y: 20 });

    hover(line().element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(true);

    // Moving off every entity drops the signal.
    const empty = screenAt({ x: 50, y: 60 });
    pointerMove(wrapper, empty.x, empty.y);
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);

    hover(line().element, at.x, at.y);
    await nextTick();
    wrapper.find('svg').element.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);

    hover(line().element, at.x, at.y);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);

    hover(line().element, at.x, at.y);
    await nextTick();
    await wrapper.setProps({ tool: 'select' });
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);
  });

  it('recomputes the line inference when the document changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = screenAt({ x: 50, y: 20 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(true);

    // The line survives an unrelated document change: the signal stays.
    const withExtra = doc([...baseDoc.entities, pt('extra', 300, 300)]);
    await wrapper.setProps({ document: withExtra });
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(true);

    const withoutLine = doc(baseDoc.entities.filter((entity) => entity.id !== 'ab'));
    await wrapper.setProps({ document: withoutLine });

    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="point-on-line-ghost"]').exists()).toBe(false);
  });

  it('shows no line inference on a read-only document', async () => {
    const wrapper = mountCanvas({ tool: 'add_point', readOnly: true });
    const at = screenAt({ x: 50, y: 20 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    expect(wrapper.emitted('add-point-on-line')).toBeUndefined();
  });

  it('picks measurable edges while a measurement is being edited', () => {
    const wrapper = mountCanvas({ measureActive: true });
    const at = screenAt({ x: 50, y: 20 });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    expect(wrapper.emitted('measure-pick')?.[0]).toEqual(['ab']);

    down(wrapper.find('[data-kind="point"][data-entity-id="a"]').element, at.x, at.y);
    expect(wrapper.emitted('measure-pick')).toHaveLength(1);
  });

  it('keeps the measurement pick ahead of an armed tool', () => {
    const wrapper = mountCanvas({ measureActive: true, tool: 'add_line' });
    const at = screenAt({ x: 50, y: 20 });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);

    expect(wrapper.emitted('measure-pick')?.[0]).toEqual(['ab']);
    expect(wrapper.emitted('add-line')).toBeUndefined();
  });

  it('shows the split hint while the Split tool is armed', () => {
    const wrapper = mountCanvas({ tool: 'split_line' });

    expect(wrapper.find('[data-testid="split-line-hint"]').text()).toBe(
      'Click a straight line to split it.',
    );
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);
  });

  it('highlights the hovered line and previews the split point', async () => {
    const wrapper = mountCanvas({ tool: 'split_line' });
    const at = screenAt({ x: 50, y: 20 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="split-line-hint"]').text()).toBe(
      'Click to split this line here.',
    );
    const ghost = wrapper.find('[data-testid="split-line-ghost"] circle');
    expect(ghost.attributes('cx')).toBe('50');
    expect(ghost.attributes('cy')).toBe('0');
    expect(ghost.attributes('r')).toBe('4');

    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    expect(line.classes()).toContain('text-primary');
    expect(line.attributes('stroke-width')).toBe('3');
  });

  it('reuses an authored point within the snap tolerance', async () => {
    const withPoint = doc([...baseDoc.entities, pt('mid', 40, 0)]);
    const wrapper = mountCanvas({ tool: 'split_line', document: withPoint });
    const at = screenAt({ x: 42, y: 2 });

    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="split-line-hint"]').text()).toBe(
      'Click to split this line at this point.',
    );
    const ghost = wrapper.find('[data-testid="split-line-ghost"] circle');
    expect(ghost.attributes('cx')).toBe('40');
    expect(ghost.attributes('cy')).toBe('0');
    expect(ghost.attributes('r')).toBe('5');
  });

  it('emits split-line with the raw pointer for a line click', () => {
    const wrapper = mountCanvas({ tool: 'split_line' });
    const at = screenAt({ x: 50, y: 20 });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, at.x, at.y);

    const [emitted] = wrapper.emitted('split-line')!;
    expect(emitted![0]).toBe('ab');
    expect(emitted![1]).toBeCloseTo(50, 6);
    expect(emitted![2]).toBeCloseTo(20, 6);
  });

  it('ignores endpoints, curves and non-lines', async () => {
    const wrapper = mountCanvas({ tool: 'split_line' });

    const start = screenAt({ x: 0, y: 0 });
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, start.x, start.y);
    const curve = screenAt({ x: 20, y: 20 });
    down(wrapper.find('[data-kind="curve"][data-entity-id="curve"]').element, curve.x, curve.y);
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);

    expect(wrapper.emitted('split-line')).toBeUndefined();
  });

  it('clears the split preview on pointer leave and Escape', async () => {
    const wrapper = mountCanvas({ tool: 'split_line' });
    const line = () => wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    const at = screenAt({ x: 50, y: 0 });

    hover(line().element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(true);

    const empty = screenAt({ x: 50, y: 60 });
    pointerMove(wrapper, empty.x, empty.y);
    await nextTick();
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);

    hover(line().element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);

    hover(line().element, at.x, at.y);
    await nextTick();
    await wrapper.setProps({ tool: 'select' });
    expect(wrapper.find('[data-testid="split-line-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);
  });

  it('does not preview or emit on a read-only document', async () => {
    const wrapper = mountCanvas({ tool: 'split_line', readOnly: true });
    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    const at = screenAt({ x: 50, y: 0 });

    hover(line.element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="split-line-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);
    down(line.element, at.x, at.y);
    expect(wrapper.emitted('split-line')).toBeUndefined();
  });

  it('ignores curves and lines owned by another piece', async () => {
    const wrapper = mountCanvas({ tool: 'split_line' });
    const curve = screenAt({ x: 20, y: 20 });
    hover(wrapper.find('[data-kind="curve"][data-entity-id="curve"]').element, curve.x, curve.y);
    await nextTick();
    expect(wrapper.find('[data-testid="split-line-ghost"]').exists()).toBe(false);

    const crossPiece = doc([
      { ...pt('a', 0, 0), piece: 'p1' },
      { ...pt('b', 100, 0), piece: 'p1' },
      { ...ln('ab', 'a', 'b'), piece: 'p1' },
      { ...pt('x', 0, 100), piece: 'p2' },
      { ...pt('y', 100, 100), piece: 'p2' },
      { ...ln('xy', 'x', 'y'), piece: 'p2' },
    ]);
    crossPiece.pieces = [
      { id: 'p1', edges: ['ab'], allowances: [] },
      { id: 'p2', edges: ['xy'], allowances: [] },
    ];
    const other = mountCanvas({ tool: 'split_line', document: crossPiece, activePieceId: 'p1' });
    const at = screenAt({ x: 50, y: 100 });
    hover(other.find('[data-kind="line"][data-entity-id="xy"]').element, at.x, at.y);
    await nextTick();
    expect(other.find('[data-testid="split-line-ghost"]').exists()).toBe(false);
  });

  it('commits a line between two existing points as endpoints', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-line')).toBeUndefined();
    await nextTick();
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-accent');

    down(pointCircle(wrapper, 'b').element, 400, 300);
    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'point', id: 'b' },
      ],
    ]);
  });

  it('creates both endpoints when a line starts and ends on empty canvas', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const start = snappedAt(600, 400);
    const end = snappedAt(300, 500);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(true);

    down(wrapper.find('[data-testid="grid"]').element, 300, 500);
    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'new', x: start.x, y: start.y },
        { kind: 'new', x: end.x, y: end.y },
      ],
    ]);
    await nextTick();
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(false);
  });

  it('creates only the end point when the line starts on an existing point', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const end = snappedAt(600, 400);

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(wrapper.find('[data-testid="grid"]').element, 600, 400);

    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'new', x: end.x, y: end.y },
      ],
    ]);
  });

  it('creates only the start point when the line ends on an existing point', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const start = snappedAt(600, 400);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    down(pointCircle(wrapper, 'c').element, 400, 300);

    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'new', x: start.x, y: start.y },
        { kind: 'point', id: 'c' },
      ],
    ]);
  });

  it('reuses an existing point when the snapped click lands on it', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const nearC = worldToScreen(fittedViewport(baseDoc), { x: 103, y: 98 });

    down(wrapper.find('[data-testid="grid"]').element, nearC.x, nearC.y);
    down(pointCircle(wrapper, 'a').element, 400, 300);

    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'point', id: 'c' },
        { kind: 'point', id: 'a' },
      ],
    ]);
  });

  it('ignores a second click on the same point or coordinate', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-line')).toBeUndefined();

    down(pointCircle(wrapper, 'b').element, 400, 300);
    expect(wrapper.emitted('add-line')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'point', id: 'b' },
      ],
    ]);

    const grid = wrapper.find('[data-testid="grid"]').element;
    down(grid, 600, 400);
    down(grid, 600, 400);
    expect(wrapper.emitted('add-line')).toHaveLength(1);
  });

  it('previews the pending start and a dashed line to the snapped pointer', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const start = snappedAt(600, 400);
    const target = snappedAt(700, 500);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="line-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('x1')).toBe(String(start.x));
    expect(preview.attributes('y1')).toBe(String(start.y));
    expect(preview.attributes('x2')).toBe(String(target.x));
    expect(preview.attributes('y2')).toBe(String(target.y));
    expect(preview.attributes('stroke-dasharray')).toBe('4 4');
  });

  it('previews from an existing point without a provisional point', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(false);

    pointerMove(wrapper, 700, 500);
    await nextTick();

    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="line-preview"]').attributes('x1')).toBe('0');
    expect(wrapper.find('[data-testid="line-preview"]').attributes('y1')).toBe('0');
  });

  it('treats a click on a line as bare canvas and creates a free endpoint', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 600, 400);
    down(pointCircle(wrapper, 'b').element, 400, 300);

    const emitted = wrapper.emitted('add-line')![0]!;
    expect(emitted[0]).toMatchObject({ kind: 'new' });
    expect(emitted[1]).toEqual({ kind: 'point', id: 'b' });
  });

  it('clears the pending line when the tool changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(true);

    wrapper.setProps({ tool: 'select' });
    await nextTick();

    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(false);
  });

  it('clears a pending point start when that point disappears', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-accent');

    wrapper.setProps({ document: doc([pt('b', 100, 0), pt('c', 100, 100)]) });
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(false);
  });

  it('draws an arc through three reused points as one gesture', () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'c').element, 400, 300);

    expect(wrapper.emitted('add-arc')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'point', id: 'b' },
        { kind: 'point', id: 'c' },
      ],
    ]);
  });

  it('marks provisional arc endpoints and previews the chord then the arc', async () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    const first = screenAt({ x: 10, y: 40 });
    down(wrapper.find('[data-testid="grid"]').element, first.x, first.y);
    await nextTick();
    expect(wrapper.find('[data-testid="arc-pending-start"]').exists()).toBe(true);

    pointerMove(wrapper, 700, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="arc-chord"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="arc-preview"]').exists()).toBe(false);

    const second = screenAt({ x: 90, y: 40 });
    down(wrapper.find('[data-testid="grid"]').element, second.x, second.y);
    await nextTick();
    expect(wrapper.find('[data-testid="arc-pending-end"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="arc-chord"]').exists()).toBe(false);

    const through = screenAt({ x: 50, y: 90 });
    pointerMove(wrapper, through.x, through.y);
    await nextTick();

    const preview = wrapper.find('[data-testid="arc-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('fill')).toBe('none');
    expect(preview.attributes('d')).toMatch(/^M .* A /);
  });

  it('ignores a collinear third click with a hint that clears off the chord', async () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    await nextTick();

    const onChord = screenAt({ x: 50, y: 0 });
    pointerMove(wrapper, onChord.x, onChord.y);
    await nextTick();
    expect(wrapper.find('[data-testid="arc-preview"]').exists()).toBe(false);

    down(wrapper.find('[data-testid="grid"]').element, onChord.x, onChord.y);
    await nextTick();

    expect(wrapper.emitted('add-arc')).toBeUndefined();
    expect(wrapper.find('[data-testid="arc-hint"]').exists()).toBe(true);

    const offChord = screenAt({ x: 50, y: 50 });
    pointerMove(wrapper, offChord.x, offChord.y);
    await nextTick();
    expect(wrapper.find('[data-testid="arc-hint"]').exists()).toBe(false);

    down(wrapper.find('[data-testid="grid"]').element, offChord.x, offChord.y);

    const emitted = wrapper.emitted('add-arc')![0]!;
    expect(emitted[0]).toEqual({ kind: 'point', id: 'a' });
    expect(emitted[1]).toEqual({ kind: 'point', id: 'b' });
    expect(emitted[2]).toEqual({ kind: 'new', x: 50, y: 50 });
  });

  it('ignores a repeated arc click without emitting', () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);

    expect(wrapper.emitted('add-arc')).toBeUndefined();
  });

  it('clears the pending arc when the tool changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();

    wrapper.setProps({ tool: 'select' });
    await nextTick();

    expect(wrapper.find('[data-testid="arc-chord"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="arc-hint"]').exists()).toBe(false);
  });

  it('drops the arc gesture when its start point disappears', async () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    wrapper.setProps({ document: doc([pt('b', 100, 0), pt('c', 100, 100)]) });
    await nextTick();

    pointerMove(wrapper, 700, 500);
    await nextTick();

    expect(wrapper.find('[data-testid="arc-chord"]').exists()).toBe(false);
  });

  it('drops the arc gesture when its end point disappears', async () => {
    const wrapper = mountCanvas({ tool: 'add_arc' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    wrapper.setProps({ document: doc([pt('a', 0, 0), pt('c', 100, 100)]) });
    await nextTick();

    // A cleared gesture makes the next click a fresh start rather than a third click.
    down(pointCircle(wrapper, 'c').element, 400, 300);
    await nextTick();

    expect(wrapper.emitted('add-arc')).toBeUndefined();
    expect(wrapper.find('[data-testid="arc-hint"]').exists()).toBe(false);
  });

  it('renders committed arcs as stroke-only paths and skips invalid or broken ones', async () => {
    const arcDoc = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('p', 50, 50),
      pt('mid', 50, 0),
      { id: 'arc', kind: 'arc', start: 'a', end: 'b', through: 'p', construction: false },
      { id: 'guide', kind: 'arc', start: 'a', end: 'b', through: 'p', construction: true },
      { id: 'flat', kind: 'arc', start: 'a', end: 'b', through: 'mid', construction: false },
      { id: 'lost', kind: 'arc', start: 'a', end: 'b', through: 'missing', construction: false },
    ]);
    const wrapper = mountCanvas({ document: arcDoc });

    const arcs = wrapper.findAll('[data-kind="arc"]');
    expect(arcs).toHaveLength(2);

    const cut = arcs.find((arc) => arc.attributes('data-entity-id') === 'arc')!;
    expect(cut.attributes('fill')).toBe('none');
    expect(cut.attributes('d')).toMatch(/^M .* A /);
    expect(cut.attributes('stroke-dasharray')).toBeUndefined();

    const guide = arcs.find((arc) => arc.attributes('data-entity-id') === 'guide')!;
    expect(guide.attributes('stroke-dasharray')).toBe('4 4');

    await cut.trigger('pointerenter');
    await cut.trigger('pointerleave');
    expect(cut.classes()).toContain('text-foreground');
  });

  it('ignores an arc as a dimension pick', () => {
    const arcDoc = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('p', 50, 50),
      { id: 'arc', kind: 'arc', start: 'a', end: 'b', through: 'p', construction: false },
    ]);
    const wrapper = mountCanvas({ document: arcDoc, tool: 'dimension' });

    down(wrapper.find('[data-kind="arc"]').element, 400, 300);

    expect(wrapper.emitted('add-dimension')).toBeUndefined();
  });

  it('commits a circle between two existing points', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-circle')).toBeUndefined();
    await nextTick();
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-accent');

    down(pointCircle(wrapper, 'c').element, 400, 300);
    expect(wrapper.emitted('add-circle')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'point', id: 'c' },
      ],
    ]);
  });

  it('creates the centre and rim for an empty-canvas circle', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });
    const center = snappedAt(600, 400);
    const rim = snappedAt(300, 500);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(true);

    down(wrapper.find('[data-testid="grid"]').element, 300, 500);
    expect(wrapper.emitted('add-circle')).toEqual([
      [
        { kind: 'new', x: center.x, y: center.y },
        { kind: 'new', x: rim.x, y: rim.y },
      ],
    ]);
    await nextTick();
    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="circle-preview"]').exists()).toBe(false);
  });

  it('previews a dashed circle from the pending centre to the snapped pointer', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });
    const center = snappedAt(600, 400);
    const target = snappedAt(700, 500);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="circle-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('cx')).toBe(String(center.x));
    expect(preview.attributes('cy')).toBe(String(center.y));
    expect(preview.attributes('r')).toBe(
      String(Math.hypot(target.x - center.x, target.y - center.y)),
    );
    expect(preview.attributes('stroke-dasharray')).toBe('4 4');
  });

  it('previews from an existing point without a provisional marker', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();
    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(false);

    pointerMove(wrapper, 700, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="circle-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('cx')).toBe('0');
    expect(preview.attributes('cy')).toBe('0');
  });

  it('ignores a second click on the centre or the same coordinate', () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-circle')).toBeUndefined();

    down(pointCircle(wrapper, 'c').element, 400, 300);
    expect(wrapper.emitted('add-circle')).toEqual([
      [
        { kind: 'point', id: 'a' },
        { kind: 'point', id: 'c' },
      ],
    ]);

    const grid = wrapper.find('[data-testid="grid"]').element;
    down(grid, 600, 400);
    down(grid, 600, 400);
    expect(wrapper.emitted('add-circle')).toHaveLength(1);
  });

  it('clears the pending circle when the tool changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(true);

    wrapper.setProps({ tool: 'select' });
    await nextTick();

    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="circle-preview"]').exists()).toBe(false);
  });

  it('clears a pending circle centre when that point disappears', async () => {
    const wrapper = mountCanvas({ tool: 'add_circle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-accent');

    wrapper.setProps({ document: doc([pt('b', 100, 0), pt('c', 100, 100)]) });
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    expect(wrapper.find('[data-testid="circle-preview"]').exists()).toBe(false);
  });

  it('commits a diagonal rectangle between two existing points', () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-rectangle')).toBeUndefined();

    down(pointCircle(wrapper, 'c').element, 400, 300);
    expect(wrapper.emitted('add-rectangle')).toEqual([
      [
        'diagonal',
        [
          { kind: 'point', id: 'a' },
          { kind: 'point', id: 'c' },
        ],
      ],
    ]);
  });

  it('previews a diagonal rectangle from the snapped pointer', async () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });
    const first = snappedAt(600, 400);
    const second = snappedAt(300, 500);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 300, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="rectangle-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('d')).toBe(
      `M ${first.x} ${first.y} L ${second.x} ${first.y} L ${second.x} ${second.y} L ${first.x} ${second.y} L ${first.x} ${first.y}`,
    );
    expect(preview.attributes('stroke-dasharray')).toBe('4 4');
    expect(wrapper.findAll('[data-testid^="rectangle-pending-corner-"]')).toHaveLength(4);
  });

  it('previews a centred rectangle from the centre and the pointer', async () => {
    const wrapper = mountCanvas({ tool: 'add_center_rectangle' });
    const center = snappedAt(600, 400);
    const corner = snappedAt(700, 500);
    const dx = corner.x - center.x;
    const dy = corner.y - center.y;

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="center-rectangle-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('d')).toBe(
      `M ${center.x - dx} ${center.y - dy} L ${center.x + dx} ${center.y - dy} L ${
        center.x + dx
      } ${center.y + dy} L ${center.x - dx} ${center.y + dy} L ${center.x - dx} ${center.y - dy}`,
    );
  });

  it('previews a rotated rectangle after two three-point clicks', async () => {
    const wrapper = mountCanvas({ tool: 'add_3point_rectangle' });
    const start = snappedAt(300, 300);
    const end = snappedAt(600, 300);

    down(wrapper.find('[data-testid="grid"]').element, 300, 300);
    down(wrapper.find('[data-testid="grid"]').element, 600, 300);
    await nextTick();
    expect(wrapper.emitted('add-rectangle')).toBeUndefined();

    pointerMove(wrapper, 600, 500);
    await nextTick();

    const preview = wrapper.find('[data-testid="three-point-rectangle-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('d')).toContain(`M ${start.x} ${start.y}`);

    down(wrapper.find('[data-testid="grid"]').element, 600, 500);
    expect(wrapper.emitted('add-rectangle')).toEqual([
      [
        'three_point',
        [
          { kind: 'new', x: start.x, y: start.y },
          { kind: 'new', x: end.x, y: end.y },
          { kind: 'new', x: snappedAt(600, 500).x, y: snappedAt(600, 500).y },
        ],
      ],
    ]);
  });

  it('refuses a rectangle click that repeats a pending corner', () => {
    const wrapper = mountCanvas({ tool: 'add_3point_rectangle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'c').element, 400, 300);

    expect(wrapper.emitted('add-rectangle')).toEqual([
      [
        'three_point',
        [
          { kind: 'point', id: 'a' },
          { kind: 'point', id: 'b' },
          { kind: 'point', id: 'c' },
        ],
      ],
    ]);
  });

  it('refuses a diagonal rectangle with no height and keeps the pending click', async () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });
    const grid = wrapper.find('[data-testid="grid"]').element;

    down(grid, 700, 200);
    down(grid, 200, 200);
    expect(wrapper.emitted('add-rectangle')).toBeUndefined();

    pointerMove(wrapper, 200, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="rectangle-preview"]').exists()).toBe(true);
  });

  it('shows no preview while the pointer cannot complete a rectangle', async () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });
    const grid = wrapper.find('[data-testid="grid"]').element;

    down(grid, 700, 200);
    await nextTick();
    pointerMove(wrapper, 700, 500);
    await nextTick();

    expect(wrapper.find('[data-testid="rectangle-preview"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="rectangle-pending-corner-"]')).toHaveLength(1);
  });

  it('clears the pending rectangle on Escape and on a tool change', async () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    pointerMove(wrapper, 300, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="rectangle-preview"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="rectangle-preview"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="rectangle-pending-corner-"]')).toHaveLength(0);

    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    await nextTick();
    wrapper.setProps({ tool: 'select' });
    await nextTick();
    expect(wrapper.findAll('[data-testid^="rectangle-pending-corner-"]')).toHaveLength(0);
  });

  it('clears a pending rectangle corner when that point disappears', async () => {
    const wrapper = mountCanvas({ tool: 'add_rectangle' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    await nextTick();

    wrapper.setProps({ document: doc([pt('b', 100, 0), pt('c', 100, 100)]) });
    await nextTick();

    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'c').element, 400, 300);
    expect(wrapper.emitted('add-rectangle')).toBeUndefined();
  });

  it('ignores a repeated point when collecting a curve', () => {
    const wrapper = mountCanvas({ tool: 'add_curve' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'c').element, 400, 300);
    down(pointCircle(wrapper, 'd').element, 400, 300);

    expect(wrapper.emitted('add-curve')).toEqual([[['a', 'b', 'c', 'd']]]);
  });

  it('resets pending curve points when a click is not on a point', () => {
    const wrapper = mountCanvas({ tool: 'add_curve' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 600, 400);
    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(wrapper.find('[data-testid="grid"]').element, 600, 400);
    down(pointCircle(wrapper, 'c').element, 400, 300);
    down(pointCircle(wrapper, 'd').element, 400, 300);

    expect(wrapper.emitted('add-curve')).toBeUndefined();
  });

  it('clears a pending selection when the tool changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-line')).toBeUndefined();

    wrapper.setProps({ tool: 'add_curve' });
    await nextTick();

    down(pointCircle(wrapper, 'b').element, 400, 300);
    down(pointCircle(wrapper, 'c').element, 400, 300);
    down(pointCircle(wrapper, 'd').element, 400, 300);
    expect(wrapper.emitted('add-curve')).toBeUndefined();

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-curve')).toEqual([[['b', 'c', 'd', 'a']]]);
  });

  it('pans with the middle mouse button without selecting', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);

    // The browser's middle-click autoscroll never starts over the canvas.
    const middleDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    wrapper.find('svg').element.dispatchEvent(middleDown);
    expect(middleDown.defaultPrevented).toBe(true);

    down(pointCircle(wrapper, 'a').element, 500, 300, 1);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();

    move(520, 330);
    await nextTick();

    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    up();
    expect(wrapper.emitted('move-point')).toBeUndefined();
  });

  it('leaves Space to a focused text field', () => {
    mountCanvas();
    const field = document.createElement('textarea');
    document.body.appendChild(field);

    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(event);
    field.remove();

    expect(event.defaultPrevented).toBe(false);
  });

  it('pans while space is held, then selects once released', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    pressSpace();

    down(pointCircle(wrapper, 'a').element, 500, 300);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
    move(520, 330);
    await nextTick();
    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    up();

    releaseSpace();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));

    down(pointCircle(wrapper, 'a').element, 500, 300);
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['a']]]);
    up();
  });

  it('zooms in and out around the pointer with the wheel', async () => {
    const wrapper = mountCanvas();
    const svg = wrapper.find('svg').element;
    const before = transformOf(wrapper);

    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    await nextTick();
    const zoomedIn = transformOf(wrapper);
    expect(zoomedIn).not.toBe(before);

    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
    await nextTick();
    expect(transformOf(wrapper)).not.toBe(zoomedIn);
  });

  it('updates the ruler size on window resize', async () => {
    const wrapper = mountCanvas();

    rectSpy.mockReturnValue({ ...RECT, width: 400, height: 300 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(wrapper.find('[data-testid="ruler-x"]').attributes('width')).toBe('400');
    expect(wrapper.find('[data-testid="ruler-y"]').attributes('height')).toBe('300');
  });

  it('reflects the active tool in the cursor', async () => {
    const wrapper = mountCanvas();

    expect(wrapper.classes()).toContain('cursor-default');

    wrapper.setProps({ tool: 'add_point' });
    await nextTick();

    expect(wrapper.classes()).toContain('cursor-crosshair');
  });

  it('removes window listeners when unmounted mid-drag', async () => {
    const wrapper = mountCanvas();
    down(pointCircle(wrapper, 'a').element, 500, 300);
    move(520, 330);
    await nextTick();

    wrapper.unmount();

    expect(() => move(540, 360)).not.toThrow();
  });

  it('observes its box for resizes and disconnects on unmount', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const wrapper = mountCanvas();
      expect(observe).toHaveBeenCalled();

      rectSpy.mockReturnValue({ ...RECT, width: 321, height: 210 } as DOMRect);
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
      await nextTick();

      expect(wrapper.find('[data-testid="ruler-x"]').attributes('width')).toBe('321');

      wrapper.unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders dimension lines and labels for every resolvable distance constraint', () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-lines-h"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-lines-ghost"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-label-w"]').find('text').text()).toBe('100');
    expect(wrapper.find('[data-testid="dimension-label-w"]').find('text').classes()).toContain(
      'fill-foreground',
    );
    expect(wrapper.find('[data-testid="dimension-label-w"]').find('text').classes()).not.toContain(
      'fill-muted-foreground',
    );
    expect(wrapper.find('[data-testid="dimension-label-w"]').attributes('aria-label')).toBe(
      'Dimension 100 millimetres',
    );
    expect(wrapper.find('[data-testid="dimension-label-h"]').find('text').text()).toBe('100');
    expect(wrapper.find('[data-testid="dimension-label-h"]').attributes('transform')).toContain(
      'rotate(90)',
    );

    const lines = wrapper.find('[data-testid="dimension-lines-w"]').findAll('line');
    expect(lines[0]!.classes()).toContain('stroke-muted-foreground');
    expect(lines[2]!.classes()).toContain('stroke-foreground');
    expect(wrapper.find('[data-testid="dimension-drag-w"]').exists()).toBe(true);
  });

  it('renders a driven measurement in parentheses with a stateful accessible name', () => {
    const drivenDoc: PatternDocument = {
      ...baseDoc,
      constraints: [
        { id: 'm', type: 'distance', a: 'a', b: 'c', orientation: 'horizontal' },
        { id: 'ghost', type: 'distance', a: 'a', b: 'missing' },
      ],
    };
    const wrapper = mountCanvas({ document: drivenDoc });

    const label = wrapper.find('[data-testid="dimension-label-m"]');
    expect(label.find('text').text()).toBe('(100)');
    expect(label.find('text').classes()).toContain('fill-muted-foreground');
    expect(label.find('text').classes()).not.toContain('fill-foreground');
    expect(label.attributes('aria-label')).toBe('Driven dimension, measured 100 millimetres');
    expect(label.find('rect').attributes('width')).toBe('38');
    expect(wrapper.find('[data-testid="dimension-drag-m"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-label-ghost"]').exists()).toBe(false);
  });

  it('renders referenced and broken dimensions with distinct shapes and colors', () => {
    const linkedDoc: PatternDocument = {
      ...baseDoc,
      constraints: [
        { id: 'A', type: 'distance', a: 'a', b: 'b', value: 100 },
        { id: 'R', type: 'distance', a: 'b', b: 'c', reference: 'A' },
        { id: 'B', type: 'distance', a: 'c', b: 'd', reference: 'gone', lastKnownValue: 75 },
      ],
    };
    const wrapper = mountCanvas({ document: linkedDoc });

    const referenced = wrapper.find('[data-testid="dimension-label-R"]');
    expect(referenced.find('text').text()).toBe('[100]');
    expect(referenced.find('text').classes()).toContain('fill-dimension-reference');
    expect(referenced.attributes('aria-label')).toBe(
      'Referenced dimension, 100 millimetres, from dimension A',
    );
    expect(referenced.find('[data-testid="dimension-broken-glyph"]').exists()).toBe(false);

    const broken = wrapper.find('[data-testid="dimension-label-B"]');
    expect(broken.find('text[data-dimension-state]').text()).toBe('[75]');
    expect(broken.find('text[data-dimension-state]').classes()).toContain('fill-destructive');
    expect(broken.attributes('aria-label')).toBe(
      'Broken reference, last known 75 millimetres; source dimension gone is missing',
    );
    expect(broken.find('[data-testid="dimension-broken-glyph"]').text()).toBe('⚠');
  });

  it('hides dimension lines and labels when the toggle is off', () => {
    const wrapper = mountCanvas({ document: dimensionDoc, showDimensions: false });

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-labels-layer"]').text()).not.toContain('100');
  });

  it('previews a dimension from a line anchor, follows the pointer and emits the placement', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    const vp = fittedViewport(dimensionDoc);

    // A line is only the first anchor now: no preview until the second pick.
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick the second anchor.');

    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').find('text').text(),
    ).toBe('(100)');
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').find('text').classes(),
    ).toContain('fill-muted-foreground');
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').find('text').classes(),
    ).not.toContain('fill-foreground');
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').attributes('aria-label'),
    ).toBe('Driven dimension, measured 100 millimetres');

    const target = worldToScreen(vp, { x: 150, y: 40 });
    wrapper
      .find('svg')
      .element.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: target.x, clientY: target.y }),
      );
    await nextTick();

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    await nextTick();

    expect(wrapper.emitted('add-dimension')).toEqual([
      [{ a: 'ab', b: 'c', orientation: 'aligned', offset: 50 }],
    ]);
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);

    const idle = worldToScreen(vp, { x: 10, y: 10 });
    wrapper
      .find('svg')
      .element.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: idle.x, clientY: idle.y }),
      );
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);
  });

  it('does not preview a zero-length dimension', async () => {
    const zeroDoc = doc([pt('a', 0, 0), pt('b', 0, 0)]);
    const wrapper = mountCanvas({ document: zeroDoc, tool: 'dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(pointCircle(wrapper, 'b').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    expect(wrapper.emitted('add-dimension')).toEqual([
      [{ a: 'a', b: 'b', orientation: 'aligned', offset: 20 }],
    ]);
  });

  it('picks two points for a dimension and ignores a repeated point', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });

    down(pointCircle(wrapper, 'c').element, 300, 200);
    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);

    expect(wrapper.emitted('add-dimension')).toEqual([
      [{ a: 'c', b: 'a', orientation: 'aligned', offset: 20 }],
    ]);
  });

  it('resets dimension picks when an empty hit interrupts them', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-kind="curve"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe(
      'Pick a point or a straight line.',
    );

    // An empty click clears the pending first anchor.
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    expect(wrapper.emitted('add-dimension')).toBeUndefined();
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
  });

  it('picks point-line, line-point and line-line anchors', async () => {
    const anchorDoc = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 0, 50),
      pt('d', 100, 50),
      pt('f', 100, 100),
      pt('p', 50, 25),
      ln('L', 'a', 'b'),
      ln('M', 'c', 'd'),
      ln('V', 'b', 'f'),
      ln('Z', 'a', 'a'),
      ln('D', 'a', 'b'),
      cv('curve', 'a', 'b', 'c', 'd'),
    ]);

    const pointLine = mountCanvas({ document: anchorDoc, tool: 'dimension' });
    down(pointCircle(pointLine, 'p').element, 300, 200);
    down(pointLine.find('[data-kind="line"][data-entity-id="L"]').element, 300, 200);
    await nextTick();
    expect(
      pointLine.find('[data-testid="dimension-label-dimension-preview"]').find('text').text(),
    ).toBe('(25)');
    down(pointLine.find('[data-testid="grid"]').element, 400, 300);
    expect(pointLine.emitted('add-dimension')).toEqual([
      [{ a: 'p', b: 'L', orientation: 'aligned', offset: 20 }],
    ]);

    const linePoint = mountCanvas({ document: anchorDoc, tool: 'dimension' });
    down(linePoint.find('[data-kind="line"][data-entity-id="L"]').element, 300, 200);
    down(pointCircle(linePoint, 'p').element, 300, 200);
    await nextTick();
    down(linePoint.find('[data-testid="grid"]').element, 400, 300);
    expect(linePoint.emitted('add-dimension')).toEqual([
      [{ a: 'L', b: 'p', orientation: 'aligned', offset: 20 }],
    ]);

    const lineLine = mountCanvas({ document: anchorDoc, tool: 'dimension' });
    down(lineLine.find('[data-kind="line"][data-entity-id="L"]').element, 300, 200);
    down(lineLine.find('[data-kind="line"][data-entity-id="M"]').element, 300, 200);
    await nextTick();
    expect(
      lineLine.find('[data-testid="dimension-label-dimension-preview"]').find('text').text(),
    ).toBe('(50)');
    down(lineLine.find('[data-testid="grid"]').element, 400, 300);
    expect(lineLine.emitted('add-dimension')).toEqual([
      [{ a: 'L', b: 'M', orientation: 'aligned', offset: 20 }],
    ]);
  });

  it('explains each rejected anchor pair and clears the hint on a valid pick', async () => {
    const anchorDoc = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 0, 50),
      pt('d', 100, 50),
      pt('f', 100, 100),
      pt('p', 50, 25),
      ln('L', 'a', 'b'),
      ln('M', 'c', 'd'),
      ln('V', 'b', 'f'),
      ln('Z', 'a', 'a'),
      ln('D', 'a', 'b'),
      cv('curve', 'a', 'b', 'c', 'd'),
    ]);
    const wrapper = mountCanvas({ document: anchorDoc, tool: 'dimension' });
    const hint = () => wrapper.find('[data-testid="dimension-hint"]').text();

    expect(hint()).toBe('Pick a point or a line.');

    down(wrapper.find('[data-kind="curve"]').element, 300, 200);
    await nextTick();
    expect(hint()).toBe('Pick a point or a straight line.');

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-kind="line"][data-entity-id="L"]').element, 300, 200);
    await nextTick();
    expect(hint()).toBe('The point lies on the line.');

    down(wrapper.find('[data-kind="line"][data-entity-id="L"]').element, 300, 200);
    await nextTick();
    expect(hint()).toBe('The point lies on the line.');

    // An empty click clears the pending first anchor, so the next pick starts over.
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    down(pointCircle(wrapper, 'p').element, 300, 200);
    await nextTick();
    expect(hint()).toBe('Pick the second anchor.');
  });

  it('rejects non-parallel, coincident and zero-length lines with a hint', async () => {
    const anchorDoc = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 0, 50),
      pt('d', 100, 50),
      pt('f', 100, 100),
      ln('L', 'a', 'b'),
      ln('M', 'c', 'd'),
      ln('V', 'b', 'f'),
      ln('Z', 'a', 'a'),
      ln('D', 'a', 'b'),
    ]);
    const wrapper = mountCanvas({ document: anchorDoc, tool: 'dimension' });
    const hint = () => wrapper.find('[data-testid="dimension-hint"]').text();
    const click = (id: string) =>
      down(wrapper.find(`[data-kind="line"][data-entity-id="${id}"]`).element, 300, 200);
    const clear = () => down(wrapper.find('[data-testid="grid"]').element, 400, 300);

    click('L');
    click('V');
    await nextTick();
    expect(hint()).toBe('Pick two parallel lines — use Angle for a corner.');
    clear();

    click('L');
    click('D');
    await nextTick();
    expect(hint()).toBe('The lines are coincident.');
    clear();

    click('L');
    click('Z');
    await nextTick();
    expect(hint()).toBe('Pick a point or a straight line.');
    clear();

    click('L');
    click('L');
    await nextTick();
    expect(hint()).toBe('Pick the second anchor.');
  });

  it('clears a pending dimension pick on Escape and on a tool change', async () => {
    const anchorDoc = doc([pt('a', 0, 0), pt('b', 100, 0), ln('L', 'a', 'b')]);
    const wrapper = mountCanvas({ document: anchorDoc, tool: 'dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick the second anchor.');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick a point or a line.');

    down(pointCircle(wrapper, 'a').element, 300, 200);
    wrapper.setProps({ tool: 'select' });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-hint"]').exists()).toBe(false);
    expect(wrapper.emitted('add-dimension')).toBeUndefined();
  });

  it('opens the inline editor on double-click and commits a valid value', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    const editor = wrapper.find('[data-testid="dimension-editor"]');
    expect(editor.exists()).toBe(true);
    expect((editor.element as HTMLInputElement).value).toBe('100');

    await editor.setValue('150');
    await editor.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update-dimension')).toEqual([['w', { value: 150 }]]);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });

  it('keeps an invalid inline value editable and cancels on Escape', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    await wrapper.find('[data-testid="dimension-editor"]').setValue('0');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);
    expect(wrapper.emitted('update-dimension')).toBeUndefined();

    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('offers the document variables when a $ token is typed', async () => {
    const document: PatternDocument = {
      ...dimensionDoc,
      variables: [
        { slug: 'bust', name: 'Bust (cm)', unit: 'cm', value: 88 },
        { slug: 'waist', name: 'Waist', unit: 'cm', value: 72 },
      ],
    };
    const wrapper = mountCanvas({ document });
    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    const editor = wrapper.find('[data-testid="dimension-editor"]');
    await editor.setValue('$b');
    expect(wrapper.find('[data-testid="dimension-variable-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-variable-bust"]').text()).toContain('$bust');

    await editor.trigger('keydown', { key: 'ArrowDown' });
    await editor.trigger('keydown', { key: 'Enter' });
    expect((editor.element as HTMLInputElement).value).toBe('$bust');

    await editor.setValue('$w');
    await wrapper.find('[data-testid="dimension-variable-waist"]').trigger('mousedown');
    expect((editor.element as HTMLInputElement).value).toBe('$waist');

    await editor.setValue('$bust');
    expect(wrapper.find('[data-testid="dimension-variable-list"]').exists()).toBe(false);

    await editor.setValue('$b');
    await editor.trigger('keydown', { key: 'ArrowUp' });
    await editor.trigger('keydown', { key: 'x' });
    expect(wrapper.find('[data-testid="dimension-variable-list"]').exists()).toBe(true);
    await editor.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-variable-list"]').exists()).toBe(false);
    expect((editor.element as HTMLInputElement).value).toBe('$b');
  });

  it('commits a formula and keeps an unresolved one editable', async () => {
    const document: PatternDocument = {
      ...dimensionDoc,
      variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880 }],
    };
    const wrapper = mountCanvas({ document });
    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    await wrapper.find('[data-testid="dimension-editor"]').setValue('$bust / 4');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.emitted('update-dimension')).toEqual([['w', { value: { expr: '$bust / 4' } }]]);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('$gone / 4');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.emitted('update-dimension')).toHaveLength(1);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);

    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Escape' });
    await nextTick();
    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('$gone / 4');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('blur');
    await nextTick();
    expect(wrapper.emitted('update-dimension')).toHaveLength(1);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });

  it('commits a valid blur and discards an invalid one', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('120');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('blur');
    expect(wrapper.emitted('update-dimension')).toEqual([['w', { value: 120 }]]);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('blur');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['w', { value: 120 }],
      ['w', { value: null }],
    ]);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    const invalid = wrapper.find('[data-testid="dimension-editor"]');
    await invalid.setValue('0');
    await invalid.trigger('blur');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['w', { value: 120 }],
      ['w', { value: null }],
    ]);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    const twice = wrapper.find('[data-testid="dimension-editor"]');
    await twice.trigger('blur');
    await twice.trigger('blur');
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });

  it('prefills a driven measurement and clears it on Enter', async () => {
    const drivenDoc: PatternDocument = {
      ...baseDoc,
      constraints: [{ id: 'm', type: 'distance', a: 'a', b: 'c', orientation: 'horizontal' }],
    };
    const wrapper = mountCanvas({ document: drivenDoc });

    await wrapper.find('[data-testid="dimension-label-m"]').trigger('dblclick');
    await flushPromises();

    const editor = wrapper.find('[data-testid="dimension-editor"]');
    expect((editor.element as HTMLInputElement).value).toBe('100');

    await editor.setValue('   ');
    await editor.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update-dimension')).toEqual([['m', { value: null }]]);
  });

  it('opens the reference picker from # and links the highlighted row with Enter', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    const editor = wrapper.find('[data-testid="dimension-editor"]');
    await editor.setValue('#');

    const picker = wrapper.find('[data-testid="dimension-reference-picker"]');
    expect(picker.exists()).toBe(true);
    expect(picker.find('[data-testid="dimension-reference-option-h"]').text()).toBe(
      'h · 100 mm · b → c · Vertical',
    );
    expect(editor.attributes('aria-expanded')).toBe('true');
    expect(editor.attributes('aria-controls')).toBe('dimension-reference-list');
    expect(editor.attributes('aria-activedescendant')).toBe('dimension-reference-list-h');

    await editor.trigger('keydown', { key: 'ArrowDown' });
    expect(editor.attributes('aria-activedescendant')).toBe('dimension-reference-list-ghost');
    await editor.trigger('keydown', { key: 'ArrowUp' });
    expect(editor.attributes('aria-activedescendant')).toBe('dimension-reference-list-h');

    await editor.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update-dimension')).toEqual([['w', { reference: 'h' }]]);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);
  });

  it('filters the inline picker, links a clicked row and commits a valid blur', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    const editor = wrapper.find('[data-testid="dimension-editor"]');

    await editor.setValue('#zzz');
    expect(wrapper.find('[data-testid="dimension-reference-empty"]').text()).toBe(
      'No other dimensions can be referenced.',
    );
    await editor.trigger('keydown', { key: 'ArrowDown' });
    await editor.trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);
    expect(wrapper.emitted('update-dimension')).toBeUndefined();

    await editor.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);
    await editor.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('#h');
    expect(wrapper.find('[data-testid="dimension-reference-option-h"]').exists()).toBe(true);
    await wrapper.find('[data-testid="dimension-reference-option-h"]').trigger('click');
    expect(wrapper.emitted('update-dimension')).toEqual([['w', { reference: 'h' }]]);
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('#h');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('blur');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['w', { reference: 'h' }],
      ['w', { reference: 'h' }],
    ]);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    const reopened = wrapper.find('[data-testid="dimension-editor"]');
    await reopened.setValue('#');
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(true);
    await reopened.setValue('100');
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);
  });

  it('ignores double-click on a preview label and closes the editor when hidden', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    await wrapper.find('[data-testid="dimension-label-dimension-preview"]').trigger('dblclick');
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);

    wrapper.setProps({ showDimensions: false });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);

    wrapper.setProps({ showDimensions: true });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-w"]').exists()).toBe(true);
  });

  it('closes the inline editor when the document changes underneath it', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);

    wrapper.setProps({ document: { ...dimensionDoc, constraints: [] } });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });

  it('drags a dimension line to a new offset', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);
    const target = worldToScreen(vp, { x: 50, y: 40 });

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    expect(wrapper.emitted('update-dimension')).toEqual([['w', { offset: 40 }]]);
  });

  it('drags a dimension from its label and ignores a click without movement', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);
    const target = worldToScreen(vp, { x: 50, y: 30 });

    down(wrapper.find('[data-testid="dimension-label-w"]').element, 300, 200);
    up();
    expect(wrapper.emitted('update-dimension')).toBeUndefined();

    down(wrapper.find('[data-testid="dimension-label-w"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    expect(wrapper.emitted('update-dimension')).toEqual([['w', { offset: 30 }]]);
  });

  it('pans with the middle button over a dimension instead of dragging it', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200, 1);
    move(320, 230);
    await nextTick();
    up();

    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('does not drag dimensions during constraint placement', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, constraintActive: true });

    expect(wrapper.find('[data-testid="dimension-drag-w"]').exists()).toBe(false);
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('drags a dimension line with the dimension tool and keeps the tool available', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    const vp = fittedViewport(dimensionDoc);
    const target = worldToScreen(vp, { x: 50, y: 40 });

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    expect(wrapper.emitted('update-dimension')).toEqual([['w', { offset: 40 }]]);
    expect(wrapper.emitted('add-dimension')).toBeUndefined();
  });

  it('drags a dimension from its label with the dimension tool', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    const vp = fittedViewport(dimensionDoc);
    const target = worldToScreen(vp, { x: 50, y: 30 });

    down(wrapper.find('[data-testid="dimension-label-w"]').element, 300, 200);
    up();
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
    expect(wrapper.emitted('add-dimension')).toBeUndefined();

    down(wrapper.find('[data-testid="dimension-label-w"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    expect(wrapper.emitted('update-dimension')).toEqual([['w', { offset: 30 }]]);
  });

  it('renders the drag strip only while a drag is possible', async () => {
    const placing = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    down(placing.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(pointCircle(placing, 'c').element, 300, 200);
    await nextTick();
    expect(placing.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);
    expect(placing.find('[data-testid="dimension-drag-dimension-preview"]').exists()).toBe(false);
    expect(placing.find('[data-testid="dimension-drag-w"]').exists()).toBe(true);

    const hidden = mountCanvas({ document: dimensionDoc, showDimensions: false });
    expect(hidden.find('[data-testid="dimension-drag-w"]').exists()).toBe(false);

    const constrained = mountCanvas({ document: dimensionDoc, constraintActive: true });
    expect(constrained.find('[data-testid="dimension-drag-w"]').exists()).toBe(false);

    const drawing = mountCanvas({ document: dimensionDoc, tool: 'add_line' });
    expect(drawing.find('[data-testid="dimension-drag-w"]').exists()).toBe(false);
  });

  it('sizes the drag strip to 24 px and uses a move cursor on both handles', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const strip = wrapper.find('[data-testid="dimension-drag-w"]');

    expect(strip.attributes('stroke')).toBe('transparent');
    expect(strip.attributes('stroke-width')).toBe('24');
    expect(strip.classes()).toContain('cursor-move');
    expect(wrapper.find('[data-testid="dimension-label-w"]').classes()).toContain('cursor-move');
    expect(wrapper.find('[data-testid="dimension-label-w"]').classes()).toContain(
      'pointer-events-auto',
    );

    const drawing = mountCanvas({ document: dimensionDoc, tool: 'add_line' });
    expect(drawing.find('[data-testid="dimension-label-w"]').classes()).toContain('cursor-text');
    expect(drawing.find('[data-testid="dimension-label-w"]').classes()).not.toContain(
      'cursor-move',
    );

    const placing = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    down(placing.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(pointCircle(placing, 'c').element, 300, 200);
    await nextTick();
    const preview = placing.find('[data-testid="dimension-label-dimension-preview"]');
    expect(preview.classes()).toContain('pointer-events-none');
    expect(preview.classes()).not.toContain('cursor-text');
  });

  it('explains drag and edit in the label tooltip', async () => {
    const draggable = mountCanvas({ document: dimensionDoc });
    expect(draggable.find('[data-testid="dimension-label-w"] title').text()).toBe(
      'Click to select, drag to reposition, double-click to edit',
    );

    const editable = mountCanvas({ document: dimensionDoc, tool: 'add_line' });
    expect(editable.find('[data-testid="dimension-label-w"] title').text()).toBe(
      'Double-click to edit',
    );

    const placing = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    down(placing.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(pointCircle(placing, 'c').element, 300, 200);
    await nextTick();
    expect(placing.find('[data-testid="dimension-label-dimension-preview"] title').text()).toBe(
      'Dimension preview',
    );
  });

  it('drops an in-flight dimension drag on pointercancel', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);
    const mainLine = () => wrapper.find('[data-testid="dimension-lines-w"]').findAll('line')[2]!;
    const committed = mainLine().attributes('y1');

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    const target = worldToScreen(vp, { x: 50, y: 40 });
    move(target.x, target.y);
    await nextTick();
    expect(mainLine().attributes('y1')).not.toBe(committed);

    window.dispatchEvent(new MouseEvent('pointercancel'));
    await nextTick();
    expect(mainLine().attributes('y1')).toBe(committed);

    move(target.x + 40, target.y + 40);
    await nextTick();
    expect(mainLine().attributes('y1')).toBe(committed);

    up();
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('drops a point drag and a pan on pointercancel', async () => {
    const dragging = mountCanvas({ document: dimensionDoc });
    const moved = () => dragging.emitted('move-point');

    down(pointCircle(dragging, 'a').element, 300, 200);
    move(420, 320);
    await nextTick();
    window.dispatchEvent(new MouseEvent('pointercancel'));
    await nextTick();
    up();
    expect(moved()).toBeUndefined();

    const panning = mountCanvas({ document: dimensionDoc });
    const beforePan = transformOf(panning);
    down(panning.find('[data-testid="grid"]').element, 300, 200);
    move(360, 260);
    await nextTick();
    const panned = transformOf(panning);
    expect(panned).not.toBe(beforePan);

    window.dispatchEvent(new MouseEvent('pointercancel'));
    await nextTick();
    move(500, 400);
    await nextTick();

    expect(transformOf(panning)).toBe(panned);
  });

  it('cancels a dimension drag when the tool switches mid-drag', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);
    const mainLine = () => wrapper.find('[data-testid="dimension-lines-w"]').findAll('line')[2]!;
    const committed = mainLine().attributes('y1');

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    const target = worldToScreen(vp, { x: 50, y: 40 });
    move(target.x, target.y);
    await nextTick();
    expect(mainLine().attributes('y1')).not.toBe(committed);

    wrapper.setProps({ tool: 'add_line' });
    await nextTick();
    expect(mainLine().attributes('y1')).toBe(committed);

    move(target.x, target.y);
    await nextTick();
    up();
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('cancels a dimension drag when the layer hides', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc });
    const vp = fittedViewport(dimensionDoc);

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    const target = worldToScreen(vp, { x: 50, y: 40 });
    move(target.x, target.y);
    await nextTick();

    wrapper.setProps({ showDimensions: false });
    await nextTick();
    up();
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('removes every window pointer listener on unmount mid-drag', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const wrapper = mountCanvas({ document: dimensionDoc });

    down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
    wrapper.unmount();

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toContain('pointermove');
    expect(removed).toContain('pointerup');
    expect(removed).toContain('pointercancel');
    removeSpy.mockRestore();
  });

  it('blocks dragging and editing during constraint placement', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, constraintActive: true });

    expect(wrapper.find('[data-testid="dimension-drag-w"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-label-w"]').classes()).toContain(
      'pointer-events-none',
    );

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await flushPromises();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });

  it('emits round-corner picks for any entity and highlights the picked lines', () => {
    const wrapper = mountCanvas({
      roundCornerActive: true,
      roundCornerPicks: { first: 'ab', second: null },
    });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-testid="grid"]').element, 600, 500);

    expect(wrapper.emitted('round-corner-pick')).toEqual([['ab'], ['a']]);
    expect(wrapper.find('[data-kind="line"][data-entity-id="ab"]').classes()).toContain(
      'text-primary',
    );
    expect(wrapper.find('[data-kind="line"][data-entity-id="ab"]').attributes('stroke-width')).toBe(
      '3',
    );
    expect(wrapper.find('div').classes()).toContain('cursor-crosshair');
  });

  it('rings roundable corners and grows the point target only while the tool is active', async () => {
    const square = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
    ]);
    const wrapper = mountCanvas({ document: square, roundCornerActive: true });

    expect(
      wrapper
        .findAll('[data-testid="roundable-corner"]')
        .map((ring) => ring.attributes('data-roundable-corner')),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(wrapper.findAll('[data-testid="round-corner-point-target"]')).toHaveLength(4);

    await wrapper.setProps({ roundCornerActive: false });
    expect(wrapper.find('[data-testid="roundable-corner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="round-corner-point-target"]').exists()).toBe(false);
  });

  it('does not ring a corner that is already rounded', () => {
    const wrapper = mountCanvas({ document: roundedSquare(), roundCornerActive: true });

    expect(
      wrapper
        .findAll('[data-testid="roundable-corner"]')
        .map((ring) => ring.attributes('data-roundable-corner')),
    ).toEqual(['a', 'c', 'd']);
  });

  it('renders a live round preview from the pending radius', async () => {
    const square = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
    ]);
    const wrapper = mountCanvas({
      document: square,
      roundCornerActive: true,
      roundCornerPicks: { first: 'ab', second: 'bc' },
      cornerRoundPreviewRadius: 10,
    });

    expect(wrapper.find('[data-testid="corner-round-preview"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="corner-round-preview-line"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="corner-round-preview-arc"]').attributes('d')).toContain(
      'M 90 0',
    );

    await wrapper.setProps({ cornerRoundPreviewRadius: null });
    expect(wrapper.find('[data-testid="corner-round-preview"]').exists()).toBe(false);
  });

  it('shows feature dots without control points and handles for a selected round', () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });

    // Tangents and the centre are feature points now; Bézier controls stay hidden.
    expect(pointCircle(wrapper, 'r1:a').exists()).toBe(true);
    expect(pointCircle(wrapper, 'r1:c1').exists()).toBe(false);
    expect(pointCircle(wrapper, 'b').exists()).toBe(true);

    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="corner-round-handle-r1-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="corner-round-label-r1"] text').text()).toBe('R 10');
    expect(wrapper.find('[data-testid="corner-round-label-r1"]').attributes('aria-label')).toBe(
      'Corner radius 10 millimetres',
    );

    const arc = mountCanvas({ document, selectedEntityIds: ['r1:arc'] });
    expect(arc.find('[data-testid="corner-round-label-r1"]').exists()).toBe(true);
  });

  it('shows handles while a rounded entity is hovered', async () => {
    const wrapper = mountCanvas({ document: roundedSquare() });

    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(false);

    await wrapper.find('[data-kind="line"][data-entity-id="ab"]').trigger('pointerenter');
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(true);

    await wrapper.find('[data-kind="line"][data-entity-id="ab"]').trigger('pointerleave');
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(false);

    await wrapper.find('[data-kind="line"][data-entity-id="cd"]').trigger('pointerenter');
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(false);

    await wrapper.findAll('[data-kind="line"][data-entity-id="ab"]')[1]!.trigger('pointerenter');
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(true);

    await wrapper.find('[data-kind="curve"][data-entity-id="r1:arc"]').trigger('pointerenter');
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(true);
  });

  it('drags a tangent handle along its line and commits one radius command', async () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });
    const vp = fittedViewport(document);
    const target = worldToScreen(vp, { x: 80, y: 0 });

    down(wrapper.find('[data-testid="corner-round-handle-r1-0"] rect').element, 100, 100);
    move(target.x, target.y);
    await nextTick();

    expect(wrapper.find('[data-testid="corner-round-drag-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="corner-round-label-r1"] text').text()).toBe('R 20');

    up();
    await nextTick();

    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 20]]);
    expect(wrapper.find('[data-testid="corner-round-drag-preview"]').exists()).toBe(false);
  });

  it('clamps a drag to the maximum and can be cancelled', () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });
    const vp = fittedViewport(document);
    const far = worldToScreen(vp, { x: 100, y: 200 });

    down(wrapper.find('[data-testid="corner-round-handle-r1-1"] rect').element, 100, 100);
    move(far.x, far.y);
    up();

    expect(wrapper.emitted('set-corner-round-radius')?.[0]?.[1]).toBeCloseTo(99.999, 3);

    down(wrapper.find('[data-testid="corner-round-handle-r1-0"] rect').element, 100, 100);
    move(10, 10);
    window.dispatchEvent(new MouseEvent('pointercancel'));

    expect(wrapper.emitted('set-corner-round-radius')).toHaveLength(1);
    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(true);
  });

  it('edits the radius from the R label and keeps typos open', async () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();

    const input = wrapper.find('[data-testid="corner-round-editor"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('10');

    await input.setValue('12');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 12]]);
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="corner-round-editor"]').setValue('0');
    await wrapper.find('[data-testid="corner-round-editor"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(true);
    await wrapper.find('[data-testid="corner-round-editor"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 12]]);
  });

  it('commits a valid blur edit and discards an invalid one', async () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="corner-round-editor"]').setValue('15');
    await wrapper.find('[data-testid="corner-round-editor"]').trigger('blur');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 15]]);

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="corner-round-editor"]').setValue('nope');
    await wrapper.find('[data-testid="corner-round-editor"]').trigger('blur');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 15]]);
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
  });

  it('keeps the label press off the canvas, so the double-click still reaches the editor', async () => {
    const wrapper = mountCanvas({ document: roundedSquare(), selectedEntityIds: ['ab'] });
    const label = wrapper.find('[data-testid="corner-round-label-r1"]');

    down(label.element, 100, 100);
    expect(wrapper.emitted('marquee-change')).toBeUndefined();
    expect(wrapper.find('[data-testid="corner-round-label-r1"]').exists()).toBe(true);

    await label.trigger('dblclick');
    await flushPromises();

    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(true);
  });

  it('opens the radius editor by double-clicking the rounded arc', async () => {
    const wrapper = mountCanvas({ document: roundedSquare(), selectedEntityIds: ['r1:arc'] });

    await wrapper.find('[data-kind="curve"][data-entity-id="r1:arc"]').trigger('dblclick', {
      clientX: 300,
      clientY: 200,
    });
    await flushPromises();

    const input = wrapper.find('[data-testid="corner-round-editor"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('10');
    expect(input.attributes('style')).toContain('left: 300px');
    expect(input.attributes('style')).toContain('top: 200px');

    await input.setValue('12');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 12]]);

    // Removing the focused input makes the browser fire a trailing blur.
    await input.trigger('blur');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 12]]);
  });

  it('edits the round radius to a variable in the inline field', async () => {
    const wrapper = mountCanvas({
      document: {
        ...roundedSquare(),
        variables: [
          { slug: 'radius', name: 'Radius', unit: 'mm', value: 12 },
          { slug: 'seam', name: 'Seam', unit: 'mm', value: 6 },
        ],
      },
      selectedEntityIds: ['ab'],
    });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();

    const input = wrapper.find('[data-testid="corner-round-editor"]');
    await input.setValue('$radius');
    expect(wrapper.find('[data-testid="corner-round-variable-list"]').exists()).toBe(false);

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', { expr: '$radius' }]]);
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
  });

  it('offers variables while editing a round radius and inserts the token', async () => {
    const wrapper = mountCanvas({
      document: {
        ...roundedSquare(),
        variables: [
          { slug: 'radius', name: 'Radius', unit: 'mm', value: 12 },
          { slug: 'seam', name: 'Seam', unit: 'mm', value: 6 },
        ],
      },
      selectedEntityIds: ['ab'],
    });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();

    const input = wrapper.find('[data-testid="corner-round-editor"]');
    await input.setValue('$s');
    expect(wrapper.find('[data-testid="corner-round-variable-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="corner-round-variable-seam"]').text()).toContain('$seam');

    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect((input.element as HTMLInputElement).value).toBe('$seam');
    expect(wrapper.find('[data-testid="corner-round-variable-list"]').exists()).toBe(false);

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', { expr: '$seam' }]]);
  });

  it('opens a stored formula, keeps an unchanged radius and accepts a literal', async () => {
    const document: PatternDocument = {
      ...roundedSquare(),
      variables: [{ slug: 'seam', name: 'Seam', unit: 'mm', value: 12 }],
    };
    const formulaDoc = executeCommand(document, {
      id: 'set',
      type: 'set_corner_round_radius',
      params: { id: 'r1', radius: { expr: '$seam' } },
    }).document;
    const wrapper = mountCanvas({ document: formulaDoc, selectedEntityIds: ['ab'] });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    const input = wrapper.find('[data-testid="corner-round-editor"]');
    expect((input.element as HTMLInputElement).value).toBe('$seam');

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('set-corner-round-radius')).toBeUndefined();

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="corner-round-editor"]').setValue('12');
    await wrapper.find('[data-testid="corner-round-editor"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 12]]);
  });

  it('keeps an unresolved formula open and discards it on blur', async () => {
    const wrapper = mountCanvas({ document: roundedSquare(), selectedEntityIds: ['ab'] });

    await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
    await flushPromises();
    const input = wrapper.find('[data-testid="corner-round-editor"]');
    await input.setValue('$missing');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(true);
    expect(wrapper.emitted('set-corner-round-radius')).toBeUndefined();

    await input.trigger('blur');
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('set-corner-round-radius')).toBeUndefined();
  });

  it('ignores a double-click on a curve that is not a rounded corner', async () => {
    const wrapper = mountCanvas({ document: baseDoc });

    await wrapper.find('[data-kind="curve"][data-entity-id="curve"]').trigger('dblclick', {
      clientX: 100,
      clientY: 100,
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
  });

  it('ignores an arc double-click while a tool or constraint is picking', async () => {
    const document = roundedSquare();
    const arc = '[data-kind="curve"][data-entity-id="r1:arc"]';
    const drawing = mountCanvas({ document, tool: 'add_line' });
    const constraining = mountCanvas({ document, constraintActive: true });

    await drawing.find(arc).trigger('dblclick', { clientX: 300, clientY: 200 });
    await constraining.find(arc).trigger('dblclick', { clientX: 300, clientY: 200 });
    await flushPromises();

    expect(drawing.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
    expect(constraining.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
  });

  it('closes the radius editor when the tool or document changes', async () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });
    const open = async (): Promise<void> => {
      await wrapper.find('[data-testid="corner-round-label-r1"]').trigger('dblclick');
      await flushPromises();
      expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(true);
    };

    await open();
    await wrapper.setProps({ tool: 'add_line' });
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);

    await wrapper.setProps({ tool: 'select' });
    await open();
    await wrapper.setProps({ document: { ...document } });
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-editor"]').exists()).toBe(false);
  });

  it('omits handles and labels for an unresolvable round', async () => {
    const document = roundedSquare();
    const degenerate: PatternDocument = {
      ...document,
      entities: document.entities.map((entity) =>
        entity.id === 'a' ? { ...entity, x: 100, y: 0 } : entity,
      ),
    };
    const wrapper = mountCanvas({ document: degenerate, selectedEntityIds: ['ab'] });

    expect(wrapper.find('[data-testid="corner-round-handle-r1-0"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="corner-round-label-r1"]').exists()).toBe(false);
  });

  it('drops a drag preview when the round or its geometry disappears', async () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });

    down(wrapper.find('[data-testid="corner-round-handle-r1-0"] rect').element, 100, 100);
    await wrapper.setProps({ document: { ...document, cornerRounds: [] } });
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-drag-preview"]').exists()).toBe(false);
    window.dispatchEvent(new MouseEvent('pointercancel'));

    await wrapper.setProps({ document, selectedEntityIds: ['ab'] });
    down(wrapper.find('[data-testid="corner-round-handle-r1-0"] rect').element, 100, 100);
    await wrapper.setProps({
      document: {
        ...document,
        entities: document.entities.map((entity) =>
          entity.id === 'a' ? { ...entity, x: 100, y: 0 } : entity,
        ),
      },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-drag-preview"]').exists()).toBe(false);
    window.dispatchEvent(new MouseEvent('pointercancel'));
  });

  it('draws every piece loop and its allowance band', () => {
    const wrapper = mountCanvas({ document: pieceDoc, showAllowances: true });

    const band = wrapper.find('[data-piece-band="p1"]');
    expect(band.exists()).toBe(true);
    expect(band.classes()).toContain('fill-primary/10');
    expect(band.attributes('d')).toMatch(/^M .* Z$/);
    expect(wrapper.find('[data-piece-cut="p1"]').attributes('d')).toMatch(/^M .* Z$/);
    expect(wrapper.find('[data-piece-stitch="p1"]').attributes('d')).toMatch(/^M .* Z$/);
    expect(wrapper.findAll('[data-piece-fold="p1"]')).toHaveLength(1);

    const selected = mountCanvas({
      document: pieceDoc,
      selectedEntityIds: ['ab'],
      showAllowances: true,
    });
    expect(selected.find('[data-piece-band="p1"]').classes()).toContain('fill-primary/25');

    const pieceSelected = mountCanvas({ document: pieceDoc, selectedPieceId: 'p1' });
    expect(pieceSelected.find('[data-piece-band="p1"]').classes()).toContain('fill-primary/25');

    const otherSelected = mountCanvas({ document: pieceDoc, selectedPieceId: 'p2' });
    expect(otherSelected.find('[data-piece-band="p1"]').classes()).toContain('fill-primary/10');

    const hidden = mountCanvas({ document: pieceDoc, showAllowances: false });
    expect(hidden.find('[data-piece-band="p1"]').isVisible()).toBe(false);
  });

  it('flags a self-intersecting piece cut loop', () => {
    const wrapper = mountCanvas({ document: selfIntersectingPieceDoc, showAllowances: true });

    expect(wrapper.find('[data-piece-cut="p1"]').classes()).toContain('stroke-destructive');
  });

  it('skips a piece whose loop no longer resolves', () => {
    const wrapper = mountCanvas({
      document: {
        ...doc([pt('a', 0, 0), pt('b', 100, 0), ln('ab', 'a', 'b')]),
        pieces: [{ id: 'broken', edges: ['ab', 'missing', 'ghost'], allowances: [] }],
      },
    });

    expect(wrapper.find('[data-piece-cut="broken"]').exists()).toBe(false);
    expect(wrapper.find('[data-piece-stitch="broken"]').exists()).toBe(false);

    const dangling = mountCanvas({
      document: {
        ...pieceDoc,
        entities: pieceDoc.entities.filter((entity) => entity.id !== 'c'),
      },
    });

    expect(dangling.find('[data-piece-cut="p1"]').exists()).toBe(false);
    expect(dangling.find('[data-piece-stitch="p1"]').exists()).toBe(false);
  });

  it('renders a cut dimension with its derived label and read-only tooltip', () => {
    const wrapper = mountCanvas({ document: derivedPieceDoc });
    const label = wrapper.find('[data-testid="dimension-label-cut"]');

    expect(wrapper.find('[data-dimension-derived="cut"]').exists()).toBe(true);
    expect(label.attributes('data-dimension-derived')).toBe('cut');
    expect(label.find('text').attributes('data-dimension-state')).toBe('derived');
    expect(label.find('text').text()).toMatch(/ cut$/);
    expect(label.attributes('aria-label')).toContain('Cut dimension');
    expect(label.find('title').text()).toBe('Click to select, drag to reposition');
    expect(label.classes()).toContain('cursor-move');

    const hidden = mountCanvas({ document: derivedPieceDoc, showDimensions: false });
    expect(hidden.find('[data-testid="dimension-label-cut"]').exists()).toBe(false);
    expect(hidden.find('[data-testid="dimension-lines-cut"]').exists()).toBe(false);
  });

  it('hides a cut dimension whose anchors no longer resolve', () => {
    const wrapper = mountCanvas({
      document: {
        ...derivedPieceDoc,
        constraints: [
          {
            ...derivedConstraint,
            b: { edge: 'missing', at: 'end' },
          },
        ],
      },
    });

    expect(wrapper.find('[data-testid="dimension-lines-cut"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-label-cut"]').exists()).toBe(false);
  });

  it('drags a cut dimension from its strip and label', async () => {
    const wrapper = mountCanvas({ document: derivedPieceDoc });
    const viewport = fittedViewport(derivedPieceDoc);
    const target = worldToScreen(viewport, { x: 40, y: 70 });

    down(wrapper.find('[data-testid="dimension-drag-cut"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    const patches = wrapper.emitted('update-dimension') as
      [string, { offset: number }][] | undefined;
    expect(patches).toHaveLength(1);
    expect(patches![0]![0]).toBe('cut');
    expect(patches![0]![1].offset).toBeTypeOf('number');

    const fromLabel = mountCanvas({ document: derivedPieceDoc });
    down(fromLabel.find('[data-testid="dimension-label-cut"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();
    expect(fromLabel.emitted('update-dimension')).toHaveLength(1);
  });

  it('makes cut dimensions read-only while placing constraints or drawing', () => {
    const constrained = mountCanvas({ document: derivedPieceDoc, constraintActive: true });
    expect(constrained.find('[data-testid="dimension-drag-cut"]').exists()).toBe(false);
    expect(constrained.find('[data-testid="dimension-label-cut"]').classes()).toContain(
      'pointer-events-none',
    );
    expect(constrained.find('[data-testid="dimension-label-cut"] title').text()).toBe(
      'Cut dimension (read-only)',
    );

    const drawing = mountCanvas({ document: derivedPieceDoc, tool: 'add_line' });
    expect(drawing.find('[data-testid="dimension-label-cut"]').classes()).toContain(
      'pointer-events-none',
    );
  });

  it('highlights piece corners and straight edges while the cut dimension tool is active', () => {
    const document: PatternDocument = {
      ...pieceDoc,
      pieces: [...pieceDoc.pieces, { id: 'dangling', edges: ['missing'], allowances: [] }],
    };
    const wrapper = mountCanvas({ document, tool: 'cut_dimension' });

    expect(wrapper.findAll('[data-testid="loop-point-handle"]')).toHaveLength(7);
    expect(wrapper.findAll('[data-loop="stitch"]')).toHaveLength(4);
    // The allowance-free corner offers one anchor, so its cut ring collapses.
    expect(wrapper.findAll('[data-loop="cut"]')).toHaveLength(3);
    expect(
      wrapper.find('[data-loop="stitch"][data-loop-piece="p1"][data-loop-edge="ab"]').classes(),
    ).toContain('seamline-point-handle');
    expect(wrapper.findAll('[data-testid="cut-edge-handle"]')).toHaveLength(4);
    expect(wrapper.find('[data-cut-edge="ab"]').classes()).toContain('cut-edge-handle');

    const idle = mountCanvas({ document });
    expect(idle.find('[data-testid="loop-point-handle"]').exists()).toBe(false);
    expect(idle.find('[data-testid="cut-edge-handle"]').exists()).toBe(false);
  });

  it('places a stitch dimension between two seamline corners', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(pieceDoc);
    const grid = wrapper.find('[data-testid="grid"]').element;

    const cornerD = worldToScreen(viewport, { x: 0, y: 100 });
    down(grid, cornerD.x, cornerD.y);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick the second anchor on the same piece.',
    );

    const cornerC = worldToScreen(viewport, { x: 100, y: 100 });
    down(grid, cornerC.x, cornerC.y);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      true,
    );

    down(grid, 400, 300);
    await nextTick();
    expect(wrapper.emitted('add-cut-dimension')).toEqual([
      [
        expect.objectContaining({
          piece: 'p1',
          a: { edge: 'cd', at: 'end', loop: 'stitch' },
          b: { edge: 'bc', at: 'end', loop: 'stitch' },
        }),
      ],
    ]);
  });

  it('offers the cut anchor alongside the seamline corner an allowance offsets', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(pieceDoc);
    const grid = wrapper.find('[data-testid="grid"]').element;
    const cutPoint = pieceCutVertex(pieceDoc, pieceDoc.pieces[0]!, { edge: 'ab', at: 'end' })!;

    const cornerB = worldToScreen(viewport, cutPoint);
    down(grid, cornerB.x, cornerB.y);
    await nextTick();

    const cornerD = worldToScreen(viewport, { x: 0, y: 100 });
    down(grid, cornerD.x, cornerD.y);
    await nextTick();

    down(grid, 400, 300);
    await nextTick();
    expect(wrapper.emitted('add-cut-dimension')).toEqual([
      [
        expect.objectContaining({
          a: { edge: 'ab', at: 'end' },
          b: { edge: 'cd', at: 'end', loop: 'stitch' },
        }),
      ],
    ]);
  });

  it('does not highlight a curve edge as a straight pick target', () => {
    const document: PatternDocument = {
      ...pieceDoc,
      pieces: [
        {
          ...pieceDoc.pieces[0]!,
          edges: [...pieceDoc.pieces[0]!.edges, 'curve'],
        },
      ],
    };
    const withCurve: PatternDocument = {
      ...document,
      entities: [...document.entities, cv('curve', 'a', 'b', 'c', 'd')],
    };
    const wrapper = mountCanvas({ document: withCurve, tool: 'cut_dimension' });

    expect(wrapper.findAll('[data-testid="cut-edge-handle"]')).toHaveLength(4);
    expect(wrapper.find('[data-cut-edge="curve"]').exists()).toBe(false);
  });

  it('previews the cut span and emits a cut dimension from two corners', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(pieceDoc);

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of one piece.',
    );

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick the second anchor on the same piece.',
    );

    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();

    const preview = wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]');
    expect(preview.exists()).toBe(true);
    expect(preview.find('text').text()).toMatch(/ cut$/);
    expect(preview.find('text').text()).not.toContain('(');

    const target = worldToScreen(viewport, { x: 150, y: 50 });
    pointerMove(wrapper, target.x, target.y);
    await nextTick();

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    await nextTick();

    expect(wrapper.emitted('add-cut-dimension')).toEqual([
      [
        expect.objectContaining({
          piece: 'p1',
          a: { edge: 'ab', at: 'start' },
          b: { edge: 'bc', at: 'end' },
        }),
      ],
    ]);
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );
  });

  it('emits a cut dimension from a straight edge and a corner, in either order', async () => {
    const edgeThenCorner = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(edgeThenCorner.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    await nextTick();
    expect(
      edgeThenCorner.find('[data-testid="dimension-label-cut-dimension-preview"]').exists(),
    ).toBe(false);
    expect(edgeThenCorner.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick the second anchor on the same piece.',
    );

    down(pointCircle(edgeThenCorner, 'c').element, 300, 200);
    await nextTick();
    down(edgeThenCorner.find('[data-testid="grid"]').element, 400, 300);

    expect(edgeThenCorner.emitted('add-cut-dimension')).toEqual([
      [
        {
          piece: 'p1',
          a: { edge: 'ab', at: 'edge' },
          b: { edge: 'bc', at: 'end' },
          orientation: 'aligned',
          offset: 20,
        },
      ],
    ]);

    const cornerThenEdge = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(pointCircle(cornerThenEdge, 'a').element, 300, 200);
    down(cornerThenEdge.find('[data-kind="line"][data-entity-id="cd"]').element, 300, 200);
    await nextTick();
    expect(
      cornerThenEdge.find('[data-testid="dimension-label-cut-dimension-preview"]').exists(),
    ).toBe(true);

    down(cornerThenEdge.find('[data-testid="grid"]').element, 400, 300);

    expect(cornerThenEdge.emitted('add-cut-dimension')).toEqual([
      [
        {
          piece: 'p1',
          a: { edge: 'ab', at: 'start' },
          b: { edge: 'cd', at: 'edge' },
          orientation: 'aligned',
          offset: 20,
        },
      ],
    ]);
  });

  it('emits an aligned cut dimension between two parallel edges', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(wrapper.find('[data-kind="line"][data-entity-id="cd"]').element, 300, 200);
    await nextTick();

    // The pointer would infer the vertical axis for this span; an edge anchor
    // forces aligned.
    pointerMove(wrapper, 600, 300);
    await nextTick();
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);

    expect(wrapper.emitted('add-cut-dimension')).toEqual([
      [
        {
          piece: 'p1',
          a: { edge: 'ab', at: 'edge' },
          b: { edge: 'cd', at: 'edge' },
          orientation: 'aligned',
          offset: expect.any(Number),
        },
      ],
    ]);
  });

  it('rejects two non-parallel edges and keeps the first pick', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(wrapper.find('[data-kind="line"][data-entity-id="bc"]').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick two parallel edges.',
    );
    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();

    down(wrapper.find('[data-kind="line"][data-entity-id="cd"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      true,
    );
  });

  it('rejects cut picks outside a piece and clears on an empty click', async () => {
    const wrapper = mountCanvas({ document: baseDoc, tool: 'cut_dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of a piece.',
    );

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of a piece.',
    );

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of one piece.',
    );
    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();
  });

  it('rejects a second corner from another piece', async () => {
    const document: PatternDocument = {
      ...doc([
        ...pieceDoc.entities,
        pt('e', 200, 0),
        pt('f', 300, 0),
        pt('g', 300, 100),
        pt('h', 200, 100),
        ln('ef', 'e', 'f'),
        ln('fg', 'f', 'g'),
        ln('gh', 'g', 'h'),
        ln('he', 'h', 'e'),
      ]),
      pieces: [
        { id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] },
        { id: 'p2', edges: ['ef', 'fg', 'gh', 'he'], allowances: [] },
      ],
    };
    const wrapper = mountCanvas({ document, tool: 'cut_dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(pointCircle(wrapper, 'e').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Both anchors must belong to the same piece.',
    );
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );
    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();
  });

  it('keeps the first corner when the second pick repeats it, and clears on Escape', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'The anchors must be different.',
    );

    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      true,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of one piece.',
    );
    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();
  });

  it('rejects a curve as a straight edge anchor', async () => {
    const document: PatternDocument = {
      ...pieceDoc,
      entities: [...pieceDoc.entities, cv('curve', 'a', 'b', 'c', 'd')],
      pieces: [
        {
          ...pieceDoc.pieces[0]!,
          edges: [...pieceDoc.pieces[0]!.edges, 'curve'],
        },
      ],
    };
    const wrapper = mountCanvas({ document, tool: 'cut_dimension' });

    down(wrapper.find('[data-kind="curve"][data-entity-id="curve"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe('Pick a straight edge.');

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-kind="curve"][data-entity-id="curve"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe('Pick a straight edge.');
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );
    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();
  });

  it('rejects a circle even when a piece lists it as an edge', async () => {
    const document: PatternDocument = {
      ...doc([...pieceDoc.entities, ci('k', 'a', 'b')]),
      pieces: [{ id: 'p1', edges: ['k'], allowances: [] }],
    };
    const wrapper = mountCanvas({ document, tool: 'cut_dimension' });

    down(wrapper.find('[data-kind="circle"][data-entity-id="k"]').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of a piece.',
    );
  });

  it('cancels a cut placement whose piece disappears', async () => {
    const pending = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    down(pointCircle(pending, 'a').element, 300, 200);
    await pending.setProps({ document: { ...pieceDoc, pieces: [] } });
    expect(pending.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Piece no longer exists',
    );

    const placed = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    down(pointCircle(placed, 'a').element, 300, 200);
    down(pointCircle(placed, 'c').element, 300, 200);
    await nextTick();
    await placed.setProps({ document: { ...pieceDoc, pieces: [] } });
    await nextTick();
    expect(placed.find('[data-testid="cut-dimension-hint"]').text()).toBe('Piece no longer exists');
    expect(placed.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );
  });

  it('drops the cut preview when a loop edge disappears mid-placement', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(pieceDoc);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      true,
    );

    await wrapper.setProps({
      document: {
        ...pieceDoc,
        entities: pieceDoc.entities.filter((entity) => entity.id !== 'ab'),
      },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').exists()).toBe(
      false,
    );

    const target = worldToScreen(viewport, { x: 150, y: 50 });
    pointerMove(wrapper, target.x, target.y);
    await nextTick();

    expect(wrapper.emitted('add-cut-dimension')).toBeUndefined();
  });

  it('clears a pending cut pick when the tool changes', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').exists()).toBe(true);

    await wrapper.setProps({ tool: 'select' });
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').exists()).toBe(false);
  });

  it('drags a cut dimension with the cut dimension tool', async () => {
    const wrapper = mountCanvas({ document: derivedPieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(derivedPieceDoc);
    const target = worldToScreen(viewport, { x: 40, y: 70 });

    down(wrapper.find('[data-testid="dimension-drag-cut"]').element, 300, 200);
    move(target.x, target.y);
    await nextTick();
    up();

    expect(wrapper.emitted('update-dimension')).toHaveLength(1);
  });

  describe('dimension selection', () => {
    it('selects a dimension on a plain press and still drags it', async () => {
      const wrapper = mountCanvas({ document: dimensionDoc });
      const target = worldToScreen(fittedViewport(dimensionDoc), { x: 50, y: 40 });

      down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
      move(target.x, target.y);
      await nextTick();
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);
      expect(wrapper.emitted('update-dimension')).toEqual([['w', { offset: 40 }]]);
    });

    it('selects from the label without moving and emits no drag update', () => {
      const wrapper = mountCanvas({ document: dimensionDoc });

      down(wrapper.find('[data-testid="dimension-label-w"]').element, 300, 200);
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);
      expect(wrapper.emitted('update-dimension')).toBeUndefined();
    });

    it('replaces, adds, toggles off and subtracts without dragging', () => {
      const replace = mountCanvas({ document: dimensionDoc });
      down(replace.find('[data-testid="dimension-drag-w"]').element, 300, 200, 0, {
        ctrlKey: false,
      });
      expect(replace.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);

      const add = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['h'] });
      down(add.find('[data-testid="dimension-drag-w"]').element, 300, 200, 0, { ctrlKey: true });
      expect(add.emitted('update:selectedDimensionIds')).toEqual([[['h', 'w']]]);
      expect(add.emitted('update-dimension')).toBeUndefined();

      const toggleOff = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['h', 'w'] });
      down(toggleOff.find('[data-testid="dimension-drag-w"]').element, 300, 200, 0, {
        metaKey: true,
      });
      expect(toggleOff.emitted('update:selectedDimensionIds')).toEqual([[['h']]]);
      expect(toggleOff.emitted('update-dimension')).toBeUndefined();

      const subtract = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['h', 'w'] });
      down(subtract.find('[data-testid="dimension-drag-w"]').element, 300, 200, 0, {
        ctrlKey: true,
        altKey: true,
      });
      expect(subtract.emitted('update:selectedDimensionIds')).toEqual([[['h']]]);
      expect(subtract.emitted('update-dimension')).toBeUndefined();
    });

    it('never changes the selection with the dimension or cut dimension tool', () => {
      const dimension = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
      down(dimension.find('[data-testid="dimension-drag-w"]').element, 300, 200);
      up();
      expect(dimension.emitted('update:selectedDimensionIds')).toBeUndefined();

      const cut = mountCanvas({ document: derivedPieceDoc, tool: 'cut_dimension' });
      down(cut.find('[data-testid="dimension-drag-cut"]').element, 300, 200);
      up();
      expect(cut.emitted('update:selectedDimensionIds')).toBeUndefined();
    });

    it('selects nothing on a read-only canvas', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, readOnly: true });

      down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200);
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toBeUndefined();
      expect(wrapper.emitted('update-dimension')).toBeUndefined();
    });

    it('renders the halo and label outline only for selected dimensions', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });

      const selected = wrapper.find('[data-testid="dimension-lines-w"]');
      expect(selected.attributes('data-selected')).toBe('true');
      expect(selected.findAll('[data-testid="dimension-selection-halo"]')).toHaveLength(1);

      const unselected = wrapper.find('[data-testid="dimension-lines-h"]');
      expect(unselected.attributes('data-selected')).toBe('false');
      expect(unselected.findAll('[data-testid="dimension-selection-halo"]')).toHaveLength(0);

      const label = wrapper.find('[data-testid="dimension-label-w"]');
      expect(label.attributes('data-selected')).toBe('true');
      expect(label.find('rect').attributes('stroke-width')).toBe('2');
      expect(label.find('rect').classes()).toContain('stroke-primary');

      const otherLabel = wrapper.find('[data-testid="dimension-label-h"]');
      expect(otherLabel.attributes('data-selected')).toBe('false');
      expect(otherLabel.find('rect').attributes('stroke-width')).toBe('0');
      expect(otherLabel.find('rect').classes()).not.toContain('stroke-primary');
    });

    it('renders the selected treatment on a cut dimension and keeps its value read-only', () => {
      const wrapper = mountCanvas({ document: derivedPieceDoc, selectedDimensionIds: ['cut'] });

      const lines = wrapper.find('[data-testid="dimension-lines-cut"]');
      expect(lines.attributes('data-selected')).toBe('true');
      expect(lines.findAll('[data-testid="dimension-selection-halo"]')).toHaveLength(1);

      const label = wrapper.find('[data-testid="dimension-label-cut"]');
      expect(label.attributes('data-selected')).toBe('true');
      expect(label.find('rect').attributes('stroke-width')).toBe('2');
      expect(label.find('text').text()).toMatch(/ cut$/);
    });

    it('clears the dimension selection on a plain entity click', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });

      down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
    });

    it('clears the dimension selection on a modified entity click too', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });

      down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200, 0, {
        ctrlKey: true,
      });
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
    });

    it('clears the entity selection on a dimension click, whatever the modifier', () => {
      const wrapper = mountCanvas({
        document: dimensionDoc,
        selectedEntityIds: ['ab'],
        selectedDimensionIds: ['h'],
      });

      down(wrapper.find('[data-testid="dimension-drag-w"]').element, 300, 200, 0, {
        ctrlKey: true,
      });
      up();

      expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[[]]]);
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['h', 'w']]]);
    });

    it('clears both selections on a bare-canvas click', () => {
      const wrapper = mountCanvas({
        document: dimensionDoc,
        selectedDimensionIds: ['w'],
        selectedEntityIds: ['a'],
      });

      down(wrapper.find('[data-testid="grid"]').element, 500, 300);
      up();

      expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[[]]]);
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
    });

    it('clears the dimension selection on a touch tap and keeps it with a modifier', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });
      const grid = wrapper.find('[data-testid="grid"]').element;
      const tap = (init: MouseEventInit): void => {
        const event = new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 500,
          clientY: 300,
          button: 0,
          ...init,
        });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        grid.dispatchEvent(event);
      };

      tap({});
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
      up();

      tap({ ctrlKey: true });
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
      up();
    });

    it('clears the dimension selection when a marquee commits', () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: -5 });
      const end = worldToScreen(vp, { x: 105, y: 5 });

      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(end.x, end.y);
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
    });

    it('adds a dimension hit on a modified marquee and keeps the rest without hits', () => {
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: 15 });
      const end = worldToScreen(vp, { x: 105, y: 25 });

      const hits = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['h'] });
      down(hits.find('[data-testid="grid"]').element, start.x, start.y, 0, { ctrlKey: true });
      move(end.x, end.y);
      up();
      expect(hits.emitted('update:selectedDimensionIds')).toEqual([[['h', 'w']]]);

      const empty = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });
      const emptyStart = worldToScreen(vp, { x: 200, y: 200 });
      const emptyEnd = worldToScreen(vp, { x: 300, y: 300 });
      down(empty.find('[data-testid="grid"]').element, emptyStart.x, emptyStart.y, 0, {
        ctrlKey: true,
      });
      move(emptyEnd.x, emptyEnd.y);
      up();
      expect(empty.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);
    });

    it('selects a dimension with the marquee and keeps the entity hits', () => {
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: -5 });
      const end = worldToScreen(vp, { x: 105, y: 25 });

      const wrapper = mountCanvas({ document: dimensionDoc });
      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(end.x, end.y);
      up();

      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);
      expect(wrapper.emitted('update:selectedEntityIds')![0]![0]).toContain('ab');
    });

    it('previews a dimension hit with the halo at reduced opacity while latched', async () => {
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: 15 });
      const end = worldToScreen(vp, { x: 105, y: 25 });

      const wrapper = mountCanvas({ document: dimensionDoc });
      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(end.x, end.y);
      await nextTick();

      const preview = wrapper.find('[data-testid="dimension-marquee-preview"]');
      expect(preview.exists()).toBe(true);
      expect(preview.classes()).toContain('opacity-20');
      expect(wrapper.findAll('[data-testid="dimension-selection-halo"]')).toHaveLength(0);

      // Releasing commits exactly what the preview promised.
      up();
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['w']]]);
    });

    it('previews a derived cut dimension hit from the marquee too', async () => {
      const vp = fittedViewport(derivedPieceDoc);
      const start = worldToScreen(vp, { x: 200, y: 200 });
      const end = worldToScreen(vp, { x: -100, y: -100 });

      const wrapper = mountCanvas({ document: derivedPieceDoc });
      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(end.x, end.y);
      await nextTick();

      const preview = wrapper.findAll('[data-testid="dimension-marquee-preview"]');
      expect(preview).toHaveLength(1);
      expect(preview[0]!.classes()).toContain('opacity-20');

      up();
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[['cut']]]);
    });

    it('never previews a dimension while the View toggle hides dimensions', async () => {
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: 15 });
      const end = worldToScreen(vp, { x: 105, y: 25 });

      const wrapper = mountCanvas({ document: dimensionDoc, showDimensions: false });
      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(end.x, end.y);
      await nextTick();

      expect(wrapper.find('[data-testid="dimension-marquee-preview"]').exists()).toBe(false);
      up();
      expect(wrapper.emitted('update:selectedDimensionIds')).toEqual([[[]]]);
    });

    it('leaves the dimension selection untouched when a marquee is cancelled', async () => {
      const wrapper = mountCanvas({ document: dimensionDoc, selectedDimensionIds: ['w'] });
      const vp = fittedViewport(dimensionDoc);
      const start = worldToScreen(vp, { x: -5, y: -5 });

      down(wrapper.find('[data-testid="grid"]').element, start.x, start.y);
      move(start.x + 40, start.y + 40);
      await nextTick();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      await nextTick();

      expect(wrapper.emitted('update:selectedDimensionIds')).toBeUndefined();
    });
  });
});

describe('corner round feature points', () => {
  const featureIds = (wrapper: VueWrapper): (string | undefined)[] =>
    wrapper
      .find('[data-testid="corner-round-feature-layer"]')
      .findAll('[data-kind="point"]')
      .map((dot) => dot.attributes('data-entity-id'));

  it('renders the radius centre and both tangents as always-visible dots', () => {
    const wrapper = mountCanvas({ document: roundedSquare() });

    const layer = wrapper.find('[data-testid="corner-round-feature-layer"]');
    expect(layer.attributes('aria-hidden')).toBe('true');
    expect(featureIds(wrapper)).toEqual(['r1:center', 'r1:a', 'r1:b']);

    const centre = wrapper.find('[data-testid="corner-round-feature-r1:center"]');
    expect(centre.attributes('r')).toBe('3');
    expect(centre.attributes('cx')).toBe('90');
    expect(centre.attributes('cy')).toBe('10');
    expect(centre.classes()).toContain('fill-background');
    expect(centre.classes()).toContain('stroke-muted-foreground');

    // A drawing without rounds shows no feature dots.
    expect(featureIds(mountCanvas())).toEqual([]);
  });

  it('promotes the three dots of the selected round', () => {
    const wrapper = mountCanvas({ document: roundedSquare(), selectedEntityIds: ['r1:center'] });

    for (const dot of wrapper.findAll('[data-testid^="corner-round-feature-r1:"]')) {
      expect(dot.classes()).toContain('fill-primary');
    }
  });

  it('skips a round written before feature points and a dot whose point is gone', () => {
    const document = roundedSquare();
    const legacy: PatternDocument = {
      ...document,
      cornerRounds: [{ ...document.cornerRounds![0]!, center: undefined }],
    };
    expect(featureIds(mountCanvas({ document: legacy }))).toEqual(['r1:a', 'r1:b']);

    const missingTangent: PatternDocument = {
      ...document,
      entities: document.entities.filter((entity) => entity.id !== 'r1:a'),
    };
    expect(featureIds(mountCanvas({ document: missingTangent }))).toEqual(['r1:center', 'r1:b']);
  });

  it('selects a feature point without starting a drag', () => {
    const wrapper = mountCanvas({ document: roundedSquare() });

    down(wrapper.find('[data-testid="corner-round-feature-r1:center"]').element, 300, 200);
    move(320, 220);
    up();

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['r1:center']]]);
    expect(wrapper.emitted('move-point')).toBeUndefined();
  });

  it('snaps a new point to the radius centre', () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, tool: 'add_point' });
    const centre = getEntity(document, 'r1:center') as PointEntity;

    const screen = worldToScreen(fitToBounds(bounds(document)!, SIZE), centre);
    down(wrapper.find('svg').element, screen.x + 2, screen.y + 2);

    expect(wrapper.emitted('add-point')).toEqual([[centre.x, centre.y]]);
  });

  it('measures from the radius centre to another point', async () => {
    const wrapper = mountCanvas({ document: roundedSquare(), tool: 'dimension' });

    down(pointCircle(wrapper, 'r1:center').element, 300, 200);
    await nextTick();
    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);

    expect(wrapper.emitted('add-dimension')![0]![0]).toMatchObject({
      a: 'r1:center',
      b: 'a',
    });
  });
});

describe('dimension pick feedback', () => {
  const pieceDoc: PatternDocument = {
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
    ]),
    pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
  };

  it('pre-highlights eligible dimension anchors and the 12 px point target', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });

    const point = pointCircle(wrapper, 'a');
    hover(point.element);
    await nextTick();
    expect(point.attributes('data-dimension-candidate')).toBe('true');
    expect(point.classes()).toContain('fill-primary');
    expect(wrapper.find('[data-testid="dimension-candidate-ring"]').attributes('cx')).toBe('0');

    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    hover(line.element);
    await nextTick();
    expect(line.attributes('data-dimension-candidate')).toBe('true');
    expect(line.attributes('stroke-width')).toBe('3');
    expect(line.classes()).toContain('text-primary');
    expect(pointCircle(wrapper, 'a').attributes('data-dimension-candidate')).toBeUndefined();

    const curve = wrapper.find('[data-kind="curve"]');
    hover(curve.element);
    await nextTick();
    expect(curve.attributes('data-dimension-candidate')).toBeUndefined();

    const target = wrapper.findAll('[data-testid="dimension-hit-target"]')[0]!;
    expect(target.attributes('fill')).toBe('transparent');
    expect(target.attributes('data-kind')).toBe('point');
    expect(Number(target.attributes('r'))).toBeCloseTo(6 / fittedViewport(baseDoc).scale);
    expect(wrapper.findAll('[data-testid="dimension-hit-target"]')).toHaveLength(4);

    const select = mountCanvas();
    hover(pointCircle(select, 'a').element);
    await nextTick();
    expect(pointCircle(select, 'a').attributes('data-dimension-candidate')).toBeUndefined();
    expect(select.find('[data-testid="dimension-hit-target"]').exists()).toBe(false);

    const readOnly = mountCanvas({ tool: 'dimension', readOnly: true });
    hover(pointCircle(readOnly, 'a').element);
    await nextTick();
    expect(pointCircle(readOnly, 'a').attributes('data-dimension-candidate')).toBeUndefined();
    expect(readOnly.find('[data-testid="dimension-pick-first"]').exists()).toBe(false);
  });

  it('picks a point from the enlarged target and keeps its first-pick mark', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    const target = wrapper.findAll('[data-testid="dimension-hit-target"]')[0]!;

    down(target.element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick the second anchor.');
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);
    expect(pointCircle(wrapper, 'a').attributes('data-dimension-first-pick')).toBe('true');
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-primary');

    // Repeating the same anchor keeps the mark and asks again.
    down(target.element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick the second anchor.');

    // An invalid second pick keeps the mark and shows the existing hint.
    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe(
      'The point lies on the line.',
    );
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);
  });

  it('marks a line first pick with a midpoint tick and clears it on Escape', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]');

    hover(line.element);
    down(line.element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-pick-first"]').attributes('x1')).toBe('50');
    expect(line.attributes('data-dimension-first-pick')).toBe('true');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-hint"]').text()).toBe('Pick a point or a line.');
  });

  it('clears the first-pick mark on an empty click and on a tool change', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(false);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await wrapper.setProps({ tool: 'select' });
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(false);
  });

  it('draws the dimension ghost, follows the raw pointer, and snaps to a candidate', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    const viewport = fittedViewport(baseDoc);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    const free = worldToScreen(viewport, { x: 50, y: 50 });
    hover(wrapper.find('[data-testid="grid"]').element, free.x, free.y);
    await nextTick();
    const ghost = wrapper.find('[data-testid="dimension-rubber-band"]');
    expect(ghost.exists()).toBe(true);
    expect(Number(ghost.attributes('x1'))).toBeCloseTo(0);
    expect(Number(ghost.attributes('y1'))).toBeCloseTo(0);
    expect(Number(ghost.attributes('x2'))).toBeCloseTo(50);
    expect(Number(ghost.attributes('y2'))).toBeCloseTo(50);
    expect(wrapper.find('[data-testid="dimension-rubber-band-end"]').attributes('cx')).toBe(
      String(50),
    );

    hover(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').attributes('x2')).toBe('100');
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').attributes('y2')).toBe('100');
    expect(pointCircle(wrapper, 'c').attributes('data-dimension-candidate')).toBe('true');

    // An invalid target does not highlight or snap; the ghost uses the pointer.
    const invalid = worldToScreen(viewport, { x: 30, y: 30 });
    hover(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, invalid.x, invalid.y);
    await nextTick();
    expect(
      wrapper
        .find('[data-kind="line"][data-entity-id="ab"]')
        .attributes('data-dimension-candidate'),
    ).toBeUndefined();
    expect(
      Number(wrapper.find('[data-testid="dimension-rubber-band"]').attributes('x2')),
    ).toBeCloseTo(30);

    // The second pick ends the ghost and starts the existing placement preview.
    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-pick-second"]').exists()).toBe(true);
  });

  it('starts the ghost at a line midpoint and drops it when the anchor disappears', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    const viewport = fittedViewport(baseDoc);

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    const target = worldToScreen(viewport, { x: 50, y: 40 });
    hover(wrapper.find('[data-testid="grid"]').element, target.x, target.y);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').attributes('x1')).toBe('50');
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').attributes('y1')).toBe('0');

    await wrapper.setProps({
      document: { ...baseDoc, entities: baseDoc.entities.filter((entity) => entity.id !== 'ab') },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(false);
  });

  it('clears the hover and ghost on pointer leave but keeps the pending pick', async () => {
    const wrapper = mountCanvas({ tool: 'dimension' });
    const viewport = fittedViewport(baseDoc);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    const target = worldToScreen(viewport, { x: 50, y: 50 });
    hover(wrapper.find('[data-testid="grid"]').element, target.x, target.y);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(true);

    wrapper.find('svg').element.dispatchEvent(new MouseEvent('pointerleave'));
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-pick-first"]').exists()).toBe(true);

    hover(wrapper.find('[data-testid="grid"]').element, target.x, target.y);
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-rubber-band"]').exists()).toBe(true);
  });

  it('shows the cut idle cue and highlights corners and piece edges only', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(pieceDoc);

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of one piece.',
    );

    const corner = wrapper.find('[data-testid="loop-point-handle"]');
    const cornerScreen = worldToScreen(viewport, {
      x: Number(corner.attributes('cx')),
      y: Number(corner.attributes('cy')),
    });
    hover(wrapper.find('[data-testid="grid"]').element, cornerScreen.x, cornerScreen.y);
    await nextTick();
    expect(corner.attributes('data-cut-dimension-candidate')).toBe('true');
    expect(corner.attributes('stroke-width')).toBe('2');

    const edge = wrapper.find('[data-kind="line"][data-entity-id="ab"]');
    hover(
      edge.element,
      worldToScreen(viewport, { x: 50, y: 0 }).x,
      worldToScreen(viewport, { x: 50, y: 0 }).y,
    );
    await nextTick();
    expect(edge.attributes('data-cut-dimension-candidate')).toBe('true');
    expect(edge.attributes('stroke-width')).toBe('3');
    expect(corner.attributes('data-cut-dimension-candidate')).toBeUndefined();

    const nonPiece = mountCanvas({ tool: 'cut_dimension' });
    const line = nonPiece.find('[data-kind="line"][data-entity-id="ab"]');
    hover(line.element);
    await nextTick();
    expect(line.attributes('data-cut-dimension-candidate')).toBeUndefined();
  });

  it('marks a cut first corner, draws its ghost and snaps only to the same piece', async () => {
    const twoPieceDoc: PatternDocument = {
      ...doc([
        ...pieceDoc.entities,
        pt('e', 200, 0),
        pt('f', 300, 0),
        pt('g', 300, 100),
        pt('h', 200, 100),
        ln('ef', 'e', 'f'),
        ln('fg', 'f', 'g'),
        ln('gh', 'g', 'h'),
        ln('he', 'h', 'e'),
      ]),
      pieces: [
        { id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] },
        { id: 'p2', edges: ['ef', 'fg', 'gh', 'he'], allowances: [] },
      ],
    };
    const wrapper = mountCanvas({ document: twoPieceDoc, tool: 'cut_dimension' });
    const viewport = fittedViewport(twoPieceDoc);

    down(pointCircle(wrapper, 'a').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-pick-first"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick the second anchor on the same piece.',
    );

    const target = worldToScreen(viewport, { x: 50, y: 50 });
    hover(wrapper.find('[data-testid="grid"]').element, target.x, target.y);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').attributes('x1')).toBe('0');
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').attributes('y1')).toBe('0');

    hover(pointCircle(wrapper, 'e').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').attributes('x2')).not.toBe(
      '200',
    );
    expect(pointCircle(wrapper, 'e').attributes('data-cut-dimension-candidate')).toBeUndefined();

    hover(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').attributes('x2')).toBe('100');
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').attributes('y2')).toBe('100');
    expect(pointCircle(wrapper, 'c').attributes('data-cut-dimension-candidate')).toBe('true');

    down(pointCircle(wrapper, 'c').element, 300, 200);
    await nextTick();
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cut-dimension-pick-second"]').exists()).toBe(true);
  });

  it('does not draw cut feedback on a read-only canvas', async () => {
    const wrapper = mountCanvas({ document: pieceDoc, tool: 'cut_dimension', readOnly: true });

    hover(pointCircle(wrapper, 'a').element);
    await nextTick();
    expect(pointCircle(wrapper, 'a').attributes('data-cut-dimension-candidate')).toBeUndefined();
    expect(wrapper.find('[data-testid="cut-dimension-pick-first"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cut-dimension-rubber-band"]').exists()).toBe(false);
  });
});

describe('containers, annotation text and move mode', () => {
  const containerDoc = (): PatternDocument => ({
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
      { id: 'mark', kind: 'line', start: 'a', end: 'b', role: 'annotation' },
      {
        id: 't1',
        kind: 'text',
        piece: 'p1',
        anchor: 'a',
        content: 'velcro',
        leader: 'b',
        rotation: 0,
        fontSize: 6,
      },
    ]),
    pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
  });

  function screenIn(document: PatternDocument, world: Vec2): Vec2 {
    return worldToScreen(fitToBounds(bounds(document)!, SIZE), world);
  }

  it('renders the label, its rule, leader and arrow, and the active-piece badge', () => {
    const document = containerDoc();
    const wrapper = mountCanvas({ document, activePieceId: 'p1' });

    expect(wrapper.find('[data-testid="annotation-layer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-t1"]').text()).toBe('velcro');
    expect(wrapper.find('[data-testid="text-underline-t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-leader-t1"]').exists()).toBe(true);
    const arrow = wrapper.find('[data-testid="text-arrow-t1"]');
    expect(arrow.element.tagName.toLowerCase()).toBe('polygon');
    expect(arrow.classes()).toContain('fill-annotation');
    expect(arrow.attributes('points')!.split(' ')).toHaveLength(3);

    // A label is selected through its whole rotated box, not only its glyphs.
    const hit = wrapper.find('[data-testid="text-hit-t1"]');
    expect(hit.attributes('data-entity-id')).toBe('t1');
    expect(hit.attributes('data-kind')).toBe('text');
    expect(hit.attributes('pointer-events')).toBe('all');
    expect(hit.classes()).toContain('cursor-move');
    expect(wrapper.find('[data-testid="active-piece-badge"]').text()).toContain('Piece 1');
    expect(wrapper.find('[data-testid="active-piece-badge"]').text()).toContain('cut loop');
  });

  it('drops the shaft when the head fills a short leader', () => {
    const document: PatternDocument = {
      ...containerDoc(),
      entities: [
        pt('a', 0, 0),
        pt('near', 2, 2, false),
        { id: 't1', kind: 'text', piece: 'p1', anchor: 'a', content: 'x', leader: 'near' },
      ],
    };
    const wrapper = mountCanvas({ document });

    expect(wrapper.find('[data-testid="text-underline-t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-leader-t1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="text-arrow-t1"]').exists()).toBe(true);
  });

  it('styles annotation geometry distinctly and keeps guides muted', () => {
    const document = containerDoc();
    const wrapper = mountCanvas({ document });

    expect(wrapper.find('[data-entity-id="mark"]').classes()).toContain('text-annotation');
    expect(wrapper.find('[data-entity-id="mark"]').attributes('stroke-dasharray')).toBe('4 4');
  });

  it('emits one move-piece translation on release', () => {
    const document = containerDoc();
    const wrapper = mountCanvas({ document, activePieceId: 'p1', moveMode: true });
    const start = screenIn(document, { x: 0, y: 0 });
    const end = screenIn(document, { x: 50, y: 30 });

    down(wrapper.find('svg').element, start.x, start.y);
    move(end.x, end.y);
    up();

    const [translation] = wrapper.emitted('move-piece')!;
    expect(translation).toHaveLength(2);
    expect(translation![0]).toBeGreaterThan(0);
    expect(translation![1]).toBeGreaterThan(0);
  });

  it('refuses a drafting pick on another piece and activates it on select', () => {
    const document: PatternDocument = {
      ...containerDoc(),
      pieces: [
        { id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] },
        { id: 'p2', edges: ['xy'], allowances: [] },
      ],
      entities: [
        ...containerDoc().entities,
        pt('x', 200, 200),
        pt('y', 300, 200),
        ln('xy', 'x', 'y'),
      ].map((entity) => ({
        ...entity,
        piece:
          entity.kind === 'line' || entity.kind === 'point'
            ? entity.id === 'xy' || entity.id === 'x' || entity.id === 'y'
              ? 'p2'
              : 'p1'
            : entity.piece,
      })),
    };
    const point = screenIn(document, { x: 200, y: 200 });

    const drafting = mountCanvas({ document, tool: 'add_line', activePieceId: 'p1' });
    down(drafting.find('[data-kind="point"][data-entity-id="x"]').element, point.x, point.y);
    expect(drafting.emitted('cross-piece')).toEqual([['p2']]);

    const selecting = mountCanvas({ document, tool: 'select', activePieceId: 'p1' });
    down(selecting.find('[data-kind="point"][data-entity-id="x"]').element, point.x, point.y);
    expect(selecting.emitted('activate-piece')).toEqual([['p2']]);
  });

  it('places annotation text with the Text tool', () => {
    const document = containerDoc();
    const wrapper = mountCanvas({ document, tool: 'add_text', activePieceId: 'p1' });
    const point = screenIn(document, { x: 50, y: 50 });

    down(wrapper.find('svg').element, point.x, point.y);
    expect(wrapper.emitted('add-text')).toHaveLength(1);
  });
});

describe('annotation text defaults and multi-piece move preview', () => {
  const bareText = (overrides: Record<string, unknown> = {}): PatternDocument => ({
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      { id: 't1', kind: 'text', anchor: 'a', content: 'x', ...overrides },
      { id: 'sorted', kind: 'text', anchor: 'a', content: 'right', alignment: 'right' },
      { id: 'orphan', kind: 'text', anchor: 'missing', content: 'lost' },
      { id: 'led', kind: 'text', anchor: 'b', content: 'lead', leader: 'mark' },
      ln('mark', 'a', 'b'),
    ]),
  });

  it('fills text defaults and skips an unresolvable anchor', () => {
    const wrapper = mountCanvas({ document: bareText() });

    expect(wrapper.find('[data-testid="text-t1"]').text()).toBe('x');
    expect(wrapper.find('[data-testid="text-t1"]').attributes('font-size')).toBe('10');
    expect(wrapper.find('[data-testid="text-sorted"]').attributes('text-anchor')).toBe('end');
    expect(wrapper.find('[data-testid="text-orphan"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="text-leader-led"]').exists()).toBe(false);
  });

  it('previews only the active piece and ignores a zero-distance move', async () => {
    const document: PatternDocument = {
      ...doc([
        pt('a', 0, 0),
        pt('b', 100, 0),
        pt('c', 100, 100),
        pt('d', 0, 100),
        ln('ab', 'a', 'b'),
        ln('bc', 'b', 'c'),
        ln('cd', 'c', 'd'),
        ln('da', 'd', 'a'),
        pt('e', 200, 0),
        pt('f', 300, 0),
        pt('g', 300, 100),
        pt('h', 200, 100),
        ln('ef', 'e', 'f'),
        ln('fg', 'f', 'g'),
        ln('gh', 'g', 'h'),
        ln('he', 'h', 'e'),
      ]),
      pieces: [
        { id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] },
        { id: 'p2', edges: ['ef', 'fg', 'gh', 'he'], allowances: [] },
      ],
    };
    const wrapper = mountCanvas({ document, activePieceId: 'p1', moveMode: true });
    const screen = worldToScreen(fitToBounds(bounds(document)!, SIZE), { x: 0, y: 0 });

    down(wrapper.find('svg').element, screen.x, screen.y);
    move(screen.x + 40, screen.y + 20);
    await nextTick();
    expect(wrapper.find('[data-piece-cut="p1"]').attributes('transform')).toContain('translate');
    up();

    down(wrapper.find('svg').element, screen.x, screen.y);
    up();
    expect(wrapper.emitted('move-piece')).toHaveLength(1);
  });
});

describe('annotation defaults', () => {
  const document = (): PatternDocument => ({
    ...doc([
      { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false, role: 'annotation' },
      { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
      { id: 'c', kind: 'text', anchor: 'b', content: 'mid', alignment: 'center' },
    ]),
  });

  it('styles an annotation point with a hollow handle', () => {
    const wrapper = mountCanvas({ document: document() });
    expect(wrapper.find('[data-kind="point"][data-entity-id="a"]').classes()).toContain(
      'stroke-annotation',
    );
  });

  it('centres a label with text-anchor middle', () => {
    const wrapper = mountCanvas({ document: document() });
    expect(wrapper.find('[data-testid="text-c"]').attributes('text-anchor')).toBe('middle');
  });
});

describe('annotation text with a leader', () => {
  const document = (): PatternDocument => ({
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
    ]),
    pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
  });

  function at(doc: PatternDocument, world: Vec2): Vec2 {
    return worldToScreen(fitToBounds(bounds(doc)!, SIZE), world);
  }

  it('shows a ghost label after the first click and commits on the second', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const first = at(doc, { x: 40, y: 40 });

    down(wrapper.find('svg').element, first.x, first.y);
    await nextTick();

    expect(wrapper.emitted('add-text')).toBeUndefined();
    expect(wrapper.find('[data-testid="text-leader-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-preview"]').text()).toBe('Text');
    expect(wrapper.find('[data-testid="text-leader-hint"]').text()).toBe('Click the arrow target.');

    const target = at(doc, { x: 100, y: 0 });
    pointerMove(wrapper, target.x, target.y);
    await nextTick();

    expect(wrapper.find('[data-testid="text-leader-preview-shaft"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-leader-preview-arrow"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="text-leader-hint"]').exists()).toBe(false);

    down(wrapper.find('svg').element, target.x, target.y);
    await nextTick();

    expect(wrapper.emitted('add-text')).toEqual([
      [
        { kind: 'new', x: 40, y: 40 },
        { kind: 'point', id: 'b' },
      ],
    ]);
    expect(wrapper.find('[data-testid="text-leader-preview"]').exists()).toBe(false);
  });

  it('refuses the anchor itself and stays armed', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const first = at(doc, { x: 40, y: 40 });

    down(wrapper.find('svg').element, first.x, first.y);
    down(wrapper.find('svg').element, first.x, first.y);
    await nextTick();

    expect(wrapper.emitted('add-text')).toBeUndefined();
    expect(wrapper.find('[data-testid="text-leader-hint"]').text()).toBe(
      'The arrow needs a different point.',
    );
    expect(wrapper.find('[data-testid="text-leader-preview"]').exists()).toBe(true);
  });

  it('refuses a target inside the label box', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const first = at(doc, { x: 40, y: 40 });
    const inside = at(doc, { x: 45, y: 35 });

    down(wrapper.find('svg').element, first.x, first.y);
    down(wrapper.find('svg').element, inside.x, inside.y);
    await nextTick();

    expect(wrapper.emitted('add-text')).toBeUndefined();
    expect(wrapper.find('[data-testid="text-leader-hint"]').text()).toBe(
      'Choose a point outside the label.',
    );
  });

  it('cancels the pending gesture on Escape', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const first = at(doc, { x: 40, y: 40 });

    down(wrapper.find('svg').element, first.x, first.y);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();

    expect(wrapper.find('[data-testid="text-leader-preview"]').exists()).toBe(false);
    expect(wrapper.emitted('add-text')).toBeUndefined();
  });

  it('cancels the pending gesture on a tool change', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const first = at(doc, { x: 40, y: 40 });

    down(wrapper.find('svg').element, first.x, first.y);
    await wrapper.setProps({ tool: 'select' });
    await nextTick();

    expect(wrapper.find('[data-testid="text-leader-preview"]').exists()).toBe(false);
  });

  it('creates a dedicated anchor even when the click lands on a point', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'add_text_leader', activePieceId: 'p1' });
    const anchor = at(doc, { x: 0, y: 0 });
    const target = at(doc, { x: 100, y: 0 });

    down(wrapper.find('[data-kind="point"][data-entity-id="a"]').element, anchor.x, anchor.y);
    down(wrapper.find('[data-kind="point"][data-entity-id="b"]').element, target.x, target.y);
    await nextTick();

    expect(wrapper.emitted('add-text')).toEqual([
      [
        { kind: 'new', x: 0, y: 0 },
        { kind: 'point', id: 'b' },
      ],
    ]);
  });
});

describe('annotation label and target movement', () => {
  const document = (): PatternDocument =>
    doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      {
        id: 't1',
        kind: 'text',
        piece: 'p1',
        anchor: 'a',
        content: 'velcro',
        leader: 'b',
      },
    ]);

  function at(doc: PatternDocument, world: Vec2): Vec2 {
    return worldToScreen(fitToBounds(bounds(doc)!, SIZE), world);
  }

  it('drags the label anchor and leaves the arrow target alone', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'select' });
    const start = at(doc, { x: 5, y: -5 });
    const end = at(doc, { x: 50, y: 30 });

    down(wrapper.find('[data-testid="text-hit-t1"]').element, start.x, start.y);
    move(end.x, end.y);
    up();

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['t1']]]);
    expect(wrapper.emitted('move-point')).toEqual([['a', 50, 30]]);
  });

  it('selects without dragging on a modified click', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'select' });
    const start = at(doc, { x: 5, y: -5 });

    down(wrapper.find('[data-testid="text-hit-t1"]').element, start.x, start.y, 0, {
      ctrlKey: true,
    });
    move(start.x + 40, start.y + 20);
    up();

    expect(wrapper.emitted('move-point')).toBeUndefined();
    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['t1']]]);
  });

  it('follows a target drag live while the label stays put', async () => {
    const doc = document();
    const wrapper = mountCanvas({ document: doc, tool: 'select' });
    const before = wrapper.find('[data-testid="text-arrow-t1"]').attributes('points');
    const start = at(doc, { x: 100, y: 0 });
    const end = at(doc, { x: 60, y: 60 });

    down(wrapper.find('[data-kind="point"][data-entity-id="b"]').element, start.x, start.y);
    move(end.x, end.y);
    await nextTick();

    expect(wrapper.find('[data-testid="text-arrow-t1"]').attributes('points')).not.toBe(before);
    expect(wrapper.find('[data-testid="text-t1"]').attributes('transform')).toBe(
      'translate(0 0) rotate(0)',
    );

    up();
    expect(wrapper.emitted('move-point')).toEqual([['b', 60, 60]]);
  });
});

describe('midpoint magnet', () => {
  const nearMidpoint = () => screenAt({ x: 50, y: 1 });
  const lineElement = (wrapper: VueWrapper) =>
    wrapper.find('[data-kind="line"][data-entity-id="ab"]');

  it('marks the visible middle ahead of point-on-line and offers the hint', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = nearMidpoint();

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();

    expect(wrapper.find('[data-testid="midpoint-hint"]').text()).toBe(
      "Click to create a point at this line's midpoint.",
    );
    expect(wrapper.find('[data-testid="midpoint-marker"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="point-on-line-hint"]').exists()).toBe(false);
    expect(lineElement(wrapper).classes()).toContain('text-primary');
    expect(lineElement(wrapper).attributes('stroke-width')).toBe('3');
  });

  it('emits the midpoint gesture instead of a point-on-line or free point', () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = nearMidpoint();

    down(lineElement(wrapper).element, at.x, at.y);

    expect(wrapper.emitted('add-point-midpoint')).toEqual([['ab']]);
    expect(wrapper.emitted('add-point-on-line')).toBeUndefined();
    expect(wrapper.emitted('add-point')).toBeUndefined();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);
  });

  it('keeps the existing point snap and the point-on-line fallback', () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const onPoint = screenAt({ x: 1, y: 1 });
    const offZone = screenAt({ x: 20, y: 0 });

    down(lineElement(wrapper).element, onPoint.x, onPoint.y);
    expect(wrapper.emitted('add-point')).toEqual([[0, 0]]);
    expect(wrapper.emitted('add-point-midpoint')).toBeUndefined();

    down(lineElement(wrapper).element, offZone.x, offZone.y);
    expect(wrapper.emitted('add-point-on-line')).toHaveLength(1);
  });

  it('starts a line from a midpoint endpoint', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });
    const at = nearMidpoint();

    down(lineElement(wrapper).element, at.x, at.y);
    const empty = screenAt({ x: 20, y: 60 });
    down(wrapper.find('[data-testid="grid"]').element, empty.x, empty.y);

    const [start, end] = wrapper.emitted('add-line')![0]!;
    expect(start).toMatchObject({ kind: 'midpoint', lineId: 'ab' });
    expect(end).toMatchObject({ kind: 'new' });
  });

  it('clears the signal on pointer leave, Escape, tool change and a document edit', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = nearMidpoint();

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(true);

    wrapper.find('svg').element.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();
    await wrapper.setProps({ tool: 'select' });
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);
  });

  it('re-resolves the candidate when the document changes', async () => {
    const wrapper = mountCanvas({ tool: 'add_point' });
    const at = nearMidpoint();

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(true);

    await wrapper.setProps({ document: doc([...baseDoc.entities, pt('extra', 300, 300)]) });
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(true);

    await wrapper.setProps({
      document: doc(baseDoc.entities.filter((entity) => entity.id !== 'ab')),
    });
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="midpoint-marker"]').exists()).toBe(false);
  });

  it('shows and dispatches nothing on a read-only document', async () => {
    const wrapper = mountCanvas({ tool: 'add_point', readOnly: true });
    const at = nearMidpoint();

    hover(lineElement(wrapper).element, at.x, at.y);
    await nextTick();
    expect(wrapper.find('[data-testid="midpoint-hint"]').exists()).toBe(false);

    down(lineElement(wrapper).element, at.x, at.y);
    expect(wrapper.emitted('add-point-midpoint')).toBeUndefined();
  });
});

describe('allowance band regions', () => {
  /** A cut square piece with a 10 mm allowance on every edge. */
  function bandPiece(rounded = false): PatternDocument {
    const square = doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
    ]);
    const withPiece = executeCommand(square, {
      id: 'piece-1',
      type: 'create_piece',
      params: {},
    }).document;
    const looped = executeCommand(withPiece, {
      id: 'loop',
      type: 'set_piece_loop',
      params: {
        piece: 'piece-1',
        edges: ['ab', 'bc', 'cd', 'da'],
        allowance: { width: 10, kind: 'seam' },
      },
    }).document;
    if (!rounded) return looped;
    return executeCommand(looped, {
      id: 'round-1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'bc', radius: 10 },
    }).document;
  }

  function regionCentre(document: PatternDocument): { point: Vec2; target: BandTarget } {
    const piece = document.pieces[0]!;
    const region = pieceBandRegions(document, piece)[0]!;
    const point = {
      x: region.polygon.reduce((sum, p) => sum + p.x, 0) / region.polygon.length,
      y: region.polygon.reduce((sum, p) => sum + p.y, 0) / region.polygon.length,
    };
    return { point, target: region.target };
  }

  function screenOf(document: PatternDocument, point: Vec2): Vec2 {
    return worldToScreen(fittedViewport(document), point);
  }

  function downTouch(el: Element, x: number, y: number): void {
    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    el.dispatchEvent(event);
  }

  it('draws one path per region, hidden until the piece is hovered', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const regions = pieceBandRegions(document, document.pieces[0]!);

    expect(regions.length).toBeGreaterThan(1);
    expect(wrapper.findAll('[data-region]')).toHaveLength(regions.length);
    for (const path of wrapper.findAll('[data-region]')) {
      expect(path.classes()).toContain('stroke-transparent');
    }
  });

  it('reveals the boundaries while the pointer is inside the piece', async () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const centre = screenOf(document, { x: 50, y: 50 });

    pointerMove(wrapper, centre.x, centre.y);
    await nextTick();

    expect(wrapper.find('[data-region]').classes()).toContain('stroke-primary/40');
  });

  it('selects a region on a click and clears the entity selection', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });
    const { point, target } = regionCentre(document);
    const screen = screenOf(document, point);

    down(wrapper.find('svg').element, screen.x, screen.y);
    up();

    expect(wrapper.emitted('update:selectedEntityIds')?.at(-1)).toEqual([[]]);
    expect(wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)).toEqual([[target]]);
  });

  it('keeps a drag inside the band a marquee', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const { point } = regionCentre(document);
    const screen = screenOf(document, point);

    down(wrapper.find('svg').element, screen.x, screen.y);
    move(screen.x + 60, screen.y + 60);
    up();

    // The marquee clears the region selection; it never picks one.
    expect(wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)).toEqual([[]]);
    expect(wrapper.emitted('marquee-change')?.at(-1)).toEqual([false]);
  });

  it('picks a region on a touch tap instead of panning', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const { point, target } = regionCentre(document);
    const screen = screenOf(document, point);

    downTouch(wrapper.find('svg').element, screen.x, screen.y);
    // The tap still starts a pan; releasing without moving picks the region.
    up();

    expect(wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)).toEqual([[target]]);
  });

  it('adds and subtracts regions with the selection modifiers', async () => {
    const document = bandPiece(true);
    const regions = pieceBandRegions(document, document.pieces[0]!);
    const first = regions[0]!;
    const second = regions[1]!;
    const centre = (region: (typeof regions)[number]) => ({
      x: region.polygon.reduce((sum, p) => sum + p.x, 0) / region.polygon.length,
      y: region.polygon.reduce((sum, p) => sum + p.y, 0) / region.polygon.length,
    });
    const emitted = (wrapper: VueWrapper) =>
      wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)?.[0] as BandTarget[];

    const wrapper = mountCanvas({ document, selectedAllowanceTargets: [first.target] });
    const svg = wrapper.find('svg').element;
    const secondScreen = screenOf(document, centre(second));
    const firstScreen = screenOf(document, centre(first));

    down(svg, secondScreen.x, secondScreen.y, 0, { ctrlKey: true });
    up();
    expect(emitted(wrapper)).toEqual([first.target, second.target]);

    // Ctrl-clicking a selected region toggles it out of the set.
    await wrapper.setProps({ selectedAllowanceTargets: [first.target, second.target] });
    down(svg, secondScreen.x, secondScreen.y, 0, { ctrlKey: true });
    up();
    expect(emitted(wrapper)).toEqual([first.target]);

    await wrapper.setProps({ selectedAllowanceTargets: [first.target] });
    down(svg, firstScreen.x, firstScreen.y, 0, { ctrlKey: true, shiftKey: true });
    up();
    expect(emitted(wrapper)).toEqual([]);
  });

  it('ignores regions while the allowance layer is hidden', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document, showAllowances: false });
    const { point } = regionCentre(document);
    const screen = screenOf(document, point);

    down(wrapper.find('svg').element, screen.x, screen.y);
    up();

    // The click clears the selection instead of picking the invisible region.
    expect(wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)).toEqual([[]]);
  });

  it('pans instead of picking when a touch drag starts in a region', () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const { point, target } = regionCentre(document);
    const screen = screenOf(document, point);

    downTouch(wrapper.find('svg').element, screen.x, screen.y);
    move(screen.x + 60, screen.y + 60);
    up();

    expect(wrapper.emitted('update:selectedAllowanceTargets')?.at(-1)).not.toEqual([[target]]);
  });

  it('highlights the region under the pointer and clears it with the tool', async () => {
    const document = bandPiece(true);
    const wrapper = mountCanvas({ document });
    const { point } = regionCentre(document);
    const centre = screenOf(document, point);

    pointerMove(wrapper, centre.x, centre.y);
    await nextTick();
    expect(
      wrapper.findAll('[data-region]').some((path) => path.classes().includes('fill-primary/20')),
    ).toBe(true);

    await wrapper.setProps({ tool: 'add_line' });
    pointerMove(wrapper, centre.x, centre.y);
    await nextTick();
    expect(
      wrapper.findAll('[data-region]').some((path) => path.classes().includes('fill-primary/20')),
    ).toBe(false);
    expect(wrapper.find('[data-region]').classes()).toContain('stroke-transparent');
  });

  it('marks a selected region and clears hover when the pointer leaves', async () => {
    const document = bandPiece(true);
    const selected = pieceBandRegions(document, document.pieces[0]!)[0]!;
    const wrapper = mountCanvas({
      document,
      selectedAllowanceTargets: [selected.target],
    });

    const selectedPath = wrapper
      .findAll('[data-region]')
      .find((path) => path.classes().includes('fill-primary/30'));
    expect(selectedPath).toBeDefined();

    const boundaryShown = () =>
      wrapper.findAll('[data-region]').some((path) => path.classes().includes('stroke-primary/40'));

    pointerMove(wrapper, 10, 10);
    const centre = screenOf(document, { x: 50, y: 50 });
    pointerMove(wrapper, centre.x, centre.y);
    await nextTick();
    expect(boundaryShown()).toBe(true);

    wrapper.find('svg').element.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    await nextTick();
    expect(boundaryShown()).toBe(false);
  });
});

describe('mark tools', () => {
  const markDoc: PatternDocument = {
    ...doc([
      pt('a', 0, 0),
      pt('b', 100, 0),
      pt('c', 100, 100),
      pt('d', 0, 100),
      ln('ab', 'a', 'b'),
      ln('bc', 'b', 'c'),
      ln('cd', 'c', 'd'),
      ln('da', 'd', 'a'),
      { id: 'notch-1', kind: 'mark', type: 'notch', piece: 'p1', edge: 'ab', point: 'a' },
      { id: 'centre-1', kind: 'mark', type: 'centre_line', piece: 'p1', start: 'a', end: 'c' },
    ]),
    pieces: [
      {
        id: 'p1',
        edges: ['ab', 'bc', 'cd', 'da'],
        allowances: [{ edge: 'ab', width: 10 }],
      },
    ],
  };

  it('draws the marks of the active piece', () => {
    const wrapper = mountCanvas({ document: markDoc, activePieceId: 'p1' });

    expect(wrapper.find('[data-testid="mark-notch-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mark-centre-1"]').exists()).toBe(true);
  });

  it('selects a notch and a centre line through their wide hit strokes', () => {
    const wrapper = mountCanvas({ document: markDoc, activePieceId: 'p1' });
    const notchHit = wrapper.find('[data-testid="mark-hit-notch-1"]');

    expect(notchHit.attributes('data-entity-id')).toBe('notch-1');
    expect(notchHit.attributes('data-kind')).toBe('mark');
    expect(notchHit.attributes('stroke-width')).toBe('12');
    expect(notchHit.attributes('stroke')).toBe('transparent');

    down(notchHit.element, 500, 300);
    up();
    down(wrapper.find('[data-testid="mark-hit-centre-1"]').element, 500, 300);
    up();

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['notch-1']], [['centre-1']]]);
  });

  it('emits a notch for a point on the edge under the pointer', async () => {
    const wrapper = mountCanvas({ document: markDoc, tool: 'notch', activePieceId: 'p1' });
    const at = screenAt({ x: 40, y: 5 });

    down(pointCircle(wrapper, 'a').element, at.x, at.y);
    await nextTick();

    expect(wrapper.emitted('add-notch')?.at(-1)).toEqual(['a', 'ab']);
  });

  it('skips a mark that has nothing to draw', () => {
    const broken: PatternDocument = {
      ...markDoc,
      entities: [
        ...markDoc.entities,
        { id: 'notch-2', kind: 'mark', type: 'notch', piece: 'p1', edge: 'bc', point: 'a' },
        { id: 'centre-2', kind: 'mark', type: 'centre_line', piece: 'p1', start: 'a', end: 'gone' },
      ],
    };

    const wrapper = mountCanvas({ document: broken, activePieceId: 'p1' });

    expect(wrapper.find('[data-testid="mark-notch-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mark-centre-2"]').exists()).toBe(false);
  });

  it('ignores a notch click that is not on a point or has no active piece', async () => {
    const wrapper = mountCanvas({ document: markDoc, tool: 'notch', activePieceId: 'p1' });
    const line = wrapper.find('[data-kind="line"][data-entity-id="ab"]').element;

    down(line, 400, 300);
    await nextTick();
    expect(wrapper.emitted('add-notch')).toBeUndefined();

    const noPiece = mountCanvas({ document: markDoc, tool: 'notch' });
    const at = screenAt({ x: 0, y: 0 });
    down(pointCircle(noPiece, 'a').element, at.x, at.y);
    await nextTick();
    expect(noPiece.emitted('add-notch')).toBeUndefined();
  });

  it('emits a centre line from two point clicks and ignores a repeated point', async () => {
    const wrapper = mountCanvas({ document: markDoc, tool: 'centre_line', activePieceId: 'p1' });
    const first = screenAt({ x: 0, y: 0 });
    const second = screenAt({ x: 100, y: 100 });

    down(pointCircle(wrapper, 'a').element, first.x, first.y);
    await nextTick();
    down(pointCircle(wrapper, 'a').element, first.x, first.y);
    await nextTick();
    expect(wrapper.emitted('add-centre-line')).toBeUndefined();

    const line = wrapper.find('[data-kind="line"][data-entity-id="bc"]').element;
    down(line, second.x, second.y);
    await nextTick();
    expect(wrapper.emitted('add-centre-line')).toBeUndefined();

    down(pointCircle(wrapper, 'c').element, second.x, second.y);
    await nextTick();
    expect(wrapper.emitted('add-centre-line')?.at(-1)).toEqual(['a', 'c']);
  });
});
