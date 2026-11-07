<script setup lang="ts">
import type {
  Assembly,
  BandTarget,
  ConstraintType,
  EntityId,
  ParamInput,
  PatternDocument,
} from '@sewcraft/geometry';

import AssemblyCanvas from '@/components/canvas/AssemblyCanvas.vue';
import PatternCanvas from '@/components/canvas/PatternCanvas.vue';
import CanvasDisplayMenu from '@/components/editor/CanvasDisplayMenu.vue';
import type { ArcEndpoint } from '@/lib/arc-tool';
import type { CircleEndpoint } from '@/lib/circle-tool';
import type { ConstraintPick } from '@/lib/constraint-tools';
import type { CornerRoundPicks } from '@/lib/corner-round';
import type { CutDimensionPlacement, DimensionPatch, DimensionPlacement } from '@/lib/dimensions';
import type { CanvasDisplayItem, DisplaySettings } from '@/lib/display-settings';
import type { DraftingEndpoint } from '@/lib/drafting';
import type { EditorTool } from '@/lib/editor-tools';
import type { LineEndpoint } from '@/lib/line-tool';
import type { RectangleMode } from '@/lib/rectangle-tool';

/** The canvas area and the display menu over it. */
defineProps<{
  pattern: PatternDocument;
  visibleDocument: PatternDocument;
  assemblyDocument: PatternDocument;
  activeAssembly: Assembly | null;
  isAssemblyTab: boolean;
  isSketch: boolean;
  activeTool: EditorTool;
  activePieceId: EntityId | null;
  readOnly: boolean;
  selectedEntityIds: EntityId[];
  selectedDimensionIds: EntityId[];
  selectedAllowanceTargets: BandTarget[];
  selectedInstanceId: EntityId | null;
  assemblyPickerOpen: boolean;
  fitToken: number;
  sketchArrange: boolean;
  display: DisplaySettings;
  displayItems: CanvasDisplayItem[];
  displayValues: Record<string, boolean>;
  activeConstraint: ConstraintType | null;
  constraintPicks: ConstraintPick[];
  cornerRoundActive: boolean;
  cornerRoundPicks: CornerRoundPicks;
  cornerRoundPreviewRadius: number | null;
  measuredEditing: boolean;
  measuredHighlightIds: EntityId[];
}>();

const emit = defineEmits<{
  'update:selectedEntityIds': [ids: EntityId[]];
  'update:selectedDimensionIds': [ids: EntityId[]];
  'update:selectedAllowanceTargets': [targets: BandTarget[]];
  'toggle-display': [key: string, value: boolean];
  'select-instance': [id: EntityId | null];
  'move-instance': [id: EntityId, x: number, y: number];
  'nudge-instance': [id: EntityId, dx: number, dy: number];
  'remove-instance': [id: EntityId];
  'add-instance': [piece: EntityId];
  'close-picker': [];
  'move-piece': [dx: number, dy: number];
  'activate-piece': [id: EntityId];
  'cross-piece': [id: EntityId];
  'move-point': [id: EntityId, x: number, y: number];
  'add-text': [anchor: DraftingEndpoint, leader?: DraftingEndpoint];
  'add-notch': [point: EntityId, edge: EntityId];
  'add-centre-line': [start: EntityId, end: EntityId];
  'add-point': [x: number, y: number];
  'add-point-on-line': [lineId: EntityId, x: number, y: number];
  'add-point-midpoint': [lineId: EntityId];
  'split-line': [lineId: EntityId, x: number, y: number];
  'add-line': [start: LineEndpoint, end: LineEndpoint];
  'add-curve': [points: [EntityId, EntityId, EntityId, EntityId]];
  'add-arc': [start: ArcEndpoint, end: ArcEndpoint, through: ArcEndpoint];
  'add-circle': [center: CircleEndpoint, rim: CircleEndpoint];
  'add-rectangle': [mode: RectangleMode, clicks: DraftingEndpoint[]];
  'constraint-pick': [pick: ConstraintPick];
  'round-corner-pick': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'add-dimension': [placement: DimensionPlacement];
  'add-cut-dimension': [placement: CutDimensionPlacement];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'marquee-change': [active: boolean];
  'measure-pick': [id: EntityId];
}>();

function forwardToggleDisplay(key: string, value: boolean): void {
  emit('toggle-display', key, value);
}
function forwardMoveInstance(id: EntityId, x: number, y: number): void {
  emit('move-instance', id, x, y);
}
function forwardNudgeInstance(id: EntityId, dx: number, dy: number): void {
  emit('nudge-instance', id, dx, dy);
}
function forwardMovePiece(dx: number, dy: number): void {
  emit('move-piece', dx, dy);
}
function forwardMovePoint(id: EntityId, x: number, y: number): void {
  emit('move-point', id, x, y);
}
function forwardAddText(anchor: DraftingEndpoint, leader?: DraftingEndpoint): void {
  emit('add-text', anchor, leader);
}
function forwardAddNotch(point: EntityId, edge: EntityId): void {
  emit('add-notch', point, edge);
}
function forwardAddCentreLine(start: EntityId, end: EntityId): void {
  emit('add-centre-line', start, end);
}
function forwardAddPoint(x: number, y: number): void {
  emit('add-point', x, y);
}
function forwardAddPointOnLine(lineId: EntityId, x: number, y: number): void {
  emit('add-point-on-line', lineId, x, y);
}
function forwardSplitLine(lineId: EntityId, x: number, y: number): void {
  emit('split-line', lineId, x, y);
}
function forwardAddLine(start: LineEndpoint, end: LineEndpoint): void {
  emit('add-line', start, end);
}
function forwardAddArc(start: ArcEndpoint, end: ArcEndpoint, through: ArcEndpoint): void {
  emit('add-arc', start, end, through);
}
function forwardAddCircle(center: CircleEndpoint, rim: CircleEndpoint): void {
  emit('add-circle', center, rim);
}
function forwardAddRectangle(mode: RectangleMode, clicks: DraftingEndpoint[]): void {
  emit('add-rectangle', mode, clicks);
}
function forwardCornerRadius(id: EntityId, radius: ParamInput): void {
  emit('set-corner-round-radius', id, radius);
}
function forwardUpdateDimension(id: EntityId, patch: DimensionPatch): void {
  emit('update-dimension', id, patch);
}
</script>

<template>
  <div class="relative min-h-0 flex-1 p-2">
    <p
      v-if="pattern.tabs.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
      data-testid="no-tabs-empty"
    >
      Create a piece to start
    </p>
    <AssemblyCanvas
      v-else-if="isAssemblyTab && activeAssembly"
      :document="assemblyDocument"
      :assembly-id="activeAssembly.id"
      :pieces="pattern.pieces"
      :selected-instance-id="selectedInstanceId"
      :picker-open="assemblyPickerOpen"
      :fit-token="fitToken"
      :read-only="readOnly"
      :show-cut-shapes="display.assembly.cutShapes"
      :show-allowances="display.assembly.allowances"
      :show-stitch="display.assembly.stitch"
      :show-folds="display.assembly.folds"
      :show-notches="display.assembly.notches"
      :show-labels="display.assembly.labels"
      @select="emit('select-instance', $event)"
      @move="forwardMoveInstance"
      @nudge="forwardNudgeInstance"
      @remove="emit('remove-instance', $event)"
      @add-piece="emit('add-instance', $event)"
      @close-picker="emit('close-picker')"
    />
    <PatternCanvas
      v-else
      :selected-entity-ids="selectedEntityIds"
      :selected-dimension-ids="selectedDimensionIds"
      :selected-allowance-targets="selectedAllowanceTargets"
      @update:selected-dimension-ids="emit('update:selectedDimensionIds', $event)"
      @update:selected-allowance-targets="emit('update:selectedAllowanceTargets', $event)"
      :document="visibleDocument"
      :tool="activeTool"
      :fit-token="fitToken"
      :show-allowances="display.piece.allowances"
      :show-constraints="display.piece.constraints"
      :show-dimensions="display.piece.dimensions"
      :constraint-active="activeConstraint !== null"
      :constraint-picks="constraintPicks"
      :round-corner-active="cornerRoundActive"
      :round-corner-picks="cornerRoundPicks"
      :corner-round-preview-radius="cornerRoundPreviewRadius"
      :read-only="readOnly"
      :active-piece-id="activePieceId"
      :move-mode="isSketch && sketchArrange"
      :measure-active="measuredEditing"
      :highlighted-entity-ids="measuredHighlightIds"
      @measure-pick="emit('measure-pick', $event)"
      @update:selected-entity-ids="emit('update:selectedEntityIds', $event)"
      @move-piece="forwardMovePiece"
      @activate-piece="emit('activate-piece', $event)"
      @cross-piece="emit('cross-piece', $event)"
      @move-point="forwardMovePoint"
      @add-text="forwardAddText"
      @add-notch="forwardAddNotch"
      @add-centre-line="forwardAddCentreLine"
      @add-point="forwardAddPoint"
      @add-point-on-line="forwardAddPointOnLine"
      @add-point-midpoint="emit('add-point-midpoint', $event)"
      @split-line="forwardSplitLine"
      @add-line="forwardAddLine"
      @add-curve="emit('add-curve', $event)"
      @add-arc="forwardAddArc"
      @add-circle="forwardAddCircle"
      @add-rectangle="forwardAddRectangle"
      @constraint-pick="emit('constraint-pick', $event)"
      @round-corner-pick="emit('round-corner-pick', $event)"
      @set-corner-round-radius="forwardCornerRadius"
      @add-dimension="emit('add-dimension', $event)"
      @add-cut-dimension="emit('add-cut-dimension', $event)"
      @update-dimension="forwardUpdateDimension"
      @marquee-change="emit('marquee-change', $event)"
    />
    <div v-if="pattern.tabs.length > 0" class="absolute bottom-3 right-3 z-20">
      <CanvasDisplayMenu
        :items="displayItems"
        :values="displayValues"
        @toggle="forwardToggleDisplay"
      />
    </div>
  </div>
</template>
