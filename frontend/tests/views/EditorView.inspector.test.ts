import { createEmptyDocument, executeCommand, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import CornerRoundPromptBar from '@/components/CornerRoundPromptBar.vue';
import { useEditorStore } from '@/stores/editor';
import {
  canvasDown,
  canvasUp,
  curveDoc,
  distanceOffset,
  entityDown,
  inspectorDoc,
  keydown,
  lineDoc,
  mountEditor,
  mountLoaded,
  openPanel,
  pieceDoc,
  pointDown,
  seededDocument,
  simpleDoc,
  toggleDisplay,
  withPiece,
} from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

describe('EditorView', () => {
  it('lists seeded non-distance constraints and removes one through the constraints drawer', async () => {
    const wrapper = await mountEditor(createPinia());

    await openPanel(wrapper, 'constraints');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Constraints"] li')).toHaveLength(4);

    await wrapper.find('[data-testid="remove-constraint-bottom"]').trigger('click');
    await nextTick();

    expect(wrapper.findAll('[aria-label="Constraints"] li')).toHaveLength(3);
    expect(wrapper.text()).toContain('1 command(s)');
  });

  it('lists seeded dimensions with editable value, orientation and offset', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    const wrapper = await mountEditor(pinia);

    expect(wrapper.find('[aria-label="Dimensions"]').exists()).toBe(false);

    await openPanel(wrapper, 'dimensions');
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

  it('hides the axis control for a line-anchored dimension', async () => {
    const { wrapper } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'gap', type: 'distance', a: 'ab', b: 'c' }],
    });

    await openPanel(wrapper, 'dimensions');
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-orientation-gap"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-orientation-locked-gap"]').text()).toBe('Aligned');
    expect(wrapper.find('[data-testid="dimension-offset-gap"]').exists()).toBe(true);
  });

  it('clears a set dimension to driven from the sidebar and undoes it', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    await openPanel(wrapper, 'dimensions');
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

    await openPanel(wrapper, 'dimensions');
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
    useEditorStore().load(
      withPiece({
        ...createEmptyDocument(),
        entities: [{ id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false }],
      }),
    );

    const wrapper = await mountEditor(pinia);
    await openPanel(wrapper, 'dimensions');
    await nextTick();
    expect(wrapper.text()).toContain('No dimensions yet.');

    await openPanel(wrapper, 'constraints');
    await nextTick();
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

    await openPanel(wrapper, 'dimensions');
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

    await openPanel(wrapper, 'dimensions');
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

    await openPanel(wrapper, 'dimensions');
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
      { id: expect.any(String), type: 'horizontal', piece: 'pc1', a: 'a', b: 'b' },
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
      { id: expect.any(String), type: 'vertical', piece: 'pc1', a: 'p', b: 's' },
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
      { id: expect.any(String), type: 'equal', piece: 'pc1', a1: 'a', a2: 'b', b1: 'b', b2: 'c' },
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
      { id: expect.any(String), type: 'point_on_line', piece: 'pc1', point: 'e', a: 'a', b: 'b' },
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
      { id: expect.any(String), type: 'distance', piece: 'pc1', a: 'a', b: 'b', value: 120 },
    ]);
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(false);
    expect(wrapper.findComponent(PatternCanvas).props('constraintPicks')).toEqual([]);
  });

  it('sets a distance from a formula over the document variables', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880 }],
    });

    await wrapper.find('[data-testid="constraint-distance"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    await wrapper.find('[data-testid="constraint-value"]').setValue('$bust / 4');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({ type: 'distance', value: { expr: '$bust / 4', lastKnown: 220 } }),
    ]);
    expect(wrapper.find('[data-testid="constraint-value"]').exists()).toBe(false);
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

    await openPanel(wrapper, 'constraints');
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
    expect(wrapper.text()).toContain(
      'Select a point, line, curve, arc, circle or dimension on the canvas or in a drawer.',
    );

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

  it('has no Seam allowance section in the inspector', async () => {
    const { wrapper } = await mountLoaded(inspectorDoc);
    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-add-seam"]').exists()).toBe(false);
  });

  it('converts the selection between construction and cut from the inspector', async () => {
    const { wrapper, store } = await mountLoaded(inspectorDoc);
    entityDown(wrapper, 'line', 'l1');
    await nextTick();

    const role = wrapper.find('[data-testid="entity-role"]');
    expect((role.element as HTMLSelectElement).value).toBe('cut');

    await role.setValue('construction');
    await flushPromises();

    expect(store.document.entities.find((entity) => entity.id === 'l1')).toMatchObject({
      role: 'construction',
    });
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

    expect(wrapper.find('[data-testid="sidebar"]').attributes('style')).toContain('width: 400px');

    window.dispatchEvent(new MouseEvent('pointerup'));
  });

  it('persists sidebar width and collapsed state across remounts', async () => {
    const first = await mountEditor(createPinia());

    await first.find('[data-testid="sidebar-toggle"]').trigger('click');
    await nextTick();

    expect(JSON.parse(window.localStorage.getItem('sewcraft.editor.sidebar')!)).toEqual({
      width: 320,
      collapsed: true,
    });
    expect(first.find('[data-testid="sidebar-panel"]').exists()).toBe(false);

    first.unmount();
    const second = await mountEditor(createPinia());

    const toggle = second.find('[data-testid="sidebar-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-label')).toBe('Expand sidebar');
  });

  it('collapses and expands from the ribbon toggle alone', async () => {
    const wrapper = await mountEditor(createPinia());
    const toggle = wrapper.find('[data-testid="sidebar-toggle"]');

    expect(wrapper.find('[data-testid="sidebar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sidebar"] [data-testid="sidebar-toggle"]').exists()).toBe(
      false,
    );

    await toggle.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-toggle"]').attributes('aria-expanded')).toBe(
      'false',
    );
    expect(wrapper.find('[data-testid="sidebar-panel"]').exists()).toBe(false);

    await wrapper.find('[data-testid="sidebar-toggle"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-toggle"]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-testid="sidebar-panel"]').exists()).toBe(true);
  });

  it('reopens the collapsed sidebar on the section the user picks', async () => {
    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="sidebar-toggle"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="sidebar-tab-outline"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sidebar-panel-title"]').text()).toBe('Outline');
  });
});

describe('EditorView', () => {
  it('creates a dimension from a line with the dimension tool', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    pointDown(wrapper, 'c');
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
      a: 'ab',
      b: 'c',
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
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'b');
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
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'b');
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
    const { wrapper, store } = await mountLoaded(
      withPiece({
        ...createEmptyDocument(),
        entities: [
          { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
          { id: 'q', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        ],
      }),
    );

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

    await toggleDisplay(wrapper, 'dimensions');
    await nextTick();

    expect(wrapper.find('[data-testid="dimension-lines-w"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dimension-labels-layer"]').text()).not.toContain('100');
    expect(store.document.constraints).toHaveLength(1);
    expect(store.journal).toHaveLength(0);

    await toggleDisplay(wrapper, 'dimensions');
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
      'Round corner — pick two lines or a corner.',
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

    // The piece canvas draws the rounded corner, not a gap: every derived entity
    // of the round survives the active-piece slice.
    const round = store.document.cornerRounds![0]!;
    const canvasIds = (
      wrapper.findComponent(PatternCanvas).props('document') as PatternDocument
    ).entities.map((entity) => entity.id);
    expect(canvasIds).toEqual(
      expect.arrayContaining([
        round.arc,
        round.center!,
        ...round.controls,
        ...round.ends.map((end) => end.tangent),
      ]),
    );
    expect(wrapper.find('[data-testid="corner-round-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick two lines or a corner.',
    );
    expect(wrapper.find('[data-testid="tool-round_corner"]').attributes('aria-pressed')).toBe(
      'true',
    );
  });

  it('rounds a corner picked as a point and replaces a pending line pick', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();
    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick the second line.',
    );

    pointDown(wrapper, 'c');
    await flushPromises();
    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — set the radius.',
    );
    expect(wrapper.findComponent(PatternCanvas).props('roundCornerPicks')).toEqual({
      first: 'bc',
      second: 'cd',
    });

    await wrapper.find('[data-testid="corner-round-prompt-bar"] form').trigger('submit');
    await flushPromises();

    expect(store.document.cornerRounds).toHaveLength(1);
    expect(store.document.cornerRounds?.[0]).toMatchObject({ corner: 'c' });
  });

  it('rejects bad picks with a concrete reason and clears them on Escape', async () => {
    const { wrapper } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-round_corner"]').trigger('click');
    await nextTick();

    pointDown(wrapper, 'e');
    await nextTick();
    expect(wrapper.find('[data-testid="corner-round-rejection"]').text()).toBe(
      'Pick a corner between two lines.',
    );

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
      'Round corner — pick two lines or a corner.',
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
      'Round corner — pick two lines or a corner.',
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
      'Round corner — pick two lines or a corner.',
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
});

describe('EditorView dimension selection', () => {
  async function openDimensions(wrapper: VueWrapper): Promise<void> {
    await openPanel(wrapper, 'dimensions');
    await nextTick();
  }

  it('selects from the canvas and deletes the whole selection as one undo entry', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('update:selectedDimensionIds', ['width']);
    await nextTick();

    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('1 dimension selected');
    expect(wrapper.find('[data-testid="selection-breakdown"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-pointer-note"]').text()).toBe(
      'Ctrl/Cmd-click adds or removes a dimension.',
    );
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe('1 dimension selected');
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');

    canvas.vm.$emit('update:selectedDimensionIds', ['width', 'height']);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('2 dimensions selected');
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe('2 dimensions selected');

    const journal = store.journal.length;
    keydown('Delete');
    await nextTick();

    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(false);
    expect(store.document.constraints.some((constraint) => constraint.id === 'height')).toBe(false);
    expect(store.journal).toHaveLength(journal + 1);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').exists()).toBe(false);

    store.undo();
    await nextTick();

    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(true);
    expect(store.document.constraints.some((constraint) => constraint.id === 'height')).toBe(true);
  });

  it('deletes the selection from the ribbon and the summary', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('update:selectedDimensionIds', ['width']);
    await nextTick();
    await wrapper.find('[data-testid="delete"]').trigger('click');
    await nextTick();
    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(false);

    canvas.vm.$emit('update:selectedDimensionIds', ['height']);
    await nextTick();
    await wrapper.find('[data-testid="selection-delete"]').trigger('click');
    await nextTick();
    expect(store.document.constraints.some((constraint) => constraint.id === 'height')).toBe(false);
  });

  it('deletes a mixed selection as one undo entry', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    pointDown(wrapper, 'e');
    await nextTick();
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedDimensionIds', ['w']);
    await nextTick();

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );

    const journal = store.journal.length;
    await wrapper.find('[data-testid="selection-delete"]').trigger('click');
    await nextTick();

    expect(store.document.entities.some((entity) => entity.id === 'e')).toBe(false);
    expect(store.document.constraints).toEqual([]);
    expect(store.journal).toHaveLength(journal + 1);
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);

    store.undo();
    await nextTick();
    expect(store.document.entities.some((entity) => entity.id === 'e')).toBe(true);
    expect(store.document.constraints.some((constraint) => constraint.id === 'w')).toBe(true);
  });

  it('refuses a mixed delete whose entity half would orphan an edge', async () => {
    const w = { id: 'w', type: 'distance' as const, a: 'a', b: 'b', value: 100 };
    const { wrapper, store } = await mountLoaded({ ...lineDoc, constraints: [w] });

    pointDown(wrapper, 'a');
    await nextTick();
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedDimensionIds', ['w']);
    await nextTick();

    const button = wrapper.find('[data-testid="selection-delete"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('title')).toBe(
      'Include ab, da in the selection to delete these points.',
    );

    const journal = store.journal.length;
    keydown('Delete');
    await nextTick();

    expect(store.journal).toHaveLength(journal);
    expect(store.document.constraints).toEqual([w]);
    expect(store.document.entities.some((entity) => entity.id === 'a')).toBe(true);
    expect(wrapper.text()).toContain('ab, da would lose a point');
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );
  });

  it('summarises a mixed selection', async () => {
    const { wrapper } = await mountLoaded({
      ...lineDoc,
      constraints: [
        { id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 },
        { id: 'h', type: 'distance', a: 'b', b: 'c', value: 100, orientation: 'vertical' },
      ],
    });
    const canvas = wrapper.findComponent(PatternCanvas);

    canvas.vm.$emit('update:selectedEntityIds', ['ab', 'bc', 'cd', 'da']);
    await nextTick();

    canvas.vm.$emit('update:selectedDimensionIds', ['w']);
    await nextTick();

    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '4 entities and 1 dimension selected',
    );
    expect(wrapper.find('[data-testid="selection-breakdown"]').text()).toBe('4 lines');
    expect(wrapper.find('[data-testid="selection-pointer-note"]').text()).toBe(
      'Ctrl/Cmd-click adds or removes a dimension.',
    );
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe(
      '4 entities and 1 dimension selected',
    );

    canvas.vm.$emit('update:selectedDimensionIds', ['w', 'h']);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe(
      '4 entities and 2 dimensions selected',
    );
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '4 entities and 2 dimensions selected',
    );
  });

  it('keeps the surviving kind when the other disappears underneath a mixed selection', async () => {
    const { wrapper, store } = await mountLoaded({
      ...lineDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });

    pointDown(wrapper, 'e');
    await nextTick();
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedDimensionIds', ['w']);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );

    store.dispatch({ id: 'external', type: 'remove_constraint', params: { id: 'w' } });
    await nextTick();

    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe('1 entity selected');
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);
  });

  it('lets a marquee mix kinds while drawer rows and pieces stay exclusive', async () => {
    const { wrapper } = await mountLoaded({
      ...pieceDoc,
      constraints: [{ id: 'w', type: 'distance', a: 'a', b: 'b', value: 100 }],
    });
    const canvas = wrapper.findComponent(PatternCanvas);

    pointDown(wrapper, 'a');
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);

    // The marquee may fill both arrays; the mixed selection shows the summary.
    canvas.vm.$emit('update:selectedDimensionIds', ['w']);
    await nextTick();
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );
    expect(wrapper.find('[data-testid="selection-status"]').text()).toBe(
      '1 entity and 1 dimension selected',
    );

    // A drawer dimension row is a click: it clears the entity selection.
    await openDimensions(wrapper);
    await wrapper.find('[data-testid="select-dimension-w"]').trigger('click');
    await nextTick();
    await openPanel(wrapper, 'properties');
    expect(wrapper.find('[data-testid="selection-count"]').text()).toBe('1 dimension selected');
    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(false);

    // Switching tabs clears both selections.
    await wrapper.find('[data-testid="tab-piece-p1"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
  });

  it('selects dimensions from the drawer with the canvas modifier rules', async () => {
    const { wrapper } = await mountLoaded(seededDocument);
    await openDimensions(wrapper);

    await wrapper.find('[data-testid="select-dimension-width"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="dimension-width"]').classes()).toContain('bg-primary/10');
    expect(wrapper.find('[data-testid="select-dimension-width"]').attributes('aria-current')).toBe(
      'true',
    );

    await wrapper.find('[data-testid="select-dimension-height"]').trigger('click', {
      ctrlKey: true,
    });
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('2');

    await wrapper.find('[data-testid="select-dimension-height"]').trigger('click', {
      metaKey: true,
    });
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');

    await wrapper.find('[data-testid="select-dimension-width"]').trigger('click', {
      ctrlKey: true,
      shiftKey: true,
    });
    await nextTick();
    expect(wrapper.find('[data-testid="dimension-width"]').classes()).not.toContain(
      'bg-primary/10',
    );

    await openPanel(wrapper, 'properties');
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
  });

  it('selects a drawer row with Enter and Space', async () => {
    const { wrapper } = await mountLoaded(seededDocument);
    await openDimensions(wrapper);

    await wrapper
      .find('[data-testid="select-dimension-width"]')
      .trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');

    await wrapper.find('[data-testid="select-dimension-height"]').trigger('keydown', { key: ' ' });
    await nextTick();
    expect(wrapper.find('[data-testid="select-dimension-height"]').attributes('aria-current')).toBe(
      'true',
    );
    expect(
      wrapper.find('[data-testid="select-dimension-width"]').attributes('aria-current'),
    ).toBeUndefined();
  });

  it('keeps the per-row Remove independent and prunes a removed selection', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    await openDimensions(wrapper);

    await wrapper.find('[data-testid="select-dimension-width"]').trigger('click');
    await nextTick();
    await openPanel(wrapper, 'properties');
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(true);
    await openPanel(wrapper, 'dimensions');

    await wrapper.find('[data-testid="remove-dimension-width"]').trigger('click');
    await nextTick();

    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(false);
    expect(wrapper.findAll('[aria-label="Dimensions"] li')).toHaveLength(1);

    await openPanel(wrapper, 'properties');
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
  });

  it('prunes a dimension id removed underneath the selection', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedDimensionIds', ['width']);
    await nextTick();
    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(true);

    store.dispatch({ id: 'external', type: 'remove_constraint', params: { id: 'width' } });
    await nextTick();

    expect(wrapper.find('[data-testid="selection-summary"]').exists()).toBe(false);
  });

  it('keeps a hidden dimension selected and deletable from the drawer', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    await openDimensions(wrapper);
    await wrapper.find('[data-testid="select-dimension-width"]').trigger('click');
    await nextTick();

    await toggleDisplay(wrapper, 'dimensions');
    await nextTick();

    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="select-dimension-width"]').attributes('aria-current')).toBe(
      'true',
    );

    keydown('Delete');
    await nextTick();
    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(false);
  });

  it('allows drawer selection but refuses the delete on a read-only document', async () => {
    const { wrapper, store } = await mountLoaded(seededDocument);
    store.setReadOnly(true);
    await nextTick();
    await openDimensions(wrapper);

    await wrapper.find('[data-testid="select-dimension-width"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');

    keydown('Delete');
    await nextTick();

    expect(store.document.constraints.some((constraint) => constraint.id === 'width')).toBe(true);
    expect(wrapper.find('[data-testid="sidebar-tab-count-properties"]').text()).toBe('1');
  });
});

describe('EditorView variables panel', () => {
  const documentWithVariable = (): PatternDocument => ({
    ...createEmptyDocument(),
    variables: [{ slug: 'bust', name: 'Bust (cm)', unit: 'cm', value: 88, comment: 'over bust' }],
  });

  it('adds, renames, edits, re-units and removes a variable from the panel', async () => {
    const { wrapper, store } = await mountLoaded(documentWithVariable());
    await openPanel(wrapper, 'variables');

    await wrapper.find('[data-testid="add-variable"]').trigger('click');
    await nextTick();
    expect(store.document.variables).toHaveLength(2);
    const added = store.document.variables![1]!;
    expect(added.name).toBe('Variable 2');

    await wrapper.find(`[data-testid="variable-name-${added.slug}"]`).setValue('Ease');
    expect(store.document.variables![1]!.name).toBe('Ease');

    await wrapper.find(`[data-testid="variable-value-${added.slug}"]`).setValue('$bust/10');
    expect(store.document.variables![1]!.value).toEqual({ expr: '$bust/10', lastKnown: 88 });

    await wrapper.find(`[data-testid="variable-comment-${added.slug}"]`).setValue('design ease');
    expect(store.document.variables![1]!.comment).toBe('design ease');

    await wrapper.find('[data-testid="variable-unit-bust"]').trigger('click');
    expect(store.document.variables![0]!.value).toBe(880);

    await wrapper.find(`[data-testid="variable-remove-${added.slug}"]`).trigger('click');
    expect(store.document.variables).toHaveLength(1);
  });

  it('starts from an empty document with no variables list', async () => {
    const { wrapper, store } = await mountLoaded(createEmptyDocument());
    await openPanel(wrapper, 'variables');
    expect(wrapper.text()).toContain('No variables yet.');

    await wrapper.find('[data-testid="add-variable"]').trigger('click');
    await nextTick();
    expect(store.document.variables?.[0]?.name).toBe('Variable 1');
  });

  it('offers the document variables in the drawer when a $ token is typed', async () => {
    const document: PatternDocument = {
      ...seededDocument,
      variables: [
        { slug: 'bust', name: 'Bust', unit: 'mm', value: 880 },
        { slug: 'waist', name: 'Waist', unit: 'mm', value: 720 },
      ],
    };
    const { wrapper } = await mountLoaded(document);
    await openPanel(wrapper, 'dimensions');

    const input = wrapper.find('[data-testid="dimension-value-width"]');
    await input.setValue('$b');
    expect(wrapper.find('[data-testid="dimension-variables-width"]').exists()).toBe(true);

    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect((input.element as HTMLInputElement).value).toBe('$bust');

    await input.setValue('$w');
    await wrapper.find('[data-testid="dimension-variable-width-waist"]').trigger('mousedown');
    expect((input.element as HTMLInputElement).value).toBe('$waist');

    await input.setValue('$b');
    await input.trigger('keydown', { key: 'ArrowUp' });
    await input.trigger('keydown', { key: 'x' });
    expect(wrapper.find('[data-testid="dimension-variables-width"]').exists()).toBe(true);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-variables-width"]').exists()).toBe(false);
  });

  it('edits a dimension formula from the drawer and reports an unresolved one', async () => {
    const document: PatternDocument = {
      ...seededDocument,
      variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880 }],
    };
    const { wrapper, store } = await mountLoaded(document);
    await openPanel(wrapper, 'dimensions');

    const input = wrapper.find('[data-testid="dimension-value-width"]');
    await input.setValue('$bust / 4');
    await flushPromises();
    expect(store.document.constraints.find((entry) => entry.id === 'width')).toMatchObject({
      value: { expr: '$bust / 4', lastKnown: 220 },
    });

    const commands = store.journal.length;
    await input.setValue('$bust / 4');
    await flushPromises();
    expect(store.journal.length).toBe(commands);

    await input.setValue('$gone / 4');
    await flushPromises();
    expect(wrapper.find('[data-testid="dimension-issue-width"]').text()).toContain(
      'unknown variable $gone',
    );
    expect(store.document.constraints.find((entry) => entry.id === 'width')).toMatchObject({
      value: { expr: '$bust / 4' },
    });
  });

  it('keeps the document unchanged when a formula does not resolve', async () => {
    const { wrapper, store } = await mountLoaded(documentWithVariable());
    await openPanel(wrapper, 'variables');

    const before = store.document.variables![0]!.value;
    await wrapper.find('[data-testid="variable-value-bust"]').setValue('$missing + 1mm');
    expect(store.document.variables![0]!.value).toEqual(before);
    expect(wrapper.text()).toContain('unknown variable $missing');
  });
});
