import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

import EditorRibbon from './EditorRibbon.vue';

function mountRibbon(
  overrides: Partial<{
    activeTool: 'select' | 'add_point' | 'add_line' | 'add_curve';
    canUndo: boolean;
    canRedo: boolean;
    canDelete: boolean;
  }> = {},
): VueWrapper {
  return mount(EditorRibbon, {
    props: {
      activeTool: 'select',
      canUndo: false,
      canRedo: false,
      canDelete: false,
      ...overrides,
    },
  });
}

describe('EditorRibbon', () => {
  it('renders every tool and action as a button', () => {
    const wrapper = mountRibbon();

    expect(wrapper.findAll('button')).toHaveLength(9);
    expect(wrapper.find('[data-testid="editor-ribbon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tool-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="undo"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="download-svg"]').exists()).toBe(true);
  });

  it('styles the active tool distinctly and outlines action buttons', () => {
    const wrapper = mountRibbon({ activeTool: 'add_line' });

    expect(wrapper.find('[data-testid="tool-add_line"]').classes()).toContain('bg-primary');
    expect(wrapper.find('[data-testid="tool-select"]').classes()).not.toContain('bg-primary');
    expect(wrapper.find('[data-testid="undo"]').classes()).toContain('border-input');
  });

  it('marks the active tool pressed and emits select-tool on click', async () => {
    const wrapper = mountRibbon({ activeTool: 'add_line' });

    expect(wrapper.find('[data-testid="tool-add_line"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="tool-select"]').attributes('aria-pressed')).toBeUndefined();

    await wrapper.find('[data-testid="tool-add_point"]').trigger('click');

    expect(wrapper.emitted('select-tool')).toEqual([['add_point']]);
  });

  it('disables undo, redo and delete without history or a selection', () => {
    const wrapper = mountRibbon();

    expect(wrapper.find('[data-testid="undo"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="redo"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="fit"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeUndefined();
  });

  it('enables undo, redo and delete when allowed and emits their actions', async () => {
    const wrapper = mountRibbon({ canUndo: true, canRedo: true, canDelete: true });

    expect(wrapper.find('[data-testid="undo"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="redo"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('[data-testid="undo"]').trigger('click');
    await wrapper.find('[data-testid="redo"]').trigger('click');
    await wrapper.find('[data-testid="delete"]').trigger('click');
    await wrapper.find('[data-testid="fit"]').trigger('click');
    await wrapper.find('[data-testid="download-svg"]').trigger('click');

    expect(wrapper.emitted('action')).toEqual([
      ['undo'],
      ['redo'],
      ['delete'],
      ['fit'],
      ['download_svg'],
    ]);
  });
});
