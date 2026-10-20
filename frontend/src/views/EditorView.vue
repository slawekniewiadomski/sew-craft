<script setup lang="ts">
import {
  constraintEntityIds,
  constraintOffset,
  constraintOrientation,
  cutEdges,
  dimensionValue,
  findDistanceConstraint,
  isDrivenDimension,
  measureLinearDimension,
  seamForEdge,
  toSvg,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
  Command,
  ConstraintType,
  CurveEntity,
  DimensionOrientation,
  EntityId,
  LineEntity,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import ConstraintPromptBar from '@/components/ConstraintPromptBar.vue';
import EditorRibbon from '@/components/EditorRibbon.vue';
import EditorSidebar from '@/components/EditorSidebar.vue';
import EntityPropertiesPanel from '@/components/EntityPropertiesPanel.vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
import { nextCommandId } from '@/lib/command-ids';
import {
  applyConstraintPick,
  constraintInitialValue,
  constraintPrompt,
  constraintRejection,
  constraintValueSpec,
  prunePicks,
  type ConstraintPick,
} from '@/lib/constraint-tools';
import { constraintLabel } from '@/lib/constraint-view';
import {
  DIMENSION_ORIENTATION_OPTIONS,
  formatDimensionValue,
  parseDimensionEdit,
  parseDimensionValue,
  type DimensionPatch,
  type DimensionPlacement,
} from '@/lib/dimensions';
import { downloadSvgFile } from '@/lib/download';
import type { RibbonAction } from '@/lib/editor-ribbon';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';
import { entityProperties } from '@/lib/entity-properties';
import { buildLineCommands, type LineEndpoint } from '@/lib/line-tool';
import { parseSeamWidth } from '@/lib/seam-width';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, dispatchGroup, undo, redo } =
  useCommandBus();
const { width, collapsed, setWidth } = useSidebarLayout(window.localStorage);

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
const selectedId = ref<EntityId | null>(null);
const fitToken = ref(0);
const showConstruction = ref(true);
const includeConstruction = ref(false);
const showSeamAllowance = ref(true);
const showConstraints = ref(true);
const showDimensions = ref(true);
const activeConstraint = ref<ConstraintType | null>(null);
const constraintPicks = ref<ConstraintPick[]>([]);
const pendingConstraint = ref<AddConstraintParams | null>(null);
const constraintRejectionMessage = ref<string | null>(null);

/**
 * Construction geometry is presentation only: hiding it filters what is drawn
 * without touching the document, so the toggle never changes the model.
 */
const visibleDocument = computed(() =>
  showConstruction.value
    ? pattern.value
    : {
        ...pattern.value,
        entities: pattern.value.entities.filter((entity) => !entity.construction),
      },
);

/** Every line and curve, so any edge can be converted between guide and cut. */
const edges = computed(() =>
  pattern.value.entities
    .filter((entity): entity is LineEntity | CurveEntity => entity.kind !== 'point')
    .map((entity) => {
      const seam = seamForEdge(pattern.value, entity.id);
      return {
        id: entity.id,
        construction: entity.construction,
        seamId: seam?.id ?? null,
        seamWidth: seam?.width ?? null,
      };
    }),
);

const cutEdgeCount = computed(() => cutEdges(pattern.value).length);

/** The selection inspector view model; `null` falls back to the workspace summary. */
const selectedEntity = computed(() => entityProperties(pattern.value, selectedId.value));

/**
 * Distance constraints are the driving dimensions; the sidebar edits their
 * value and measurement axis, while the canvas renders them. Every other
 * constraint stays in the generic constraints list.
 */
const dimensions = computed(() =>
  pattern.value.constraints.flatMap((constraint) => {
    if (constraint.type !== 'distance') return [];
    // Point deletion cascades to constraints, so a surviving dimension resolves.
    const measured = dimensionValue(pattern.value, constraint)!;
    return [
      {
        id: constraint.id,
        entities: [constraint.a, constraint.b],
        value: formatDimensionValue(measured),
        driven: isDrivenDimension(constraint),
        orientation: constraintOrientation(constraint),
        offset: formatDimensionValue(constraintOffset(constraint)),
      },
    ];
  }),
);

const otherConstraints = computed(() =>
  pattern.value.constraints.filter((constraint) => constraint.type !== 'distance'),
);

const activeToolLabel = computed(
  () => EDITOR_TOOLS.find((tool) => tool.id === activeTool.value)!.label,
);

const constraintPromptText = computed(() =>
  constraintPrompt(activeConstraint.value!, constraintPicks.value),
);
const constraintValueReady = computed(
  () => activeConstraint.value !== null && pendingConstraint.value !== null,
);
const constraintInitial = computed(() =>
  activeConstraint.value === null || pendingConstraint.value === null
    ? ''
    : constraintInitialValue(activeConstraint.value, constraintPicks.value, pattern.value),
);

function run(action: () => void): boolean {
  try {
    error.value = null;
    action();
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Command failed';
    return false;
  }
}

function selectTool(tool: EditorTool): void {
  exitConstraint();
  activeTool.value = activeTool.value === tool ? 'select' : tool;
}

function exitConstraint(): void {
  activeConstraint.value = null;
  constraintPicks.value = [];
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
}

function selectConstraint(type: ConstraintType): void {
  if (activeConstraint.value === type) {
    exitConstraint();
    return;
  }

  activeConstraint.value = type;
  activeTool.value = 'select';
  selectedId.value = null;
  constraintPicks.value = [];
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
}

function fit(): void {
  fitToken.value += 1;
}

function downloadSvg(): void {
  downloadSvgFile(
    `pattern-${props.id}.svg`,
    toSvg(pattern.value, { construction: includeConstruction.value }),
  );
}

function deleteSelected(): void {
  const id = selectedId.value;
  if (id === null) return;

  run(() => dispatch({ id: nextCommandId('delete'), type: 'delete_entity', params: { id } }));
  selectedId.value = null;
}

function onRibbonAction(action: RibbonAction): void {
  switch (action) {
    case 'undo':
      run(undo);
      break;
    case 'redo':
      run(redo);
      break;
    case 'delete':
      deleteSelected();
      break;
    case 'fit':
      fit();
      break;
    case 'download_svg':
      downloadSvg();
      break;
  }
}

function onMovePoint(id: EntityId, x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('move'), type: 'move_point', params: { id, x, y } }));
}

function onAddPoint(x: number, y: number): void {
  run(() => dispatch({ id: nextCommandId('point'), type: 'add_point', params: { x, y } }));
}

/** One gesture: new endpoints become points, then the line, as a single entry. */
function onAddLine(start: LineEndpoint, end: LineEndpoint): void {
  run(() => dispatchGroup(buildLineCommands(start, end, nextCommandId)));
}

function onAddCurve(points: [EntityId, EntityId, EntityId, EntityId]): void {
  run(() =>
    dispatch({
      id: nextCommandId('curve'),
      type: 'add_curve',
      params: { p0: points[0], p1: points[1], p2: points[2], p3: points[3] },
    }),
  );
}

/**
 * Place a dimension as a driven distance constraint: it measures the span and
 * adds no equation. Reusing an existing distance between the same two points
 * avoids duplicates and keeps that dimension's driven/set state; the placement
 * then only updates its presentation.
 */
function onAddDimension(placement: DimensionPlacement): void {
  const existing = findDistanceConstraint(pattern.value, placement.a, placement.b);
  if (existing !== undefined) {
    run(() =>
      dispatch({
        id: nextCommandId('dimension'),
        type: 'update_constraint',
        params: { id: existing.id, orientation: placement.orientation, offset: placement.offset },
      }),
    );
    return;
  }

  const measured = measureLinearDimension(
    pattern.value,
    placement.a,
    placement.b,
    placement.orientation,
  )!;
  if (measured <= 0) return;

  run(() =>
    dispatch({
      id: nextCommandId('dimension'),
      type: 'add_constraint',
      params: {
        type: 'distance',
        entities: [placement.a, placement.b],
        orientation: placement.orientation,
        offset: placement.offset,
      },
    }),
  );
}

function onUpdateDimension(id: EntityId, patch: DimensionPatch): void {
  run(() =>
    dispatch({
      id: nextCommandId('dimension'),
      type: 'update_constraint',
      params: { id, ...patch },
    }),
  );
}

/** The inspector edits a value only; placement stays in the Dimensions drawer. */
function onInspectorDimensionValue(id: EntityId, value: number | null): void {
  onUpdateDimension(id, { value });
}

function onDimensionValueEdit(id: EntityId, event: Event): void {
  const edit = parseDimensionEdit((event.target as HTMLInputElement).value);
  if (edit.kind === 'invalid') return;
  onUpdateDimension(id, edit.kind === 'driven' ? { value: null } : { value: edit.value });
}

function onDimensionOrientationEdit(id: EntityId, event: Event): void {
  const orientation = (event.target as HTMLSelectElement).value as DimensionOrientation;
  onUpdateDimension(id, { orientation });
}

function onDimensionOffsetEdit(id: EntityId, event: Event): void {
  const offset = parseDimensionValue((event.target as HTMLInputElement).value);
  if (offset === null) return;
  onUpdateDimension(id, { offset });
}

function convert(id: string, construction: boolean): void {
  run(() =>
    dispatch({
      id: nextCommandId('construction'),
      type: 'set_construction',
      params: { id, construction },
    }),
  );
}

function onAddAllowance(edge: EntityId): void {
  const entity = pattern.value.entities.find((candidate) => candidate.id === edge);
  if (seamForEdge(pattern.value, edge) !== undefined) return;

  if (entity === undefined || entity.kind === 'point' || entity.construction) {
    error.value = 'Only cut edges can carry a seam allowance';
    return;
  }

  run(() => dispatch({ id: nextCommandId('seam'), type: 'add_seam_allowance', params: { edge } }));
}

function setSeamWidth(id: EntityId, width: number): void {
  run(() =>
    dispatch({ id: nextCommandId('seam'), type: 'set_seam_allowance', params: { id, width } }),
  );
}

/** Sidebar width edit: invalid or unchanged values snap back without a command. */
function onSeamWidthEdit(id: EntityId, current: number, event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseSeamWidth(input.value);
  if (width === null || width === current) {
    input.value = String(current);
    return;
  }

  setSeamWidth(id, width);
}

function removeSeam(id: EntityId): void {
  run(() => dispatch({ id: nextCommandId('seam'), type: 'remove_seam_allowance', params: { id } }));
}

function dispatchConstraint(params: AddConstraintParams): boolean {
  return run(() => dispatch({ id: nextCommandId('constraint'), type: 'add_constraint', params }));
}

function onConstraintPick(pick: ConstraintPick): void {
  const type = activeConstraint.value!;
  if (pendingConstraint.value !== null) return;

  const result = applyConstraintPick({ type, picks: constraintPicks.value }, pick, pattern.value);
  if (result.status === 'rejected') {
    constraintRejectionMessage.value = constraintRejection(result.reason);
    return;
  }

  constraintRejectionMessage.value = null;
  constraintPicks.value = result.picks;

  if (result.status === 'picking') return;

  if (constraintValueSpec(type) !== null) {
    pendingConstraint.value = result.params;
    return;
  }

  if (dispatchConstraint(result.params)) {
    constraintPicks.value = [];
  }
}

function applyConstraintValue(value: number): void {
  const params = pendingConstraint.value!;

  if (dispatchConstraint({ ...params, value })) {
    pendingConstraint.value = null;
    constraintPicks.value = [];
    constraintRejectionMessage.value = null;
  }
}

function removeConstraint(id: EntityId): void {
  run(() =>
    dispatch({ id: nextCommandId('constraint'), type: 'remove_constraint', params: { id } }),
  );
}

function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeConstraint.value !== null) {
    event.preventDefault();
    exitConstraint();
    return;
  }

  if (event.key === 'Escape' && activeTool.value !== 'select') {
    event.preventDefault();
    activeTool.value = 'select';
    return;
  }

  if (isEditing(event.target)) return;

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelected();
  }
}

watch(pattern, (next) => {
  if (activeConstraint.value === null) return;

  const pruned = prunePicks(constraintPicks.value, next);
  if (pruned.length === constraintPicks.value.length) return;

  constraintPicks.value = pruned;
  pendingConstraint.value = null;
  constraintRejectionMessage.value = null;
});

function seed(): void {
  const commands: Command[] = [
    { id: 'a', type: 'add_point', params: { x: 60, y: 260 } },
    { id: 'b', type: 'add_point', params: { x: 220, y: 260 } },
    { id: 'c', type: 'add_point', params: { x: 220, y: 170 } },
    { id: 'd', type: 'add_point', params: { x: 60, y: 170 } },
    { id: 'ab', type: 'add_line', params: { start: 'a', end: 'b' } },
    { id: 'bc', type: 'add_line', params: { start: 'b', end: 'c' } },
    { id: 'cd', type: 'add_line', params: { start: 'c', end: 'd' } },
    { id: 'da', type: 'add_line', params: { start: 'd', end: 'a' } },
    { id: 'bottom', type: 'add_constraint', params: { type: 'horizontal', entities: ['a', 'b'] } },
    { id: 'right', type: 'add_constraint', params: { type: 'vertical', entities: ['b', 'c'] } },
    { id: 'top', type: 'add_constraint', params: { type: 'horizontal', entities: ['c', 'd'] } },
    { id: 'left', type: 'add_constraint', params: { type: 'vertical', entities: ['d', 'a'] } },
    {
      id: 'width',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['a', 'b'], value: 160 },
    },
    {
      id: 'height',
      type: 'add_constraint',
      params: { type: 'distance', entities: ['b', 'c'], value: 90 },
    },
  ];
  run(() => commands.forEach((command) => dispatch(command)));
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);

  if (pattern.value.entities.length === 0 && journal.value.length === 0) {
    seed();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <EditorRibbon
      :active-tool="activeTool"
      :active-constraint="activeConstraint"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :can-delete="selectedId !== null"
      @select-tool="selectTool"
      @select-constraint="selectConstraint"
      @action="onRibbonAction"
    />

    <ConstraintPromptBar
      v-if="activeConstraint"
      :type="activeConstraint"
      :prompt="constraintPromptText"
      :rejection="constraintRejectionMessage"
      :value-ready="constraintValueReady"
      :initial-value="constraintInitial"
      @apply="applyConstraintValue"
      @cancel="exitConstraint"
    />

    <p v-if="error" class="border-b px-3 py-1 text-sm text-destructive">{{ error }}</p>

    <div class="flex min-h-0 flex-1">
      <div class="min-h-0 flex-1 p-2">
        <PatternCanvas
          v-model:selected-id="selectedId"
          :document="visibleDocument"
          :tool="activeTool"
          :fit-token="fitToken"
          :show-seam-allowance="showSeamAllowance"
          :show-constraints="showConstraints"
          :show-dimensions="showDimensions"
          :constraint-active="activeConstraint !== null"
          :constraint-picks="constraintPicks"
          @move-point="onMovePoint"
          @add-point="onAddPoint"
          @add-line="onAddLine"
          @add-curve="onAddCurve"
          @constraint-pick="onConstraintPick"
          @add-dimension="onAddDimension"
          @update-dimension="onUpdateDimension"
          @add-allowance="onAddAllowance"
          @set-seam-width="setSeamWidth"
        />
      </div>

      <EditorSidebar
        :width="width"
        :collapsed="collapsed"
        @update:width="setWidth"
        @update:collapsed="collapsed = $event"
      >
        <template #properties>
          <EntityPropertiesPanel
            v-if="selectedEntity"
            :document="pattern"
            :entity="selectedEntity"
            @set-construction="convert"
            @add-seam="onAddAllowance"
            @set-seam-width="setSeamWidth"
            @remove-seam="removeSeam"
            @update-dimension="onInspectorDimensionValue"
            @remove-constraint="removeConstraint"
          />

          <section
            class="space-y-1 text-sm"
            :class="selectedEntity ? 'mt-3 border-t pt-3' : ''"
            aria-label="Workspace"
            data-testid="workspace-summary"
          >
            <h3
              class="text-xs font-semibold uppercase text-muted-foreground"
              :class="selectedEntity ? '' : 'sr-only'"
            >
              Workspace
            </h3>
            <dl class="space-y-1">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">Tool</dt>
                <dd data-testid="active-tool">{{ activeToolLabel }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">Project</dt>
                <dd>#{{ props.id }}</dd>
              </div>
            </dl>
            <p class="text-xs text-muted-foreground">{{ journal.length }} command(s)</p>
            <p class="text-xs text-muted-foreground">{{ cutEdgeCount }} cut edge(s)</p>
            <p v-if="!selectedEntity" class="pt-1 text-xs text-muted-foreground">
              Select a point, line or curve to inspect it.
            </p>
          </section>
        </template>

        <template #outline>
          <ul v-if="edges.length > 0" class="space-y-2" aria-label="Edges">
            <li
              v-for="edge in edges"
              :key="edge.id"
              class="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span class="font-mono text-muted-foreground">{{ edge.id }}</span>

              <div class="flex items-center gap-2">
                <template v-if="edge.seamId !== null">
                  <label
                    class="flex items-center gap-1 text-muted-foreground"
                    :data-testid="`seam-label-${edge.id}`"
                  >
                    Allowance
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      class="w-16 rounded-md border px-2 py-1 text-sm text-foreground"
                      :value="edge.seamWidth!"
                      :aria-label="`Allowance width in millimetres for ${edge.id}`"
                      :data-testid="`seam-width-${edge.id}`"
                      @change="onSeamWidthEdit(edge.seamId!, edge.seamWidth!, $event)"
                      @keydown.enter.prevent="
                        onSeamWidthEdit(edge.seamId!, edge.seamWidth!, $event)
                      "
                    />
                    mm
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`remove-seam-${edge.id}`"
                    @click="removeSeam(edge.seamId!)"
                  >
                    Remove allowance
                  </Button>
                </template>
                <template v-else>
                  <span class="text-muted-foreground" :data-testid="`seam-empty-${edge.id}`">
                    No allowance
                  </span>
                </template>

                <Button variant="outline" size="sm" @click="convert(edge.id, !edge.construction)">
                  {{ edge.construction ? 'Make cut edge' : 'Make construction' }}
                </Button>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No edges yet.</p>
        </template>

        <template #dimensions>
          <ul v-if="dimensions.length > 0" class="space-y-3" aria-label="Dimensions">
            <li
              v-for="dimension in dimensions"
              :key="dimension.id"
              class="space-y-1 text-sm"
              :data-testid="`dimension-${dimension.id}`"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-mono text-muted-foreground">{{ dimension.id }}</span>
                  <span class="ml-2 text-xs text-muted-foreground">
                    ({{ dimension.entities.join(', ') }})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  :data-testid="`remove-dimension-${dimension.id}`"
                  @click="removeConstraint(dimension.id)"
                >
                  Remove
                </Button>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0.001"
                  step="0.1"
                  class="w-20 rounded-md border px-2 py-1 text-sm"
                  :value="dimension.value"
                  :aria-label="
                    dimension.driven
                      ? `Value for ${dimension.id} (driven measurement)`
                      : `Value for ${dimension.id}`
                  "
                  :data-testid="`dimension-value-${dimension.id}`"
                  @change="onDimensionValueEdit(dimension.id, $event)"
                />
                <span class="text-xs text-muted-foreground">mm</span>
                <span
                  class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  :data-testid="`dimension-state-${dimension.id}`"
                >
                  {{ dimension.driven ? 'Driven' : 'Set' }}
                </span>

                <select
                  class="rounded-md border px-2 py-1 text-sm"
                  :value="dimension.orientation"
                  :aria-label="`Orientation for ${dimension.id}`"
                  :data-testid="`dimension-orientation-${dimension.id}`"
                  @change="onDimensionOrientationEdit(dimension.id, $event)"
                >
                  <option
                    v-for="option in DIMENSION_ORIENTATION_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="1"
                  class="w-20 rounded-md border px-2 py-1 text-sm"
                  :value="dimension.offset"
                  :aria-label="`Offset for ${dimension.id}`"
                  :data-testid="`dimension-offset-${dimension.id}`"
                  @change="onDimensionOffsetEdit(dimension.id, $event)"
                />
                <span class="text-xs text-muted-foreground">offset (mm)</span>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No dimensions yet.</p>
        </template>

        <template #constraints>
          <ul v-if="otherConstraints.length > 0" class="space-y-2" aria-label="Constraints">
            <li
              v-for="constraint in otherConstraints"
              :key="constraint.id"
              class="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <div class="min-w-0">
                <span class="font-mono text-muted-foreground">{{ constraint.id }}</span>
                <span class="ml-2">{{ constraintLabel(constraint) }}</span>
                <span class="ml-2 text-xs text-muted-foreground">
                  ({{ constraintEntityIds(constraint).join(', ') }})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`remove-constraint-${constraint.id}`"
                @click="removeConstraint(constraint.id)"
              >
                Remove
              </Button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No constraints yet.</p>
        </template>

        <template #view>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showConstruction" type="checkbox" data-testid="show-construction" />
              Show construction
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="showSeamAllowance"
                type="checkbox"
                data-testid="show-seam-allowance"
              />
              Show seam allowance
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="includeConstruction"
                type="checkbox"
                data-testid="toggle-construction"
              />
              Include construction
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showConstraints" type="checkbox" data-testid="show-constraints" />
              Show constraints
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="showDimensions" type="checkbox" data-testid="show-dimensions" />
              Show dimensions
            </label>
          </div>
        </template>
      </EditorSidebar>
    </div>
  </section>
</template>
