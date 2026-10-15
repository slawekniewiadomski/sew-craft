<script setup lang="ts">
import { cutEdges, DEFAULT_SEAM_ALLOWANCE, seamForEdge, toSvg } from '@sewcraft/geometry';
import type { Command, CurveEntity, EntityId, LineEntity } from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import PatternCanvas from '@/components/PatternCanvas.vue';
import { Button } from '@/components/ui/button';
import { useCommandBus } from '@/composables/use-command-bus';
import { nextCommandId } from '@/lib/command-ids';
import { downloadSvgFile } from '@/lib/download';
import { EDITOR_TOOLS, type EditorTool } from '@/lib/editor-tools';

const props = defineProps<{ id: string }>();

const { document: pattern, journal, canUndo, canRedo, dispatch, undo, redo } = useCommandBus();

const error = ref<string | null>(null);
const activeTool = ref<EditorTool>('select');
const selectedId = ref<EntityId | null>(null);
const fitToken = ref(0);
const showConstruction = ref(true);
const includeConstruction = ref(false);
const showSeamAllowance = ref(true);
const seamWidths = ref<Record<string, number>>({});

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
  <section class="space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="text-2xl font-semibold">Editor</h1>
      <p class="text-sm text-muted-foreground">Project #{{ props.id }}</p>
    </div>

    <p class="text-sm text-muted-foreground">
      Every edit is a command: dragging, drawing and deleting all go through the command bus, so
      undo and redo replay the journal. The solver rebuilds after each change and constraints hold.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1 rounded-md border p-1">
        <Button
          v-for="tool in EDITOR_TOOLS"
          :key="tool.id"
          :variant="activeTool === tool.id ? 'default' : 'ghost'"
          size="sm"
          :data-testid="`tool-${tool.id}`"
          @click="selectTool(tool.id)"
        >
          {{ tool.label }}
        </Button>
      </div>

      <Button variant="outline" size="sm" :disabled="!canUndo" @click="run(undo)">Undo</Button>
      <Button variant="outline" size="sm" :disabled="!canRedo" @click="run(redo)">Redo</Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="selectedId === null"
        data-testid="delete"
        @click="deleteSelected"
      >
        Delete
      </Button>
      <Button variant="outline" size="sm" data-testid="fit" @click="fit">Fit</Button>
      <Button variant="outline" size="sm" data-testid="download-svg" @click="downloadSvg">
        Download SVG
      </Button>
      <label class="flex items-center gap-1 text-sm text-muted-foreground">
        <input v-model="includeConstruction" type="checkbox" data-testid="toggle-construction" />
        Include construction
      </label>

      <label class="flex items-center gap-1 text-sm">
        <input v-model="showConstruction" type="checkbox" data-testid="show-construction" />
        Show construction
      </label>

      <label class="flex items-center gap-1 text-sm">
        <input v-model="showSeamAllowance" type="checkbox" data-testid="show-seam-allowance" />
        Show seam allowance
      </label>

      <span class="text-sm text-muted-foreground">{{ journal.length }} command(s)</span>
      <span class="text-sm text-muted-foreground">{{ cutEdgeCount }} cut edge(s)</span>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <PatternCanvas
      v-model:selected-id="selectedId"
      :document="visibleDocument"
      :tool="activeTool"
      :fit-token="fitToken"
      :show-seam-allowance="showSeamAllowance"
      @move-point="onMovePoint"
      @add-point="onAddPoint"
      @add-line="onAddLine"
      @add-curve="onAddCurve"
    />

    <div v-if="edges.length > 0" class="space-y-2">
      <h2 class="text-sm font-medium">Edges</h2>
      <ul class="space-y-1" aria-label="Edges">
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
    </div>
  </section>
</template>
