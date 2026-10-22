import {
  createEmptyDocument,
  type Constraint,
  type EntityId,
  executeCommand,
  type PatternDocument,
} from '@sewcraft/geometry';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import PatternCanvas from '@/components/PatternCanvas.vue';
import CornerRoundPromptBar from '@/components/CornerRoundPromptBar.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
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

function canvasUp(): void {
  window.dispatchEvent(new MouseEvent('pointerup'));
}

function entityDown(
  wrapper: VueWrapper,
  kind: 'point' | 'line' | 'curve' | 'circle',
  id: EntityId,
  init: MouseEventInit = {},
): void {
  wrapper.find(`[data-kind="${kind}"][data-entity-id="${id}"]`).element.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
      button: 0,
      ...init,
    }),
  );
}

function pointDown(wrapper: VueWrapper, id: EntityId): void {
  entityDown(wrapper, 'point', id);
}

function keydown(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
}

/** Presentation offset of a distance constraint, or undefined for other kinds. */
function distanceOffset(constraint: Constraint | undefined): number | undefined {
  return constraint?.type === 'distance' ? constraint.offset : undefined;
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

/** A circle of radius 100 centred on `a`, its rim on `c`. */
const circleDoc: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'c', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
    { id: 'k1', kind: 'circle', center: 'a', rim: 'c', construction: false },
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

const inspectorDoc: PatternDocument = {
  ...edgeDoc,
  constraints: [
    { id: 'w', type: 'distance', a: 'p', b: 'q', value: 50, orientation: 'horizontal' },
    { id: 'h', type: 'horizontal', a: 'p', b: 'q' },
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

/** The four lines of `lineDoc` as one closed piece. */
const pieceDoc: PatternDocument = {
  ...lineDoc,
  pieces: [
    {
      id: 'p1',
      name: 'Front',
      quantity: 2,
      edges: ['ab', 'bc', 'cd', 'da'],
      allowances: [{ edge: 'ab', width: 10 }],
    },
  ],
};

/** `pieceDoc` plus a read-only cut dimension from `a` to `c`. */
const cutDimensionDoc: PatternDocument = {
  ...pieceDoc,
  constraints: [
    {
      id: 'cut',
      type: 'derived_distance',
      piece: 'p1',
      a: { edge: 'ab', at: 'start' },
      b: { edge: 'bc', at: 'end' },
      orientation: 'horizontal',
      offset: 20,
    },
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
    const { wrapper } = await mountLoaded(simpleDoc);

    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeDefined();

    keydown('Delete');
    expect(points(wrapper)).toHaveLength(4);

    pointDown(wrapper, 'p');
    await nextTick();
    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeUndefined();

    keydown('Delete');
    await nextTick();
    expect(points(wrapper)).toHaveLength(3);

    keydown('a');
    expect(points(wrapper)).toHaveLength(3);
  });

  it('removes the selected point with Backspace and the delete button', async () => {
    const { wrapper } = await mountLoaded(simpleDoc);

    pointDown(wrapper, 'p');
    await nextTick();
    keydown('Backspace');
    await nextTick();
    expect(points(wrapper)).toHaveLength(3);

    pointDown(wrapper, 'q');
    await nextTick();
    await wrapper.find('[data-testid="delete"]').trigger('click');
    await nextTick();
    expect(points(wrapper)).toHaveLength(2);
  });

  it('deletes a multi-selection as one undo entry and summarises it', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    pointDown(wrapper, 'p');
    await nextTick();
    entityDown(wrapper, 'point', 'q', { ctrlKey: true });
    await nextTick();

    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('2 entities selected');
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('2 points');
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe('2 entities selected');
    expect(wrapper.text()).not.toContain('Select a point, line or curve to inspect it.');

    const journal = store.journal.length;
    await wrapper.find('[data-testid="selection-delete"]').trigger('click');
    await nextTick();

    expect(points(wrapper)).toHaveLength(2);
    expect(store.journal).toHaveLength(journal + 1);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);

    store.undo();
    await nextTick();

    expect(points(wrapper)).toHaveLength(4);
  });

  it('refuses a delete that would orphan one edge and names it', async () => {
    const { wrapper, store } = await mountLoaded(edgeDoc);

    pointDown(wrapper, 'p');
    await nextTick();
    entityDown(wrapper, 'point', 'q', { ctrlKey: true });
    await nextTick();

    const button = wrapper.find('[data-testid="selection-delete"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe('Include l1 in the selection to delete these points.');

    keydown('Delete');
    await nextTick();

    expect(wrapper.text()).toContain(
      'Cannot delete this selection: l1 would lose a point. Include the edge in the selection first.',
    );
    expect(points(wrapper)).toHaveLength(2);
    expect(store.document.entities.filter((entity) => entity.kind === 'line')).toHaveLength(1);
  });

  it('refuses a delete that would orphan several edges', async () => {
    const { wrapper } = await mountLoaded(lineDoc);

    pointDown(wrapper, 'a');
    await nextTick();
    entityDown(wrapper, 'point', 'b', { ctrlKey: true });
    await nextTick();

    expect(wrapper.find('[data-testid="selection-delete"]').attributes('title')).toBe(
      'Include ab, bc, da in the selection to delete these points.',
    );

    keydown('Delete');
    await nextTick();

    expect(wrapper.text()).toContain(
      'Cannot delete this selection: ab, bc, da would lose a point. Include the edges in the selection first.',
    );
    expect(points(wrapper)).toHaveLength(5);
  });

  it('leaves Delete and Escape to the canvas while a marquee is in flight', async () => {
    const { wrapper } = await mountLoaded(simpleDoc);

    pointDown(wrapper, 'p');
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);

    canvasDown(wrapper, 700, 500);
    keydown('Delete');
    await nextTick();
    expect(points(wrapper)).toHaveLength(4);

    canvasUp();
    await nextTick();

    const canvas = wrapper.findComponent(PatternCanvas);
    canvas.vm.$emit('marquee-change', true);
    keydown('Escape');
    keydown('Backspace');
    await nextTick();
    expect(points(wrapper)).toHaveLength(4);
    canvas.vm.$emit('marquee-change', false);
  });

  it('prunes a selected id that disappears underneath the selection', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    pointDown(wrapper, 'p');
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);

    store.dispatch({ id: 'external', type: 'delete_entity', params: { id: 'p' } });
    await nextTick();

    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Select a point, line or curve to inspect it.');
  });

  it('skips an id that no longer resolves when summarising a selection', async () => {
    const { wrapper } = await mountLoaded(simpleDoc);

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedEntityIds', ['p', 'ghost']);
    await nextTick();

    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('1 point');
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

  it('draws a circle through the canvas tool and undoes it in one step', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await wrapper.find('[data-testid="tool-add_circle"]').trigger('click');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'q');
    await flushPromises();

    const circle = store.document.entities.find((entity) => entity.kind === 'circle');
    expect(circle).toMatchObject({ kind: 'circle', center: 'p', rim: 'q' });
    expect(store.journal).toHaveLength(1);

    store.undo();
    await nextTick();
    expect(store.document.entities.some((entity) => entity.kind === 'circle')).toBe(false);
  });

  it('draws a circle in empty space as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;

    await wrapper.find('[data-testid="tool-add_circle"]').trigger('click');
    canvasDown(wrapper, 700, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="circle-pending-center"]').exists()).toBe(true);

    canvasDown(wrapper, 300, 200);
    await flushPromises();

    expect(store.document.entities).toHaveLength(before + 3);
    expect(store.journal).toHaveLength(1);
    expect(store.document.entities.filter((entity) => entity.kind === 'circle')).toHaveLength(1);

    store.undo();
    await nextTick();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(0);
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Circle');
  });

  it('edits a circle radius from the inspector by moving the rim', async () => {
    const { wrapper, store } = await mountLoaded(circleDoc);

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    const input = wrapper.find('[data-testid="entity-circle-radius"]');
    expect((input.element as HTMLInputElement).value).toBe('100');

    await input.setValue('50');
    await flushPromises();

    expect(store.journal.at(-1)!.command).toMatchObject({
      type: 'move_point',
      params: { id: 'c', x: 50, y: 0 },
    });
    const rim = store.document.entities.find((entity) => entity.id === 'c');
    expect(rim).toMatchObject({ x: 50, y: 0 });
  });

  it('updates a driving centre-rim dimension when editing a circle radius', async () => {
    const { wrapper, store } = await mountLoaded({
      ...circleDoc,
      constraints: [{ id: 'd1', type: 'distance', a: 'a', b: 'c', value: 100 }],
    });

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    await wrapper.find('[data-testid="entity-circle-radius"]').setValue('30');
    await flushPromises();

    expect(store.journal.at(-1)!.command).toMatchObject({
      type: 'update_constraint',
      params: { id: 'd1', value: 30 },
    });
  });

  it('moves the rim for a driven centre-rim dimension', async () => {
    const { wrapper, store } = await mountLoaded({
      ...circleDoc,
      constraints: [{ id: 'd1', type: 'distance', a: 'a', b: 'c' }],
    });

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    await wrapper.find('[data-testid="entity-circle-radius"]').setValue('25');
    await flushPromises();

    expect(store.journal.at(-1)!.command).toMatchObject({
      type: 'move_point',
      params: { id: 'c', x: 25, y: 0 },
    });
  });

  it('places the rim due east when editing a collapsed circle radius', async () => {
    const { wrapper, store } = await mountLoaded(circleDoc);

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    store.dispatch({ id: 'collapse', type: 'move_point', params: { id: 'c', x: 0, y: 0 } });
    await nextTick();

    await wrapper.find('[data-testid="entity-circle-radius"]').setValue('25');
    await flushPromises();

    expect(store.journal.at(-1)!.command).toMatchObject({
      type: 'move_point',
      params: { id: 'c', x: 25, y: 0 },
    });
  });

  it('ignores a circle radius edit when a referenced point is missing', async () => {
    const { wrapper, store } = await mountLoaded(circleDoc);

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    store.dispatch({ id: 'drop-rim', type: 'delete_entity', params: { id: 'c' } });
    await nextTick();
    const journal = store.journal.length;

    const panel = wrapper.findComponent(EntityPropertiesPanel);
    panel.vm.$emit('set-circle-radius', 'k1', 50);
    await flushPromises();

    expect(store.journal).toHaveLength(journal);
  });

  it('ignores a circle radius edit for a missing or non-circle entity', async () => {
    const { wrapper, store } = await mountLoaded(circleDoc);

    entityDown(wrapper, 'circle', 'k1');
    await nextTick();

    const panel = wrapper.findComponent(EntityPropertiesPanel);
    panel.vm.$emit('set-circle-radius', 'missing', 50);
    panel.vm.$emit('set-circle-radius', 'a', 50);
    await flushPromises();

    expect(store.journal).toHaveLength(0);
  });

  it('draws a line in empty space as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;
    const journal = store.journal.length;

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    canvasDown(wrapper, 700, 500);
    await nextTick();
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(true);

    canvasDown(wrapper, 300, 200);
    await flushPromises();

    expect(store.document.entities).toHaveLength(before + 3);
    expect(store.journal).toHaveLength(journal + 1);
    const lines = store.document.entities.filter((entity) => entity.kind === 'line');
    expect(lines).toHaveLength(1);
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(false);

    store.undo();
    await nextTick();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(journal);
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Line');
  });

  it('draws a line from an existing point to empty space', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    pointDown(wrapper, 'p');
    canvasDown(wrapper, 700, 500);
    await flushPromises();

    expect(store.document.entities).toHaveLength(before + 2);
    expect(store.journal).toHaveLength(1);
    const line = store.document.entities.find((entity) => entity.kind === 'line')!;
    expect(line).toMatchObject({ start: 'p' });
  });

  it('draws an arc in empty space as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;
    const journal = store.journal.length;

    await wrapper.find('[data-testid="tool-add_arc"]').trigger('click');
    canvasDown(wrapper, 700, 500);
    canvasDown(wrapper, 300, 500);
    canvasDown(wrapper, 500, 200);
    await flushPromises();

    // Three new points and the arc, committed as a single journal entry.
    expect(store.document.entities).toHaveLength(before + 4);
    expect(store.journal).toHaveLength(journal + 1);
    expect(wrapper.findAll('[data-kind="arc"]')).toHaveLength(1);

    store.undo();
    await nextTick();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(journal);
  });

  it('clears a pending line preview when Escape leaves the tool', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    canvasDown(wrapper, 700, 500);
    await nextTick();
    wrapper
      .findComponent(PatternCanvas)
      .find('svg')
      .element.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 650, clientY: 450 }),
      );
    await nextTick();
    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(true);

    keydown('Escape');
    await nextTick();

    expect(wrapper.find('[data-testid="line-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="line-pending-point"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');
    store.undo();
    expect(store.document.entities).toHaveLength(simpleDoc.entities.length);
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

  it('omits the stitch and fold layers when their export toggles are off', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load({
      ...createEmptyDocument(),
      entities: [
        { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'b', kind: 'point', x: 200, y: 0, construction: false, fixed: false },
        { id: 'c', kind: 'point', x: 200, y: 200, construction: false, fixed: false },
        { id: 'd', kind: 'point', x: 0, y: 200, construction: false, fixed: false },
        { id: 'bottom', kind: 'line', start: 'a', end: 'b', construction: false },
        { id: 'right', kind: 'line', start: 'b', end: 'c', construction: false },
        { id: 'top', kind: 'line', start: 'c', end: 'd', construction: false },
        { id: 'left', kind: 'line', start: 'd', end: 'a', construction: false },
      ],
      pieces: [
        {
          id: 'piece-1',
          edges: ['bottom', 'right', 'top', 'left'],
          allowances: [{ edge: 'right', width: 10, kind: 'double' }],
        },
      ],
    });

    const wrapper = await mountEditor(pinia);

    await wrapper.find('[data-testid="download-svg"]').trigger('click');
    const [, initial] = vi.mocked(downloadSvgFile).mock.calls[0]!;
    expect(initial).toContain('data-layer="stitch"');
    expect(initial).toContain('data-layer="fold"');

    await openViewDrawer(wrapper);
    await wrapper.find('[data-testid="toggle-stitch"]').setValue(false);
    await wrapper.find('[data-testid="toggle-fold"]').setValue(false);
    await wrapper.find('[data-testid="download-svg"]').trigger('click');

    const [, svg] = vi.mocked(downloadSvgFile).mock.calls[1]!;
    expect(svg).toContain('data-layer="cut"');
    expect(svg).not.toContain('data-layer="stitch"');
    expect(svg).not.toContain('data-layer="fold"');
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

  it('arms the seam allowance tool, toggles it off and leaves it with Escape', async () => {
    const { wrapper } = await mountLoaded(edgeDoc);

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Seam allowance');
    expect(wrapper.find('[data-testid="tool-add_allowance"]').attributes('aria-pressed')).toBe(
      'true',
    );

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();
    keydown('Escape');
    await nextTick();

    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');
  });

  it('attaches a default allowance from the canvas and stays armed', async () => {
    const { wrapper, store } = await mountLoaded(edgeDoc);

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'l1');
    await flushPromises();

    expect(store.document.seams).toHaveLength(1);
    expect(store.document.seams![0]).toMatchObject({ edge: 'l1', width: 10 });
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Seam allowance');
  });

  it('rejects a construction edge with the error banner', async () => {
    const guideDoc: PatternDocument = {
      ...edgeDoc,
      entities: edgeDoc.entities.map((entity) =>
        entity.kind === 'line' ? { ...entity, construction: true } : entity,
      ),
    };
    const { wrapper, store } = await mountLoaded(guideDoc);

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'l1');
    await flushPromises();

    expect(wrapper.text()).toContain('Only cut edges can carry a seam allowance');
    expect(store.document.seams).toHaveLength(0);
    expect(wrapper.find('[data-testid="flip-seam-l1"]').exists()).toBe(false);
  });

  it('does nothing when clicking an edge that already has an allowance', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });

    await wrapper.find('[data-testid="tool-add_allowance"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'l1');
    await flushPromises();

    expect(store.document.seams).toHaveLength(1);
    expect(store.journal).toHaveLength(0);
  });

  it('edits a seam width by double-clicking and restores it with undo', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });

    await wrapper.find('[data-seam-hit="l1"]').trigger('dblclick');
    await flushPromises();

    const input = wrapper.find('[data-testid="seam-width-input"]');
    expect((input.element as HTMLInputElement).value).toBe('10');
    await input.setValue('15');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(store.document.seams![0]).toMatchObject({ id: 's1', width: 15 });
    expect((wrapper.find('[data-testid="seam-width-l1"]').element as HTMLInputElement).value).toBe(
      '15',
    );

    await wrapper.find('[data-testid="undo"]').trigger('click');
    await flushPromises();

    expect(store.document.seams![0]).toMatchObject({ width: 10 });
  });

  it('edits the sidebar width and snaps back on invalid or unchanged input', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });
    const field = () => wrapper.find('[data-testid="seam-width-l1"]');

    await field().setValue('18');
    await field().trigger('change');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ width: 18 });
    const journal = store.journal.length;

    await field().setValue('0');
    await field().trigger('change');
    await nextTick();
    expect(store.document.seams![0]).toMatchObject({ width: 18 });
    expect((field().element as HTMLInputElement).value).toBe('18');

    await field().setValue('18');
    await field().trigger('change');
    await flushPromises();
    expect(store.journal).toHaveLength(journal);

    await field().setValue('22');
    await field().trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ width: 22 });
  });

  it('flips a seam side from the outline twice and undoes one flip', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });
    const flip = () => wrapper.find('[data-testid="flip-seam-l1"]');

    expect(flip().attributes('aria-label')).toBe('Flip side of the seam allowance for l1');

    await flip().trigger('click');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ id: 's1', side: 'right' });

    await flip().trigger('click');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ side: 'left' });
    expect(store.journal).toHaveLength(2);

    await wrapper.find('[data-testid="undo"]').trigger('click');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ side: 'right' });
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);
  });

  it('shows No allowance for an unattached edge with no add control', async () => {
    const { wrapper } = await mountLoaded(edgeDoc);

    expect(wrapper.find('[data-testid="seam-empty-l1"]').text()).toBe('No allowance');
    expect(wrapper.find('[data-testid="add-seam-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="seam-width-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="flip-seam-l1"]').exists()).toBe(false);
  });

  it('removes an allowance and its dashed path', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });

    await wrapper.find('[data-testid="remove-seam-l1"]').trigger('click');
    await flushPromises();

    expect(store.document.seams).toHaveLength(0);
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="seam-empty-l1"]').exists()).toBe(true);
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
    expect(wrapper.find('[data-testid="dimension-state-width"]').text()).toBe('Set');
    expect(wrapper.find('[data-testid="dimension-state-height"]').text()).toBe('Set');

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

  it('clears a set dimension to driven from the sidebar and undoes it', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    const input = wrapper.find('[data-testid="dimension-value-w"]');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(input.attributes('aria-label')).toBe('Value for w (set)');

    await input.setValue('');
    await flushPromises();

    expect(store.document.constraints[0]).not.toHaveProperty('value');
    expect(wrapper.find('[data-testid="dimension-state-w"]').text()).toBe('Driven');
    expect(
      (wrapper.find('[data-testid="dimension-value-w"]').element as HTMLInputElement).value,
    ).toBe('100');
    expect(wrapper.find('[data-testid="dimension-value-w"]').attributes('aria-label')).toBe(
      'Value for w (driven)',
    );
    expect(store.document.entities.find((entity) => entity.id === 'b')).toMatchObject({
      x: 100,
      y: 0,
    });

    await wrapper.find('[data-testid="undo"]').trigger('click');
    await nextTick();
    expect(store.document.constraints[0]).toMatchObject({ value: 100 });
    expect(wrapper.find('[data-testid="dimension-state-w"]').text()).toBe('Set');

    await wrapper.find('[data-testid="redo"]').trigger('click');
    await nextTick();
    expect(store.document.constraints[0]).not.toHaveProperty('value');
  });

  it('sets a driven dimension from the sidebar', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'm', type: 'distance', a: 'a', b: 'b' }],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-state-m"]').text()).toBe('Driven');
    expect(
      (wrapper.find('[data-testid="dimension-value-m"]').element as HTMLInputElement).value,
    ).toBe('100');

    await wrapper.find('[data-testid="dimension-value-m"]').setValue('150');
    await wrapper.find('[data-testid="dimension-value-m"]').trigger('change');
    await flushPromises();

    expect(store.document.constraints[0]).toMatchObject({ value: 150 });
    expect(wrapper.find('[data-testid="dimension-state-m"]').text()).toBe('Set');
    expect(wrapper.find('[data-testid="dimension-value-m"]').attributes('aria-label')).toBe(
      'Value for m (set)',
    );
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

  it('relinks a broken dimension from the drawer and removes the reference again', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [
        { id: 'w', type: 'distance', a: 'a', b: 'b', reference: 'gone', lastKnownValue: 80 },
        { id: 'h', type: 'distance', a: 'b', b: 'c', value: 60 },
      ],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    const input = wrapper.find('[data-testid="dimension-value-w"]');
    expect(wrapper.find('[data-testid="dimension-state-w"]').text()).toBe('Broken');
    expect((input.element as HTMLInputElement).value).toBe('80');
    expect(wrapper.find('[data-testid="dimension-broken-w"]').text()).toBe(
      'Source gone is missing. Type a value or press # to re-link.',
    );
    expect(wrapper.find('[data-testid="dimension-reference-w"]').text()).toBe('Re-link');

    await wrapper.find('[data-testid="dimension-reference-w"]').trigger('click');
    expect(wrapper.find('[data-testid="dimension-reference-option-h"]').text()).toBe(
      'h · 60 mm · b → c · Aligned',
    );
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(store.document.constraints.find((constraint) => constraint.id === 'w')).toMatchObject({
      reference: 'h',
    });
    expect(wrapper.find('[data-testid="dimension-state-w"]').text()).toBe('Referenced');
    expect(
      (wrapper.find('[data-testid="dimension-value-w"]').element as HTMLInputElement).value,
    ).toBe('#h');
    expect(wrapper.find('[data-testid="dimension-source-w"]').text()).toContain('Source: h');

    await wrapper.find('[data-testid="dimension-unlink-w"]').trigger('click');
    await flushPromises();

    expect(store.document.constraints.find((constraint) => constraint.id === 'w')).toMatchObject({
      value: 60,
    });
    expect(wrapper.find('[data-testid="dimension-state-w"]').text()).toBe('Set');
  });

  it('opens the drawer picker from #, filters it and closes it with Escape or a value', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [
        { id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 },
        { id: 'h', type: 'distance', a: 'b', b: 'c', value: 60 },
      ],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    const input = wrapper.find('[data-testid="dimension-value-w"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    (input.element as HTMLInputElement).value = '#';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-option-h"]').exists()).toBe(true);
    expect(input.attributes('aria-expanded')).toBe('true');

    const heightInput = wrapper.find('[data-testid="dimension-value-h"]');
    await heightInput.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(true);
    expect(input.attributes('aria-activedescendant')).toBe('dimension-drawer-reference-list-w-h');

    await input.trigger('keydown', { key: 'ArrowUp' });
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);

    (input.element as HTMLInputElement).value = '#zzz';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-empty"]').text()).toBe(
      'No other dimensions can be referenced.',
    );
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(store.journal).toHaveLength(0);

    await input.trigger('keydown', { key: 'Escape' });
    (input.element as HTMLInputElement).value = '#zzz';
    await input.trigger('change');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(store.journal).toHaveLength(0);

    (input.element as HTMLInputElement).value = '#';
    await input.trigger('input');
    (input.element as HTMLInputElement).value = '120';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);

    await wrapper.find('[data-testid="dimension-reference-w"]').trigger('click');
    await wrapper.find('[data-testid="dimension-reference-option-h"]').trigger('click');
    await flushPromises();

    expect(store.document.constraints.find((constraint) => constraint.id === 'w')).toMatchObject({
      reference: 'h',
    });
  });

  it('keeps an unmeasurable driven dimension in the drawer', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'ghost', type: 'distance', a: 'a', b: 'missing' }],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    await nextTick();

    expect(
      (wrapper.find('[data-testid="dimension-value-ghost"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(store.journal).toHaveLength(0);
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
      'Curves and arcs are not supported yet; pick a point or a line.',
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

  it('reports the active tool and opens the inspector for a selection', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Select a point, line or curve to inspect it.');

    pointDown(wrapper, 'a');
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Point');
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');

    canvasDown(wrapper, 700, 500);
    canvasUp();
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tool-add_line"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Line');
  });

  it('inspects a selected line with its length and related rows', async () => {
    const { wrapper } = await mountLoaded(inspectorDoc);

    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Line');
    expect(wrapper.find('[data-testid="entity-length"]').text()).toBe('50 mm');
    expect(wrapper.find('[data-testid="entity-dimension-w"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-constraint-h"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workspace-summary"]').text()).toContain('0 command(s)');
  });

  it('adds, edits and removes an allowance from the inspector', async () => {
    const { wrapper, store } = await mountLoaded(inspectorDoc);
    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    await wrapper.find('[data-testid="entity-add-seam"]').trigger('click');
    await flushPromises();
    expect(store.document.seams).toEqual([
      { id: expect.any(String), edge: 'l1', width: 10, side: 'left' },
    ]);

    const width = wrapper.find('[data-testid="entity-seam-width"]');
    expect((width.element as HTMLInputElement).value).toBe('10');
    await width.setValue('15');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ width: 15 });

    await wrapper.find('[data-testid="entity-flip-seam"]').trigger('click');
    await flushPromises();
    expect(store.document.seams![0]).toMatchObject({ width: 15, side: 'right' });

    await wrapper.find('[data-testid="entity-remove-seam"]').trigger('click');
    await flushPromises();
    expect(store.document.seams).toHaveLength(0);
    expect(wrapper.find('[data-testid="entity-add-seam"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-flip-seam"]').exists()).toBe(false);
  });

  it('converts the selection between construction and cut from the inspector', async () => {
    const { wrapper, store } = await mountLoaded(inspectorDoc);
    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    const construction = wrapper.find('[data-testid="entity-construction"]');
    expect((construction.element as HTMLInputElement).checked).toBe(false);

    await construction.setValue(true);
    await flushPromises();

    expect(store.document.entities.find((entity) => entity.id === 'l1')).toMatchObject({
      construction: true,
    });
    expect(wrapper.find('[data-testid="entity-seam-construction"]').exists()).toBe(true);
  });

  it('edits and removes related dimensions and constraints from the inspector', async () => {
    const { wrapper, store } = await mountLoaded(inspectorDoc);
    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    const value = wrapper.find('[data-testid="entity-dimension-value-w"]');
    expect((value.element as HTMLInputElement).value).toBe('50');

    await value.setValue('0');
    await flushPromises();
    expect((value.element as HTMLInputElement).value).toBe('50');
    expect(store.journal).toHaveLength(0);

    await value.setValue('60');
    await flushPromises();
    expect(store.document.constraints.find((constraint) => constraint.id === 'w')).toMatchObject({
      value: 60,
    });

    await wrapper.find('[data-testid="entity-remove-dimension-w"]').trigger('click');
    await flushPromises();
    expect(store.document.constraints.some((constraint) => constraint.id === 'w')).toBe(false);

    await wrapper.find('[data-testid="entity-remove-constraint-h"]').trigger('click');
    await flushPromises();
    expect(store.document.constraints).toHaveLength(0);
    expect(wrapper.text()).toContain('No constraints on this line.');
  });

  it('relates a point selection to constraints on that point', async () => {
    const { wrapper } = await mountLoaded(inspectorDoc);

    pointDown(wrapper, 'p');
    await nextTick();

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Point');
    expect(wrapper.find('[data-testid="entity-dimension-w"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-constraint-h"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
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
    ).toBe('(100)');
    expect(store.document.entities.find((entity) => entity.id === 'b')).toMatchObject({
      x: 100,
      y: 0,
    });

    canvasDown(wrapper, 400, 300);
    await flushPromises();

    const constraint = store.document.constraints[0]!;
    expect(constraint).toMatchObject({
      type: 'distance',
      a: 'a',
      b: 'b',
      orientation: 'aligned',
      offset: 20,
    });
    expect(constraint).not.toHaveProperty('value');
    expect(store.document.entities.find((entity) => entity.id === 'b')).toMatchObject({
      x: 100,
      y: 0,
    });
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
      expect.objectContaining({ type: 'distance', a: 'p', b: 'q' }),
    ]);
    expect(store.document.constraints[0]).not.toHaveProperty('value');
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

    const dragged = distanceOffset(store.document.constraints[0]);
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

    expect(distanceOffset(store.document.constraints[0])).toBe(3);
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

    expect(distanceOffset(store.document.constraints[0])).not.toBe(3);
    expect(wrapper.find('[data-testid="tool-dimension"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="dimension-lines-dimension-preview"]').exists()).toBe(false);
  });

  it('keeps a re-placed driven dimension driven', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'm', type: 'distance', a: 'a', b: 'b', offset: 3 }],
    });

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.document.constraints[0]).toMatchObject({ id: 'm', offset: 20 });
    expect(store.document.constraints[0]).not.toHaveProperty('value');
  });

  it('clears a set dimension inline on the canvas', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await wrapper.find('[data-testid="dimension-label-w"]').trigger('dblclick');
    await nextTick();
    await wrapper.find('[data-testid="dimension-editor"]').setValue('');
    await wrapper.find('[data-testid="dimension-editor"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(store.document.constraints[0]).not.toHaveProperty('value');
    expect(wrapper.find('[data-testid="dimension-label-w"]').find('text').text()).toBe('(100)');
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

  it('rounds a corner from the canvas picks and stays armed for the next one', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the first line.',
    );

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the second line.',
    );

    entityDown(wrapper, 'line', 'bc');
    await flushPromises();
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — set the radius.',
    );

    const input = wrapper.find('[data-testid="corner-round-value"]');
    expect((input.element as HTMLInputElement).value).toBe('5');
    expect(wrapper.find('[data-testid="corner-round-max"]').text()).toBe('Maximum 99.999 mm');

    await input.setValue('10');
    expect(wrapper.findComponent(PatternCanvas).props('cornerRoundPreviewRadius')).toBe(10);

    await wrapper.find('[data-testid="corner-round-prompt-bar"] form').trigger('submit');
    await flushPromises();

    expect(store.document.cornerRounds).toHaveLength(1);
    expect(store.document.cornerRounds?.[0]).toMatchObject({ radius: 10 });
    expect(store.document.cornerRounds?.[0]?.id).toMatch(/^corner-round-/);
    expect(wrapper.find('[data-testid="corner-round-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the first line.',
    );
    expect(wrapper.find('[data-testid="tool-round_corner"]').attributes('aria-pressed')).toBe(
      'true',
    );
  });

  it('rejects bad picks with a concrete reason and clears them on Escape', async () => {
    const { wrapper } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();

    pointDown(wrapper, 'a');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-rejection"]').text()).toBe('Pick a line.');

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    entityDown(wrapper, 'line', 'cd');
    await flushPromises();
    expect(wrapper.find('[data-testid="corner-round-rejection"]').text()).toBe(
      'The lines must meet at a corner.',
    );
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the second line.',
    );

    keydown('Escape');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-prompt-bar"]').exists()).toBe(false);
    expect(wrapper.findComponent(PatternCanvas).classes()).toContain('cursor-default');
  });

  it('cancels the picks but keeps the tool armed', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    await wrapper.find('[data-testid="corner-round-cancel"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the first line.',
    );
    expect(wrapper.find('[data-testid="corner-round-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tool-round_corner"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(store.journal).toHaveLength(0);
  });

  it('keeps Apply disabled and explains an unusable radius', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    entityDown(wrapper, 'line', 'bc');
    await flushPromises();

    await wrapper.find('[data-testid="corner-round-value"]').setValue('200');

    expect(wrapper.find('[data-testid="corner-round-value-error"]').text()).toBe(
      'Radius 200 mm is too large for these lines; the maximum is 99.999 mm.',
    );
    expect(wrapper.find('[data-testid="corner-round-apply"]').attributes('disabled')).toBeDefined();
    expect(store.journal).toHaveLength(0);
  });

  it('clears a stale pick when its line disappears', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    store.dispatch({ id: 'delete-ab', type: 'delete_entity', params: { id: 'ab' } });
    await nextTick();

    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the first line.',
    );
  });

  it('keeps a valid pick when another command changes the document', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    store.dispatch({ id: 'point-x', type: 'add_point', params: { x: 10, y: 10 } });
    await nextTick();

    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the second line.',
    );
  });

  it('clears both picks when the second line disappears', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    entityDown(wrapper, 'line', 'bc');
    await flushPromises();

    store.dispatch({ id: 'delete-bc', type: 'delete_entity', params: { id: 'bc' } });
    await nextTick();

    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the first line.',
    );
  });

  it('ignores Apply before both lines are picked', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();

    wrapper.findComponent(CornerRoundPromptBar).vm.$emit('apply', 10);
    await nextTick();

    expect(store.journal).toHaveLength(0);
  });

  it('edits and removes a round from the inspector', async () => {
    const rounded = executeCommand(lineDoc, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'bc', radius: 10 },
    }).document;
    const { wrapper, store } = await mountLoaded(rounded);

    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    const input = wrapper.find('[data-testid="entity-corner-radius-r1"]');
    expect((input.element as HTMLInputElement).value).toBe('10');

    await input.setValue('20');
    await flushPromises();
    expect(store.document.cornerRounds?.[0]?.radius).toBe(20);

    await wrapper.find('[data-testid="entity-remove-corner-round-r1"]').trigger('click');
    await flushPromises();
    expect(store.document.cornerRounds).toEqual([]);
  });

  it('creates a piece from a selected closed loop and clears the selection', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    const create = () => wrapper.find('[data-testid="create-piece"]');

    expect(create().attributes('disabled')).toBeDefined();

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    entityDown(wrapper, 'line', 'bc', { ctrlKey: true });
    await nextTick();
    entityDown(wrapper, 'line', 'cd', { ctrlKey: true });
    await nextTick();
    entityDown(wrapper, 'line', 'da', { ctrlKey: true });
    await nextTick();

    expect(create().attributes('disabled')).toBeUndefined();
    await create().trigger('click');
    await flushPromises();

    expect(store.document.pieces).toHaveLength(1);
    expect(store.document.pieces[0]).toMatchObject({
      edges: ['ab', 'bc', 'cd', 'da'],
      allowances: [],
    });
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
  });

  it('explains why a selection cannot become a piece', async () => {
    const { wrapper } = await mountLoaded(lineDoc);

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'create_piece');
    await flushPromises();

    expect(wrapper.text()).toContain('Select at least three cut edges to create a piece.');
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);
  });

  it('creates a read-only cut dimension between two loop vertices', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'c');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({
        type: 'derived_distance',
        piece: 'p1',
        a: { edge: 'ab', at: 'start' },
        b: { edge: 'bc', at: 'end' },
      }),
    ]);
  });

  it('shows a cut dimension as read-only and refuses edits in the drawer', async () => {
    const { wrapper, store } = await mountLoaded(cutDimensionDoc);

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    const input = wrapper.find('[data-testid="dimension-value-cut"]');

    expect(input.attributes('readonly')).toBeDefined();
    expect(wrapper.find('[data-testid="dimension-readonly-cut"]').exists()).toBe(true);
    const before = (input.element as HTMLInputElement).value;

    await input.setValue('999');
    await input.trigger('change');
    await flushPromises();

    expect((input.element as HTMLInputElement).value).toBe(before);
    expect(store.document.constraints).toEqual(cutDimensionDoc.constraints);
    expect(store.journal).toHaveLength(0);
  });

  it('shows a broken cut dimension as an empty read-only field', async () => {
    const { wrapper } = await mountLoaded({
      ...cutDimensionDoc,
      constraints: [
        {
          id: 'cut',
          type: 'derived_distance',
          piece: 'p1',
          a: { edge: 'ab', at: 'start' },
          b: { edge: 'missing', at: 'end' },
          orientation: 'horizontal',
          offset: 20,
        },
      ],
    });

    await wrapper.find('[data-testid="drawer-toggle-dimensions"]').trigger('click');
    const input = wrapper.find('[data-testid="dimension-value-cut"]');

    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('readonly')).toBeDefined();
    expect(wrapper.find('[data-testid="dimension-state-cut"]').text()).toBe('Broken');
    expect(wrapper.find('[data-testid="dimension-readonly-cut"]').exists()).toBe(true);
  });

  it('edits the piece card and removes the piece', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    const name = wrapper.find('[data-testid="entity-piece-name"]');
    await name.setValue('Back');
    await name.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.name).toBe('Back');

    const quantity = wrapper.find('[data-testid="entity-piece-quantity"]');
    await quantity.setValue('4');
    await quantity.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.quantity).toBe(4);

    const kind = wrapper.find('[data-testid="entity-piece-kind-ab"]');
    await kind.setValue('single');
    await kind.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.allowances[0]).toMatchObject({ kind: 'single', width: 10 });

    const width = wrapper.find('[data-testid="entity-piece-width-ab"]');
    await width.setValue('12');
    await width.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.allowances[0]).toMatchObject({ width: 12 });

    await kind.setValue('none');
    await kind.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.allowances).toEqual([]);

    await wrapper.find('[data-testid="entity-remove-piece-p1"]').trigger('click');
    await flushPromises();
    expect(store.document.pieces).toEqual([]);
  });

  it('describes an edge that belongs to a piece in the outline', async () => {
    const { wrapper } = await mountLoaded(pieceDoc);

    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    expect(wrapper.find('[data-testid="edge-piece-ab"]').text()).toContain('In piece p1');
    expect(wrapper.find('[data-testid="edge-piece-ab"]').text()).toContain('seam 10 mm');
  });
});
