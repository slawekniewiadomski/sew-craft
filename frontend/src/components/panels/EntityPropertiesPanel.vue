<script setup lang="ts">
import type {
  AllowanceKind,
  Entity,
  EntityId,
  ParamInput,
  PatternDocument,
} from '@sewcraft/geometry';
import { computed } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import Pill from '@/components/sidebar/Pill.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import type { EntityProperties } from '@/lib/entity-properties';
import type { DimensionPatch } from '@/lib/dimensions';
import { pieceById } from '@sewcraft/geometry';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';

import EntityAnnotationSection from '@/components/panels/EntityAnnotationSection.vue';
import EntityConstraintsSection from '@/components/panels/EntityConstraintsSection.vue';
import EntityDimensionsSection from '@/components/panels/EntityDimensionsSection.vue';
import EntityGeometrySection from '@/components/panels/EntityGeometrySection.vue';
import PiecePanel from '@/components/panels/PiecePanel.vue';

const props = defineProps<{
  /** The live document; the panel never copies it, every render re-reads props. */
  document: PatternDocument;
  entity: EntityProperties;
}>();

const emit = defineEmits<{
  'set-role': [id: EntityId, role: 'cut' | 'construction' | 'annotation'];
  'update-text': [id: EntityId, patch: Record<string, unknown>];
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
  'remove-piece': [id: EntityId];
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

function forwardDimensionUpdate(id: EntityId, patch: DimensionPatch): void {
  emit('update-dimension', id, patch);
}

function forwardCornerRadius(id: EntityId, radius: ParamInput): void {
  emit('set-corner-round-radius', id, radius);
}

/** The stored piece behind the summary, so its new parameters can be edited. */
const storedPiece = computed(() =>
  /* v8 ignore next -- 0.4 geometry always names an existing piece */
  props.entity.piece === null ? null : (pieceById(props.document, props.entity.piece.id) ?? null),
);

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

    <PiecePanel
      v-if="props.entity.piece && storedPiece"
      :summary="props.entity.piece"
      :piece="storedPiece"
      :document="props.document"
      :default-allowance="defaultAllowanceSummary(props.document)"
      :inherited-default="defaultAllowanceSummary(props.document)"
      label="Piece"
      @update-piece="(id, patch) => emit('update-piece', id, patch)"
      @set-piece-default="(piece, value) => emit('set-piece-default', piece, value)"
      @set-piece-allowance="(piece, edge, value) => emit('set-piece-allowance', piece, edge, value)"
      @set-all-allowances="(piece, value) => emit('set-all-allowances', piece, value)"
      @remove-piece="(id) => emit('remove-piece', id)"
    />

    <EntityDimensionsSection
      :document="document"
      :entity="entity"
      :entity-noun="kindNoun"
      @update-dimension="forwardDimensionUpdate"
      @remove-constraint="emit('remove-constraint', $event)"
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
