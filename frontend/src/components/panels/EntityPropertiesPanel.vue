<script setup lang="ts">
import type { Entity, EntityId, ParamInput, PatternDocument } from '@sewcraft/geometry';
import { computed } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import Pill from '@/components/sidebar/Pill.vue';
import type { EntityProperties } from '@/lib/entity-properties';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';

import EntityAnnotationSection from '@/components/panels/EntityAnnotationSection.vue';
import EntityConstraintsSection from '@/components/panels/EntityConstraintsSection.vue';
import EntityCornerRoundsSection from '@/components/panels/EntityCornerRoundsSection.vue';
import EntityGeometrySection from '@/components/panels/EntityGeometrySection.vue';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-role': [id: EntityId, role: 'cut' | 'construction' | 'annotation'];
  'update-text': [id: EntityId, patch: Record<string, unknown>];
  'remove-constraint': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'remove-corner-round': [id: EntityId];
  'set-circle-radius': [id: EntityId, radius: number];
}>();

function forwardText(id: EntityId, patch: Record<string, unknown>): void {
  emit('update-text', id, patch);
}

function forwardRole(id: EntityId, role: 'cut' | 'construction' | 'annotation'): void {
  emit('set-role', id, role);
}

function forwardCircleRadius(id: EntityId, radius: number): void {
  emit('set-circle-radius', id, radius);
}

function forwardCornerRadius(id: EntityId, radius: ParamInput): void {
  emit('set-corner-round-radius', id, radius);
}

const KIND_LABELS: Record<Entity['kind'], string> = {
  point: 'Point',
  line: 'Line',
  curve: 'Curve',
  arc: 'Arc',
  circle: 'Circle',
  text: 'Text',
  mark: 'Mark',
};

const KIND_NOUNS: Record<Entity['kind'], string> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
  mark: 'mark',
};

const KIND_ICONS: Record<Entity['kind'], RibbonIconName> = {
  point: 'point',
  line: 'line',
  curve: 'curve',
  arc: 'arc',
  circle: 'circle',
  text: 'text',
  mark: 'notch',
};

function kindLabel(kind: Entity['kind']): string {
  return KIND_LABELS[kind];
}

const kindNoun = computed(() => KIND_NOUNS[props.entity.kind]);
const kindIcon = computed(() => ribbonIcon(KIND_ICONS[props.entity.kind]));
</script>

<template>
  <section aria-labelledby="entity-properties-heading" data-testid="entity-properties">
    <header class="mb-3 flex flex-wrap items-center gap-1.5">
      <h2
        id="entity-properties-heading"
        class="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold"
      >
        <RibbonIcon :icon="kindIcon" :size="14" class="shrink-0 text-muted-foreground" />
        <span class="truncate">{{ kindLabel(props.entity.kind) }}</span>
        <span class="font-mono text-2xs font-normal text-muted-foreground">
          {{ props.entity.id }}
        </span>
      </h2>
      <Pill v-if="props.entity.construction" tone="neutral">Construction</Pill>
    </header>

    <p
      v-if="props.entity.geometry.kind !== 'point'"
      class="mb-3 text-2xs leading-snug text-muted-foreground"
      data-testid="entity-scope-hint"
    >
      Showing what acts on this {{ kindNoun }}. Select a point to see its constraints.
    </p>

    <EntityGeometrySection
      :entity="entity"
      :kind-label-text="kindLabel(entity.kind)"
      @set-role="forwardRole"
      @set-circle-radius="forwardCircleRadius"
    />

    <EntityAnnotationSection :entity="entity" @update-text="forwardText" />

    <EntityCornerRoundsSection
      :document="document"
      :rounds="entity.rounds"
      @set-corner-round-radius="forwardCornerRadius"
      @remove-corner-round="emit('remove-corner-round', $event)"
    />

    <EntityConstraintsSection
      :entity="entity"
      :entity-noun="kindNoun"
      @remove-constraint="emit('remove-constraint', $event)"
    />
  </section>
</template>
