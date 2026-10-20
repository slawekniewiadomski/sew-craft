import { createEmptyDocument, type EntityId, type PatternDocument } from '@sewcraft/geometry';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import PatternCanvas from '@/components/PatternCanvas.vue';
import { downloadSvgFile } from '@/lib/download';
import { useEditorStore } from '@/stores/editor';

import EditorView from './EditorView.vue';

vi.mock('@/lib/download', () => ({ downloadSvgFile: vi.fn() }));

const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  width: 800,
  height: 600,
  right: 800,
  bottom: 600,
  toJSON: () => ({}),
} as DOMRect;

enableAutoUnmount(afterEach);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(downloadSvgFile).mockClear();
  window.localStorage.clear();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});

async function mountEditor(pinia: Pinia): Promise<VueWrapper> {
  const wrapper = mount(EditorView, {
    props: { id: '1' },
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

/** The View drawer is collapsed by default; open it before driving its inputs. */
async function openViewDrawer(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="drawer-toggle-view"]').trigger('click');
  await nextTick();
}

function canvasDown(wrapper: VueWrapper, x: number, y: number, button = 0): void {
  wrapper
    .find('[data-testid="grid"]')
    .element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button }),
    );
}

function entityDown(wrapper: VueWrapper, kind: 'point' | 'line' | 'curve', id: EntityId): void {
  wrapper
    .find(`[data-kind="${kind}"][data-entity-id="${id}"]`)
    .element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }),
    );
}

function pointDown(wrapper: VueWrapper, id: EntityId): void {
  entityDown(wrapper, 'point', id);
}

function keydown(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
}

function points(wrapper: VueWrapper) {
  return wrapper.findAll('[data-kind="point"]');
}

const simpleDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
    { id: 'r', kind: 'point', x: 50, y: 50, construction: false, fixed: false },
    { id: 's', kind: 'point', x: 0, y: 50, construction: false, fixed: false },
  ],
};

const edgeDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
    { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: false },
  ],
};

const lineDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
    { id: 'c', kind: 'point', x: 100, y: 100, construction: false, fixed: false },
    { id: 'd', kind: 'point', x: 0, y: 100, construction: false, fixed: false },
    { id: 'e', kind: 'point', x: 50, y: 50, construction: false, fixed: false },
    { id: 'ab', kind: 'line', start: 'a', end: 'b', construction: false },
    { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
    { id: 'cd', kind: 'line', start: 'c', end: 'd', construction: false },
    { id: 'da', kind: 'line', start: 'd', end: 'a', construction: false },
  ],
};

const curveDoc: PatternDocument = {
  ...lineDoc,
  entities: [
    ...lineDoc.entities,
    { id: 'curve', kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd', construction: false },
  ],
};

async function mountLoaded(
  document: PatternDocument,
): Promise<{ wrapper: VueWrapper; store: ReturnType<typeof useEditorStore> }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useEditorStore();
  store.load(document);
  const wrapper = await mountEditor(pinia);
  return { wrapper, store };
}

describe('EditorView', () => {
  it('seeds a starter sketch on first mount', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(points(wrapper)).toHaveLength(4);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(8);
    expect(wrapper.text()).toContain('14 command(s)');
  });

  it('switches the active tool and reflects it on the canvas', async () => {
    const wrapper = await mountEditor(createPinia());
    const canvas = wrapper.findComponent(PatternCanvas);

    expect(canvas.classes()).toContain('cursor-default');

    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    await nextTick();

    expect(canvas.classes()).toContain('cursor-crosshair');
  });

  it('adds a point through the canvas, then undoes and redoes it', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    canvasDown(wrapper, 400, 300);
    await flushPromises();
    expect(points(wrapper)).toHaveLength(5);
    expect(wrapper.text()).toContain('15 command(s)');

    await wrapper.find('[data-testid="undo"]').trigger('click');
    expect(points(wrapper)).toHaveLength(4);

    await wrapper.find('[data-testid="redo"]').trigger('click');
    expect(points(wrapper)).toHaveLength(5);
  });

  it('enables delete only with a selection and removes the point on Delete', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeDefined();

    keydown('Delete');
    expect(points(wrapper)).toHaveLength(4);

    pointDown(wrapper, 'a');
    await nextTick();
    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeUndefined();

    keydown('Delete');
    await nextTick();
    expect(points(wrapper)).toHaveLength(3);

    keydown('a');
    expect(points(wrapper)).toHaveLength(3);
  });

  it('removes the selected point with Backspace and the delete button', async () => {
    const wrapper = await mountEditor(createPinia());

    pointDown(wrapper, 'a');
    await nextTick();
    keydown('Backspace');
    await nextTick();
    expect(points(wrapper)).toHaveLength(3);

    pointDown(wrapper, 'b');
    await nextTick();
    await wrapper.find('[data-testid="delete"]').trigger('click');
    await nextTick();
    expect(points(wrapper)).toHaveLength(2);
  });

  it('re-fits the canvas when Fit is pressed', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="fit"]').trigger('click');
    await nextTick();

    expect(wrapper.findComponent(PatternCanvas).props('fitToken')).toBe(1);
  });

  it('draws a line and a curve through the canvas tools', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load(simpleDoc);

    const wrapper = await mountEditor(pinia);

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'q');
    await flushPromises();
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(2);

    await wrapper.find('[data-testid="tool-add_curve"]').trigger('click');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'q');
    pointDown(wrapper, 'r');
    pointDown(wrapper, 's');
    await flushPromises();
    expect(wrapper.findAll('[data-kind="curve"]')).toHaveLength(1);
  });

  it('moves a point through the canvas drag', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load(simpleDoc);

    const wrapper = await mountEditor(pinia);

    pointDown(wrapper, 'p');
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 }));
    await nextTick();
    window.dispatchEvent(new MouseEvent('pointerup'));
    await flushPromises();

    expect(wrapper.text()).toContain('1 command(s)');
  });

  it('does not seed when a document is already loaded', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    const loaded: PatternDocument = {
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 1, y: 2, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 3, y: 4, construction: false, fixed: false },
        { id: 'c', kind: 'line', start: 'p', end: 'q', construction: true },
        { id: 'l', kind: 'line', start: 'p', end: 'missing', construction: false },
      ],
    };
    store.load(loaded);

    const wrapper = await mountEditor(pinia);

    expect(points(wrapper)).toHaveLength(2);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(2);
    expect(wrapper.find('[data-entity-id="c"]').attributes('stroke-dasharray')).toBe('4 4');
  });

  it('does not seed when the journal already has entries', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.dispatch({ id: 'p', type: 'add_point', params: { x: 0, y: 0 } });
    store.dispatch({ id: 'del', type: 'delete_entity', params: { id: 'p' } });

    const wrapper = await mountEditor(pinia);

    expect(points(wrapper)).toHaveLength(0);
  });

  it('downloads the pattern as an SVG with construction hidden by default', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="download-svg"]').trigger('click');

    expect(downloadSvgFile).toHaveBeenCalledTimes(1);
    const [filename, svg] = vi.mocked(downloadSvgFile).mock.calls[0]!;
    expect(filename).toBe('pattern-1.svg');
    expect(svg).toContain('data-layer="cut"');
    expect(svg).not.toContain('data-layer="construction"');
  });

  it('renders construction points as muted outlines', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({
      ...createEmptyDocument(),
      entities: [
        { id: 'guide', kind: 'point', x: 1, y: 2, construction: true, fixed: false },
        { id: 'cut', kind: 'point', x: 3, y: 4, construction: false, fixed: false },
      ],
    });

    const wrapper = await mountEditor(pinia);
    const rendered = points(wrapper);

    expect(rendered).toHaveLength(2);
    expect(rendered[0]!.classes()).toContain('fill-muted-foreground');
    expect(rendered[1]!.classes()).toContain('fill-foreground');
  });

  it('includes construction geometry in the download when toggled on', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
        { id: 'guide', kind: 'line', start: 'p', end: 'q', construction: true },
      ],
    });

    const wrapper = await mountEditor(pinia);

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="toggle-construction"]').setValue(true);
    await wrapper.find('[data-testid="download-svg"]').trigger('click');

    const [, svg] = vi.mocked(downloadSvgFile).mock.calls[0]!;
    expect(svg).toContain('data-layer="construction"');
    expect(svg).toContain('data-entity-id="guide"');
  });

  it('hides construction geometry without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
        { id: 'cut', kind: 'line', start: 'p', end: 'q', construction: false },
        { id: 'guide', kind: 'line', start: 'p', end: 'q', construction: true },
      ],
    });

    const wrapper = await mountEditor(pinia);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(4);

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="show-construction"]').setValue(false);

    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(2);
    expect(wrapper.find('line').attributes('stroke-dasharray')).toBeUndefined();
    expect(store.journal).toHaveLength(0);
  });

  it('converts a cut edge to construction and undoes it', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
        { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: false },
      ],
    });

    const wrapper = await mountEditor(pinia);
    expect(wrapper.text()).toContain('1 cut edge(s)');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Make construction')!
      .trigger('click');

    expect(wrapper.find('line').attributes('stroke-dasharray')).toBe('4 4');
    expect(wrapper.text()).toContain('0 cut edge(s)');

    await wrapper.find('[data-testid="undo"]').trigger('click');

    expect(wrapper.find('line').attributes('stroke-dasharray')).toBeUndefined();
    expect(wrapper.text()).toContain('1 cut edge(s)');
  });

  it('converts a construction edge back to a cut edge', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
        { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: true },
      ],
    });

    const wrapper = await mountEditor(pinia);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Make cut edge')!
      .trigger('click');

    expect(wrapper.find('line').attributes('stroke-dasharray')).toBeUndefined();
    expect(wrapper.text()).toContain('1 cut edge(s)');
  });

  it('attaches and detaches a seam allowance on an edge', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load(edgeDoc);

    const wrapper = await mountEditor(pinia);

    await wrapper.find('[data-testid="seam-width-l1"]').setValue('12');
    await wrapper.find('[data-testid="add-seam-l1"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="seam-label-l1"]').text()).toContain('12');
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);

    await wrapper.find('[data-testid="remove-seam-l1"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="seam-label-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(false);
  });

  it('ignores a non-positive seam width', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load(edgeDoc);

    const wrapper = await mountEditor(pinia);

    await wrapper.find('[data-testid="seam-width-l1"]').setValue('0');
    await wrapper.find('[data-testid="add-seam-l1"]').trigger('click');
    await nextTick();

    expect(store.document.seams).toHaveLength(0);
    expect(wrapper.find('[data-testid="seam-label-l1"]').exists()).toBe(false);
  });

  it('hides seam allowances without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({ ...edgeDoc, seams: [{ id: 's1', edge: 'l1', width: 10 }] });

    const wrapper = await mountEditor(pinia);
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="show-seam-allowance"]').setValue(false);
    await nextTick();

    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(false);
    expect(store.document.seams).toHaveLength(1);
    expect(store.journal).toHaveLength(0);
  });

  it('shows constraint badges by default and hides them without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
      ],
      constraints: [{ id: 'h', type: 'horizontal', a: 'p', b: 'q' }],
    });

    const wrapper = await mountEditor(pinia);
    expect(wrapper.find('[data-constraint-id="h"]').exists()).toBe(true);

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="show-constraints"]').setValue(false);
    await nextTick();

    expect(wrapper.find('[data-constraint-id="h"]').exists()).toBe(false);
    expect(store.document.constraints).toHaveLength(1);
    expect(store.journal).toHaveLength(0);
  });

  it('lists seeded non-distance constraints and removes one through the constraints drawer', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="drawer-toggle-constraints"]').trigger('click');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Constraints"] li')).toHaveLength(4);

    await wrapper.find('[data-testid="remove-constraint-bottom"]').trigger('click');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Constraints"] li')).toHaveLength(3);
    expect(wrapper.text()).toContain('15 command(s)');
  });

  it('lists seeded dimensions with editable value, orientation and offset', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    const wrapper = await mountEditor(pinia);

    expect(wrapper.find('[aria-label="Dimensions"]').exists()).toBe(false);

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Dimensions"] li')).toHaveLength(2);
    expect(
      (wrapper.find('[data-testid="dimension-value-width"]').element as HTMLInputElement).value,
    ).toBe('160');
    expect(
      (wrapper.find('[data-testid="dimension-orientation-width"]').element as HTMLSelectElement)
        .value,
    ).toBe('aligned');
    expect(
      (wrapper.find('[data-testid="dimension-offset-width"]').element as HTMLInputElement).value,
    ).toBe('20');

    await wrapper.find('[data-testid="dimension-value-width"]').setValue('200');
    await wrapper.find('[data-testid="dimension-value-width"]').trigger('change');
    await flushPromises();

    expect(
      store.document.constraints.find((constraint) => constraint.id === 'width'),
    ).toMatchObject({ value: 200 });

    await wrapper.find('[data-testid="dimension-orientation-width"]').setValue('horizontal');
    await wrapper.find('[data-testid="dimension-orientation-width"]').trigger('change');
    await flushPromises();

    expect(
      store.document.constraints.find((constraint) => constraint.id === 'width'),
    ).toMatchObject({ orientation: 'horizontal' });

    await wrapper.find('[data-testid="dimension-offset-width"]').setValue('25');
    await wrapper.find('[data-testid="dimension-offset-width"]').trigger('change');
    await flushPromises();

    expect(
      store.document.constraints.find((constraint) => constraint.id === 'width'),
    ).toMatchObject({ offset: 25 });

    const commands = store.journal.length;

    await wrapper.find('[data-testid="dimension-value-height"]').setValue('0');
    await wrapper.find('[data-testid="dimension-value-height"]').trigger('change');
    await wrapper.find('[data-testid="dimension-offset-height"]').setValue('');
    await wrapper.find('[data-testid="dimension-offset-height"]').trigger('change');

    expect(store.journal).toHaveLength(commands);

    await wrapper.find('[data-testid="remove-dimension-height"]').trigger('click');
    await nextTick();

    expect(store.document.constraints.some((constraint) => constraint.id === 'height')).toBe(false);
    expect(wrapper.findAll('[aria-label="Dimensions"] li')).toHaveLength(1);
  });

  it('shows empty states when the document has no constraints or dimensions', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load({
      ...createEmptyDocument(),
      entities: [{ id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false }],
    });

    const wrapper = await mountEditor(pinia);
    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await wrapper.find('[data-testid="drawer-toggle-constraints"]').trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('No dimensions yet.');
    expect(wrapper.text()).toContain('No constraints yet.');
  });

  it('shows the constraints group and arms a mode with its prompt', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="constraint-horizontal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="constraint-equal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.find('[data-testid="tool-select"]').attributes('aria-pressed')).toBeUndefined();
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick a line, or two points.',
    );
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');

    await wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="constraint-prompt"]').exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed'),
    ).toBeUndefined();
  });

  it('applies horizontal from a line and stays armed', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      { id: expect.any(String), type: 'horizontal', a: 'a', b: 'b' },
    ]);
    expect(wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([]);
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick a line, or two points.',
    );
  });

  it('applies vertical from two points', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await wrapper.find('[data-testid="constraint-vertical"]').trigger('click');
    pointDown(wrapper, 'p');
    await nextTick();
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe('Pick the second point.');

    pointDown(wrapper, 's');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      { id: expect.any(String), type: 'vertical', a: 'p', b: 's' },
    ]);
  });

  it('applies equal length from two lines, including a shared endpoint', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="constraint-equal"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick the second line, or two points.',
    );

    entityDown(wrapper, 'line', 'bc');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      { id: expect.any(String), type: 'equal', a1: 'a', a2: 'b', b1: 'b', b2: 'c' },
    ]);
  });

  it('applies point on line from a point and a line', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="constraint-point_on_line"]').trigger('click');
    pointDown(wrapper, 'e');
    await nextTick();
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick a line, or two points.',
    );

    entityDown(wrapper, 'line', 'ab');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      { id: expect.any(String), type: 'point_on_line', point: 'e', a: 'a', b: 'b' },
    ]);
  });

  it('rejects a curve click without staging a constraint', async () => {
    const { wrapper, store } = await mountLoaded(curveDoc);

    await wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    entityDown(wrapper, 'curve', 'curve');
    await nextTick();

    expect(store.document.constraints).toHaveLength(0);
    expect(wrapper.find('[data-testid="constraint-rejection"]').text()).toBe(
      'Curves are not supported yet; pick a point or a line.',
    );
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([]);
  });

  it('prefills distance, applies the typed value and closes the bar', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    document.body.appendChild(wrapper.element);

    await wrapper.find('[data-testid="constraint-distance"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    expect(
      (wrapper.find('[data-testid="constraint-value"]').element as HTMLInputElement).value,
    ).toBe('100');

    const backspace = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    wrapper.find('[data-testid="constraint-value"]').element.dispatchEvent(backspace);
    expect(backspace.defaultPrevented).toBe(false);

    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(deleteEvent);
    expect(deleteEvent.defaultPrevented).toBe(true);

    pointDown(wrapper, 'e');
    await nextTick();
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([
      { id: 'ab', kind: 'line' },
    ]);
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(true);

    await wrapper.find('[data-testid="constraint-value"]').setValue('120');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      { id: expect.any(String), type: 'distance', a: 'a', b: 'b', value: 120 },
    ]);
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(false);
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([]);
  });

  it('prefills angle in degrees and dispatches radians', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="constraint-angle"]').trigger('click');
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'b');
    pointDown(wrapper, 'c');
    await nextTick();

    expect(
      (wrapper.find('[data-testid="constraint-value"]').element as HTMLInputElement).value,
    ).toBe('-90');

    await wrapper.find('[data-testid="constraint-value"]').setValue('45');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const [constraint] = store.document.constraints;
    expect(constraint).toMatchObject({ type: 'angle', a: 'a', b: 'b', c: 'c' });
    expect(constraint?.type === 'angle' ? constraint.value : null).toBeCloseTo(Math.PI / 4);
  });

  it('exits the mode with Cancel, Escape or another tool', async () => {
    const cancelled = await mountLoaded(lineDoc);
    await cancelled.wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    await cancelled.wrapper.find('[data-testid="constraint-cancel"]').trigger('click');
    await nextTick();
    expect(cancelled.wrapper.find('[data-testid="constraint-prompt"]').exists()).toBe(false);
    expect(
      cancelled.wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed'),
    ).toBeUndefined();

    const escaped = await mountLoaded(lineDoc);
    await escaped.wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    keydown('Escape');
    await nextTick();
    expect(escaped.wrapper.find('[data-testid="constraint-prompt"]').exists()).toBe(false);

    const switched = await mountLoaded(lineDoc);
    await switched.wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    await switched.wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    await nextTick();
    expect(switched.wrapper.find('[data-testid="constraint-prompt"]').exists()).toBe(false);
    expect(
      switched.wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed'),
    ).toBeUndefined();
  });

  it('prunes disappeared picks and closes a stale value bar', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="constraint-coincident"]').trigger('click');
    pointDown(wrapper, 'e');
    await nextTick();
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([
      { id: 'e', kind: 'point' },
    ]);

    store.dispatch({ id: 'move-a', type: 'move_point', params: { id: 'a', x: 1, y: 1 } });
    await nextTick();
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([
      { id: 'e', kind: 'point' },
    ]);

    store.dispatch({ id: 'delete-e', type: 'delete_entity', params: { id: 'e' } });
    await nextTick();
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([]);
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe('Pick the first point.');

    await wrapper.find('[data-testid="constraint-distance"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(true);

    store.dispatch({ id: 'delete-ab', type: 'delete_entity', params: { id: 'ab' } });
    await nextTick();
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick a line, or two points.',
    );
  });

  it('keeps the constraints drawer as a list-only surface', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="drawer-toggle-constraints"]').trigger('click');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Constraints"] li')).toHaveLength(4);
    expect(wrapper.find('[data-testid="constraint-type"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="constraint-entity-0"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-constraint"]').exists()).toBe(false);
  });

  it('reports the active tool and selection in the properties drawer', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');
    expect(wrapper.find('[data-testid="active-selection"]').text()).toBe('None');

    pointDown(wrapper, 'a');
    await nextTick();
    expect(wrapper.find('[data-testid="active-selection"]').text()).toBe('a');

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Line');
  });

  it('resizes the sidebar with the drag handle', async () => {
    const wrapper = await mountEditor(createPinia());
    const handle = wrapper.find('[data-testid="sidebar-resize"]');

    handle.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 600, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 560 }));
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar"]').attributes('style')).toContain('width: 360px');

    window.dispatchEvent(new MouseEvent('pointerup'));
  });

  it('persists sidebar width and collapsed state across remounts', async () => {
    const first = await mountEditor(createPinia());

    await first.find('[data-testid="sidebar-collapse"]').trigger('click');
    await nextTick();

    expect(JSON.parse(window.localStorage.getItem('sewcraft.editor.sidebar')!)).toEqual({
      width: 320,
      collapsed: true,
    });

    first.unmount();
    const second = await mountEditor(createPinia());

    expect(second.find('[data-testid="sidebar-expand"]').exists()).toBe(true);
  });

  it('creates a dimension from a line with the dimension tool', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    expect(store.document.constraints).toHaveLength(0);
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="dimension-label-dimension-preview"]').find('text').text(),
    ).toBe('100');

    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      {
        id: expect.any(String),
        type: 'distance',
        a: 'a',
        b: 'b',
        value: 100,
        orientation: 'aligned',
        offset: 20,
      },
    ]);
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);
  });

  it('creates a dimension from two points', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'q');
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(true);

    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({ type: 'distance', a: 'p', b: 'q', value: 50 }),
    ]);
  });

  it('updates an existing distance instead of duplicating it', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100, offset: 3 }],
    });

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.document.constraints[0]).toMatchObject({ id: 'w', value: 100, offset: 20 });
  });

  it('drags an existing dimension and restores the offset with undo', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100, offset: 3 }],
    });

    wrapper
      .find('[data-testid="dimension-drag-w"]')
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 200, button: 0 }),
      );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 120 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await flushPromises();

    const dragged = store.document.constraints[0]!.offset;
    expect(dragged).not.toBe(3);

    const entry = store.journal.at(-1)!;
    expect(entry.command).toMatchObject({
      type: 'update_constraint',
      params: { id: 'w', offset: dragged },
    });
    expect(entry.inverse).toMatchObject({
      type: 'update_constraint',
      params: { id: 'w', offset: 3 },
    });

    await wrapper.find('[data-testid="undo"]').trigger('click');
    await flushPromises();

    expect(store.document.constraints[0]!.offset).toBe(3);
  });

  it('keeps the dimension tool active after dragging a dimension', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100, offset: 3 }],
    });

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    expect(wrapper.find('[data-testid="tool-dimension"]').attributes('aria-pressed')).toBe('true');

    wrapper
      .find('[data-testid="dimension-drag-w"]')
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 200, button: 0 }),
      );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 120 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await flushPromises();

    expect(store.document.constraints[0]!.offset).not.toBe(3);
    expect(wrapper.find('[data-testid="tool-dimension"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);
  });

  it('ignores a zero-length dimension placement', async () => {
    const { wrapper, store } = await mountLoaded({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
      ],
    });

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'q');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(0);
    expect(store.journal).toHaveLength(0);
  });

  it('hides dimensions without changing the document', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(true);

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="show-dimensions"]').setValue(false);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-labels-layer"]').text()).not.toContain('100');
    expect(store.document.constraints).toHaveLength(1);
    expect(store.journal).toHaveLength(0);

    await wrapper.find('[data-testid="show-dimensions"]').setValue(true);
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(true);
  });

  it('edits a dimension value inline on the canvas', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await nextTick();

    const editor = wrapper.find('[data-testid="dimension-editor"]');
    expect(editor.exists()).toBe(true);
    expect((editor.element as HTMLInputElement).value).toBe('100');

    await editor.setValue('150');
    await editor.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(store.document.constraints[0]).toMatchObject({ id: 'w', value: 150 });
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });

  it('keeps the inline editor open for invalid values and cancels on Escape', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await nextTick();

    await wrapper.find('[data-testid="dimension-editor"]').setValue('0');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);
    expect(store.journal).toHaveLength(0);

    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
    expect(store.journal).toHaveLength(0);
  });

  it('commits a valid inline edit on blur and closes on a document change', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await nextTick();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('120');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('blur');
    await flushPromises();

    expect(store.document.constraints[0]).toMatchObject({ value: 120 });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(true);

    store.dispatch({ id: 'move-a', type: 'move_point', params: { id: 'a', x: 1, y: 1 } });
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);
  });
});
