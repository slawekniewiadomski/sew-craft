<script setup lang="ts">
import type {
  AllowanceKind,
  Assembly,
  BandTarget,
  Constraint,
  Entity,
  EntityId,
  ParamInput,
  PatternDocument,
  Piece,
} from '@sewcraft/geometry';

import AssemblyPanel from '@/components/panels/AssemblyPanel.vue';
import ConstraintsPanel from '@/components/panels/ConstraintsPanel.vue';
import DimensionsPanel from '@/components/panels/DimensionsPanel.vue';
import EntityPropertiesPanel from '@/components/panels/EntityPropertiesPanel.vue';
import PiecePanel from '@/components/panels/PiecePanel.vue';
import VariablesPanel from '@/components/panels/VariablesPanel.vue';
import EditorSidebar from '@/components/editor/EditorSidebar.vue';
import SelectionSummary from '@/components/editor/SelectionSummary.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarStat from '@/components/sidebar/SidebarStat.vue';
import type { BulkAllowanceEdit } from '@/lib/allowance-edit';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import type { DimensionPatch } from '@/lib/dimensions';
import type { EntityProperties } from '@/lib/entity-properties';
import type { PanelId } from '@/lib/editor-panels';
import type { PieceMarkRow, PieceSummary } from '@/lib/pieces';
import type { SelectionMode } from '@/lib/selection';
import type { VariableValueInput } from '@/lib/variables';

/** The sidebar and every panel it can show. */
defineProps<{
  width: number;
  collapsed: boolean;
  panelCounts: Partial<Record<PanelId, number>>;
  patternId: string;
  mode: 'piece' | 'assembly';
  readOnly: boolean;
  selectedDimensionIds: EntityId[];
  selectedEntityIds: EntityId[];
  selectedEntities: Entity[];
  deleteDisabled: boolean;
  deleteHint: string | undefined;
  measureLabel: string;
  measureDisabled: boolean;
  measureHint: string | undefined;
  selectedEntity: EntityProperties | null;
  pattern: PatternDocument;
  activePiece: Piece | null;
  activePieceSummary: PieceSummary | null;
  selectedAllowanceTargets: BandTarget[];
  defaultAllowance: AllowanceChoice;
  activePieceMarks: PieceMarkRow[];
  activeAssembly: Assembly | null;
  selectedInstanceId: EntityId | null;
  selectedIds: ReadonlySet<EntityId>;
  selectedDimensionIdSet: ReadonlySet<EntityId>;
  highlightedVariableSlug: string | null;
  editingMeasuredSlug: string | null;
  measuredChainAvailable: boolean;
  activeToolLabel: string;
  journalLength: number;
  cutEdgeCount: number;
  otherConstraints: Constraint[];
}>();

const emit = defineEmits<{
  'update:width': [width: number];
  'update:collapsed': [collapsed: boolean];
  'delete-selected': [];
  'measure-selection': [];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'remove-constraint': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'remove-corner-round': [id: EntityId];
  'set-circle-radius': [id: EntityId, radius: number];
  'update-piece': [
    id: EntityId,
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ];
  'set-piece-default': [
    piece: EntityId,
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
  ];
  'set-piece-allowance': [
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ];
  'set-all-allowances': [piece: EntityId, value: { kind: AllowanceKind; width: number } | null];
  'set-piece-corner-allowance': [
    piece: EntityId,
    round: EntityId,
    value: { cutWidth: number } | null,
  ];
  'apply-allowances': [edit: BulkAllowanceEdit];
  'remove-piece': [id: EntityId];
  'set-role': [id: EntityId, role: 'cut' | 'construction' | 'annotation'];
  'update-text': [id: EntityId, patch: Record<string, unknown>];
  'set-cut-loop': [piece: EntityId];
  'clear-cut-loop': [piece: EntityId];
  'delete-mark': [id: EntityId];
  'set-notch-depth': [id: EntityId, depth: number | null];
  'update-assembly': [name: string];
  'update-instance': [patch: { x?: number; y?: number; rotation?: number; mirrored?: boolean }];
  'open-piece': [piece: EntityId];
  'remove-instance': [id: EntityId];
  'select-dimension': [id: EntityId, mode: SelectionMode];
  'create-variable': [];
  'rename-variable': [slug: string, name: string];
  'set-variable-value': [slug: string, value: VariableValueInput];
  'set-variable-unit': [slug: string, unit: 'mm' | 'cm'];
  'set-variable-comment': [slug: string, comment: string | null];
  'remove-variable': [slug: string];
  'create-measured': [];
  'highlight-variable': [slug: string | null];
  'edit-measured': [slug: string];
}>();

interface PiecePatch {
  name?: string | null;
  quantity?: number | null;
  notes?: string | null;
  fabric?: string | null;
  color?: string | null;
}

type PieceDefault =
  | { mode: 'inherit' }
  | { mode: 'none' }
  | { mode: 'preset'; width: ParamInput; kind: AllowanceKind };

type AllowanceValue = { kind: AllowanceKind; width: number } | null;

function emitUpdateDimension(id: EntityId, patch: DimensionPatch): void {
  emit('update-dimension', id, patch);
}
function emitCornerRadius(id: EntityId, radius: ParamInput): void {
  emit('set-corner-round-radius', id, radius);
}
function emitCircleRadius(id: EntityId, radius: number): void {
  emit('set-circle-radius', id, radius);
}
function emitUpdatePiece(id: EntityId, patch: PiecePatch): void {
  emit('update-piece', id, patch);
}
function emitPieceDefault(piece: EntityId, value: PieceDefault): void {
  emit('set-piece-default', piece, value);
}
function emitPieceAllowance(piece: EntityId, edge: EntityId, value: AllowanceValue): void {
  emit('set-piece-allowance', piece, edge, value);
}
function emitAllAllowances(piece: EntityId, value: AllowanceValue): void {
  emit('set-all-allowances', piece, value);
}
function emitCornerAllowance(
  piece: EntityId,
  round: EntityId,
  value: { cutWidth: number } | null,
): void {
  emit('set-piece-corner-allowance', piece, round, value);
}
function emitSetRole(id: EntityId, role: 'cut' | 'construction' | 'annotation'): void {
  emit('set-role', id, role);
}
function emitUpdateText(id: EntityId, patch: Record<string, unknown>): void {
  emit('update-text', id, patch);
}
function emitNotchDepth(id: EntityId, depth: number | null): void {
  emit('set-notch-depth', id, depth);
}
function emitDimensionSelect(id: EntityId, mode: SelectionMode): void {
  emit('select-dimension', id, mode);
}
function emitRenameVariable(slug: string, name: string): void {
  emit('rename-variable', slug, name);
}
function emitVariableValue(slug: string, value: VariableValueInput): void {
  emit('set-variable-value', slug, value);
}
function emitVariableUnit(slug: string, unit: 'mm' | 'cm'): void {
  emit('set-variable-unit', slug, unit);
}
function emitVariableComment(slug: string, comment: string | null): void {
  emit('set-variable-comment', slug, comment);
}
</script>

<template>
  <EditorSidebar
    :width="width"
    :collapsed="collapsed"
    :counts="panelCounts"
    :pattern-id="patternId"
    :mode="mode"
    :read-only="readOnly"
    @update:width="emit('update:width', $event)"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #properties>
      <SelectionSummary
        v-if="selectedDimensionIds.length > 0 || selectedEntityIds.length > 1"
        :entities="selectedEntities"
        :dimensions="selectedDimensionIds.length"
        :delete-disabled="deleteDisabled"
        :delete-hint="deleteHint"
        :measure-label="measureLabel"
        :measure-disabled="measureDisabled"
        :measure-hint="measureHint"
        @delete="emit('delete-selected')"
        @measure="emit('measure-selection')"
      />

      <EntityPropertiesPanel
        v-else-if="selectedEntity"
        :document="pattern"
        :entity="selectedEntity"
        @update-dimension="emitUpdateDimension"
        @remove-constraint="emit('remove-constraint', $event)"
        @set-corner-round-radius="emitCornerRadius"
        @remove-corner-round="emit('remove-corner-round', $event)"
        @set-circle-radius="emitCircleRadius"
        @update-piece="emitUpdatePiece"
        @set-piece-default="emitPieceDefault"
        @set-piece-allowance="emitPieceAllowance"
        @set-all-allowances="emitAllAllowances"
        @set-piece-corner-allowance="emitCornerAllowance"
        @apply-allowances="emit('apply-allowances', $event)"
        @remove-piece="emit('remove-piece', $event)"
        @set-role="emitSetRole"
        @update-text="emitUpdateText"
      />

      <SidebarEmpty
        v-else
        icon="select"
        message="Nothing selected"
        hint="Select a point, line, curve, arc, circle or dimension on the canvas or in a drawer."
        data-testid="properties-empty"
      />
    </template>

    <template #stats>
      <SidebarStat data-testid="workspace-summary">
        <span data-testid="active-tool">{{ activeToolLabel }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ journalLength }} command(s)</span>
        <span aria-hidden="true">·</span>
        <span>{{ cutEdgeCount }} cut edge(s)</span>
      </SidebarStat>
    </template>

    <template #pieces>
      <PiecePanel
        v-if="activePiece && activePieceSummary"
        :summary="activePieceSummary"
        :piece="activePiece"
        :document="pattern"
        :selected-targets="selectedAllowanceTargets"
        :default-allowance="defaultAllowance"
        :inherited-default="defaultAllowance"
        :label="activePiece.name ?? 'Piece'"
        prefix="piece-drawer"
        :marks="activePieceMarks"
        @update-piece="emitUpdatePiece"
        @set-piece-default="emitPieceDefault"
        @set-piece-allowance="emitPieceAllowance"
        @set-all-allowances="emitAllAllowances"
        @set-piece-corner-allowance="emitCornerAllowance"
        @apply-allowances="emit('apply-allowances', $event)"
        @remove-piece="emit('remove-piece', $event)"
        @set-cut-loop="emit('set-cut-loop', $event)"
        @clear-cut-loop="emit('clear-cut-loop', $event)"
        @delete-mark="emit('delete-mark', $event)"
        @set-notch-depth="emitNotchDepth"
      />
      <SidebarEmpty
        v-else
        icon="piece"
        message="No piece tab is active"
        hint="Use the + menu to create a piece."
        data-testid="pieces-empty"
      />
    </template>

    <template #assembly>
      <AssemblyPanel
        :document="pattern"
        :assembly="activeAssembly!"
        :selected-instance-id="selectedInstanceId"
        :read-only="readOnly"
        @update-assembly="emit('update-assembly', $event)"
        @update-instance="emit('update-instance', $event)"
        @update-piece="emitUpdatePiece"
        @set-default="emitPieceDefault"
        @open-piece="emit('open-piece', $event)"
        @remove-instance="emit('remove-instance', $event)"
      />
    </template>

    <template #dimensions>
      <DimensionsPanel
        :document="pattern"
        :selected-ids="selectedDimensionIdSet"
        @select="emitDimensionSelect"
        @update="emitUpdateDimension"
        @remove="emit('remove-constraint', $event)"
      />
    </template>

    <template #variables>
      <VariablesPanel
        :document="pattern"
        :read-only="readOnly"
        @create="emit('create-variable')"
        @rename="emitRenameVariable"
        @set-value="emitVariableValue"
        @set-unit="emitVariableUnit"
        @set-comment="emitVariableComment"
        @remove="emit('remove-variable', $event)"
        :can-measure="measuredChainAvailable"
        :active-slug="highlightedVariableSlug"
        :editing-slug="editingMeasuredSlug"
        :compact="width < 420"
        @create-measured="emit('create-measured')"
        @highlight="emit('highlight-variable', $event)"
        @edit-measured="emit('edit-measured', $event)"
      />
    </template>

    <template #constraints>
      <ConstraintsPanel
        :constraints="otherConstraints"
        @remove="emit('remove-constraint', $event)"
      />
    </template>
  </EditorSidebar>
</template>
