import type * as Geometry from '@sewcraft/geometry';
import {
  bounds,
  createEmptyDocument,
  type CurveEntity,
  type Entity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type PointEntity,
  seamAllowancePaths,
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

let rectSpy: MockInstance;

beforeEach(() => {
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});

function mountCanvas(
  overrides: Partial<{
    document: PatternDocument;
    tool: 'select' | 'add_point' | 'add_line' | 'add_curve' | 'dimension' | 'add_allowance';
    selectedId: EntityId | null;
    fitToken: number;
    showSeamAllowance: boolean;
    showConstraints: boolean;
    showDimensions: boolean;
    constraintActive: boolean;
    constraintPicks: ConstraintPick[];
  }> = {},
): VueWrapper {
  return mount(PatternCanvas, {
    props: {
      document: baseDoc,
      tool: 'select',
      selectedId: null,
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

function down(el: Element, x: number, y: number, button = 0): void {
  el.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button }),
  );
}

function move(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
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

    expect(wrapper.emitted('update:selectedId')).toEqual([['ab']]);
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
    const wrapper = mountCanvas({ selectedId: 'a' });

    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-primary');
    expect(pointCircle(wrapper, 'd').classes()).toContain('fill-muted-foreground');
    expect(pointCircle(wrapper, 'b').classes()).toContain('fill-foreground');
    expect(wrapper.find('[data-testid="selection-handle"]').exists()).toBe(true);
    expect(wrapper.find('[data-entity-id="bc"]').attributes('stroke-dasharray')).toBe('4 4');
    expect(wrapper.find('[data-entity-id="ab"]').attributes('stroke-dasharray')).toBeUndefined();
  });

  it('applies the selected stroke width to lines and curves', () => {
    const lineWrapper = mountCanvas({ selectedId: 'ab' });
    expect(lineWrapper.find('[data-entity-id="ab"]').attributes('stroke-width')).toBe('3');
    expect(lineWrapper.find('[data-kind="curve"]').attributes('stroke-width')).toBe('2');

    const curveWrapper = mountCanvas({ selectedId: 'curve' });
    expect(curveWrapper.find('[data-kind="curve"]').attributes('stroke-width')).toBe('3');
  });

  it('selects and drags a point, emitting a move-point on release', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const a = pointCircle(wrapper, 'a').element;

    down(a, 600, 400);
    expect(wrapper.emitted('update:selectedId')).toEqual([['a']]);
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

    expect(wrapper.emitted('update:selectedId')).toEqual([['a']]);
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
    expect(wrapper.emitted('update:selectedId')).toEqual([['ab']]);
    up();

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    expect(wrapper.emitted('update:selectedId')).toEqual([['ab'], [null]]);
    up();
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
    expect(wrapper.emitted('update:selectedId')).toBeUndefined();
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

  it('pans the viewport when dragging the background', async () => {
    const wrapper = mountCanvas();
    const vp = fittedViewport(baseDoc);
    const before = transformOf(wrapper);

    down(wrapper.find('[data-testid="grid"]').element, 500, 300);
    move(520, 330);
    await nextTick();

    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    expect(transformOf(wrapper)).not.toBe(before);
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

  it('commits a line after two distinct points with the add_line tool', async () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    expect(wrapper.emitted('add-line')).toBeUndefined();
    await nextTick();
    expect(pointCircle(wrapper, 'a').classes()).toContain('fill-accent');

    down(pointCircle(wrapper, 'b').element, 400, 300);
    expect(wrapper.emitted('add-line')).toEqual([['a', 'b']]);
  });

  it('resets pending points when the add_line tool hits empty space or a line', () => {
    const wrapper = mountCanvas({ tool: 'add_line' });

    down(pointCircle(wrapper, 'a').element, 400, 300);
    down(wrapper.find('[data-kind="line"]').element, 400, 300);
    down(wrapper.find('[data-testid="grid"]').element, 400, 300);
    down(pointCircle(wrapper, 'b').element, 400, 300);

    expect(wrapper.emitted('add-line')).toBeUndefined();
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
    expect(wrapper.emitted('update:selectedId')).toBeUndefined();

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
    expect(wrapper.emitted('update:selectedId')).toBeUndefined();
    move(520, 330);
    await nextTick();
    expect(transformOf(wrapper)).toBe(viewportTransform(panBy(vp, 20, 30)));
    up();

    releaseSpace();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));

    down(pointCircle(wrapper, 'a').element, 500, 300);
    expect(wrapper.emitted('update:selectedId')).toEqual([['a']]);
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
    ).toContain('fill-foreground');
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').find('text').classes(),
    ).not.toContain('fill-muted-foreground');
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
    expect(wrapper.emitted('update:selectedId')).toBeUndefined();
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
});
