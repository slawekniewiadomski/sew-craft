<script setup lang="ts">
import type { EntityProperties } from '@/lib/entity-properties';
import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';
import { formatDimensionValue } from '@/lib/dimensions';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import { computed } from 'vue';

const props = defineProps<{
  entity: EntityProperties;
  /** The entity's human label, already resolved by the panel header's map. */
  kindLabelText: string;
}>();

const emit = defineEmits<{
  'set-role': [id: string, role: 'cut' | 'construction' | 'annotation'];
  'set-circle-radius': [id: string, radius: number];
}>();

/**
 * The read-only derived arc values. Empty for every other kind and for an arc
 * whose points no longer define a circle, which is exactly when the panel shows
 * its invalid state instead.
 */
const arcRows = computed(() => {
  const arc = props.entity.arc;
  if (arc === null) return [];

  return [
    { key: 'radius', label: 'Radius', value: `${formatDimensionValue(arc.radius)} mm` },
    {
      key: 'angle',
      label: 'Included angle',
      value: `${formatDimensionValue(arc.includedAngle)}°`,
    },
    { key: 'length', label: 'Arc length', value: `${formatDimensionValue(arc.length)} mm` },
  ];
});

function lengthText(length: number | null): string {
  return length === null ? '—' : `${formatDimensionValue(length)} mm`;
}

function onRoleChange(event: Event): void {
  emit(
    'set-role',
    props.entity.id,
    (event.target as HTMLSelectElement).value as 'cut' | 'construction' | 'annotation',
  );
}

/**
 * Edit a circle's radius. An invalid or unchanged value snaps the field back
 * without emitting a command; a valid one is forwarded for the editor to turn
 * into a rim move or a driving-dimension update.
 */
function onCircleRadiusEdit(event: Event): void {
  const input = event.target as HTMLInputElement;
  const radius = parseCornerRadius(input.value);
  if (radius === null || radius === props.entity.radius) {
    input.value = props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius);
    return;
  }

  emit('set-circle-radius', props.entity.id, radius);
}
</script>

<template>
  <SidebarSection label="Geometry" heading-id="entity-geometry-heading">
    <dl class="space-y-2">
      <SidebarField label="Kind" data-testid="entity-kind">
        {{ kindLabelText }}
      </SidebarField>

      <template v-if="entity.geometry.kind === 'point'">
        <SidebarField label="X" data-testid="entity-x">
          {{ formatDimensionValue(entity.geometry.x)
          }}<span class="text-2xs text-muted-foreground"> mm</span>
        </SidebarField>
        <SidebarField label="Y" data-testid="entity-y">
          {{ formatDimensionValue(entity.geometry.y)
          }}<span class="text-2xs text-muted-foreground"> mm</span>
        </SidebarField>
        <SidebarField label="Fixed" data-testid="entity-fixed">
          {{ entity.fixed ? 'Yes' : 'No' }}
        </SidebarField>
      </template>

      <template v-else-if="entity.geometry.kind === 'line'">
        <SidebarField label="Start" mono data-testid="entity-start">
          {{ entity.geometry.start }}
        </SidebarField>
        <SidebarField label="End" mono data-testid="entity-end">
          {{ entity.geometry.end }}
        </SidebarField>
        <SidebarField label="Length" data-testid="entity-length">
          {{ lengthText(entity.length) }}
        </SidebarField>
      </template>

      <template v-else-if="entity.geometry.kind === 'arc'">
        <SidebarField label="Start" mono data-testid="entity-start">
          {{ entity.geometry.start }}
        </SidebarField>
        <SidebarField label="End" mono data-testid="entity-end">
          {{ entity.geometry.end }}
        </SidebarField>
        <SidebarField label="Through" mono data-testid="entity-through">
          {{ entity.geometry.through }}
        </SidebarField>
        <SidebarField
          v-for="row in arcRows"
          :key="row.key"
          :label="row.label"
          :data-testid="`entity-arc-${row.key}`"
        >
          {{ row.value }}
        </SidebarField>
        <p
          v-if="arcRows.length === 0"
          class="text-2xs text-destructive"
          data-testid="entity-arc-invalid"
        >
          Invalid: the three points are collinear.
        </p>
      </template>

      <template v-else-if="entity.geometry.kind === 'curve'">
        <SidebarField
          v-for="point in ['p0', 'p1', 'p2', 'p3'] as const"
          :key="point"
          :label="point"
          mono
        >
          {{ entity.geometry[point] }}
        </SidebarField>
      </template>

      <template v-else-if="entity.geometry.kind === 'circle'">
        <SidebarField label="Centre" mono data-testid="entity-circle-center">
          {{ entity.geometry.center }}
        </SidebarField>
        <SidebarField label="Rim" mono data-testid="entity-circle-rim">
          {{ entity.geometry.rim }}
        </SidebarField>
        <SidebarField label="Radius">
          <span class="inline-flex items-center gap-1">
            <SidebarInput
              type="number"
              min="0.001"
              step="0.001"
              class="w-24 tabular-nums"
              :value="entity.radius === null ? '' : formatCornerRadius(entity.radius)"
              :aria-label="`Radius for circle ${entity.id} (mm)`"
              data-testid="entity-circle-radius"
              @change="onCircleRadiusEdit"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
          </span>
        </SidebarField>
      </template>

      <SidebarField v-if="entity.kind !== 'text'" label="Role">
        <SidebarSelect
          class="w-28"
          :value="entity.role"
          :aria-label="`Role for ${entity.id}`"
          data-testid="entity-role"
          @change="onRoleChange"
        >
          <option value="cut">Cut</option>
          <option value="construction">Construction</option>
          <option value="annotation">Annotation</option>
        </SidebarSelect>
      </SidebarField>
    </dl>
  </SidebarSection>
</template>
