import type * as Geometry from '@sewcraft/geometry';
import {
  bounds,
  createEmptyDocument,
  type CurveEntity,
  type Entity,
  type EntityId,
  entitiesInRect,
  executeCommand,
  type LineEntity,
  type PatternDocument,
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

import PatternCanvas from './PatternCanvas.vue';

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
    tool: 'select' | 'add_point' | 'add_line' | 'add_curve' | 'dimension' | 'add_allowance';
    selectedEntityIds: EntityId[];
    fitToken: number;
    showSeamAllowance: boolean;
    showConstraints: boolean;
    showDimensions: boolean;
    constraintActive: boolean;
    constraintPicks: ConstraintPick[];
    roundCornerActive: boolean;
    roundCornerPicks: CornerRoundPicks;
    cornerRoundPreviewRadius: number | null;
  }> = {},
): VueWrapper {
  return mount(PatternCanvas, {
    props: {
      document: baseDoc,
      tool: 'select',
      selectedEntityIds: [],
      fitToken: 0,
      ...overrides,
    },
  });
}

function fittedViewport(doc: PatternDocument): Viewport {
  return fitToBounds(bounds(doc)!, SIZE);
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
    const wrapper = mountCanvas({ document: seamDoc, showSeamAllowance: false });

    expect(wrapper.findAll('[data-seam-edge]')).toHaveLength(0);
  });

  it('renders a hit path for a seam only while the layer is visible', () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };

    const visible = mountCanvas({ document: seamDoc });
    expect(visible.findAll('[data-seam-hit]')).toHaveLength(1);
    expect(visible.find('[data-seam-hit="ab"]').attributes('data-seam-id')).toBe('s1');
    expect(visible.find('[data-seam-hit="ab"]').classes()).toContain('cursor-pointer');

    const hidden = mountCanvas({ document: seamDoc, showSeamAllowance: false });
    expect(hidden.findAll('[data-seam-hit]')).toHaveLength(0);
  });

  it('emits add-allowance for a cut line or curve and ignores empty space and points', () => {
    const wrapper = mountCanvas({ document: baseDoc, tool: 'add_allowance' });

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
    down(wrapper.find('[data-kind="curve"][data-entity-id="curve"]').element, 300, 200);
    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-testid="grid"]').element, 600, 500);

    expect(wrapper.emitted('add-allowance')).toEqual([['ab'], ['curve']]);
  });

  it('treats a seam hit path as a click on its edge', () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc });

    down(wrapper.find('[data-seam-hit="ab"]').element, 300, 200);

    expect(wrapper.emitted('update:selectedEntityIds')).toEqual([[['ab']]]);
  });

  it('opens the seam width editor on double-click and commits a valid width', async () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc });
    const hit = wrapper.find('[data-seam-hit="ab"]');

    await hit.trigger('dblclick', { clientX: 120, clientY: 140 });
    await flushPromises();

    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(true);
    const input = wrapper.find('[data-testid="seam-width-input"]');
    expect((input.element as HTMLInputElement).value).toBe('10');

    await input.setValue('15');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('set-seam-width')).toEqual([['s1', 15]]);
    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);
  });

  it('does not emit a width on Escape and ignores double-clicks during constraints', async () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };

    const constrained = mountCanvas({ document: seamDoc, constraintActive: true });
    await constrained.find('[data-seam-hit="ab"]').trigger('dblclick');
    await flushPromises();
    expect(constrained.find('[data-testid="seam-width-editor"]').exists()).toBe(false);

    const wrapper = mountCanvas({ document: seamDoc });
    await wrapper.find('[data-seam-hit="ab"]').trigger('dblclick');
    await flushPromises();
    await wrapper.find('[data-testid="seam-width-input"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);
    expect(wrapper.emitted('set-seam-width')).toBeUndefined();
  });

  it('closes the seam width editor when the tool, document or layer changes', async () => {
    const seamDoc: PatternDocument = {
      ...baseDoc,
      seams: [{ id: 's1', edge: 'ab', width: 10 }],
    };
    const wrapper = mountCanvas({ document: seamDoc });
    const open = async () => {
      await wrapper.find('[data-seam-hit="ab"]').trigger('dblclick');
      await flushPromises();
      expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(true);
    };

    await open();
    await wrapper.setProps({ tool: 'add_line' });
    await nextTick();
    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);

    await open();
    await wrapper.setProps({ document: { ...seamDoc, seams: [] } });
    await nextTick();
    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);

    await wrapper.setProps({ document: seamDoc });
    await open();
    await wrapper.setProps({ showSeamAllowance: false });
    await nextTick();
    expect(wrapper.find('[data-testid="seam-width-editor"]').exists()).toBe(false);
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

    down(pointCircle(wrapper, 'a').element, 500, 300, 1);
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();

    move(520, 330);
    await nextTick();

    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    up();
    expect(wrapper.emitted('move-point')).toBeUndefined();
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

  it('previews a dimension from a line, follows the pointer and emits the placement', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    const vp = fittedViewport(dimensionDoc);

    down(wrapper.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
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

    const target = worldToScreen(vp, { x: 50, y: 40 });
    wrapper
      .find('svg')
      .element.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: target.x, clientY: target.y }),
      );
    await nextTick();

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    await nextTick();

    expect(wrapper.emitted('add-dimension')).toEqual([
      [{ a: 'a', b: 'b', orientation: 'horizontal', offset: 40 }],
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

  it('resets dimension picks when an empty or curve hit interrupts them', async () => {
    const wrapper = mountCanvas({ document: dimensionDoc, tool: 'dimension' });

    down(pointCircle(wrapper, 'a').element, 300, 200);
    down(wrapper.find('[data-kind="curve"]').element, 300, 200);
    down(pointCircle(wrapper, 'b').element, 300, 200);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);

    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    expect(wrapper.emitted('add-dimension')).toBeUndefined();
    expect(wrapper.emitted('update:selectedEntityIds')).toBeUndefined();
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
    await nextTick();
    const preview = placing.find('[data-testid="dimension-label-dimension-preview"]');
    expect(preview.classes()).toContain('pointer-events-none');
    expect(preview.classes()).not.toContain('cursor-text');
  });

  it('explains drag and edit in the label tooltip', async () => {
    const draggable = mountCanvas({ document: dimensionDoc });
    expect(draggable.find('[data-testid="dimension-label-w"] title').text()).toBe(
      'Drag to reposition, double-click to edit',
    );

    const editable = mountCanvas({ document: dimensionDoc, tool: 'add_line' });
    expect(editable.find('[data-testid="dimension-label-w"] title').text()).toBe(
      'Double-click to edit',
    );

    const placing = mountCanvas({ document: dimensionDoc, tool: 'dimension' });
    down(placing.find('[data-kind="line"][data-entity-id="ab"]').element, 300, 200);
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

  it('hides derived points and shows handles and the label for a selected round', () => {
    const document = roundedSquare();
    const wrapper = mountCanvas({ document, selectedEntityIds: ['ab'] });

    expect(pointCircle(wrapper, 'r1:a').exists()).toBe(false);
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
});
