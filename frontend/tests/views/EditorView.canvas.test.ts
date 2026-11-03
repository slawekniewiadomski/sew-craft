import { createEmptyDocument, executeCommand, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
import { downloadSvgFile } from '@/lib/download';
import { useEditorStore } from '@/stores/editor';
import {
  canvasDown,
  canvasUp,
  circleDoc,
  edgeDoc,
  entityDown,
  keydown,
  lineDoc,
  mountEditor,
  mountLoaded,
  openExport,
  openPanel,
  pointDown,
  points,
  roundedLineDoc,
  selectRectangleMode,
  simpleDoc,
  toggleDisplay,
  withPiece,
} from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

describe('EditorView', () => {
  it('loads the stored sketch on mount', async () => {
    const wrapper = await mountEditor(createPinia());

    expect(points(wrapper)).toHaveLength(4);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(8);
    expect(wrapper.text()).toContain('0 command(s)');
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');
  });

  it('switches the active tool and reflects it on the canvas', async () => {
    const wrapper = await mountEditor(createPinia());
    const canvas = wrapper.findComponent(PatternCanvas);

    expect(canvas.classes()).toContain('cursor-default');

    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    await nextTick();

    expect(canvas.classes()).toContain('cursor-crosshair');
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Point');

    // Clicking the active tool again returns to Select.
    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Select');
    expect(canvas.classes()).toContain('cursor-default');
  });

  it('adds a point through the canvas, then undoes and redoes it', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');
    canvasDown(wrapper, 400, 300);
    await flushPromises();
    expect(points(wrapper)).toHaveLength(5);
    expect(wrapper.text()).toContain('1 command(s)');

    await wrapper.find('[data-testid="undo"]').trigger('click');
    expect(points(wrapper)).toHaveLength(4);

    await wrapper.find('[data-testid="redo"]').trigger('click');
    expect(points(wrapper)).toHaveLength(5);
  });

  it('creates a point on a line as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-on-line', 'ab', 30, 12);
    await flushPromises();

    const created = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.x === 30 && entity.y === 0,
    );
    expect(created).toBeDefined();
    expect(store.document.constraints).toEqual([
      {
        id: expect.any(String),
        type: 'point_on_line',
        piece: 'pc1',
        point: created!.id,
        a: 'a',
        b: 'b',
      },
    ]);
    expect(store.journal).toHaveLength(1);
    expect(wrapper.text()).toContain('1 command(s)');

    await wrapper.find('[data-testid="undo"]').trigger('click');
    expect(store.document.entities.some((entity) => entity.id === created!.id)).toBe(false);
    expect(store.document.constraints).toEqual([]);
  });

  it('creates a point on a rounded line with its authored anchors', async () => {
    const { wrapper, store } = await mountLoaded(roundedLineDoc);

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-on-line', 'ab', 30, 12);
    await flushPromises();

    const created = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.x === 30 && entity.y === 0,
    );
    expect(created).toBeDefined();
    expect(store.document.constraints).toEqual([
      {
        id: expect.any(String),
        type: 'point_on_line',
        piece: 'pc1',
        point: created!.id,
        a: 'a',
        b: 'b',
      },
    ]);
    expect(store.journal).toHaveLength(1);
    expect(wrapper.text()).not.toContain('This point is derived by a corner round');
  });

  it('creates a derived midpoint point as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-midpoint', 'ab');
    await flushPromises();

    const created = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.x === 50 && entity.y === 0,
    );
    expect(created).toBeDefined();
    expect(store.document.constraints).toEqual([
      {
        id: expect.any(String),
        type: 'midpoint',
        piece: 'pc1',
        point: created!.id,
        line: 'ab',
      },
    ]);
    expect(store.journal).toHaveLength(1);

    await wrapper.find('[data-testid="undo"]').trigger('click');
    expect(store.document.entities.some((entity) => entity.id === created!.id)).toBe(false);
    expect(store.document.constraints).toEqual([]);
  });

  it('dispatches nothing when the midpoint line no longer resolves', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    const before = store.document;

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-midpoint', 'missing');
    await flushPromises();

    expect(store.document).toBe(before);
    expect(store.journal).toHaveLength(0);
  });

  it('draws between two midpoints as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    const before = store.document.entities.filter((entity) => entity.kind === 'line').length;

    wrapper
      .findComponent(PatternCanvas)
      .vm.$emit(
        'add-line',
        { kind: 'midpoint', lineId: 'ab', x: 50, y: 0 },
        { kind: 'midpoint', lineId: 'bc', x: 100, y: 50 },
      );
    await flushPromises();

    expect(store.journal).toHaveLength(1);
    expect(store.document.entities.filter((entity) => entity.kind === 'line')).toHaveLength(
      before + 1,
    );
    expect(
      store.document.constraints.filter((constraint) => constraint.type === 'midpoint'),
    ).toEqual([
      expect.objectContaining({ point: expect.any(String), line: 'ab' }),
      expect.objectContaining({ point: expect.any(String), line: 'bc' }),
    ]);
  });

  it('dispatches nothing when the point-on-line line no longer resolves', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    const before = store.document;

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point-on-line', 'missing', 30, 12);
    await flushPromises();

    expect(store.document).toBe(before);
    expect(store.journal).toHaveLength(0);
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
    expect(wrapper.text()).not.toContain(
      'Select a point, line, curve, arc, circle or dimension on the canvas or in a drawer.',
    );

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
    expect(wrapper.text()).toContain(
      'Select a point, line, curve, arc, circle or dimension on the canvas or in a drawer.',
    );
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

  it('draws a rectangle over existing corners and undoes the four sides in one step', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;

    await selectRectangleMode(wrapper, 'add_rectangle');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'r');
    await flushPromises();

    expect(store.journal).toHaveLength(1);
    expect(store.document.entities).toHaveLength(before + 4);
    expect(store.document.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(store.document.entities.filter((entity) => entity.kind === 'point')).toHaveLength(4);

    store.undo();
    await nextTick();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(0);
  });

  it('draws a rectangle in empty space as one undoable gesture', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);
    const before = store.document.entities.length;

    await selectRectangleMode(wrapper, 'add_center_rectangle');
    canvasDown(wrapper, 700, 200);
    await nextTick();
    expect(wrapper.findAll('[data-testid^="rectangle-pending-corner-"]')).toHaveLength(1);

    canvasDown(wrapper, 300, 500);
    await flushPromises();

    expect(store.document.entities).toHaveLength(before + 8);
    expect(store.journal).toHaveLength(1);
    expect(wrapper.find('[data-testid="active-tool"]').text()).toBe('Centre rectangle');

    store.undo();
    await nextTick();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(0);
  });

  it('constrains a fresh rectangle and leaves a reused-corner one alone', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await selectRectangleMode(wrapper, 'add_rectangle');
    canvasDown(wrapper, 700, 500);
    canvasDown(wrapper, 300, 200);
    await flushPromises();

    const fresh = store.document.constraints.map((constraint) => constraint.type);
    expect(fresh).toHaveLength(4);
    expect(fresh.filter((type) => type === 'horizontal')).toHaveLength(2);
    expect(fresh.filter((type) => type === 'vertical')).toHaveLength(2);

    store.undo();
    await nextTick();
    expect(store.document.constraints).toHaveLength(0);

    const lateral = await mountLoaded(simpleDoc);
    await selectRectangleMode(lateral.wrapper, 'add_rectangle');
    pointDown(lateral.wrapper, 'p');
    pointDown(lateral.wrapper, 'r');
    await flushPromises();

    expect(lateral.store.document.constraints).toHaveLength(0);
    expect(lateral.store.document.entities.filter((entity) => entity.kind === 'line')).toHaveLength(
      4,
    );
  });

  it('constrains a rotated rectangle with three right angles', async () => {
    const { wrapper, store } = await mountLoaded(simpleDoc);

    await selectRectangleMode(wrapper, 'add_3point_rectangle');
    canvasDown(wrapper, 300, 500);
    canvasDown(wrapper, 300, 300);
    canvasDown(wrapper, 500, 400);
    await flushPromises();

    const angles = store.document.constraints.filter((constraint) => constraint.type === 'angle');
    expect(angles).toHaveLength(3);
    for (const angle of angles) {
      expect(angle.type === 'angle' ? Math.abs(angle.value) : 0).toBeCloseTo(Math.PI / 2);
    }
  });

  it('adds no constraints to a rectangle drawn onto constrained geometry', async () => {
    const constrained: PatternDocument = {
      ...simpleDoc,
      constraints: [{ id: 'h', type: 'horizontal', a: 'p', b: 'q' }],
    };
    const { wrapper, store } = await mountLoaded(constrained);

    await selectRectangleMode(wrapper, 'add_rectangle');
    pointDown(wrapper, 'p');
    pointDown(wrapper, 'r');
    await flushPromises();

    expect(store.document.constraints).toEqual([{ id: 'h', type: 'horizontal', a: 'p', b: 'q' }]);
    expect(store.document.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(store.journal).toHaveLength(1);
  });

  it('rolls a failing rectangle batch back and reports why', async () => {
    const rounded = executeCommand(lineDoc, {
      id: 'r1',
      type: 'add_corner_round',
      params: { first: 'ab', second: 'bc', radius: 10 },
    }).document;
    const tangent = rounded.cornerRounds![0]!.ends[0]!.tangent;
    const { wrapper, store } = await mountLoaded(rounded);
    const before = store.document.entities.length;

    wrapper.findComponent(PatternCanvas).vm.$emit('add-rectangle', 'diagonal', [
      { kind: 'point', id: tangent },
      { kind: 'point', id: 'e' },
    ]);
    await flushPromises();

    expect(store.document.entities).toHaveLength(before);
    expect(store.journal).toHaveLength(0);
    expect(wrapper.text()).toContain('derived by a corner round');
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
});

describe('EditorView', () => {
  it('does not seed when a document is already loaded', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    const loaded: PatternDocument = withPiece({
      ...createEmptyDocument(),
      entities: [
        { id: 'p', kind: 'point', x: 1, y: 2, construction: false, fixed: false },
        { id: 'q', kind: 'point', x: 3, y: 4, construction: false, fixed: false },
        { id: 'c', kind: 'line', start: 'p', end: 'q', construction: true },
        { id: 'l', kind: 'line', start: 'p', end: 'missing', construction: false },
      ],
    });
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

    await openExport(wrapper);
    await wrapper.find('[data-testid="export-download"]').trigger('click');

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
    store.load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'guide', kind: 'point', x: 1, y: 2, construction: true, fixed: false },
          { id: 'cut', kind: 'point', x: 3, y: 4, construction: false, fixed: false },
        ],
      }),
    );

    const wrapper = await mountEditor(pinia);
    const rendered = points(wrapper);

    expect(rendered).toHaveLength(2);
    expect(rendered[0]!.classes()).toContain('fill-muted-foreground');
    expect(rendered[1]!.classes()).toContain('fill-foreground');
  });

  it('includes construction geometry in the download when toggled on', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load(
      withPiece(
        {
          ...lineDoc,
          entities: [
            ...lineDoc.entities,
            { id: 'guide', kind: 'line', start: 'a', end: 'c', construction: true },
          ],
        },
        'pc1',
        ['ab', 'bc', 'cd', 'da'],
      ),
    );

    const wrapper = await mountEditor(pinia);

    await openExport(wrapper);
    await wrapper.find('[data-testid="export-construction"]').setValue(true);
    await wrapper.find('[data-testid="export-download"]').trigger('click');

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

    await openExport(wrapper);
    await wrapper.find('[data-testid="export-download"]').trigger('click');
    const [, initial] = vi.mocked(downloadSvgFile).mock.calls[0]!;
    expect(initial).toContain('data-layer="stitch"');
    expect(initial).toContain('data-layer="fold"');

    await openExport(wrapper);
    await wrapper.find('[data-testid="export-stitch"]').setValue(false);
    await wrapper.find('[data-testid="export-fold"]').setValue(false);
    await wrapper.find('[data-testid="export-download"]').trigger('click');

    const [, svg] = vi.mocked(downloadSvgFile).mock.calls[1]!;
    expect(svg).toContain('data-layer="cut"');
    expect(svg).not.toContain('data-layer="stitch"');
    expect(svg).not.toContain('data-layer="fold"');
  });

  it('hides construction geometry without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
          { id: 'cut', kind: 'line', start: 'p', end: 'q', construction: false },
          { id: 'guide', kind: 'line', start: 'p', end: 'q', construction: true },
        ],
      }),
    );

    const wrapper = await mountEditor(pinia);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(4);

    await toggleDisplay(wrapper, 'construction');

    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(2);
    expect(wrapper.find('line').attributes('stroke-dasharray')).toBeUndefined();
    expect(store.journal).toHaveLength(0);
  });

  it('persists display choices per project and restores them on mount', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useEditorStore().load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
          { id: 'cut', kind: 'line', start: 'p', end: 'q', construction: false },
          { id: 'guide', kind: 'line', start: 'p', end: 'q', construction: true },
        ],
      }),
    );

    const wrapper = await mountEditor(pinia);
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(4);

    await toggleDisplay(wrapper, 'construction');
    expect(wrapper.findAll('[data-kind="line"]')).toHaveLength(2);

    const stored = JSON.parse(window.localStorage.getItem('sewcraft:display:1')!) as {
      piece: { construction: boolean };
    };
    expect(stored.piece.construction).toBe(false);

    wrapper.unmount();
    const remounted = await mountEditor(createPinia());
    expect(remounted.findAll('[data-kind="line"]')).toHaveLength(2);
  });

  it('converts a cut edge to construction and undoes it', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
          { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: false },
        ],
      }),
    );

    const wrapper = await mountEditor(pinia);
    await openPanel(wrapper, 'outline');
    expect(wrapper.text()).toContain('1 cut edge(s)');

    await wrapper.find('[data-testid="outline-construction-l1"]').trigger('click');

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
    store.load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 10, y: 0, construction: false, fixed: false },
          { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: true },
        ],
      }),
    );

    const wrapper = await mountEditor(pinia);
    await openPanel(wrapper, 'outline');

    await wrapper.find('[data-testid="outline-construction-l1"]').trigger('click');

    expect(wrapper.find('line').attributes('stroke-dasharray')).toBeUndefined();
    expect(wrapper.text()).toContain('1 cut edge(s)');
  });

  it('no longer offers the Seam allowance tool in the ribbon', async () => {
    const { wrapper } = await mountLoaded(edgeDoc);

    expect(wrapper.find('[data-testid="tool-add_allowance"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="editor-ribbon"]').text()).not.toContain('Seam allowance');
  });

  it('renders a legacy allowance as read-only text with no editor', async () => {
    const { wrapper } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });
    await openPanel(wrapper, 'outline');

    expect(wrapper.find('[data-testid="seam-label-l1"]').text()).toBe('Allowance 10 mm');
    expect(wrapper.find('[data-testid="seam-width-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="flip-seam-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="remove-seam-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-seam-hit]').exists()).toBe(false);
  });

  it('shows No allowance for an unattached edge with no add control', async () => {
    const { wrapper } = await mountLoaded(edgeDoc);
    await openPanel(wrapper, 'outline');

    expect(wrapper.find('[data-testid="seam-empty-l1"]').text()).toBe('No allowance');
    expect(wrapper.find('[data-testid="add-seam-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="seam-width-l1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="flip-seam-l1"]').exists()).toBe(false);
  });

  it('keeps the legacy dashed path without offering removal', async () => {
    const { wrapper, store } = await mountLoaded({
      ...edgeDoc,
      seams: [{ id: 's1', edge: 'l1', width: 10 }],
    });

    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-seam-l1"]').exists()).toBe(false);
    expect(store.document.seams).toHaveLength(1);
  });

  it('hides allowances without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load({ ...edgeDoc, seams: [{ id: 's1', edge: 'l1', width: 10 }] });

    const wrapper = await mountEditor(pinia);
    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(true);

    await toggleDisplay(wrapper, 'allowances');
    await nextTick();

    expect(wrapper.find('[data-seam-edge="l1"]').exists()).toBe(false);
    expect(store.document.seams).toHaveLength(1);
    expect(store.journal).toHaveLength(0);
  });

  it('shows constraint badges by default and hides them without changing the document', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.load(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
        ],
        constraints: [{ id: 'h', type: 'horizontal', a: 'p', b: 'q' }],
      }),
    );

    const wrapper = await mountEditor(pinia);
    expect(wrapper.find('[data-constraint-id="h"]').exists()).toBe(true);

    await toggleDisplay(wrapper, 'constraints');
    await nextTick();

    expect(wrapper.find('[data-constraint-id="h"]').exists()).toBe(false);
    expect(store.document.constraints).toHaveLength(1);
    expect(store.journal).toHaveLength(0);
  });
});
