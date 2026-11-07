import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import AssemblyCanvas from '@/components/canvas/AssemblyCanvas.vue';
import AssemblyPanel from '@/components/panels/AssemblyPanel.vue';
import EditorTabs from '@/components/editor/EditorTabs.vue';
import PiecePanel from '@/components/panels/PiecePanel.vue';
import PatternCanvas from '@/components/canvas/PatternCanvas.vue';
import EditorRibbon from '@/components/editor/EditorRibbon.vue';
import EntityPropertiesPanel from '@/components/panels/EntityPropertiesPanel.vue';
import { downloadSvgFile } from '@/lib/download';
import { useEditorStore } from '@/stores/editor';
import {
  canvasDown,
  cutDimensionDoc,
  entityDown,
  keydown,
  lineDoc,
  mountEditor,
  mountLoaded,
  openPanel,
  pieceDoc,
  pointDown,
  roundedLineDoc,
  seededDocument,
  toggleDisplay,
  withPiece,
  setLoadedDocument,
} from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

describe('EditorView', () => {
  it('creates an empty piece from the + menu and switches to it', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    await wrapper.find('[data-testid="tabs-menu-piece"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces).toHaveLength(2);
    const created = store.document.pieces[1]!;
    expect(created.edges).toEqual([]);
    expect(created.color).toBeDefined();
    expect(store.activeTab).toEqual({ kind: 'piece', id: created.id });

    store.undo();
    await nextTick();
    expect(store.document.pieces).toHaveLength(1);
  });

  it('captures the selected loop through Set cut loop rather than creation', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    entityDown(wrapper, 'line', 'bc', { ctrlKey: true });
    await nextTick();
    entityDown(wrapper, 'line', 'cd', { ctrlKey: true });
    await nextTick();
    entityDown(wrapper, 'line', 'da', { ctrlKey: true });
    await nextTick();

    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'set_cut_loop');
    await flushPromises();

    const active = store.document.pieces.find((piece) => piece.id === store.activePieceId)!;
    expect(active.edges).toEqual(['ab', 'bc', 'cd', 'da']);
    expect(active.allowances).toHaveLength(4);
  });

  it('creates a distance between two piece corners, not a cut dimension', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'c');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({
        type: 'distance',
        a: 'a',
        b: 'c',
      }),
    ]);
    expect(store.document.constraints[0]).not.toHaveProperty('value');
  });

  it('creates a cut dimension between two piece corners with the cut tool', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'c');
    await nextTick();

    expect(
      wrapper.find('[data-testid="dimension-label-cut-dimension-preview"]').find('text').text(),
    ).toMatch(/ cut$/);

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

  it('creates a cut dimension from a straight edge and another edge', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'ab');
    await flushPromises();
    // One pick is only the first anchor; the old one-click shortcut is gone.
    expect(store.document.constraints).toHaveLength(0);

    entityDown(wrapper, 'line', 'cd');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({
        type: 'derived_distance',
        piece: 'p1',
        a: { edge: 'ab', at: 'edge' },
        b: { edge: 'cd', at: 'edge' },
        orientation: 'aligned',
      }),
    ]);
  });

  it('creates a corner-to-edge cut dimension in either order', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    entityDown(wrapper, 'line', 'cd');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toEqual([
      expect.objectContaining({
        type: 'derived_distance',
        a: { edge: 'ab', at: 'start' },
        b: { edge: 'cd', at: 'edge' },
        orientation: 'aligned',
      }),
    ]);
  });

  it('updates an existing cut dimension instead of duplicating it', async () => {
    const { wrapper, store } = await mountLoaded(cutDimensionDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    pointDown(wrapper, 'c');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.document.constraints[0]).toMatchObject({
      id: 'cut',
      type: 'derived_distance',
      orientation: 'aligned',
    });
    expect(store.journal).toHaveLength(1);
  });

  it('updates the existing cut dimension when the same corners are picked in reverse', async () => {
    const { wrapper, store } = await mountLoaded(cutDimensionDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    pointDown(wrapper, 'c');
    pointDown(wrapper, 'a');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.document.constraints[0]).toMatchObject({ id: 'cut' });
    expect(store.journal).toHaveLength(1);
  });

  it('stores edge anchors in piece order and dedupes a reversed re-placement', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    entityDown(wrapper, 'line', 'cd');
    entityDown(wrapper, 'line', 'ab');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.document.constraints[0]).toMatchObject({
      type: 'derived_distance',
      a: { edge: 'ab', at: 'edge' },
      b: { edge: 'cd', at: 'edge' },
      orientation: 'aligned',
    });

    entityDown(wrapper, 'line', 'ab');
    entityDown(wrapper, 'line', 'cd');
    canvasDown(wrapper, 400, 300);
    await flushPromises();

    expect(store.document.constraints).toHaveLength(1);
    expect(store.journal).toHaveLength(2);
  });

  it('locks the axis control for an edge-anchored cut dimension', async () => {
    const edgeDoc: PatternDocument = {
      ...pieceDoc,
      constraints: [
        {
          id: 'cut',
          type: 'derived_distance',
          piece: 'p1',
          a: { edge: 'ab', at: 'edge' },
          b: { edge: 'cd', at: 'edge' },
          offset: 20,
        },
      ],
    };
    const { wrapper } = await mountLoaded(edgeDoc);

    await openPanel(wrapper, 'dimensions');

    expect(wrapper.find('[data-testid="dimension-orientation-locked-cut"]').text()).toBe('Aligned');
    expect(wrapper.find('[data-testid="dimension-orientation-cut"]').exists()).toBe(false);
  });

  it('rejects a cut dimension pick outside a piece without emitting a command', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tool-cut_dimension"]').trigger('click');
    pointDown(wrapper, 'a');
    await nextTick();

    expect(wrapper.find('[data-testid="cut-dimension-hint"]').text()).toBe(
      'Pick a seamline or cut corner, or a straight edge, of a piece.',
    );
    expect(store.document.constraints).toHaveLength(0);
    expect(store.journal).toHaveLength(0);
  });

  it('shows a cut dimension as read-only and refuses edits in the drawer', async () => {
    const { wrapper, store } = await mountLoaded(cutDimensionDoc);

    await openPanel(wrapper, 'dimensions');
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

    await openPanel(wrapper, 'dimensions');
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

    const name = wrapper.find('[data-testid="entity-name"]');
    await name.setValue('Back');
    await name.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.name).toBe('Back');

    const quantity = wrapper.find('[data-testid="entity-quantity"]');
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

  it('shows a piece whose point was deleted without a size instead of crashing', async () => {
    const { wrapper } = await mountLoaded({
      ...pieceDoc,
      entities: pieceDoc.entities.filter((entity) => entity.id !== 'c'),
    });

    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    expect(wrapper.find('[data-testid="entity-piece"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-piece-finished"]').text()).toBe('—');
    expect(wrapper.find('[data-testid="entity-piece-cut"]').text()).toBe('—');
  });

  it('describes an edge that belongs to a piece in the outline', async () => {
    const { wrapper } = await mountLoaded(pieceDoc);
    await openPanel(wrapper, 'outline');

    entityDown(wrapper, 'line', 'ab');
    await nextTick();

    expect(wrapper.find('[data-testid="edge-piece-ab"]').text()).toContain('In piece p1');
    expect(wrapper.find('[data-testid="edge-piece-ab"]').text()).toContain('seam 10 mm');
  });
});

describe('EditorView piece, pattern and assembly drawers', () => {
  it('renders the active piece card with its label and sizes', async () => {
    const { wrapper } = await mountLoaded(pieceDoc);
    await openPanel(wrapper, 'pieces');

    const card = wrapper.find('[data-testid="piece-drawer-piece"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('100 × 100 mm');
    expect(card.text()).toContain('Cut loop');
    expect(wrapper.find('[data-testid="piece-drawer-name"]').element).toHaveProperty(
      'value',
      'Front',
    );
  });

  it('shows the empty piece state when no piece tab is active', async () => {
    const { wrapper } = await mountLoaded(createEmptyDocument());

    expect(wrapper.find('[data-testid="no-tabs-empty"]').text()).toBe('Create a piece to start');
    expect(wrapper.find('[data-testid="tabs-list"]').text()).toBe('');

    await openPanel(wrapper, 'pieces');
    expect(wrapper.find('[data-testid="pieces-empty"]').exists()).toBe(true);

    await openPanel(wrapper, 'outline');
    expect(wrapper.text()).toContain('No edges yet.');
  });

  it('edits and clears the per-piece parameters', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);
    await openPanel(wrapper, 'pieces');

    const name = wrapper.find('[data-testid="piece-drawer-name"]');
    await name.setValue('Back');
    await name.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.name).toBe('Back');

    const quantity = wrapper.find('[data-testid="piece-drawer-quantity"]');
    await quantity.setValue('4');
    await quantity.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.quantity).toBe(4);

    const fabric = wrapper.find('[data-testid="piece-drawer-fabric"]');
    await fabric.setValue('Linen');
    await fabric.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.fabric).toBe('Linen');

    const notes = wrapper.find('[data-testid="piece-drawer-notes"]');
    await notes.setValue('Cut two');
    await notes.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.notes).toBe('Cut two');

    const color = wrapper.find('[data-testid="piece-drawer-color"]');
    await color.setValue('#a1b2c3');
    await color.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.color).toBe('#a1b2c3');

    await wrapper.find('[data-testid="piece-drawer-color-clear"]').trigger('click');
    await flushPromises();
    expect(store.document.pieces[0]?.color).toBeUndefined();

    const quantityAgain = wrapper.find('[data-testid="piece-drawer-quantity"]');
    await quantityAgain.setValue('0');
    await quantityAgain.trigger('change');
    await flushPromises();
    expect(store.document.pieces[0]?.quantity).toBe(4);
  });

  it('sets and clears a piece allowance override', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);
    await openPanel(wrapper, 'pieces');
    const mode = () => wrapper.find('[data-testid="piece-drawer-default-mode"]');

    await mode().setValue('none');
    await flushPromises();
    expect(store.document.pieces[0]?.defaults).toEqual({ allowance: null });

    await mode().setValue('preset');
    await flushPromises();
    expect(store.document.pieces[0]?.defaults).toEqual({
      allowance: { width: 10, kind: 'seam' },
    });

    await mode().setValue('inherit');
    await flushPromises();
    expect(store.document.pieces[0]?.defaults).toBeUndefined();
  });

  it('applies one allowance to every edge in a single undo step', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);
    await openPanel(wrapper, 'pieces');

    expect(wrapper.find('[data-testid="piece-drawer-piece-all-mixed"]').exists()).toBe(true);
    await wrapper.find('[data-testid="piece-drawer-piece-all-apply"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces[0]!.allowances).toEqual([
      { edge: 'ab', width: 10 },
      { edge: 'bc', width: 10, kind: 'seam' },
      { edge: 'cd', width: 10, kind: 'seam' },
      { edge: 'da', width: 10, kind: 'seam' },
    ]);

    store.undo();
    await nextTick();
    expect(store.document.pieces[0]!.allowances).toEqual([{ edge: 'ab', width: 10 }]);
  });

  it('removes every allowance from the drawer with the none kind', async () => {
    const uniformDoc: PatternDocument = {
      ...pieceDoc,
      pieces: [
        {
          id: 'p1',
          edges: ['ab', 'bc', 'cd', 'da'],
          allowances: ['ab', 'bc', 'cd', 'da'].map((edge) => ({ edge, width: 10 })),
        },
      ],
    };
    const { wrapper, store } = await mountLoaded(uniformDoc);
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="piece-drawer-piece-all-kind"]').setValue('none');
    await wrapper.find('[data-testid="piece-drawer-piece-all-apply"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces[0]!.allowances).toEqual([]);
  });

  it('removes a piece and returns to the remaining tab', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      pieces: [...pieceDoc.pieces, { id: 'p2', name: 'Sleeve', edges: [], allowances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'piece', id: 'p2' },
      ],
    });
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="piece-drawer-remove-piece-p1"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces.map((piece) => piece.id)).toEqual(['p2']);
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p2' });
  });

  it('confirms before deleting a placed piece and names its assemblies', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      assemblies: [
        {
          id: 'a1',
          name: 'Shell',
          instances: [
            { id: 'i1', piece: 'p1', x: 0, y: 0 },
            { id: 'i2', piece: 'p1', x: 10, y: 0 },
          ],
        },
      ],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="piece-drawer-remove-piece-p1"]').trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(
      'Front is placed 2 times in 1 assembly. Remove it and its instances?',
    );
    expect(store.document.pieces).toHaveLength(1);

    confirm.mockReturnValue(true);
    await wrapper.find('[data-testid="piece-drawer-remove-piece-p1"]').trigger('click');
    await flushPromises();
    expect(store.document.pieces).toEqual([]);
    expect(store.document.assemblies[0]!.instances).toEqual([]);
    confirm.mockRestore();
  });

  it('creates a piece and an assembly from the tab bar menu', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    expect(wrapper.find('[data-testid="tabs-menu-drawing"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="tabs-menu-piece"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces).toHaveLength(2);
    expect(store.activeTab).toEqual({ kind: 'piece', id: store.document.pieces[1]!.id });
    expect(wrapper.findAll('[data-testid^="tab-piece-"]')).toHaveLength(2);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    await wrapper.find('[data-testid="tabs-menu-assembly"]').trigger('click');
    await flushPromises();

    expect(store.document.assemblies).toHaveLength(1);
    expect(store.activeTab).toEqual({ kind: 'assembly', id: store.document.assemblies[0]!.id });
    expect(wrapper.find('[data-testid="assembly-empty"]').text()).toBe('Add a piece to start');
  });

  it('switches tabs and reorders them from the keyboard', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });

    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    expect(store.activeTab).toEqual({ kind: 'assembly', id: 'a1' });

    const tab = wrapper.find('[data-testid="tab-piece-p1"]');
    await tab.trigger('keydown', { key: 'ArrowRight', altKey: true, shiftKey: true });
    await flushPromises();

    expect(store.document.tabs).toEqual([
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
    ]);
  });
});

describe('EditorView assembly tab', () => {
  const assemblyDoc = (): PatternDocument => ({
    ...withPiece(lineDoc, 'p1', ['ab', 'bc', 'cd', 'da']),
    entities: [
      ...lineDoc.entities.map((entity) => ({ ...entity, piece: 'p1' })),
      { id: 'n1', kind: 'mark', type: 'notch', piece: 'p1', edge: 'ab', point: 'a' },
    ],
    pieces: [
      {
        id: 'p1',
        name: 'Front',
        edges: ['ab', 'bc', 'cd', 'da'],
        allowances: [{ edge: 'ab', width: 10 }],
        color: '#336699',
      },
    ],
    assemblies: [
      {
        id: 'a1',
        name: 'Shell',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p1', x: 200, y: 0, mirrored: true },
        ],
      },
    ],
    tabs: [
      { kind: 'piece', id: 'p1' },
      { kind: 'assembly', id: 'a1' },
    ],
  });

  async function mountAssembly() {
    const result = await mountLoaded(assemblyDoc());
    await result.wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    return result;
  }

  it('replaces the sketch ribbon and canvas with the assembly surfaces', async () => {
    const { wrapper } = await mountAssembly();

    expect(wrapper.find('[data-testid="assembly-canvas"]').exists()).toBe(true);
    expect(wrapper.findComponent(PatternCanvas).exists()).toBe(false);
    expect(wrapper.find('[data-testid="tool-add_line"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="constraint-horizontal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-instance"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeDefined();
  });

  it('selects an instance and removes it with the Delete key', async () => {
    const { wrapper, store } = await mountAssembly();

    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();
    expect(wrapper.find('[data-testid="instance-x"]').exists()).toBe(true);

    keydown('Delete');
    await flushPromises();

    expect(store.document.assemblies[0]!.instances.map((instance) => instance.id)).toEqual(['i2']);
  });

  it('moves an instance from a canvas drag and nudges coalesce', async () => {
    const { wrapper, store } = await mountAssembly();

    wrapper.findComponent(AssemblyCanvas).vm.$emit('move', 'i1', 40, 50);
    await flushPromises();
    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ x: 40, y: 50 });

    wrapper.findComponent(AssemblyCanvas).vm.$emit('nudge', 'i1', 1, 0);
    wrapper.findComponent(AssemblyCanvas).vm.$emit('nudge', 'i1', 0, 2);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();

    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ x: 41, y: 52 });
    expect(store.journal.filter((entry) => entry.command.type === 'update_instance')).toHaveLength(
      2,
    );
  });

  it('adds the first piece to an assembly that has no instances yet', async () => {
    const document = assemblyDoc();
    document.assemblies[0]!.instances = [];
    const { wrapper, store } = await mountLoaded(document);
    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="add-instance"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="add-piece-p1"]').exists()).toBe(true);

    await wrapper.find('[data-testid="add-piece-p1"]').trigger('click');
    await flushPromises();

    expect(store.document.assemblies[0]!.instances).toHaveLength(1);
    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ piece: 'p1' });
  });

  it('adds a piece through the ribbon picker', async () => {
    const { wrapper, store } = await mountAssembly();

    await wrapper.find('[data-testid="add-instance"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="add-piece-picker"]').exists()).toBe(true);

    await wrapper.find('[data-testid="add-piece-p1"]').trigger('click');
    await flushPromises();

    expect(store.document.assemblies[0]!.instances).toHaveLength(3);
    expect(wrapper.find('[data-testid="add-piece-picker"]').exists()).toBe(false);
  });

  it('hides assembly layers from the canvas display menu', async () => {
    const { wrapper } = await mountAssembly();
    expect(wrapper.findAll('[data-testid="instance-label"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="instance-cut-fill"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="instance-notch"]')).toHaveLength(2);

    await toggleDisplay(wrapper, 'labels');
    expect(wrapper.findAll('[data-testid="instance-label"]')).toHaveLength(0);

    await toggleDisplay(wrapper, 'cutShapes');
    expect(wrapper.findAll('[data-testid="instance-cut-fill"]')).toHaveLength(0);

    await toggleDisplay(wrapper, 'notches');
    expect(wrapper.findAll('[data-testid="instance-notch"]')).toHaveLength(0);

    const stored = JSON.parse(window.localStorage.getItem('sewcraft:display:1')!) as {
      assembly: { labels: boolean; cutShapes: boolean; notches: boolean };
    };
    expect(stored.assembly).toMatchObject({ labels: false, cutShapes: false, notches: false });
  });

  it('mirrors and rotates the selected instance', async () => {
    const { wrapper, store } = await mountAssembly();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();

    await wrapper.find('[data-testid="mirror-instance"]').trigger('click');
    await flushPromises();
    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ mirrored: true });

    await wrapper.find('[data-testid="rotate-instance"]').trigger('click');
    await flushPromises();
    expect(store.document.assemblies[0]!.instances[0]!.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('edits the instance and the assembly from the panel', async () => {
    const { wrapper, store } = await mountAssembly();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();

    await wrapper.find('[data-testid="instance-x"]').setValue('30');
    await flushPromises();
    expect(store.document.assemblies[0]!.instances[0]!.x).toBe(30);

    await wrapper.find('[data-testid="instance-mirror"]').trigger('click');
    await flushPromises();
    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ mirrored: true });

    await wrapper.find('[data-testid="assembly-name"]').setValue('Outer');
    await flushPromises();
    expect(store.document.assemblies[0]!.name).toBe('Outer');

    await wrapper.find('[data-testid="assembly-piece-fabric"]').setValue('Wool');
    await flushPromises();
    expect(store.document.pieces[0]!.fabric).toBe('Wool');
  });

  it('opens the piece tab from the selection and removes an instance from the panel', async () => {
    const { wrapper, store } = await mountAssembly();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();

    await wrapper.find('[data-testid="instance-open-piece-p1"]').trigger('click');
    await flushPromises();
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p1' });
    expect(wrapper.findComponent(PatternCanvas).exists()).toBe(true);

    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();
    wrapper.findComponent(AssemblyPanel).vm.$emit('remove-instance', 'i1');
    await flushPromises();
    expect(store.document.assemblies[0]!.instances.map((instance) => instance.id)).toEqual(['i2']);
  });

  it('clears the selection and cancels gestures when switching tabs', async () => {
    const { wrapper, store } = await mountAssembly();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();

    await wrapper.find('[data-testid="tab-piece-p1"]').trigger('click');
    await flushPromises();
    expect(store.activeTab).toEqual({ kind: 'piece', id: 'p1' });

    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="assembly-selection"]').text()).toContain(
      'Select an instance to inspect it.',
    );
  });

  it('disables the assembly actions while read-only', async () => {
    const { wrapper, store } = await mountAssembly();
    store.setReadOnly(true);
    await nextTick();

    expect(wrapper.find('[data-testid="add-instance"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="mirror-instance"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="tab-piece-p1"]').attributes('disabled')).toBeUndefined();
  });

  it('reorders tabs from the tab bar', async () => {
    const { wrapper, store } = await mountAssembly();

    wrapper.findComponent(EditorTabs).vm.$emit('reorder', [
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
    ]);
    await flushPromises();

    expect(store.document.tabs).toEqual([
      { kind: 'assembly', id: 'a1' },
      { kind: 'piece', id: 'p1' },
    ]);
  });
});

describe('EditorView edge cases', () => {
  it('disables export while the active piece loop does not resolve', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      pieces: [{ id: 'p1', edges: ['ab', 'ghost'], allowances: [] }],
      tabs: [{ kind: 'piece', id: 'p1' }],
    });

    expect(wrapper.findComponent(EditorRibbon).props('canExport')).toBe(false);
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="download-svg"]').trigger('click');
    expect(vi.mocked(downloadSvgFile)).not.toHaveBeenCalled();
    expect(store.journal).toHaveLength(0);
  });

  it('reports Set cut loop without an active piece', async () => {
    const { wrapper, store } = await mountLoaded(createEmptyDocument());

    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'set_cut_loop');
    await nextTick();

    expect(wrapper.text()).toContain('Create or select a piece first.');
    expect(store.journal).toHaveLength(0);
  });

  it('selects outline rows with add and subtract modifiers', async () => {
    const { wrapper } = await mountLoaded(seededDocument);
    await openPanel(wrapper, 'outline');

    await wrapper.find('[data-testid="outline-select-ab"]').trigger('click');
    expect(wrapper.find('[data-testid="outline-select-ab"]').attributes('aria-current')).toBe(
      'true',
    );

    await wrapper.find('[data-testid="outline-select-bc"]').trigger('click', { ctrlKey: true });
    expect(wrapper.find('[data-testid="outline-select-bc"]').attributes('aria-current')).toBe(
      'true',
    );

    await openPanel(wrapper, 'properties');
    expect(wrapper.find('[data-testid="selection-summary"]').text()).toContain('2 entities');
    await openPanel(wrapper, 'outline');

    await wrapper
      .find('[data-testid="outline-select-ab"]')
      .trigger('click', { ctrlKey: true, shiftKey: true });
    expect(wrapper.find('[data-testid="outline-select-ab"]').attributes('aria-current')).toBe(
      undefined,
    );
  });

  it('reports invalid label content before dispatching an update', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      entities: [
        ...pieceDoc.entities,
        { id: 't1', kind: 'text', piece: 'p1', anchor: 'a', content: 'x' },
      ],
    });

    wrapper
      .find('[data-kind="text"][data-entity-id="t1"]')
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }),
      );
    await nextTick();
    wrapper.findComponent(EntityPropertiesPanel).vm.$emit('update-text', 't1', { content: '   ' });
    await nextTick();

    expect(wrapper.text()).toContain('Enter some text.');
    expect(store.journal).toHaveLength(0);
  });

  it('names an unnamed piece and pluralises a single placement in the warning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { wrapper } = await mountLoaded({
      ...pieceDoc,
      pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
      assemblies: [
        {
          id: 'a1',
          name: 'Shell',
          instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }],
        },
      ],
      tabs: [{ kind: 'piece', id: 'p1' }],
    });
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="piece-drawer-remove-piece-p1"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Piece p1 is placed 1 time in 1 assembly. Remove it and its instances?',
    );
    confirm.mockRestore();
  });

  it('clears the instance selection when the instance disappears', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });
    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="assembly-instance-i1"]').trigger('pointerdown');
    await nextTick();

    store.dispatch({
      id: 'remove',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="assembly-selection"]').text()).toContain(
      'Select an instance to inspect it.',
    );
  });

  it('drops a pending instance nudge when the instance disappears', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });
    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();

    wrapper.findComponent(AssemblyCanvas).vm.$emit('nudge', 'i1', 1, 0);
    store.dispatch({
      id: 'remove',
      type: 'remove_instance',
      params: { assembly: 'a1', instance: 'i1' },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();

    expect(store.document.assemblies[0]!.instances).toEqual([]);
  });

  it('names every assembly when a placed piece spans two of them', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { wrapper } = await mountLoaded({
      ...pieceDoc,
      pieces: [{ id: 'p1', name: 'Front', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
      assemblies: [
        { id: 'a1', name: 'Shell', instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }] },
        { id: 'a2', name: 'Lining', instances: [{ id: 'i2', piece: 'p1', x: 0, y: 0 }] },
      ],
      tabs: [{ kind: 'piece', id: 'p1' }],
    });
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="piece-drawer-remove-piece-p1"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Front is placed 2 times in 2 assemblies. Remove it and its instances?',
    );
    confirm.mockRestore();
  });

  it('closes the Add piece picker and switches back to a piece tab', async () => {
    const { wrapper } = await mountLoaded({
      ...pieceDoc,
      pieces: [...pieceDoc.pieces, { id: 'p2', name: 'Sleeve', edges: [], allowances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
      assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
    });
    await openPanel(wrapper, 'pieces');

    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'add_instance');
    await nextTick();
    await wrapper.find('[data-testid="add-piece-close"]').trigger('click');
    expect(wrapper.find('[data-testid="add-piece-picker"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tab-piece-p1"]').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(PatternCanvas).exists()).toBe(true);
  });

  it('clears a pending instance nudge when the view unmounts', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [{ id: 'i1', piece: 'p1', x: 0, y: 0 }] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });
    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();

    wrapper.findComponent(AssemblyCanvas).vm.$emit('nudge', 'i1', 5, 5);
    wrapper.unmount();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(store.document.assemblies[0]!.instances[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('persists the active tab per pattern and restores it on load', async () => {
    const document: PatternDocument = {
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    };

    setLoadedDocument(document);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    await wrapper.find('[data-testid="tab-assembly-a1"]').trigger('click');
    await flushPromises();
    expect(window.localStorage.getItem('sewcraft:active-tab:1')).toBe('assembly:a1');

    store.load(document, { kind: 'assembly', id: 'a1' });
    await nextTick();
    expect(store.activeTab).toEqual({ kind: 'assembly', id: 'a1' });
  });

  it('restores the persisted tab when the project reloads', async () => {
    window.localStorage.setItem('sewcraft:active-tab:1', 'assembly:a1');

    setLoadedDocument({
      ...pieceDoc,
      assemblies: [{ id: 'a1', name: 'Shell', instances: [] }],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'assembly', id: 'a1' },
      ],
    });

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="assembly-canvas"]').exists()).toBe(true);
  });

  it('normalises a stale assembly tab back to a piece tab', async () => {
    const { wrapper, store } = await mountLoaded({
      ...pieceDoc,
      tabs: [{ kind: 'assembly', id: 'missing' }],
    });

    expect(store.document.tabs).toEqual([{ kind: 'piece', id: 'p1' }]);
    expect(wrapper.findComponent(PatternCanvas).exists()).toBe(true);
  });
});

describe('EditorView allowance regions', () => {
  const targets = [
    { kind: 'edge' as const, edge: 'ab' },
    { kind: 'round' as const, round: 'r1' },
  ];

  it('sets one corner width and edits several regions as one undo step', async () => {
    const { wrapper, store } = await mountLoaded(roundedLineDoc);
    await openPanel(wrapper, 'pieces');
    const piece = store.document.pieces[0]!;
    const pieceId = piece.id;

    wrapper
      .findComponent(PiecePanel)
      .vm.$emit('set-piece-corner-allowance', pieceId, 'r1', { cutWidth: 20 });
    await flushPromises();
    expect(store.document.pieces[0]!.cornerAllowances).toEqual([{ round: 'r1', cutWidth: 20 }]);

    // Inherit removes the corner's own width, and undo brings it back.
    wrapper.findComponent(PiecePanel).vm.$emit('set-piece-corner-allowance', pieceId, 'r1', null);
    await flushPromises();
    expect(store.document.pieces[0]!.cornerAllowances).toEqual([]);
    store.undo();
    await nextTick();
    expect(store.document.pieces[0]!.cornerAllowances).toEqual([{ round: 'r1', cutWidth: 20 }]);

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedAllowanceTargets', targets);
    await nextTick();
    expect(wrapper.findComponent(PiecePanel).props('selectedTargets')).toEqual(targets);

    wrapper.findComponent(PiecePanel).vm.$emit('apply-allowances', { mode: 'set', cutWidth: 15 });
    await flushPromises();

    const edited = store.document.pieces[0]!;
    expect(edited.cornerAllowances).toEqual([{ round: 'r1', cutWidth: 15 }]);
    expect(edited.allowances.find((allowance) => allowance.edge === 'ab')?.width).toBe(15);

    store.undo();
    await nextTick();
    const undone = store.document.pieces[0]!;
    expect(undone.cornerAllowances).toEqual([{ round: 'r1', cutWidth: 20 }]);
    expect(undone.allowances.find((allowance) => allowance.edge === 'ab')?.width).not.toBe(15);
  });

  it('ignores a bulk edit that has no command to run', async () => {
    const { wrapper, store } = await mountLoaded(roundedLineDoc);
    await openPanel(wrapper, 'pieces');
    const before = store.journal.length;

    wrapper
      .findComponent(PatternCanvas)
      .vm.$emit('update:selectedAllowanceTargets', [{ kind: 'edge', edge: 'missing' }]);
    await nextTick();
    wrapper.findComponent(PiecePanel).vm.$emit('apply-allowances', { mode: 'double' });
    await flushPromises();

    expect(store.journal.length).toBe(before);
  });

  it('clears the region selection with Escape and when a target disappears', async () => {
    const { wrapper, store } = await mountLoaded(roundedLineDoc);
    await openPanel(wrapper, 'pieces');

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedAllowanceTargets', targets);
    await nextTick();
    keydown('Escape');
    await nextTick();
    expect(wrapper.findComponent(PiecePanel).props('selectedTargets')).toEqual([]);

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedAllowanceTargets', targets);
    await nextTick();
    store.dispatch({
      id: 'remove-round',
      type: 'remove_corner_round',
      params: { id: 'r1' },
    });
    await nextTick();
    expect(wrapper.findComponent(PiecePanel).props('selectedTargets')).toEqual([
      { kind: 'edge', edge: 'ab' },
    ]);
  });

  it('drops the region selection when another kind of selection takes over', async () => {
    const { wrapper } = await mountLoaded(roundedLineDoc);
    await openPanel(wrapper, 'pieces');

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedAllowanceTargets', targets);
    await nextTick();
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedEntityIds', ['ab']);
    await nextTick();
    expect(wrapper.findComponent(PiecePanel).props('selectedTargets')).toEqual([]);

    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedAllowanceTargets', targets);
    await nextTick();
    wrapper.findComponent(PatternCanvas).vm.$emit('update:selectedDimensionIds', ['cut']);
    await nextTick();
    expect(wrapper.findComponent(PiecePanel).props('selectedTargets')).toEqual([]);
  });
});
