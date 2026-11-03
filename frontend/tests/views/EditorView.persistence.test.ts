import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { RouterView } from 'vue-router';
import { ApiError, projectsApi } from '@/api/projects';
import PatternCanvas from '@/components/PatternCanvas.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import { downloadSvgFile } from '@/lib/download';
import { useEditorStore } from '@/stores/editor';
import EditorView from '@/views/EditorView.vue';
import {
  canvasDown,
  currentRouter,
  curveDoc,
  cutDimensionDoc,
  distanceOffset,
  entityDown,
  keydown,
  lineDoc,
  mountEditor,
  mountLoaded,
  openExport,
  openPanel,
  pieceDoc,
  points,
  seededDocument,
  selectTextMode,
  simpleDoc,
  testRouter,
  withPiece,
  setLoadedDocument,
} from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

describe('EditorView persistence', () => {
  function markDirty(pinia: Pinia): void {
    const piece = useEditorStore(pinia).document.pieces[0]?.id;
    useEditorStore(pinia).dispatch({
      id: 'dirty',
      type: 'add_point',
      params: { x: 1, y: 2, ...(piece === undefined ? {} : { piece }) },
    });
  }

  it('opens a project without a pattern as new and saves the first edit', async () => {
    setLoadedDocument(null);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('New pattern — not saved yet');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();

    markDirty(pinia);
    await nextTick();

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Unsaved changes');
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(1, {
      document: store.document,
      expected_version: 0,
    });
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');
    expect(store.savedVersion).toBe(2);
    expect(store.isDirty).toBe(false);
  });

  it('saves an untouched new project as an empty document', async () => {
    setLoadedDocument(null);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ expected_version: 0 }),
    );
    expect(useEditorStore(pinia).isNew).toBe(false);
  });

  it('ignores a save shortcut before the project finishes loading', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    vi.mocked(projectsApi.getPattern).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve as (value: unknown) => void;
        }),
    );
    const wrapper = await mountEditor(createPinia());

    keydown('s', { ctrlKey: true });
    await flushPromises();
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="editor-loading"]').exists()).toBe(true);

    resolveLoad({
      data: {
        id: 1,
        project_id: 1,
        name: 'Bodice',
        document: simpleDoc,
        version: 1,
        saved_at: '2026-10-23T14:32:00.000Z',
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="editor-top-bar"]').exists()).toBe(true);
  });

  it('reports a malformed stored document as a load error', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      entities: null,
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain(
      'The stored pattern for "Bodice" is unreadable.',
    );
  });

  it('reports an older document without an entity list as unreadable', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.1',
      entities: null,
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain(
      'The stored pattern for "Bodice" is unreadable.',
    );
  });

  it('reports an older document without a constraint list as unreadable', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.1',
      constraints: null,
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain('is unreadable');
  });

  it('reports an unknown document without a constraint list as unreadable', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.3',
      constraints: null,
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain('is unreadable');
  });

  it('reports an unknown schema that cannot be rendered', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.3',
      pieces: undefined,
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain('is unreadable');
  });

  it('shows a load error with a way back to Projects', async () => {
    vi.mocked(projectsApi.getPattern).mockRejectedValueOnce(new Error('Load failed badly'));
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain('Load failed badly');
    expect(wrapper.find('[data-testid="editor-load-error"] a').attributes('href')).toBe(
      '/projects',
    );
    // Hiding the app header on this route must not strand the user here.
    const header = wrapper.find('[data-testid="editor-top-bar"]');
    expect(header.exists()).toBe(true);
    expect(header.text()).toContain('SewCraft');
    expect(header.text()).toContain('Projects');
    expect(wrapper.find('[data-testid="pattern-name"]').text()).toBe('Project unavailable');
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(false);
  });

  it('saves with Cmd/Ctrl+S and ignores it while clean', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    keydown('s', { ctrlKey: true });
    await flushPromises();
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();

    markDirty(pinia);
    await nextTick();
    keydown('s', { metaKey: true });
    await flushPromises();

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');
  });

  it('keeps the work and offers a retry when a save fails', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(new Error('Network down'));
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');
    expect(wrapper.text()).toContain('Network down');
    expect(store.isDirty).toBe(true);
    expect(points(wrapper)).toHaveLength(5);
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
  });

  it('explains a project deleted while the editor was open', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(
      new ApiError(404, { message: 'Not found' }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain(
      'This project no longer exists.',
    );
  });

  it('disables the save while one is in flight', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    vi.mocked(projectsApi.savePattern).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: unknown) => void;
        }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Saving…');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();

    keydown('s', { ctrlKey: true });
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    resolveSave({
      data: { id: 1, version: 2, saved_at: '2026-10-23T16:00:00.000Z', created: false },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');
  });

  it('reloads the stored document after a conflict', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(
      new ApiError(409, {
        message: 'The project was saved by someone else.',
        current_version: 4,
        saved_at: '2026-10-23T16:05:00.000Z',
      }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(true);

    // The shortcut is ignored while the dialog is open.
    keydown('s', { ctrlKey: true });
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    vi.mocked(projectsApi.getPattern).mockResolvedValueOnce({
      data: {
        id: 1,
        project_id: 1,
        name: 'Bodice',
        document: simpleDoc,
        version: 4,
        saved_at: '2026-10-23T16:05:00.000Z',
      },
    });
    await wrapper.find('[data-testid="conflict-reload"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(false);
    expect(store.document).toEqual(simpleDoc);
    expect(store.savedVersion).toBe(4);
    expect(store.saveState).toBe('idle');
  });

  it('overwrites explicitly from the conflict dialog', async () => {
    vi.mocked(projectsApi.savePattern)
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }))
      .mockResolvedValueOnce({
        data: { id: 1, version: 5, saved_at: '2026-10-23T17:00:00.000Z', created: false },
      });
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="conflict-overwrite"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ expected_version: null }),
    );
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');
  });

  it('opens a 0.2 document read-only with the unsupported-format dialog', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.2',
    } as unknown as PatternDocument);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="upgrade-dialog-title"]').text()).toBe(
      'Unsupported project format',
    );
    expect(wrapper.find('[data-testid="saved-schema"]').text()).toBe('sewcraft.pattern/0.2');
    expect(wrapper.find('[data-testid="editor-schema"]').text()).toBe('sewcraft.pattern/0.5');
    expect(wrapper.find('[data-testid="read-only-pill"]').exists()).toBe(true);
    expect(store.readOnly).toBe(true);

    await wrapper.find('[data-testid="upgrade-readonly"]').trigger('click');
    await flushPromises();

    expect(store.readOnly).toBe(true);
    expect(store.document.schema).toBe('sewcraft.pattern/0.2');
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(false);
  });

  it('opens an older document read-only without saving and keeps export', async () => {
    const readOnlyDoc: PatternDocument = {
      ...cutDimensionDoc,
      schema: 'sewcraft.pattern/0.2',
      constraints: [
        {
          id: 'w',
          type: 'distance',
          a: 'a',
          b: 'b',
          value: 100,
          orientation: 'horizontal',
          offset: 20,
        },
        ...(cutDimensionDoc.constraints ?? []),
      ],
    } as unknown as PatternDocument;

    setLoadedDocument(readOnlyDoc);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    await wrapper.find('[data-testid="upgrade-readonly"]').trigger('click');
    await flushPromises();

    expect(store.readOnly).toBe(true);
    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="read-only-pill"]').exists()).toBe(true);
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="tool-add_point"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeUndefined();

    await openExport(wrapper);
    await wrapper.find('[data-testid="export-download"]').trigger('click');
    expect(vi.mocked(downloadSvgFile)).toHaveBeenCalledTimes(1);

    expect(wrapper.find('[data-testid="tabs-new"]').attributes('disabled')).toBeDefined();

    await openExport(wrapper);
    expect(wrapper.find('[data-testid="export-stitch"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="export-cancel"]').trigger('click');

    const before = points(wrapper).length;
    canvasDown(wrapper, 400, 300);
    await nextTick();
    expect(points(wrapper)).toHaveLength(before);
    expect(wrapper.findComponent(PatternCanvas).attributes('aria-readonly')).toBe('true');

    const distance = wrapper.find('[data-testid="dimension-label-w"]');
    distance.element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(distanceOffset(store.document.constraints.find((entry) => entry.id === 'w'))).toBe(20);

    await distance.trigger('dblclick');
    expect(wrapper.find('[data-testid="dimension-editor"]').exists()).toBe(false);

    const cut = wrapper.find('[data-testid="dimension-label-cut"]');
    cut.element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 120, button: 0 }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 320 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(store.document.constraints.some((entry) => entry.id === 'cut')).toBe(true);
  });

  it('never migrates a newer schema and offers read-only or cancel', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.6',
    } as unknown as PatternDocument);

    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);

    expect(wrapper.find('[data-testid="upgrade-dialog"]').text()).toContain(
      'Unsupported project format',
    );
    expect(wrapper.find('[data-testid="upgrade-update"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Saved');

    keydown('Escape');
    await nextTick();
    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(true);

    const close = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(close);
    expect(close.defaultPrevented).toBe(false);

    await wrapper.find('[data-testid="upgrade-readonly"]').trigger('click');
    await flushPromises();

    expect(store.readOnly).toBe(true);
    expect(store.document.schema).toBe('sewcraft.pattern/0.6');
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();
  });

  it('returns to Projects when the unsupported-format dialog is cancelled', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.2',
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());

    await wrapper.find('[data-testid="upgrade-cancel"]').trigger('click');
    await flushPromises();

    expect(currentRouter.currentRoute.value.name).toBe('projects');
  });

  it('prompts before leaving with unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pinia = createPinia();
    const router = testRouter();
    await router.push('/projects/1/edit');
    await router.isReady();
    const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    await router.push('/projects');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('projects');

    await router.push('/projects/1/edit');
    await flushPromises();
    markDirty(pinia);
    await nextTick();

    await router.push('/projects');
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?');
    expect(router.currentRoute.value.name).toBe('editor');

    confirm.mockReturnValue(true);
    await router.push('/projects');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('projects');
    expect(wrapper.findComponent(EditorView).exists()).toBe(false);
    confirm.mockRestore();
  });

  it('asks the browser before closing a dirty tab', async () => {
    const pinia = createPinia();
    await mountEditor(pinia);

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    markDirty(pinia);
    await nextTick();

    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('falls back to a generic save failure for a non-Error throw', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce('offline');
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Save failed');
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');
  });

  it('ignores a stale read-only choice once the dialog is closed', async () => {
    setLoadedDocument({
      ...createEmptyDocument(),
      schema: 'sewcraft.pattern/0.2',
    } as unknown as PatternDocument);

    const wrapper = await mountEditor(createPinia());
    const dialog = wrapper.findComponent({ name: 'UpgradeDocumentDialog' });

    dialog.vm.$emit('readonly');
    dialog.vm.$emit('readonly');
    await nextTick();

    expect(wrapper.find('[data-testid="upgrade-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="read-only-pill"]').exists()).toBe(true);
  });

  it('falls back to a generic load error for a non-Error failure', async () => {
    vi.mocked(projectsApi.getPattern).mockRejectedValueOnce('offline');
    const wrapper = await mountEditor(createPinia());

    expect(wrapper.find('[data-testid="editor-load-error"]').text()).toContain(
      'Failed to load the project',
    );
  });
});

describe('EditorView autosave', () => {
  function markDirty(pinia: Pinia): void {
    const piece = useEditorStore(pinia).document.pieces[0]?.id;
    useEditorStore(pinia).dispatch({
      id: 'dirty',
      type: 'add_point',
      params: { x: 1, y: 2, ...(piece === undefined ? {} : { piece }) },
    });
  }

  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  }

  afterEach(() => {
    delete (document as { hidden?: boolean }).hidden;
    vi.useRealTimers();
  });

  it('writes a committed change after the idle delay and reports it as autosaved', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Unsaved changes');

    await vi.advanceTimersByTimeAsync(1499);
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(1, {
      document: store.document,
      expected_version: 1,
      origin: 'autosave',
    });
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');
    expect(store.isDirty).toBe(false);
  });

  it('cancels the pending autosave when Save is pressed', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);

    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(1, {
      document: store.document,
      expected_version: 1,
    });

    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
  });

  it('writes again when an edit lands during an autosave request', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    vi.mocked(projectsApi.savePattern).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: unknown) => void;
        }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    markDirty(pinia);
    await nextTick();
    resolveSave({
      data: { id: 1, version: 2, saved_at: '2026-10-23T16:00:00.000Z', created: false },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');
  });

  it('retries a transient autosave failure on the backoff ladder', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(new Error('Network down'));
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');

    await vi.advanceTimersByTimeAsync(1999);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');
  });

  it('stops on a permanent failure until the document changes', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(
      new ApiError(422, { message: 'The document may not be greater than 2 MB.' }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed');
    expect(wrapper.text()).toContain('The document may not be greater than 2 MB.');
    expect(store.saveState).toBe('error');
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(60000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    // A new change makes the same document worth trying again.
    markDirty(pinia);
    await nextTick();
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Unsaved changes');

    await vi.advanceTimersByTimeAsync(1500);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(2);
  });

  it('pauses on an autosave conflict and opens the dialog only on Save', async () => {
    vi.mocked(projectsApi.savePattern)
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }))
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }));
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe(
      'Save paused — changed elsewhere',
    );
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(false);

    // Editing while paused keeps the work in memory and stays paused.
    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(20000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    // An explicit Save is what opens the existing conflict dialog.
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenLastCalledWith(1, {
      document: expect.anything(),
      expected_version: 1,
    });
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(true);
  });

  it('resumes autosave after the conflict is reloaded', async () => {
    vi.mocked(projectsApi.savePattern)
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }))
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }));
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.saveState).toBe('paused');

    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(true);

    vi.mocked(projectsApi.getPattern).mockResolvedValueOnce({
      data: {
        id: 1,
        project_id: 1,
        name: 'Bodice',
        document: seededDocument,
        version: 4,
        saved_at: '2026-10-23T16:05:00.000Z',
      },
    });
    await wrapper.find('[data-testid="conflict-reload"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(false);
    expect(store.saveState).toBe('idle');
    expect(store.savedVersion).toBe(4);

    // Autosave re-arms against the reloaded version.
    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1500);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ expected_version: 4, origin: 'autosave' }),
    );
  });

  it('retries a transient overwrite failure on the background ladder', async () => {
    vi.mocked(projectsApi.savePattern)
      .mockRejectedValueOnce(new ApiError(409, { current_version: 4, saved_at: null }))
      .mockRejectedValueOnce(new Error('Network down'));
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);

    await wrapper.find('[data-testid="conflict-overwrite"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');

    await vi.advanceTimersByTimeAsync(2000);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(3);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');
  });

  it('does not autosave while the conflict dialog owns the editor', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(
      new ApiError(409, { current_version: 4, saved_at: null }),
    );
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    await wrapper.find('[data-testid="save-project"]').trigger('click');
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('[data-testid="conflict-dialog"]').exists()).toBe(true);

    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(20000);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
  });

  it('flushes a hidden tab with keepalive and reports the write', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    // A clean editor writes nothing on the lifecycle event.
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();

    markDirty(pinia);
    await nextTick();
    document.dispatchEvent(new Event('visibilitychange'));

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(
      1,
      {
        document: store.document,
        expected_version: 1,
        origin: 'autosave',
      },
      { keepalive: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');

    // Returning to a clean tab writes nothing more.
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
  });

  it('re-arms autosave when the tab returns with a failed lifecycle flush', async () => {
    vi.mocked(projectsApi.savePattern)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({
        data: { id: 1, version: 2, saved_at: '2026-10-23T16:00:00.000Z', created: false },
      });
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');

    // Leaving the tab paused the retry ladder; returning re-arms the writer.
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1500);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="save-status"]').text()).toContain('Autosaved');
  });

  it('flushes on pagehide as well', async () => {
    const pinia = createPinia();
    await mountEditor(pinia);
    vi.useFakeTimers();
    markDirty(pinia);
    await nextTick();

    window.dispatchEvent(new Event('pagehide'));

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ origin: 'autosave' }),
      { keepalive: true },
    );
  });

  it('skips the keepalive flush when the payload exceeds the browser budget', async () => {
    const pinia = createPinia();
    await mountEditor(pinia);
    const store = useEditorStore(pinia);
    vi.useFakeTimers();

    store.document = {
      ...store.document,
      entities: [
        {
          id: 'x'.repeat(70_000),
          kind: 'point',
          x: 0,
          y: 0,
          construction: false,
          fixed: false,
        },
      ],
    };
    await nextTick();

    window.dispatchEvent(new Event('pagehide'));

    expect(vi.mocked(projectsApi.savePattern)).not.toHaveBeenCalled();
  });

  it('does not schedule a write while a lifecycle flush is in flight', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    vi.mocked(projectsApi.savePattern).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve as (value: unknown) => void;
        }),
    );
    const pinia = createPinia();
    await mountEditor(pinia);
    vi.useFakeTimers();

    markDirty(pinia);
    await nextTick();
    window.dispatchEvent(new Event('pagehide'));
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    // The edit lands while that request is still open; scheduling would race it
    // for the same version token, so it waits for the next committed change.
    markDirty(pinia);
    await nextTick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);

    resolveSave({
      data: { id: 1, version: 2, saved_at: '2026-10-23T16:00:00.000Z', created: false },
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected keepalive flush', async () => {
    vi.mocked(projectsApi.savePattern).mockRejectedValueOnce(new Error('offline'));
    const pinia = createPinia();
    await mountEditor(pinia);
    vi.useFakeTimers();
    markDirty(pinia);
    await nextTick();

    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.mocked(projectsApi.savePattern)).toHaveBeenCalledTimes(1);
  });
});

describe('EditorView top bar', () => {
  it('renders one header row above the ribbon with brand navigation and save controls', async () => {
    const wrapper = await mountEditor(createPinia());

    const headers = wrapper.findAll('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]!.attributes('data-testid')).toBe('editor-top-bar');
    expect(headers[0]!.text()).toContain('SewCraft');
    expect(headers[0]!.text()).toContain('Projects');
    expect(wrapper.find('[data-testid="pattern-name"]').text()).toBe('Bodice');
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="toolbar"]')).toHaveLength(1);
  });

  it('keeps the top bar and the way back to Projects while the project loads', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    vi.mocked(projectsApi.getPattern).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve as (value: unknown) => void;
        }),
    );
    const wrapper = await mountEditor(createPinia());

    const header = wrapper.find('[data-testid="editor-top-bar"]');
    expect(header.exists()).toBe(true);
    expect(header.text()).toContain('SewCraft');
    expect(header.text()).toContain('Projects');
    expect(wrapper.find('[data-testid="pattern-name"]').text()).toBe('Loading…');
    expect(wrapper.find('[data-testid="save-status"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(false);

    resolveLoad({
      data: {
        id: 1,
        project_id: 1,
        name: 'Bodice',
        document: simpleDoc,
        version: 1,
        saved_at: '2026-10-23T14:32:00.000Z',
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="pattern-name"]').text()).toBe('Bodice');
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(true);
  });
});

describe('EditorView containers and annotation text', () => {
  const owned = (document: PatternDocument): PatternDocument => ({
    ...document,
    entities: document.entities.map((entity) => ({ ...entity, piece: 'p1' })),
  });

  it('creates an empty piece and makes it active', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    await wrapper.find('[data-testid="tabs-new"]').trigger('click');
    await wrapper.find('[data-testid="tabs-menu-piece"]').trigger('click');
    await flushPromises();

    expect(store.document.pieces).toHaveLength(2);
    expect(store.document.pieces[1]!.edges).toEqual([]);
    expect(store.activePieceId).toBe(store.document.pieces[1]!.id);
  });

  it('captures and clears a cut loop from the piece card', async () => {
    const { wrapper, store } = await mountLoaded({
      ...owned(lineDoc),
      pieces: [{ id: 'p1', edges: [], allowances: [] }],
    });
    await openPanel(wrapper, 'pieces');

    for (const id of ['ab', 'bc', 'cd', 'da']) {
      entityDown(wrapper, 'line', id, { ctrlKey: id !== 'ab' });
      await nextTick();
    }
    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'set_cut_loop');
    await flushPromises();
    expect(store.document.pieces[0]!.edges).toEqual(['ab', 'bc', 'cd', 'da']);

    await wrapper.find('[data-testid="piece-drawer-clear-cut-loop"]').trigger('click');
    await flushPromises();
    expect(store.document.pieces[0]!.edges).toEqual([]);
  });

  it('places a label with the Text tool and edits it in the inspector', async () => {
    const { wrapper, store } = await mountLoaded(owned(pieceDoc));

    await wrapper.find('[data-testid="tool-text"]').trigger('click');
    wrapper.findComponent(PatternCanvas).vm.$emit('add-text', { kind: 'point', id: 'a' });
    await flushPromises();

    const text = store.document.entities.find((entity) => entity.kind === 'text')!;
    expect(text).toMatchObject({ anchor: 'a', content: 'Text', piece: 'p1' });

    await wrapper.find('[data-testid="tool-select"]').trigger('click');
    wrapper
      .find(`[data-kind="text"][data-entity-id="${text.id}"]`)
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }),
      );
    await nextTick();

    await wrapper.find('[data-testid="text-content"]').setValue('snap');
    await flushPromises();
    expect(store.document.entities.find((entity) => entity.id === text.id)).toMatchObject({
      content: 'snap',
    });
  });

  it('places a label and its arrow target in one batch', async () => {
    const { wrapper, store } = await mountLoaded(owned(pieceDoc));

    await selectTextMode(wrapper, 'add_text_leader');
    wrapper
      .findComponent(PatternCanvas)
      .vm.$emit('add-text', { kind: 'new', x: 10, y: 20 }, { kind: 'point', id: 'b' });
    await flushPromises();

    const text = store.document.entities.find((entity) => entity.kind === 'text')!;
    expect(text).toMatchObject({ content: 'Text', leader: 'b', piece: 'p1' });
    const anchor = store.document.entities.find(
      (entity) => entity.kind === 'point' && entity.x === 10 && entity.y === 20,
    );
    expect(anchor).toMatchObject({ role: 'annotation' });
    expect(store.journal.at(-1)?.command.type).toBe('add_text');
  });

  it('assigns an annotation role from the inspector', async () => {
    const { wrapper, store } = await mountLoaded(pieceDoc);

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    await wrapper.find('[data-testid="entity-role"]').setValue('annotation');
    await flushPromises();

    expect(store.document.entities.find((entity) => entity.id === 'ab')).toMatchObject({
      role: 'annotation',
    });
  });
});

describe('EditorView container escape hatches', () => {
  it('explains an empty loop selection and places text on the active piece', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);

    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'set_cut_loop');
    await nextTick();
    expect(wrapper.text()).toContain('Select at least three cut edges');

    wrapper.findComponent(PatternCanvas).vm.$emit('add-text', { kind: 'point', id: 'a' });
    await flushPromises();
    expect(store.document.entities.find((entity) => entity.kind === 'text')).toMatchObject({
      piece: 'pc1',
    });
  });

  it('explains an invalid loop selection and switches tabs', async () => {
    const { wrapper, store } = await mountLoaded({
      ...withPiece(lineDoc, 'p1'),
      pieces: [
        { id: 'p1', edges: [], allowances: [] },
        { id: 'p2', edges: [], allowances: [] },
      ],
      tabs: [
        { kind: 'piece', id: 'p1' },
        { kind: 'piece', id: 'p2' },
      ],
    });

    entityDown(wrapper, 'line', 'ab');
    await nextTick();
    wrapper.findComponent(EditorRibbon).vm.$emit('action', 'set_cut_loop');
    await nextTick();
    expect(wrapper.text()).toContain('Select at least three cut edges');

    await wrapper.find('[data-testid="tab-piece-p2"]').trigger('click');
    await nextTick();
    expect(store.activePieceId).toBe('p2');
  });
});

describe('EditorView active-piece defaults and teardown', () => {
  it('stamps the active piece on points, curves and constraints', async () => {
    const { wrapper, store } = await mountLoaded(withPiece(curveDoc, 'p1'));

    wrapper.findComponent(PatternCanvas).vm.$emit('add-point', 10, 10);
    await flushPromises();
    expect(
      store.document.entities.find((entity) => entity.kind === 'point' && entity.x === 10),
    ).toMatchObject({ piece: 'p1' });

    wrapper.findComponent(PatternCanvas).vm.$emit('add-curve', ['a', 'b', 'c', 'd']);
    await flushPromises();
    expect(
      store.document.entities.filter((entity) => entity.kind === 'curve').at(-1),
    ).toMatchObject({
      piece: 'p1',
    });

    await wrapper.find('[data-testid="constraint-horizontal"]').trigger('click');
    wrapper.findComponent(PatternCanvas).vm.$emit('constraint-pick', { id: 'a', kind: 'point' });
    wrapper.findComponent(PatternCanvas).vm.$emit('constraint-pick', { id: 'b', kind: 'point' });
    await flushPromises();
    expect(store.document.constraints.at(-1)).toMatchObject({ piece: 'p1' });
  });
});
