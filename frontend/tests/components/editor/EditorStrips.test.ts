import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import type { PatternDocument } from '@sewcraft/geometry';

import EditorStrips from '@/components/editor/EditorStrips.vue';

const pattern = { pieces: [], tabs: [] } as unknown as PatternDocument;

const stub = (name: string) => defineComponent({ name, template: '<div />' });

function mountStrips(overrides: Record<string, unknown> = {}) {
  return mount(EditorStrips, {
    props: {
      mode: 'piece',
      activeTool: 'select',
      activeConstraint: 'distance',
      canUndo: false,
      canRedo: false,
      canDelete: false,
      canExport: false,
      exportHint: undefined,
      readOnly: false,
      sidebarCollapsed: false,
      pattern,
      constraintPrompt: 'Pick a line.',
      constraintRejection: null,
      constraintValueReady: false,
      constraintInitial: '',
      cornerRoundActive: true,
      cornerRoundPrompt: 'Pick two lines.',
      cornerRoundRejection: null,
      cornerRoundReady: false,
      cornerRoundInitial: '',
      cornerRoundMax: null,
      editingMeasuredName: 'Measured 1',
      measuredSources: [{ id: 'e1', label: 'Edge 1' }],
      measuredMessage: null,
      error: null,
      selectionStatus: 'Nothing selected',
      isSketch: true,
      sketchTarget: null,
      sketchArrange: false,
      ...overrides,
    },
    global: {
      stubs: {
        EditorRibbon: stub('EditorRibbon'),
        ConstraintPromptBar: stub('ConstraintPromptBar'),
        CornerRoundPromptBar: stub('CornerRoundPromptBar'),
        MeasuredEditBar: stub('MeasuredEditBar'),
        SketchToolbar: stub('SketchToolbar'),
      },
    },
  });
}

describe('EditorStrips', () => {
  it('forwards the ribbon and constraint actions', async () => {
    const wrapper = mountStrips();

    const ribbon = wrapper.findComponent({ name: 'EditorRibbon' });
    await ribbon.vm.$emit('select-tool', 'line');
    await ribbon.vm.$emit('select-constraint', 'distance');
    await ribbon.vm.$emit('action', { type: 'undo' });
    await ribbon.vm.$emit('toggle-sidebar');

    const constraint = wrapper.findComponent({ name: 'ConstraintPromptBar' });
    await constraint.vm.$emit('apply', 12);
    await constraint.vm.$emit('cancel');

    expect(wrapper.emitted('select-tool')).toEqual([['line']]);
    expect(wrapper.emitted('select-constraint')).toEqual([['distance']]);
    expect(wrapper.emitted('action')).toEqual([[{ type: 'undo' }]]);
    expect(wrapper.emitted('toggle-sidebar')).toEqual([[]]);
    expect(wrapper.emitted('apply-constraint')).toEqual([[12]]);
    expect(wrapper.emitted('cancel-constraint')).toEqual([[]]);
  });

  it('forwards the corner-round and measured actions', async () => {
    const wrapper = mountStrips();

    const corner = wrapper.findComponent({ name: 'CornerRoundPromptBar' });
    await corner.vm.$emit('apply', 4);
    await corner.vm.$emit('cancel');
    await corner.vm.$emit('preview', 4);

    const measured = wrapper.findComponent({ name: 'MeasuredEditBar' });
    await measured.vm.$emit('remove', 'e1');
    await measured.vm.$emit('done');
    await measured.vm.$emit('cancel');

    expect(wrapper.emitted('apply-corner')).toEqual([[4]]);
    expect(wrapper.emitted('cancel-corner')).toEqual([[]]);
    expect(wrapper.emitted('preview-corner')).toEqual([[4]]);
    expect(wrapper.emitted('remove-measured')).toEqual([['e1']]);
    expect(wrapper.emitted('done-measured')).toEqual([[]]);
    expect(wrapper.emitted('cancel-measured')).toEqual([[]]);
  });

  it('forwards the sketch toolbar actions', async () => {
    const wrapper = mountStrips();

    const sketch = wrapper.findComponent({ name: 'SketchToolbar' });
    await sketch.vm.$emit('update:target', 'p1');
    await sketch.vm.$emit('update:arrange', true);
    await sketch.vm.$emit('fit');

    expect(wrapper.emitted('update:sketchTarget')).toEqual([['p1']]);
    expect(wrapper.emitted('update:sketchArrange')).toEqual([[true]]);
    expect(wrapper.emitted('fit')).toEqual([[]]);
  });

  it('hides the conditional strips when their state is absent', () => {
    const wrapper = mountStrips({
      activeConstraint: null,
      cornerRoundActive: false,
      editingMeasuredName: null,
      isSketch: false,
    });

    expect(wrapper.findComponent({ name: 'ConstraintPromptBar' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'CornerRoundPromptBar' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'MeasuredEditBar' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'SketchToolbar' }).exists()).toBe(false);
  });
});
