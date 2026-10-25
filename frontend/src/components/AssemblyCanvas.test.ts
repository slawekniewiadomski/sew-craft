import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import AssemblyCanvas from './AssemblyCanvas.vue';

const documentOf = (): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, piece: 'p1', fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, piece: 'p1', fixed: false },
    { id: 'c', kind: 'point', x: 100, y: 50, piece: 'p1', fixed: false },
    { id: 'd', kind: 'point', x: 0, y: 50, piece: 'p1', fixed: false },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', piece: 'p1' },
    { id: 'bc', kind: 'line', start: 'b', end: 'c', piece: 'p1' },
    { id: 'cd', kind: 'line', start: 'c', end: 'd', piece: 'p1' },
    { id: 'da', kind: 'line', start: 'd', end: 'a', piece: 'p1' },
  ],
  pieces: [
    {
      id: 'p1',
      name: 'Front',
      edges: ['ab', 'bc', 'cd', 'da'],
      allowances: [
        { edge: 'ab', width: 10 },
        { edge: 'bc', width: 10, kind: 'double' },
      ],
      color: '#336699',
    },
    { id: 'p2', name: 'Sleeve', edges: [], allowances: [] },
  ],
  assemblies: [
    {
      id: 'a1',
      name: 'Shell',
      instances: [
        { id: 'i1', piece: 'p1', x: 100, y: 100 },
        { id: 'i2', piece: 'p2', x: 300, y: 100 },
      ],
    },
    { id: 'a2', name: 'Empty', instances: [] },
  ],
  tabs: [
    { kind: 'piece', id: 'p1' },
    { kind: 'assembly', id: 'a1' },
  ],
});

function mountCanvas(props: Record<string, unknown> = {}) {
  return mount(AssemblyCanvas, {
    props: { document: documentOf(), assemblyId: 'a1', ...props },
  });
}

/** Set a fixed client width so drag deltas convert to millimetres. */
function withWidth(wrapper: ReturnType<typeof mountCanvas>, width = 1000): void {
  Object.defineProperty(wrapper.find('[data-testid="assembly-svg"]').element, 'clientWidth', {
    configurable: true,
    value: width,
  });
}

/** The SVG viewBox as numbers: `x y width height`. */
function viewBoxOf(wrapper: ReturnType<typeof mountCanvas>): number[] {
  return wrapper.find('[data-testid="assembly-svg"]').attributes('viewBox')!.split(' ').map(Number);
}

describe('AssemblyCanvas rendering', () => {
  it('renders every instance layer, label and its colour', () => {
    const wrapper = mountCanvas();

    expect(wrapper.findAll('[data-testid="instance-cut-fill"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="instance-allowance-band"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="instance-cut-line"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="instance-stitch-line"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="instance-fold-line"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="instance-cut-fill"]').attributes('fill')).toBe('#336699');
    expect(wrapper.findAll('[data-testid="instance-label"]').map((node) => node.text())).toEqual([
      'Front',
      'Sleeve',
    ]);
  });

  it('hides every layer the display menu turns off', () => {
    const wrapper = mountCanvas({
      showCutShapes: false,
      showAllowances: false,
      showStitch: false,
      showFolds: false,
      showLabels: false,
    });

    expect(wrapper.findAll('[data-testid="instance-cut-fill"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="instance-allowance-band"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="instance-stitch-line"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="instance-fold-line"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="instance-label"]')).toHaveLength(0);
    // The cut outline and the selection affordance are not display layers.
    expect(wrapper.findAll('[data-testid="instance-cut-line"]')).toHaveLength(1);
  });

  it('marks a mirrored instance in its label', () => {
    const document = documentOf();
    document.assemblies[0]!.instances[0]!.mirrored = true;
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1' },
    });

    expect(wrapper.find('[data-testid="instance-label"]').text()).toBe('Front · mirrored');
  });

  it('shows a dashed placeholder for a piece with no geometry', () => {
    const wrapper = mountCanvas();

    expect(
      wrapper.find('[data-testid="instance-placeholder"] circle').attributes('stroke-dasharray'),
    ).toBe('2 2');
  });

  it('shows the empty assembly state', () => {
    const wrapper = mountCanvas({ assemblyId: 'a2' });

    expect(wrapper.find('[data-testid="assembly-empty"]').text()).toBe('Add a piece to start');
  });

  it('draws the selection box only for the selected instance', () => {
    const wrapper = mountCanvas({ selectedInstanceId: 'i1' });

    expect(wrapper.findAll('[data-testid="instance-selection-box"]')).toHaveLength(1);
  });

  it('falls back to a neutral fill and label for an unknown piece', () => {
    const document = documentOf();
    document.assemblies[0]!.instances.push({ id: 'i3', piece: 'gone', x: 0, y: 0 });
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1' },
    });

    expect(wrapper.findAll('[data-testid="instance-label"]').at(-1)!.text()).toBe('Piece');
    expect(wrapper.findAll('[data-testid="instance-placeholder"]').length).toBeGreaterThan(0);
  });
});

describe('AssemblyCanvas interaction', () => {
  it('selects an instance on pointer down and clears on the background', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    expect(wrapper.emitted('select')).toEqual([['i1']]);

    await wrapper.find('[data-testid="assembly-svg"]').trigger('pointerdown', { button: 0 });
    expect(wrapper.emitted('select')?.at(-1)).toEqual([null]);
  });

  it('commits one move with the dragged delta in millimetres', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await instance.trigger('pointermove', { clientX: 10, clientY: 5 });
    await instance.trigger('pointerup');
    await instance.trigger('pointerup');

    const moves = wrapper.emitted('move') ?? [];
    expect(moves).toHaveLength(1);
    const [id, x, y] = moves[0] as [string, number, number];
    expect(id).toBe('i1');
    expect(x).toBeGreaterThan(100);
    expect(y).toBeGreaterThan(100);
  });

  it('previews the drag on the pressed instance only', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const first = wrapper.find('[data-testid="assembly-instance-i1"]');
    const second = wrapper.find('[data-testid="assembly-instance-i2"]');

    await first.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await first.trigger('pointermove', { clientX: 10, clientY: 5 });
    await nextTick();

    expect(first.attributes('transform')).toContain('translate(');
    expect(second.attributes('transform')).toBe('');

    await first.trigger('pointerup');
  });

  it('does not commit a drag with no movement or while read-only', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await instance.trigger('pointerup');
    expect(wrapper.emitted('move')).toBeUndefined();

    const readOnly = mountCanvas({ readOnly: true });
    const blocked = readOnly.find('[data-testid="assembly-instance-i1"]');
    await blocked.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await blocked.trigger('pointermove', { clientX: 10, clientY: 10 });
    await blocked.trigger('pointerup');
    expect(readOnly.emitted('move')).toBeUndefined();
  });

  it('nudges with the arrow keys and Delete removes', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('keydown', { key: 'ArrowRight' });
    await instance.trigger('keydown', { key: 'ArrowDown', shiftKey: true });
    await instance.trigger('keydown', { key: 'Delete' });
    await instance.trigger('keydown', { key: 'Escape' });
    await instance.trigger('keydown', { key: 'a' });

    expect(wrapper.emitted('nudge')).toEqual([
      ['i1', 1, 0],
      ['i1', 0, 10],
    ]);
    expect(wrapper.emitted('remove')).toEqual([['i1']]);
  });

  it('drops the drag preview on pointercancel', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await instance.trigger('pointercancel');
    await instance.trigger('pointerup');

    expect(wrapper.emitted('move')).toBeUndefined();
  });

  it('captures the pointer when the browser supports it', async () => {
    const wrapper = mountCanvas();
    const element = wrapper.find('[data-testid="assembly-instance-i1"]').element;
    const capture = vi.fn();
    Object.defineProperty(element, 'setPointerCapture', { configurable: true, value: capture });

    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown', {
      clientX: 1,
      clientY: 1,
      pointerId: 7,
    });

    expect(capture).toHaveBeenCalledWith(7);
  });

  it('zooms the fitted view around the pointer with the wheel', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const svg = wrapper.find('[data-testid="assembly-svg"]');
    const before = viewBoxOf(wrapper);

    svg.element.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 500,
        clientY: 0,
        deltaY: -100,
      }),
    );
    await nextTick();

    expect(viewBoxOf(wrapper)[2]).toBeCloseTo(before[2]! / 1.15);
    expect(viewBoxOf(wrapper)[0]).toBeGreaterThan(before[0]!);

    svg.element.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 500,
        clientY: 0,
        deltaY: 100,
      }),
    );
    await nextTick();

    expect(viewBoxOf(wrapper)[2]).toBeCloseTo(before[2]!);
  });

  it('pans with the middle button, even from an instance', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const svg = wrapper.find('[data-testid="assembly-svg"]');
    const before = viewBoxOf(wrapper);

    // The browser's middle-click autoscroll never starts over the canvas.
    const middleDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    svg.element.dispatchEvent(middleDown);
    expect(middleDown.defaultPrevented).toBe(true);

    // A middle press on an instance pans rather than dragging or selecting it.
    svg.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }));
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper
      .find('[data-testid="assembly-instance-i1"]')
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 1, clientX: 0, clientY: 0 }),
      );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 0 }));
    await nextTick();
    window.dispatchEvent(new MouseEvent('pointerup'));

    expect(viewBoxOf(wrapper)[0]).toBeCloseTo(before[0]! - (100 * before[2]!) / 1000);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('move')).toBeUndefined();
  });

  it('ignores the wheel and a middle drag before the canvas has a size', async () => {
    const wrapper = mountCanvas();
    const svg = wrapper.find('[data-testid="assembly-svg"]');
    const before = svg.attributes('viewBox');

    svg.element.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 10, deltaY: -100 }),
    );
    svg.element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 1, clientX: 0, clientY: 0 }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();

    expect(svg.attributes('viewBox')).toBe(before);
  });

  it('resets zoom and pan when the tab is fitted again', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const svg = wrapper.find('[data-testid="assembly-svg"]');

    svg.element.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0,
        deltaY: -100,
      }),
    );
    await nextTick();
    expect(viewBoxOf(wrapper)[2]).toBeLessThan(160);

    await wrapper.setProps({ fitToken: 1 });

    expect(viewBoxOf(wrapper)).toEqual([30, 45, 160, 100]);
  });

  it('captures the pointer for a middle-button pan', async () => {
    const wrapper = mountCanvas();
    withWidth(wrapper, 1000);
    const svg = wrapper.find('[data-testid="assembly-svg"]');
    const capture = vi.fn();
    Object.defineProperty(svg.element, 'setPointerCapture', { configurable: true, value: capture });

    await svg.trigger('pointerdown', { button: 1, clientX: 0, clientY: 0, pointerId: 7 });
    window.dispatchEvent(new MouseEvent('pointerup'));

    expect(capture).toHaveBeenCalledWith(7);
  });

  it('nudges left and up too', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('keydown', { key: 'ArrowLeft' });
    await instance.trigger('keydown', { key: 'ArrowUp' });

    expect(wrapper.emitted('nudge')).toEqual([
      ['i1', -1, 0],
      ['i1', 0, -1],
    ]);
  });

  it('shows a selection box for a placeholder only when it has bounds', async () => {
    const wrapper = mountCanvas({ selectedInstanceId: 'i2' });

    expect(wrapper.find('[data-testid="instance-selection-box"]').exists()).toBe(false);
    expect(wrapper.findAll('[role="button"]')[1]!.attributes('data-selected')).toBe('true');
  });

  it('falls back to a neutral colour for a piece without one', () => {
    const document = documentOf();
    delete document.pieces[0]!.color;
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1' },
    });

    expect(wrapper.find('[data-testid="instance-cut-fill"]').attributes('fill')).toBe('#94a3b8');
  });

  it('ignores keys while read-only', async () => {
    const wrapper = mountCanvas({ readOnly: true });

    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('keydown', {
      key: 'ArrowLeft',
    });
    expect(wrapper.emitted('nudge')).toBeUndefined();
    expect(wrapper.emitted('remove')).toBeUndefined();
  });
});

describe('AssemblyCanvas Add piece picker', () => {
  it('offers every piece and emits the pick', async () => {
    const wrapper = mountCanvas({ pickerOpen: true });

    expect(wrapper.find('[data-testid="add-piece-picker"]').exists()).toBe(true);
    await wrapper.find('[data-testid="add-piece-p1"]').trigger('click');
    expect(wrapper.emitted('add-piece')).toEqual([['p1']]);

    await wrapper.find('[data-testid="add-piece-close"]').trigger('click');
    expect(wrapper.emitted('close-picker')).toHaveLength(1);
  });

  it('reports an empty piece list', () => {
    const document = documentOf();
    document.pieces = [];
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1', pickerOpen: true },
    });

    expect(wrapper.text()).toContain('No pieces yet');
  });

  it('labels an unnamed piece by its palette position', () => {
    const document = documentOf();
    document.pieces[1]!.name = '  ';
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1', pickerOpen: true },
    });

    expect(wrapper.find('[data-testid="add-piece-p2"]').text()).toBe('Piece 2');
  });

  it('offers pieces the assembly slice does not contain yet', async () => {
    const full = documentOf();
    // A fresh assembly's slice holds no piece: nothing is placed yet.
    const document: PatternDocument = {
      ...full,
      pieces: [],
      assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
    };
    const wrapper = mount(AssemblyCanvas, {
      props: { document, assemblyId: 'a1', pickerOpen: true, pieces: full.pieces },
    });

    expect(wrapper.text()).not.toContain('No pieces yet');
    expect(wrapper.find('[data-testid="add-piece-p1"]').text()).toBe('Front');
    expect(wrapper.find('[data-testid="add-piece-p2"]').text()).toBe('Sleeve');

    await wrapper.find('[data-testid="add-piece-p2"]').trigger('click');
    expect(wrapper.emitted('add-piece')).toEqual([['p2']]);
  });
});

describe('AssemblyCanvas cancel and fit', () => {
  it('drops a drag on Escape and when the assembly changes', async () => {
    const wrapper = mountCanvas();
    const instance = wrapper.find('[data-testid="assembly-instance-i1"]');

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await instance.trigger('keydown', { key: 'Escape' });
    await instance.trigger('pointerup');
    expect(wrapper.emitted('move')).toBeUndefined();

    await instance.trigger('pointerdown', { clientX: 0, clientY: 0 });
    await wrapper.setProps({ assemblyId: 'a2' });
    await instance.trigger('pointerup');
    expect(wrapper.emitted('move')).toBeUndefined();
  });

  it('recomputes the viewBox on fit and handles an unknown assembly', async () => {
    const wrapper = mountCanvas();

    await wrapper.setProps({ fitToken: 2 });
    expect(wrapper.find('[data-testid="assembly-svg"]').attributes('viewBox')).toBe(
      '30 45 160 100',
    );

    await wrapper.setProps({ assemblyId: 'missing' });
    expect(wrapper.find('[data-testid="assembly-svg"]').attributes('viewBox')).toBe('0 0 100 100');
  });

  it('keeps the view fixed when an instance moves and refits only on fit', async () => {
    const wrapper = mountCanvas();
    const before = viewBoxOf(wrapper);

    const moved = documentOf();
    moved.assemblies[0]!.instances[0]!.x = 1000;
    const reference = mountCanvas({ document: moved });
    const fitted = viewBoxOf(reference);
    reference.unmount();

    await wrapper.setProps({ document: moved });
    expect(viewBoxOf(wrapper)).toEqual(before);

    await wrapper.setProps({ fitToken: 1 });
    expect(viewBoxOf(wrapper)).toEqual(fitted);
  });
});
