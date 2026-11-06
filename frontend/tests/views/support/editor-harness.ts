// Shared fixtures, mounts and hooks for the split EditorView suites.
import {
  createEmptyDocument,
  type Command,
  type Constraint,
  type EntityId,
  executeCommand,
  type PatternDocument,
} from '@sewcraft/geometry';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { projectsApi } from '@/api/projects';
import { downloadSvgFile } from '@/lib/download';
import { useEditorStore } from '@/stores/editor';

import EditorView from '@/views/EditorView.vue';

// floating-ui's auto-update watches an anchored menu through an
// IntersectionObserver, which jsdom does not implement.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

export const RECT = {
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

/** The starter sketch the old seed produced, now a stored fixture. */
export const seedCommands: Command[] = [
  { id: 'a', type: 'add_point', params: { x: 60, y: 260 } },
  { id: 'b', type: 'add_point', params: { x: 220, y: 260 } },
  { id: 'c', type: 'add_point', params: { x: 220, y: 170 } },
  { id: 'd', type: 'add_point', params: { x: 60, y: 170 } },
  { id: 'ab', type: 'add_line', params: { start: 'a', end: 'b' } },
  { id: 'bc', type: 'add_line', params: { start: 'b', end: 'c' } },
  { id: 'cd', type: 'add_line', params: { start: 'c', end: 'd' } },
  { id: 'da', type: 'add_line', params: { start: 'd', end: 'a' } },
  { id: 'bottom', type: 'add_constraint', params: { type: 'horizontal', entities: ['a', 'b'] } },
  { id: 'right', type: 'add_constraint', params: { type: 'vertical', entities: ['b', 'c'] } },
  { id: 'top', type: 'add_constraint', params: { type: 'horizontal', entities: ['c', 'd'] } },
  { id: 'left', type: 'add_constraint', params: { type: 'vertical', entities: ['d', 'a'] } },
  {
    id: 'width',
    type: 'add_constraint',
    params: { type: 'distance', entities: ['a', 'b'], value: 160 },
  },
  {
    id: 'height',
    type: 'add_constraint',
    params: { type: 'distance', entities: ['b', 'c'], value: 90 },
  },
];

/** Give a fixture one piece (and its tab) so the piece canvas renders. */
export function withPiece(
  document: PatternDocument,
  id = 'pc1',
  edges: EntityId[] = [],
): PatternDocument {
  return {
    ...document,
    entities: document.entities.map((entity) => ({ ...entity, piece: id })),
    pieces: [{ id, edges, allowances: [], placement: { x: 0, y: 0 } }],
    tabs: [{ kind: 'piece', id }],
  };
}

export const seededDocument: PatternDocument = withPiece(
  seedCommands.reduce(
    (document, command) => executeCommand(document, command).document,
    createEmptyDocument(),
  ),
  'pc1',
  ['ab', 'bc', 'cd', 'da'],
);

/** The document the mocked load endpoint returns; null means a new project. */
let loadedDocument: PatternDocument | null = seededDocument;

/** Tests that stub the stored document assign it here. */
export function setLoadedDocument(document: PatternDocument | null): void {
  loadedDocument = document;
}
export let currentRouter: Router;
export let savedAt: string | null = '2026-10-23T14:32:00.000Z';

export function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/projects' },
      { path: '/projects', name: 'projects', component: { template: '<div />' } },
      { path: '/projects/:id/edit', name: 'editor', component: EditorView, props: true },
    ],
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  loadedDocument = seededDocument;
  savedAt = '2026-10-23T14:32:00.000Z';
  vi.mocked(downloadSvgFile).mockClear();
  vi.mocked(projectsApi.get).mockClear();
  vi.mocked(projectsApi.update).mockClear();
  vi.mocked(projectsApi.getPattern).mockClear();
  vi.mocked(projectsApi.savePattern).mockClear();
  window.localStorage.clear();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);

  vi.mocked(projectsApi.get).mockImplementation(async () => ({
    data: {
      id: 1,
      name: 'Bodice',
      description: 'A fitted bodice block',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    },
  }));
  vi.mocked(projectsApi.update).mockImplementation(async (id, payload) => ({
    data: {
      id,
      name: payload.name,
      description: payload.description,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-11-04T00:00:00.000Z',
    },
  }));

  vi.mocked(projectsApi.getPattern).mockImplementation(async () => ({
    data: {
      id: 1,
      project_id: 1,
      document: loadedDocument,
      version: 1,
      saved_at: savedAt,
    },
  }));
  vi.mocked(projectsApi.savePattern).mockResolvedValue({
    data: { id: 1, version: 2, saved_at: '2026-10-23T16:00:00.000Z', created: false },
  });
});

export async function mountEditor(pinia: Pinia): Promise<VueWrapper> {
  // A test that preloaded the store defines the document the API should return.
  const store = useEditorStore(pinia);
  if (store.journal.length > 0 || store.document.entities.length > 0) {
    loadedDocument = store.document;
  }
  currentRouter = testRouter();
  const wrapper = mount(EditorView, {
    props: { id: '1' },
    global: { plugins: [pinia, currentRouter] },
  });
  await flushPromises();
  return wrapper;
}

/** Switch the sidebar to one section. */
export async function openPanel(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.find(`[data-testid="sidebar-tab-${id}"]`).trigger('click');
  await nextTick();
}

/** Open the canvas display menu and toggle one layer by its key. */
export async function toggleDisplay(wrapper: VueWrapper, key: string): Promise<void> {
  if (!wrapper.find(`[data-testid="display-${key}"]`).exists()) {
    await wrapper.find('[data-testid="display-menu-trigger"]').trigger('click');
    await flushPromises();
  }
  await wrapper.find(`[data-testid="display-${key}"]`).trigger('click');
  await flushPromises();
}

/** Open the export dialog from the ribbon. */
export async function openExport(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="download-svg"]').trigger('click');
  await flushPromises();
}

export function canvasDown(wrapper: VueWrapper, x: number, y: number, button = 0): void {
  wrapper
    .find('[data-testid="grid"]')
    .element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button }),
    );
}

export function canvasUp(): void {
  window.dispatchEvent(new MouseEvent('pointerup'));
}

export function entityDown(
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

export function pointDown(wrapper: VueWrapper, id: EntityId): void {
  entityDown(wrapper, 'point', id);
}

/** Arm one of the grouped rectangle modes through the ribbon's split control. */
export async function selectRectangleMode(
  wrapper: VueWrapper,
  mode: 'add_rectangle' | 'add_center_rectangle' | 'add_3point_rectangle',
): Promise<void> {
  await wrapper.find('[data-testid="tool-rectangle-modes"]').trigger('click');
  await flushPromises();
  document
    .querySelector<HTMLElement>(`[data-testid="tool-${mode}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

/** Arm one of the grouped text modes through the ribbon's split control. */
export async function selectTextMode(
  wrapper: VueWrapper,
  mode: 'add_text' | 'add_text_leader',
): Promise<void> {
  await wrapper.find('[data-testid="tool-text-modes"]').trigger('click');
  await flushPromises();
  document
    .querySelector<HTMLElement>(`[data-testid="tool-${mode}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

export function keydown(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }));
}

/** Presentation offset of a distance constraint, or undefined for other kinds. */
export function distanceOffset(constraint: Constraint | undefined): number | undefined {
  return constraint?.type === 'distance' ? constraint.offset : undefined;
}

export function points(wrapper: VueWrapper) {
  return wrapper.findAll('[data-kind="point"]');
}

export const simpleDoc: PatternDocument = withPiece({
  ...createEmptyDocument(),
  entities: [
    { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
    { id: 'r', kind: 'point', x: 50, y: 50, construction: false, fixed: false },
    { id: 's', kind: 'point', x: 0, y: 50, construction: false, fixed: false },
  ],
});

/** A circle of radius 100 centred on `a`, its rim on `c`. */
export const circleDoc: PatternDocument = withPiece({
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'c', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
    { id: 'k1', kind: 'circle', center: 'a', rim: 'c', construction: false },
  ],
});

export const edgeDoc: PatternDocument = withPiece({
  ...createEmptyDocument(),
  entities: [
    { id: 'p', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'q', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
    { id: 'l1', kind: 'line', start: 'p', end: 'q', construction: false },
  ],
});

export const inspectorDoc: PatternDocument = {
  ...edgeDoc,
  constraints: [
    { id: 'w', type: 'distance', a: 'p', b: 'q', value: 50, orientation: 'horizontal' },
    { id: 'h', type: 'horizontal', a: 'p', b: 'q' },
  ],
};

export const lineDoc: PatternDocument = withPiece({
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
});

/** `lineDoc` with the corner at `b` rounded between `ab` and `bc`. */
export const roundedLineDoc: PatternDocument = (() => {
  const rounded = executeCommand(lineDoc, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'ab', second: 'bc', radius: 20 },
  }).document;
  return withPiece(rounded, 'pc1', ['ab', 'bc', 'cd', 'da']);
})();

export const curveDoc: PatternDocument = withPiece(
  {
    ...createEmptyDocument(),
    entities: [
      ...lineDoc.entities,
      { id: 'curve', kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd', construction: false },
    ],
  },
  'pc1',
  ['ab', 'bc', 'cd', 'da'],
);

/** The four lines of `lineDoc` as one closed piece. */
export const pieceDoc: PatternDocument = {
  ...lineDoc,
  entities: lineDoc.entities.map((entity) => ({ ...entity, piece: 'p1' })),
  pieces: [
    {
      id: 'p1',
      name: 'Front',
      quantity: 2,
      edges: ['ab', 'bc', 'cd', 'da'],
      allowances: [{ edge: 'ab', width: 10 }],
    },
  ],
  tabs: [{ kind: 'piece', id: 'p1' }],
};

/** `pieceDoc` plus a read-only cut dimension from `a` to `c`. */
export const cutDimensionDoc: PatternDocument = {
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

export async function mountLoaded(
  document: PatternDocument,
): Promise<{ wrapper: VueWrapper; store: ReturnType<typeof useEditorStore> }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useEditorStore();
  store.load(document);
  loadedDocument = document;
  const wrapper = await mountEditor(pinia);
  return { wrapper, store };
}
