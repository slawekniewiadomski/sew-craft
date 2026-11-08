<script setup lang="ts">
import type {
  Assembly,
  ConstraintType,
  EntityId,
  ParamInput,
  PatternDocument,
} from '@sewcraft/geometry';

import ConstraintPromptBar from '@/components/bars/ConstraintPromptBar.vue';
import CornerRoundPromptBar from '@/components/bars/CornerRoundPromptBar.vue';
import MeasuredEditBar from '@/components/bars/MeasuredEditBar.vue';
import SeamPromptBar from '@/components/bars/SeamPromptBar.vue';
import SketchToolbar from '@/components/bars/SketchToolbar.vue';
import EditorRibbon from '@/components/editor/EditorRibbon.vue';
import type { RibbonAction } from '@/lib/editor-ribbon';
import type { EditorTool } from '@/lib/editor-tools';
import type { SeamDraft } from '@/lib/seam-picks';

/** The ribbon and the strips above the canvas. */
defineProps<{
  mode: 'piece' | 'assembly';
  activeTool: EditorTool;
  activeConstraint: ConstraintType | null;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  canExport: boolean;
  exportHint: string | undefined;
  readOnly: boolean;
  sidebarCollapsed: boolean;
  pattern: PatternDocument;
  constraintPrompt: string;
  constraintRejection: string | null;
  constraintValueReady: boolean;
  constraintInitial: string;
  cornerRoundActive: boolean;
  cornerRoundPrompt: string;
  cornerRoundRejection: string | null;
  cornerRoundReady: boolean;
  cornerRoundInitial: string;
  cornerRoundMax: number | null;
  editingMeasuredName: string | null;
  measuredSources: { id: EntityId; label: string }[];
  measuredMessage: string | null;
  error: string | null;
  selectionStatus: string;
  isSketch: boolean;
  sketchTarget: EntityId | null;
  sketchArrange: boolean;
  activeAction?: RibbonAction | null;
  seamActive: boolean;
  seamDocument: PatternDocument;
  seamAssembly: Assembly | null;
  seamDraft: SeamDraft;
  seamEased: boolean;
}>();

const emit = defineEmits<{
  'select-tool': [tool: EditorTool];
  'select-constraint': [type: ConstraintType];
  action: [action: RibbonAction];
  'toggle-sidebar': [];
  'apply-constraint': [value: ParamInput];
  'cancel-constraint': [];
  'apply-corner': [value: ParamInput];
  'cancel-corner': [];
  'preview-corner': [radius: number | null];
  'remove-measured': [id: EntityId];
  'done-measured': [];
  'cancel-measured': [];
  'update:sketchTarget': [id: EntityId];
  'update:sketchArrange': [on: boolean];
  'seam-new-side': [];
  'seam-flip': [];
  'seam-remove-pick': [instance: EntityId, edge: EntityId];
  'seam-eased': [value: boolean];
  'seam-commit': [];
  'seam-cancel': [];
  fit: [];
}>();

/** The seam bar reports both the picked instance and edge. */
function forwardSeamRemove(instance: EntityId, edge: EntityId): void {
  emit('seam-remove-pick', instance, edge);
}
</script>

<template>
  <EditorRibbon
    :mode="mode"
    :active-tool="activeTool"
    :active-constraint="activeConstraint"
    :can-undo="canUndo"
    :can-redo="canRedo"
    :can-delete="canDelete"
    :can-export="canExport"
    :export-hint="exportHint"
    :read-only="readOnly"
    :sidebar-collapsed="sidebarCollapsed"
    :active-action="activeAction"
    @select-tool="emit('select-tool', $event)"
    @select-constraint="emit('select-constraint', $event)"
    @action="emit('action', $event)"
    @toggle-sidebar="emit('toggle-sidebar')"
  />

  <ConstraintPromptBar
    v-if="activeConstraint"
    :type="activeConstraint"
    :prompt="constraintPrompt"
    :rejection="constraintRejection"
    :value-ready="constraintValueReady"
    :initial-value="constraintInitial"
    :document="pattern"
    @apply="emit('apply-constraint', $event)"
    @cancel="emit('cancel-constraint')"
  />

  <CornerRoundPromptBar
    v-if="cornerRoundActive"
    :prompt="cornerRoundPrompt"
    :rejection="cornerRoundRejection"
    :ready="cornerRoundReady"
    :initial-value="cornerRoundInitial"
    :max-radius="cornerRoundMax ?? 0"
    :document="pattern"
    @apply="emit('apply-corner', $event)"
    @cancel="emit('cancel-corner')"
    @preview="emit('preview-corner', $event)"
  />

  <MeasuredEditBar
    v-if="editingMeasuredName !== null"
    :name="editingMeasuredName"
    :sources="measuredSources"
    :message="measuredMessage"
    @remove="emit('remove-measured', $event)"
    @done="emit('done-measured')"
    @cancel="emit('cancel-measured')"
  />

  <SeamPromptBar
    v-if="seamActive && seamAssembly"
    :document="seamDocument"
    :assembly="seamAssembly"
    :draft="seamDraft"
    :eased="seamEased"
    :read-only="readOnly"
    @new-side="emit('seam-new-side')"
    @flip="emit('seam-flip')"
    @remove-pick="forwardSeamRemove"
    @update:eased="emit('seam-eased', $event)"
    @commit="emit('seam-commit')"
    @cancel="emit('seam-cancel')"
  />

  <p v-if="error" class="border-b px-3 py-1 text-sm text-destructive">{{ error }}</p>

  <p class="sr-only" aria-live="polite" data-testid="selection-status">
    {{ selectionStatus }}
  </p>

  <SketchToolbar
    v-if="isSketch"
    :pieces="pattern.pieces"
    :target="sketchTarget"
    :arrange="sketchArrange"
    :read-only="readOnly"
    @update:target="emit('update:sketchTarget', $event)"
    @update:arrange="emit('update:sketchArrange', $event)"
    @fit="emit('fit')"
  />
</template>
