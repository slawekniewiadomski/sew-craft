<script setup lang="ts">
import {
  allPoints,
  constraintEntityIds,
  CONSTRAINT_TYPES,
  cutEdges,
  DEFAULT_SEAM_ALLOWANCE,
  seamForEdge,
  toSvg,
} from '@sewcraft/geometry';
import type {
  AddConstraintParams,
  Command,
  ConstraintType,
  CurveEntity,
  EntityId,
  LineEntity,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import EditorRibbon from '@/components/EditorRibbon.vue';
import EditorSidebar from '@/components/EditorSidebar.vue';
import PatternCanvas from '@/components/PatternCanvas.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { useSidebarLayout } from '@/composables/use-sidebar-layout';
import { nextCommandId } from '@/lib/command-ids';
import { downloadSvgFile } from '@/lib/download';
import {
  CONSTRAINT_LABELS,
  CONSTRAINT_ROLES,
  constraintLabel,
  constraintValueUnit,
  isValidConstraintValue,
} from '@/lib/constraint-view';
import type { RibbonAction } from '@/lib/editor-ribbon';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, undo, redo } = useCommandBus();
const { width, collapsed, setWidth } = useSidebarLayout(window.localStorage);

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
const selectedId = ref<EntityId | null>(null);
const fitToken = ref(0);
const showConstruction = ref(true);
const includeConstruction = ref(false);
const showSeamAllowance = ref(true);
const showConstraints = ref(true);
const seamWidths = ref<Record<string, number>>({});
const constraintType = ref<ConstraintType>('horizontal');
const constraintEntities = ref<EntityId[]>([]);
const constraintValue = ref('');

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
const activeToolLabel = computed(
  () => EDITOR_TOOLS.find((tool) => tool.id === activeTool.value)!.label,
);

const constraintRoles = computed(() => CONSTRAINT_ROLES[constraintType.value]);
const valueUnit = computed(() => constraintValueUnit(constraintType.value));
const pointOptions = computed(() => allPoints(pattern.value));

function run(action: () => void): void {
  try {
    error.value = null;
    action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Command failed';
  }
}

function selectTool(tool: EditorTool): void {
  activeTool.value = tool;
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

function onAddLine(start: EntityId, end: EntityId): void {
  run(() => dispatch({ id: nextCommandId('line'), type: 'add_line', params: { start, end } }));
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

function convert(id: string, construction: boolean): void {
  run(() =>
    dispatch({
      id: nextCommandId('construction'),
      type: 'set_construction',
      params: { id, construction },
    }),
  );
}

function seamWidthFor(id: EntityId): number {
  return seamWidths.value[id] ?? DEFAULT_SEAM_ALLOWANCE;
}

function isValidSeamWidth(width: number): boolean {
  return width > 0;
}

function setSeamWidth(id: EntityId, value: string): void {
  seamWidths.value = { ...seamWidths.value, [id]: Number(value) };
}

function addSeam(edge: EntityId): void {
  const width = seamWidthFor(edge);
  if (!isValidSeamWidth(width)) return;

  run(() =>
    dispatch({ id: nextCommandId('seam'), type: 'add_seam_allowance', params: { edge, width } }),
  );
}

function removeSeam(id: EntityId): void {
  run(() => dispatch({ id: nextCommandId('seam'), type: 'remove_seam_allowance', params: { id } }));
}

function entityAt(index: number): EntityId {
  return constraintEntities.value[index] ?? '';
}

function setEntity(index: number, id: EntityId): void {
  const next = [...constraintEntities.value];
  next[index] = id;
  constraintEntities.value = next;
}

function addConstraint(): void {
  const type = constraintType.value;
  const entities = constraintRoles.value.map((_, index) => entityAt(index));
  if (entities.some((id) => id === '')) return;

  const params: AddConstraintParams = { type, entities };
  if (valueUnit.value !== null) {
    const raw = constraintValue.value.trim();
    const value = Number(raw);
    if (raw === '' || !isValidConstraintValue(type, value)) return;
    params.value = value;
  }

  run(() => dispatch({ id: nextCommandId('constraint'), type: 'add_constraint', params }));
  constraintValue.value = '';
}

function removeConstraint(id: EntityId): void {
  run(() =>
    dispatch({ id: nextCommandId('constraint'), type: 'remove_constraint', params: { id } }),
  );
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelected();
  }
}

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
      :can-undo="canUndo"
      :can-redo="canRedo"
      :can-delete="selectedId !== null"
      @select-tool="selectTool"
      @action="onRibbonAction"
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
          @move-point="onMovePoint"
          @add-point="onAddPoint"
          @add-line="onAddLine"
          @add-curve="onAddCurve"
        />
      </div>

      <EditorSidebar
        :width="width"
        :collapsed="collapsed"
        @update:width="setWidth"
        @update:collapsed="collapsed = $event"
      >
        <template #properties>
          <dl class="space-y-1 text-sm">
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Tool</dt>
              <dd data-testid="active-tool">{{ activeToolLabel }}</dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Selection</dt>
              <dd data-testid="active-selection">{{ selectedId ?? 'None' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Project</dt>
              <dd>#{{ props.id }}</dd>
            </div>
          </dl>
          <p class="mt-2 text-xs text-muted-foreground">{{ journal.length }} command(s)</p>
          <p class="text-xs text-muted-foreground">{{ cutEdgeCount }} cut edge(s)</p>
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
                  <span class="text-muted-foreground" :data-testid="`seam-label-${edge.id}`">
                    Allowance {{ edge.seamWidth }} mm
                  </span>
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
                  <input
                    type="number"
                    min="1"
                    step="1"
                    class="w-16 rounded-md border px-2 py-1 text-sm"
                    :value="seamWidthFor(edge.id)"
                    :aria-label="`Seam width for ${edge.id}`"
                    :data-testid="`seam-width-${edge.id}`"
                    @input="setSeamWidth(edge.id, ($event.target as HTMLInputElement).value)"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`add-seam-${edge.id}`"
                    @click="addSeam(edge.id)"
                  >
                    Add allowance
                  </Button>
                </template>

                <Button variant="outline" size="sm" @click="convert(edge.id, !edge.construction)">
                  {{ edge.construction ? 'Make cut edge' : 'Make construction' }}
                </Button>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No edges yet.</p>
        </template>

        <template #constraints>
          <ul v-if="pattern.constraints.length > 0" class="space-y-2" aria-label="Constraints">
            <li
              v-for="constraint in pattern.constraints"
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

          <form class="mt-3 space-y-2" @submit.prevent="addConstraint">
            <label class="block text-sm">
              Type
              <select
                v-model="constraintType"
                class="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                data-testid="constraint-type"
              >
                <option v-for="type in CONSTRAINT_TYPES" :key="type" :value="type">
                  {{ CONSTRAINT_LABELS[type] }}
                </option>
              </select>
            </label>

            <label
              v-for="(role, index) in constraintRoles"
              :key="`${constraintType}-${role}`"
              class="block text-sm"
            >
              {{ role }}
              <select
                class="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                :data-testid="`constraint-entity-${index}`"
                :value="entityAt(index)"
                @change="setEntity(index, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Select a point…</option>
                <option v-for="point in pointOptions" :key="point.id" :value="point.id">
                  {{ point.id }} ({{ point.x }}, {{ point.y }})
                </option>
              </select>
            </label>

            <label v-if="valueUnit !== null" class="block text-sm">
              Value ({{ valueUnit }})
              <input
                type="number"
                step="any"
                class="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                data-testid="constraint-value"
                :value="constraintValue"
                @input="constraintValue = ($event.target as HTMLInputElement).value"
              />
            </label>

            <Button type="submit" size="sm" data-testid="add-constraint">Add constraint</Button>
          </form>
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
          </div>
        </template>
      </EditorSidebar>
    </div>
  </section>
</template>
