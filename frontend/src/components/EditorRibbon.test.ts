import { describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import type { EditorTool } from '@/lib/editor-tools';

import EditorRibbon from './EditorRibbon.vue';

function mountRibbon(
  overrides: Partial<{
    activeTool: EditorTool;
    activeConstraint: 'horizontal' | null;
    canUndo: boolean;
    canRedo: boolean;
    canDelete: boolean;
    readOnly: boolean;
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
  'New piece',
  'Set cut loop',
  'Undo',
  'Redo',
  'Delete',
  'Fit',
  'Round corner',
  'Text',
  'Point',
  'Line',
  'Curve',
  'Arc',
  'Circle',
  'Rectangle',
  'Rectangle modes',
  'Dimension',
  'Cut dimension',
  'Coincident',
  'Horizontal',
  'Vertical',
  'Point on line',
  'Distance',
  'Angle',
  'Equal length',
  'Download SVG',
];

/**
 * The caret names itself with a native `title` instead of the ribbon tooltip:
 * wrapping the menu trigger in a TooltipTrigger breaks the menu's anchor.
 */
const RIBBON_TOOLTIPS = RIBBON_LABELS.filter((label) => label !== 'Rectangle modes');

describe('EditorRibbon', () => {
  it('renders every control as an icon button with an accessible name', () => {
    const wrapper = mountRibbon();

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(26);
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

    const captions = wrapper.findAll('[data-testid$="-label"]');
    expect(captions.map((caption) => caption.text())).toEqual([
      'Tools',
      'Features',
      'Annotation',
      'Sketching',
      'Constraints',
      'Export',
    ]);
    expect(captions[0]!.classes()).toEqual(expect.arrayContaining(['uppercase', 'text-[10px]']));

    const groups = wrapper.findAll('[role="group"]');
    expect(groups.map((group) => group.attributes('aria-label'))).toEqual([
      'Tools',
      'Features',
      'Annotation',
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
      RIBBON_TOOLTIPS,
    );
  });

  it('explains a refused Create piece in its tooltip', () => {
    const wrapper = mount(EditorRibbon, {
      props: {
        activeTool: 'select',
        activeConstraint: null,
        canUndo: false,
        canRedo: false,
        canDelete: false,
        canCreatePiece: false,
        createPieceHint: 'Clear the dimension selection: Create piece applies to entities only.',
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

    const createPiece = wrapper.findAll('.ribbon-tooltip')[1]!.text();
    expect(createPiece).toBe(
      'Clear the dimension selection: Create piece applies to entities only.',
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

  it('forwards a mode picked from the rectangle menu', async () => {
    const wrapper = mountRibbon();

    await wrapper.find('[data-testid="tool-rectangle-modes"]').trigger('click');
    await flushPromises();

    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items).toHaveLength(3);
    items[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted('select-tool')).toEqual([['add_3point_rectangle']]);

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('treats the rectangle group as active while a member is the tool and no constraint is armed', () => {
    const active = mountRibbon({ activeTool: 'add_center_rectangle' });

    expect(active.find('[data-testid="tool-rectangle"]').classes()).toContain('bg-primary');
    expect(active.find('[data-testid="tool-rectangle"]').attributes('aria-pressed')).toBe('true');
    expect(active.find('[data-testid="tool-rectangle"]').attributes('data-mode')).toBe(
      'add_center_rectangle',
    );

    const constrained = mountRibbon({
      activeTool: 'add_center_rectangle',
      activeConstraint: 'horizontal',
    });

    expect(constrained.find('[data-testid="tool-rectangle"]').classes()).not.toContain(
      'bg-primary',
    );
    expect(
      constrained.find('[data-testid="tool-rectangle"]').attributes('aria-pressed'),
    ).toBeUndefined();
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

  it('disables mutations but keeps fit and export in read-only mode', () => {
    const wrapper = mountRibbon({ readOnly: true, canUndo: true, canRedo: true });

    expect(wrapper.find('[data-testid="tool-add_point"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="tool-rectangle"]').attributes('disabled')).toBeDefined();
    expect(
      wrapper.find('[data-testid="tool-rectangle-modes"]').attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[data-testid="undo"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="delete"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="fit"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeUndefined();
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
