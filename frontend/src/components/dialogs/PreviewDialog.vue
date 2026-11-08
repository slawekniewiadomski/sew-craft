<script setup lang="ts">
import {
  drapeAssembly,
  explodedAssembly,
  sewabilityReport,
  type Assembly,
  type PatternDocument,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Button } from '@/components/ui/button';
import { edgeLabel } from '@/lib/pieces';
import {
  DEFAULT_PREVIEW_VIEW,
  SEAM_COLORS,
  clampPreviewPitch,
  projectExploded,
  projectMesh,
  type PreviewView,
} from '@/lib/preview-mesh';

const props = defineProps<{
  document: PatternDocument;
  assembly: Assembly;
}>();

const emit = defineEmits<{ close: [] }>();

type PreviewMode = 'exploded' | 'sewn';

const mode = ref<PreviewMode>('exploded');
/** The seam under the pointer, isolated from the rest of the exploded web. */
const focusedSeam = ref<number | null>(null);
const inflatePercent = ref(100);
const wireframe = ref(false);
const view = ref<PreviewView>({ ...DEFAULT_PREVIEW_VIEW });

const exploded = computed(() => explodedAssembly(props.document, props.assembly));
// These projections are lazy: the template only reads them in a non-empty mode.
const explodedProjection = computed(() => projectExploded(exploded.value!, view.value));
const mesh = computed(() =>
  drapeAssembly(props.document, props.assembly, { inflate: inflatePercent.value / 100 }),
);
const projection = computed(() => projectMesh(mesh.value!, view.value));
const report = computed(() => sewabilityReport(props.document, props.assembly));

/** A seam row in the parts sheet: its colour and its two labelled sides. */
const seamRows = computed(() => {
  const view = exploded.value!;
  const labels = new Map(view.panels.map((panel) => [panel.instance, panel.label]));
  return view.seams.map((seam, index) => ({
    index,
    color: SEAM_COLORS[seam.colorIndex % SEAM_COLORS.length]!,
    sides: seam.sides.map(
      (side) =>
        `${labels.get(side.instance)!} · ${side.edges
          .map((edge) => edgeLabel(props.document, edge))
          .join(' + ')}`,
    ),
  }));
});

const empty = computed(() =>
  mode.value === 'exploded' ? exploded.value === null : mesh.value === null,
);

/** A complex assembly stays in Exploded; the height-field shell is not credible. */
const sewnUnsupported = computed(
  () => mode.value === 'sewn' && mesh.value !== null && !mesh.value.sewnSupported,
);

const activeBounds = computed(() =>
  mode.value === 'exploded' ? explodedProjection.value.bounds : projection.value.bounds,
);

const viewBox = computed(() => {
  const bounds = activeBounds.value;
  return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
});

/** Keep labels the same on-screen size in both modes. */
const labelSize = computed(
  () => Math.max(activeBounds.value.width, activeBounds.value.height) * 0.018,
);

function setMode(next: PreviewMode): void {
  mode.value = next;
  focusedSeam.value = null;
}

function focusSeam(index: number): void {
  focusedSeam.value = index;
}

function clearSeam(): void {
  focusedSeam.value = null;
}

const orbit = ref<{ x: number; y: number } | null>(null);

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  orbit.value = { x: event.clientX, y: event.clientY };
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  const previous = orbit.value;
  if (previous === null) return;
  const next = {
    yaw: view.value.yaw + (event.clientX - previous.x) * 0.01,
    pitch: clampPreviewPitch(view.value.pitch - (event.clientY - previous.y) * 0.01),
  };
  view.value = next;
  orbit.value = { x: event.clientX, y: event.clientY };
}

function endOrbit(): void {
  orbit.value = null;
}

function resetView(): void {
  view.value = { ...DEFAULT_PREVIEW_VIEW };
}

function onInflate(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  inflatePercent.value = Math.min(100, Math.max(0, value));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-background"
    role="dialog"
    aria-modal="true"
    aria-labelledby="preview-title"
    data-testid="preview-dialog"
  >
    <header class="flex items-center justify-between gap-2 border-b px-3 py-2">
      <h2 id="preview-title" class="min-w-0 flex-1 truncate text-sm font-medium">
        Preview · {{ props.assembly.name }}
      </h2>
      <div class="flex shrink-0 items-center gap-1" role="group" aria-label="Preview mode">
        <Button
          size="sm"
          :variant="mode === 'exploded' ? 'default' : 'outline'"
          :aria-pressed="mode === 'exploded'"
          data-testid="preview-mode-exploded"
          @click="setMode('exploded')"
        >
          Exploded
        </Button>
        <Button
          size="sm"
          :variant="mode === 'sewn' ? 'default' : 'outline'"
          :aria-pressed="mode === 'sewn'"
          data-testid="preview-mode-sewn"
          @click="setMode('sewn')"
        >
          Sewn
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close preview"
        data-testid="preview-close"
        @click="emit('close')"
      >
        ×
      </Button>
    </header>

    <p
      v-if="empty"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      data-testid="preview-empty"
    >
      Nothing to preview.
    </p>

    <div
      v-else-if="sewnUnsupported"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      data-testid="preview-sewn-unsupported"
    >
      <p class="max-w-md text-sm text-muted-foreground">
        Sewn preview is available for a simple pouch or a gusset box. This assembly has several
        panels, so the parts sheet is the reliable view.
      </p>
      <Button
        variant="outline"
        size="sm"
        data-testid="preview-use-exploded"
        @click="setMode('exploded')"
      >
        Use Exploded
      </Button>
    </div>

    <template v-else>
      <div class="flex min-h-0 flex-1 flex-col md:flex-row">
        <div class="relative min-h-0 flex-1">
          <svg
            :viewBox="viewBox"
            class="h-full w-full touch-none select-none"
            data-testid="preview-svg"
            role="img"
            :aria-label="`3D preview of ${props.assembly.name}`"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="endOrbit"
            @pointercancel="endOrbit"
          >
            <template v-if="mode === 'exploded' && explodedProjection">
              <polygon
                v-for="(panel, index) in explodedProjection.panels"
                :key="`panel-${index}`"
                :points="panel.points"
                :fill="panel.color"
                fill-opacity="0.32"
                :stroke="panel.color"
                stroke-width="0.25"
                stroke-linejoin="round"
                :data-testid="`exploded-panel-${index}`"
              />
              <template v-for="(seam, index) in explodedProjection.seams" :key="`seam-${index}`">
                <polyline
                  v-for="(side, sideIndex) in seam.sides"
                  :key="`side-${index}-${sideIndex}`"
                  :points="side"
                  fill="none"
                  :stroke="seam.color"
                  :stroke-width="focusedSeam === index ? 0.9 : 0.55"
                  :opacity="focusedSeam === null || focusedSeam === index ? 1 : 0.12"
                  stroke-linecap="round"
                  :data-testid="`exploded-seam-${index}-${sideIndex}`"
                />
                <polyline
                  v-for="(link, linkIndex) in seam.links"
                  :key="`link-${index}-${linkIndex}`"
                  :points="link"
                  fill="none"
                  :stroke="seam.color"
                  :stroke-width="focusedSeam === index ? 0.6 : 0.35"
                  :opacity="focusedSeam === null || focusedSeam === index ? 1 : 0.12"
                  stroke-dasharray="2 1.5"
                  :data-testid="`exploded-link-${index}-${linkIndex}`"
                />
                <polyline
                  v-for="(side, sideIndex) in seam.sides"
                  :key="`side-hit-${index}-${sideIndex}`"
                  :points="side"
                  fill="none"
                  stroke="transparent"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  pointer-events="stroke"
                  class="cursor-pointer"
                  :data-testid="`seam-focus-side-${index}-${sideIndex}`"
                  @pointerenter="focusSeam(index)"
                  @pointerleave="clearSeam"
                />
                <polyline
                  v-for="(link, linkIndex) in seam.links"
                  :key="`link-hit-${index}-${linkIndex}`"
                  :points="link"
                  fill="none"
                  stroke="transparent"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  pointer-events="stroke"
                  class="cursor-pointer"
                  :data-testid="`seam-focus-link-${index}-${linkIndex}`"
                  @pointerenter="focusSeam(index)"
                  @pointerleave="clearSeam"
                />
              </template>
              <text
                v-for="(panel, index) in explodedProjection.panels"
                :key="`label-${index}`"
                :x="panel.labelX"
                :y="panel.labelY"
                :font-size="labelSize"
                text-anchor="middle"
                class="fill-current"
                data-testid="exploded-label"
              >
                {{ panel.label }}
              </text>
            </template>
            <template v-else-if="projection">
              <polygon
                v-for="(polygon, index) in projection.polygons"
                :key="index"
                :points="polygon.points"
                :fill="wireframe ? 'none' : polygon.fill"
                :stroke="polygon.fill"
                :stroke-width="wireframe ? 0.15 : 0.15"
                stroke-linejoin="round"
                :data-testid="`preview-face-${polygon.panel}`"
              />
            </template>
          </svg>
          <p class="pointer-events-none absolute bottom-2 left-3 text-2xs text-muted-foreground">
            {{
              mode === 'exploded'
                ? 'Drag to orbit · parts sheet · hover a seam to isolate it'
                : 'Drag to orbit · approximate preview'
            }}
          </p>
        </div>

        <aside
          v-if="mode === 'exploded' && exploded"
          class="max-h-48 shrink-0 overflow-y-auto border-t p-3 md:max-h-none md:w-72 md:border-l md:border-t-0"
          data-testid="exploded-seams"
        >
          <h3 class="mb-2 text-xs font-medium">Seams ({{ seamRows.length }})</h3>
          <ul class="space-y-0.5">
            <li v-for="row in seamRows" :key="row.index">
              <button
                type="button"
                class="flex w-full items-start gap-2 rounded-sm px-2 py-1 text-left text-2xs hover:bg-accent focus-visible:bg-accent"
                :aria-pressed="focusedSeam === row.index"
                data-testid="preview-seam-row"
                @pointerenter="focusSeam(row.index)"
                @pointerleave="clearSeam"
                @focus="focusSeam(row.index)"
                @blur="clearSeam"
              >
                <span
                  class="mt-1 size-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: row.color }"
                  aria-hidden="true"
                />
                <span class="min-w-0">{{ row.sides.join('  ↔  ') }}</span>
              </button>
            </li>
          </ul>
        </aside>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs">
        <template v-if="mode === 'sewn'">
          <label class="flex items-center gap-2">
            Inflate
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="inflatePercent"
              data-testid="preview-inflate"
              @input="onInflate"
            />
            <span class="w-9 tabular-nums" data-testid="preview-inflate-value">
              {{ inflatePercent }}%
            </span>
          </label>
          <label class="flex items-center gap-1">
            <input v-model="wireframe" type="checkbox" data-testid="preview-wireframe" />
            Wireframe
          </label>
        </template>
        <Button variant="outline" size="sm" data-testid="preview-reset" @click="resetView">
          Reset view
        </Button>
        <p
          v-if="mode === 'sewn' && mesh?.simplified"
          class="text-muted-foreground"
          data-testid="preview-simplified"
        >
          Large pattern: the view is simplified.
        </p>
        <p
          v-if="mode === 'sewn' && report.errors > 0"
          class="text-destructive"
          data-testid="preview-approximate"
        >
          Not sewable: the preview is approximate.
        </p>
      </footer>
    </template>
  </div>
</template>
