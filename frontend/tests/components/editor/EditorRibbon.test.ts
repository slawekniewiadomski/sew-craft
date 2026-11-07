import { describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

import type { EditorTool } from '@/lib/editor-tools';

import EditorRibbon from '@/components/editor/EditorRibbon.vue';

function mountRibbon(
  overrides: Partial<{
    activeTool: EditorTool;
    activeConstraint: 'horizontal' | null;
    canUndo: boolean;
    canRedo: boolean;
    canDelete: boolean;
    readOnly: boolean;
    mode: 'piece' | 'assembly';
    canExport: boolean;
    exportHint: string;
    sidebarCollapsed: boolean;
    activeAction: 'sew' | null;
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

/** Mount with the tooltip parts stubbed so portal content is inspectable. */
function mountRibbonWithTooltips(
  overrides: Partial<{
    sidebarCollapsed: boolean;
    mode: 'piece' | 'assembly';
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
    global: {
      stubs: {
        TooltipProvider: { template: '<div><slot /></div>' },
        Tooltip: { template: '<div><slot /></div>' },
        TooltipTrigger: { template: '<div><slot /></div>' },
        TooltipContent: { template: '<span class="ribbon-tooltip"><slot /></span>' },
      },
    },
  });
}

const RIBBON_LABELS = [
  'Select',
  'Set cut loop',
  'Undo',
  'Redo',
  'Delete',
  'Fit',
  'Round corner',
  'Split',
  'Notch',
  'Centre line',
  'Text',
  'Text modes',
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
  'Midpoint',
  'Download SVG',
];

/**
 * The caret names itself with a native `title` instead of the ribbon tooltip:
 * wrapping the menu trigger in a TooltipTrigger breaks the menu's anchor.
 */
const RIBBON_TOOLTIPS = RIBBON_LABELS.filter(
  (label) => label !== 'Rectangle modes' && label !== 'Text modes',
);

describe('EditorRibbon', () => {
  it('renders an action pressed only when it is the active action', () => {
    const wrapper = mountRibbon({ mode: 'assembly', activeAction: 'sew' });

    const sew = wrapper.find('[data-testid="sew"]');
    expect(sew.attributes('aria-pressed')).toBe('true');
    expect(sew.classes()).toContain('bg-primary');
    expect(wrapper.find('[data-testid="add-instance"]').attributes('aria-pressed')).toBeUndefined();
  });

  it('renders every control as an icon button with an accessible name', () => {
    const wrapper = mountRibbon();

    const buttons = wrapper.findAll('[role="toolbar"] button');
    expect(buttons).toHaveLength(30);
    expect(buttons.every((button) => button.find('svg').exists())).toBe(true);
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(RIBBON_LABELS);
    expect(wrapper.findAll('button').every((button) => button.find('svg').exists())).toBe(true);

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

    const tooltips = wrapper.findAll('.ribbon-tooltip').map((tooltip) => tooltip.text());
    // The sidebar toggle sits outside the toolbar, so its own tip comes last.
    expect(tooltips).toEqual([...RIBBON_TOOLTIPS, 'Collapse sidebar']);
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

  it('shows the assembly ribbon with an export hint', async () => {
    const wrapper = mount(EditorRibbon, {
      props: {
        mode: 'assembly',
        activeTool: 'select',
        canUndo: false,
        canRedo: false,
        canDelete: false,
        canExport: false,
        exportHint: 'Switch to a piece to export',
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

    expect(wrapper.find('[data-testid="add-instance"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tool-add_line"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="download-svg"]').attributes('disabled')).toBeDefined();
    expect(
      wrapper
        .findAll('.ribbon-tooltip')
        .some((tooltip) => tooltip.text() === 'Switch to a piece to export'),
    ).toBe(true);
  });
});

describe('EditorRibbon sidebar toggle', () => {
  it('puts one collapse control outside the toolbar at the right of the ribbon', () => {
    const wrapper = mountRibbon();

    const toolbars = wrapper.findAll('[role="toolbar"]');
    expect(toolbars).toHaveLength(1);
    expect(toolbars[0]!.find('[data-testid="sidebar-toggle"]').exists()).toBe(false);

    const toggle = wrapper.find('[data-testid="sidebar-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.attributes('aria-label')).toBe('Collapse sidebar');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-controls')).toBe('sidebar');
    expect(toggle.classes()).toEqual(expect.arrayContaining(['h-9', 'w-9']));
    expect(toggle.find('svg').classes()).toContain('-rotate-90');
    expect(wrapper.findAll('[data-testid="sidebar-toggle"]')).toHaveLength(1);
  });

  it('lets the toolbar shrink so the toggle stays inside the ribbon', () => {
    const wrapper = mountRibbon();
    const ribbon = wrapper.find('[data-testid="editor-ribbon"]');
    const toolbar = wrapper.find('[role="toolbar"]');

    // Without min-w-0 the wrapping toolbar keeps its min-content width and
    // pushes the only collapse control off-screen at 375 px.
    expect(toolbar.classes()).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'flex-wrap']));
    expect(toolbar.classes()).toContain('items-start');
    expect(ribbon.classes()).toContain('items-start');

    const toggle = wrapper.find('[data-testid="sidebar-toggle"]');
    expect(toggle.element.parentElement?.className).toContain('self-center');
  });

  it('mirrors a collapsed sidebar and emits the toggle request', async () => {
    const wrapper = mountRibbonWithTooltips({ sidebarCollapsed: true });

    const toggle = wrapper.find('[data-testid="sidebar-toggle"]');
    expect(toggle.attributes('aria-label')).toBe('Expand sidebar');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.find('svg').classes()).toContain('rotate-90');
    expect(wrapper.findAll('.ribbon-tooltip').at(-1)!.text()).toBe('Expand sidebar');

    await toggle.trigger('click');
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1);
  });

  it('keeps the toggle in both ribbon modes and for a read-only document', () => {
    for (const overrides of [{ mode: 'assembly' as const }, { readOnly: true }]) {
      const wrapper = mountRibbon(overrides);
      const toggle = wrapper.find('[data-testid="sidebar-toggle"]');
      expect(toggle.exists()).toBe(true);
      expect(toggle.attributes('disabled')).toBeUndefined();
    }
  });
});
