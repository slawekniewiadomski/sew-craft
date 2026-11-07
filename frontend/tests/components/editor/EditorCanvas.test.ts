import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import type { Assembly, PatternDocument } from '@sewcraft/geometry';

import EditorCanvas from '@/components/editor/EditorCanvas.vue';

const pattern = { pieces: [], tabs: [{}] } as unknown as PatternDocument;
const assembly = { id: 'a1' } as unknown as Assembly;
const display = {
  piece: { construction: true, allowances: true, constraints: true, dimensions: true },
  assembly: {
    cutShapes: true,
    allowances: true,
    stitch: true,
    folds: true,
    notches: true,
    labels: true,
  },
  export: { construction: true, stitch: true, fold: true },
};

const stub = (name: string) => defineComponent({ name, template: '<div />' });

function mountCanvas(overrides: Record<string, unknown> = {}) {
  return mount(EditorCanvas, {
    props: {
      pattern,
      visibleDocument: pattern,
      assemblyDocument: pattern,
      activeAssembly: assembly,
      isAssemblyTab: false,
      isSketch: false,
      activeTool: 'select',
      activePieceId: null,
      readOnly: false,
      selectedEntityIds: [],
      selectedDimensionIds: [],
      selectedAllowanceTargets: [],
      selectedInstanceId: null,
      assemblyPickerOpen: false,
      fitToken: 0,
      sketchArrange: false,
      display,
      displayItems: [],
      displayValues: {},
      activeConstraint: null,
      constraintPicks: [],
      cornerRoundActive: false,
      cornerRoundPicks: { first: null, second: null },
      cornerRoundPreviewRadius: null,
      measuredEditing: false,
      measuredHighlightIds: [],
      ...overrides,
    },
    global: {
      stubs: {
        AssemblyCanvas: stub('AssemblyCanvas'),
        PatternCanvas: stub('PatternCanvas'),
        CanvasDisplayMenu: stub('CanvasDisplayMenu'),
      },
    },
  });
}

describe('EditorCanvas', () => {
  it('forwards the assembly canvas actions', async () => {
    const wrapper = mountCanvas({ isAssemblyTab: true });
    const canvas = wrapper.findComponent({ name: 'AssemblyCanvas' });

    await canvas.vm.$emit('select', 'i1');
    await canvas.vm.$emit('move', 'i1', 4, 5);
    await canvas.vm.$emit('nudge', 'i1', 1, -1);
    await canvas.vm.$emit('remove', 'i1');
    await canvas.vm.$emit('add-piece', 'p1');
    await canvas.vm.$emit('close-picker');

    expect(wrapper.emitted('select-instance')).toEqual([['i1']]);
    expect(wrapper.emitted('move-instance')).toEqual([['i1', 4, 5]]);
    expect(wrapper.emitted('nudge-instance')).toEqual([['i1', 1, -1]]);
    expect(wrapper.emitted('remove-instance')).toEqual([['i1']]);
    expect(wrapper.emitted('add-instance')).toEqual([['p1']]);
    expect(wrapper.emitted('close-picker')).toEqual([[]]);
  });

  it('forwards the piece canvas actions used by the region', async () => {
    const wrapper = mountCanvas();
    const canvas = wrapper.findComponent({ name: 'PatternCanvas' });

    await canvas.vm.$emit('move-piece', 2, 3);
    await canvas.vm.$emit('move-point', 'p1', 4, 5);
    await canvas.vm.$emit('add-text', ['a', 1, 2]);
    await canvas.vm.$emit('add-notch', 'p1', 'e1');
    await canvas.vm.$emit('add-centre-line', 'p1', 'p2');
    await canvas.vm.$emit('add-point', 4, 5);
    await canvas.vm.$emit('add-point-on-line', 'l1', 4, 5);
    await canvas.vm.$emit('split-line', 'l1', 4, 5);
    await canvas.vm.$emit('add-line', ['a', 1, 2], ['b', 3, 4]);
    await canvas.vm.$emit('add-arc', ['a', 1, 2], ['b', 3, 4], ['c', 5, 6]);
    await canvas.vm.$emit('add-circle', ['a', 1, 2], ['b', 3, 4]);
    await canvas.vm.$emit('add-rectangle', 'two-click', [['a', 1, 2]]);
    await canvas.vm.$emit('set-corner-round-radius', 'c1', 5);
    await canvas.vm.$emit('update-dimension', 'd1', { offset: 2 });

    expect(wrapper.emitted('move-piece')).toEqual([[2, 3]]);
    expect(wrapper.emitted('move-point')).toEqual([['p1', 4, 5]]);
    expect(wrapper.emitted('add-text')).toEqual([[['a', 1, 2], undefined]]);
    expect(wrapper.emitted('add-notch')).toEqual([['p1', 'e1']]);
    expect(wrapper.emitted('add-centre-line')).toEqual([['p1', 'p2']]);
    expect(wrapper.emitted('add-point')).toEqual([[4, 5]]);
    expect(wrapper.emitted('add-point-on-line')).toEqual([['l1', 4, 5]]);
    expect(wrapper.emitted('split-line')).toEqual([['l1', 4, 5]]);
    expect(wrapper.emitted('add-line')).toHaveLength(1);
    expect(wrapper.emitted('add-arc')).toHaveLength(1);
    expect(wrapper.emitted('add-circle')).toHaveLength(1);
    expect(wrapper.emitted('add-rectangle')).toHaveLength(1);
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['c1', 5]]);
    expect(wrapper.emitted('update-dimension')).toEqual([['d1', { offset: 2 }]]);
  });

  it('forwards the display menu toggle and skips the empty state', async () => {
    const wrapper = mountCanvas();
    await wrapper.findComponent({ name: 'CanvasDisplayMenu' }).vm.$emit('toggle', 'labels', false);

    expect(wrapper.emitted('toggle-display')).toEqual([['labels', false]]);

    const empty = mountCanvas({ pattern: { tabs: [], pieces: [] } as unknown as PatternDocument });
    expect(empty.find('[data-testid="no-tabs-empty"]').exists()).toBe(true);
    expect(empty.findComponent({ name: 'PatternCanvas' }).exists()).toBe(false);
  });
});
