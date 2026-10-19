import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

import EditorRibbon from './EditorRibbon.vue';

function mountRibbon(
  overrides: Partial<{
    activeTool: 'select' | 'add_point' | 'add_line' | 'add_curve';
    activeConstraint: 'horizontal' | null;
    canUndo: boolean;
    canRedo: boolean;
    canDelete: boolean;
  }> = {},
): VueWrapper {
  return mount(EditorRibbon, {
    props: {
      activeTool: 'select',
      activeConstraint: null,
      canUndo: false,
      canRedo: false,
      canDelete: false,
      ...overrides,
    },
  });
}

const RIBBON_LABELS = [
  'Select',
  'Undo',
  'Redo',
  'Delete',
  'Fit',
  'Point',
  'Line',
  'Curve',
  'Coincident',
  'Horizontal',
  'Vertical',
  'Point on line',
  'Distance',
  'Angle',
  'Equal length',
  'Download SVG',
];

describe('EditorRibbon', () => {
  it('renders every control as an icon button with an accessible name', () => {
    const wrapper = mountRibbon();

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(16);
    expect(buttons.every((button) => button.find('svg').exists())).toBe(true);
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(RIBBON_LABELS);

    expect(wrapper.find('[data-testid="editor-ribbon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tool-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="constraint-horizontal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="constraint-equal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="undo"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="download-svg"]').exists()).toBe(true);
  });

  it('labels each named group with a small uppercase caption', () => {
    const wrapper = mountRibbon();

    const captions = wrapper.findAll('[data-testid="ribbon-group-label"]');
    expect(captions.map((caption) => caption.text())).toEqual([
      'Tools',
      'Sketching',
      'Constraints',
      'Export',
    ]);
    expect(captions[0]!.classes()).toEqual(expect.arrayContaining(['uppercase', 'text-[10px]']));

    const groups = wrapper.findAll('[role="group"]');
    expect(groups.map((group) => group.attributes('aria-label'))).toEqual([
      'Tools',
      'Sketching',
      'Constraints',
      'Export',
    ]);
  });

  it('shows the control label in a tooltip', () => {
    const wrapper = mount(EditorRibbon, {
      props: {
        activeTool: 'select',
        activeConstraint: null,
        canUndo: false,
        canRedo: false,
        canDelete: false,
      },
      global: {
        stubs: {
          TooltipProvider: { template: '<div><slot /></div>' },
          Tooltip: { template: '<div><slot /></div>' },
          TooltipTrigger: { template: '<div><slot /></div>' },
          TooltipContent: { template: '<span class="ribbon-tooltip"><slot /></span>' },
        },
      },
    });

    expect(wrapper.findAll('.ribbon-tooltip').map((tooltip) => tooltip.text())).toEqual(
      RIBBON_LABELS,
    );
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

  it('marks the active constraint pressed and emits select-constraint on click', async () => {
    const wrapper = mountRibbon({ activeConstraint: 'horizontal' });

    expect(wrapper.find('[data-testid="constraint-horizontal"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.find('[data-testid="constraint-horizontal"]').classes()).toContain('bg-primary');
    expect(wrapper.find('[data-testid="tool-select"]').attributes('aria-pressed')).toBeUndefined();
    expect(
      wrapper.find('[data-testid="constraint-vertical"]').attributes('aria-pressed'),
    ).toBeUndefined();

    await wrapper.find('[data-testid="constraint-vertical"]').trigger('click');

    expect(wrapper.emitted('select-constraint')).toEqual([['vertical']]);
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
