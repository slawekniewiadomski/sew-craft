<script setup lang="ts">
import {
  drapeAssembly,
  sewabilityReport,
  type Assembly,
  type PatternDocument,
} from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Button } from '@/components/ui/button';
import {
  DEFAULT_PREVIEW_VIEW,
  clampPreviewPitch,
  projectMesh,
  type PreviewView,
} from '@/lib/preview-mesh';

const props = defineProps<{
  document: PatternDocument;
  assembly: Assembly;
}>();

const emit = defineEmits<{ close: [] }>();

const inflatePercent = ref(100);
const wireframe = ref(false);
const view = ref<PreviewView>({ ...DEFAULT_PREVIEW_VIEW });

/** The mesh is recomputed whenever the slider settles; the camera only rotates. */
const mesh = computed(() =>
  drapeAssembly(props.document, props.assembly, { inflate: inflatePercent.value / 100 }),
);
// The SVG is only rendered while a mesh exists, so these computeds never run
// for the empty state; the assertion documents that invariant.
const projection = computed(() => projectMesh(mesh.value!, view.value));
const report = computed(() => sewabilityReport(props.document, props.assembly));

const viewBox = computed(() => {
  const bounds = projection.value.bounds;
  return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
});

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
      <h2 id="preview-title" class="text-sm font-medium">Preview · {{ props.assembly.name }}</h2>
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
      v-if="mesh === null"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      data-testid="preview-empty"
    >
      Nothing to preview.
    </p>

    <template v-else>
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
          <polygon
            v-for="(polygon, index) in projection.polygons"
            :key="index"
            :points="polygon.points"
            :fill="wireframe ? 'none' : polygon.fill"
            :stroke="wireframe ? polygon.fill : 'none'"
            :stroke-width="wireframe ? 0.15 : 0"
            stroke-linejoin="round"
            :data-testid="`preview-face-${polygon.panel}`"
          />
        </svg>
        <p class="pointer-events-none absolute bottom-2 left-3 text-2xs text-muted-foreground">
          Drag to orbit · approximate preview
        </p>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs">
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
        <Button variant="outline" size="sm" data-testid="preview-reset" @click="resetView">
          Reset view
        </Button>
        <p v-if="mesh.simplified" class="text-muted-foreground" data-testid="preview-simplified">
          Large pattern: the view is simplified.
        </p>
        <p v-if="report.errors > 0" class="text-destructive" data-testid="preview-approximate">
          Not sewable: the preview is approximate.
        </p>
      </footer>
    </template>
  </div>
</template>
