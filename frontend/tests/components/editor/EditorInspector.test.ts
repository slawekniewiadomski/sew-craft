import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import type { Assembly, PatternDocument, Piece } from '@sewcraft/geometry';

import EditorInspector from '@/components/editor/EditorInspector.vue';
import type { EntityProperties } from '@/lib/entity-properties';
import type { PieceSummary } from '@/lib/pieces';

const pattern = { pieces: [], assemblies: [], tabs: [] } as unknown as PatternDocument;
const piece = { id: 'p1', name: 'Front' } as unknown as Piece;
const summary = { id: 'p1', name: 'Front' } as unknown as PieceSummary;
const entity = { id: 'e1', kind: 'line' } as unknown as EntityProperties;
const assembly = { id: 'a1' } as unknown as Assembly;

const stub = (name: string) => defineComponent({ name, template: '<div />' });

const SidebarStub = defineComponent({
  name: 'EditorSidebar',
  template: `<div>
    <slot name="properties" />
    <slot name="stats" />
    <slot name="pieces" />
    <slot name="assembly" />
    <slot name="outline" />
    <slot name="dimensions" />
    <slot name="variables" />
    <slot name="constraints" />
  </div>`,
});

function mountInspector(overrides: Record<string, unknown> = {}) {
  return mount(EditorInspector, {
    props: {
      width: 320,
      collapsed: false,
      panelCounts: {},
      patternId: '1',
      mode: 'piece',
      readOnly: false,
      selectedDimensionIds: [],
      selectedEntityIds: ['e1'],
      selectedEntities: [],
      deleteDisabled: false,
      deleteHint: undefined,
      measureLabel: 'Add as measured variable',
      measureDisabled: true,
      measureHint: undefined,
      selectedEntity: entity,
      pattern,
      activePiece: piece,
      activePieceSummary: summary,
      selectedAllowanceTargets: [],
      defaultAllowance: { kind: 'none', width: 0 },
      activePieceMarks: [],
      activeAssembly: assembly,
      selectedInstanceId: null,
      edges: [],
      selectedIds: new Set<string>(),
      selectedDimensionIdSet: new Set<string>(),
      highlightedVariableSlug: null,
      editingMeasuredSlug: null,
      measuredChainAvailable: false,
      activeToolLabel: 'Select',
      journalLength: 0,
      cutEdgeCount: 0,
      otherConstraints: [],
      ...overrides,
    },
    global: {
      stubs: {
        EditorSidebar: SidebarStub,
        SelectionSummary: stub('SelectionSummary'),
        EntityPropertiesPanel: stub('EntityPropertiesPanel'),
        PiecePanel: stub('PiecePanel'),
        AssemblyPanel: stub('AssemblyPanel'),
        OutlinePanel: stub('OutlinePanel'),
        DimensionsPanel: stub('DimensionsPanel'),
        VariablesPanel: stub('VariablesPanel'),
        ConstraintsPanel: stub('ConstraintsPanel'),
        SidebarEmpty: stub('SidebarEmpty'),
        SidebarStat: stub('SidebarStat'),
      },
    },
  });
}

describe('EditorInspector', () => {
  it('forwards the sidebar size and panel actions', async () => {
    const wrapper = mountInspector();
    const sidebar = wrapper.findComponent({ name: 'EditorSidebar' });
    await sidebar.vm.$emit('update:width', 360);
    await sidebar.vm.$emit('update:collapsed', true);

    expect(wrapper.emitted('update:width')).toEqual([[360]]);
    expect(wrapper.emitted('update:collapsed')).toEqual([[true]]);
  });

  it('forwards the bulk allowance edit and the cut loop', async () => {
    const wrapper = mountInspector();
    const edit = { width: 10, kind: 'seam' };

    await wrapper
      .findComponent({ name: 'EntityPropertiesPanel' })
      .vm.$emit('apply-allowances', edit);
    await wrapper.findComponent({ name: 'PiecePanel' }).vm.$emit('set-cut-loop', 'p1');

    expect(wrapper.emitted('apply-allowances')).toEqual([[edit]]);
    expect(wrapper.emitted('set-cut-loop')).toEqual([['p1']]);
  });

  it('forwards a selected-row action and a dimension edit', async () => {
    const wrapper = mountInspector();

    await wrapper
      .findComponent({ name: 'EntityPropertiesPanel' })
      .vm.$emit('update-dimension', 'd1', { offset: 2 });
    await wrapper.findComponent({ name: 'OutlinePanel' }).vm.$emit('convert', 'e2', true);

    expect(wrapper.emitted('update-dimension')).toEqual([['d1', { offset: 2 }]]);
    expect(wrapper.emitted('convert')).toEqual([['e2', true]]);
  });
});
