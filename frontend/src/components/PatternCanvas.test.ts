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
import { enableAutoUnmount, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
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
    tool: 'select' | 'add_point' | 'add_line' | 'add_curve';
    selectedId: EntityId | null;
    fitToken: number;
    showSeamAllowance: boolean;
    showConstraints: boolean;
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
    const wrapper = mountCanvas();

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
});
