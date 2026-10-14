import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from '@/stores/editor';

import EditorView from './EditorView.vue';

async function mountEditor(pinia: Pinia) {
  const wrapper = mount(EditorView, {
    props: { id: '1' },
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

describe('EditorView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('seeds a starter sketch on first mount', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    expect(wrapper.findAll('circle')).toHaveLength(4);
    expect(wrapper.findAll('line')).toHaveLength(4);
    expect(wrapper.text()).toContain('command(s)');
  });

  it('adds a point, then undoes and redoes it', async () => {
    const pinia = createPinia();
    const wrapper = await mountEditor(pinia);

    const before = wrapper.findAll('circle').length;

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add point')!
      .trigger('click');
    expect(wrapper.findAll('circle')).toHaveLength(before + 1);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Undo')!
      .trigger('click');
    expect(wrapper.findAll('circle')).toHaveLength(before);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Redo')!
      .trigger('click');
    expect(wrapper.findAll('circle')).toHaveLength(before + 1);
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

    expect(wrapper.findAll('circle')).toHaveLength(2);
    expect(wrapper.findAll('line')).toHaveLength(1);
    expect(wrapper.find('line').attributes('stroke-dasharray')).toBe('4 4');
  });

  it('does not seed when the journal already has entries', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.dispatch({ id: 'p', type: 'add_point', params: { x: 0, y: 0 } });
    store.dispatch({ id: 'del', type: 'delete_entity', params: { id: 'p' } });

    const wrapper = await mountEditor(pinia);

    expect(wrapper.findAll('circle')).toHaveLength(0);
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
    const circles = wrapper.findAll('circle');

    expect(circles).toHaveLength(2);
    expect(circles[0]!.attributes('fill')).toBe('none');
    expect(circles[0]!.attributes('stroke')).toBe('currentColor');
    expect(circles[1]!.attributes('fill')).toBe('currentColor');
    expect(circles[1]!.attributes('stroke')).toBe('none');
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
    expect(wrapper.findAll('line')).toHaveLength(2);

    await wrapper.find('input[type="checkbox"]').setValue(false);

    expect(wrapper.findAll('line')).toHaveLength(1);
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

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Undo')!
      .trigger('click');

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
});
