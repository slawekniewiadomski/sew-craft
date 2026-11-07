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
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import type { EntityProperties } from '@/lib/entity-properties';
import type { DimensionPatch } from '@/lib/dimensions';
import { pieceById } from '@sewcraft/geometry';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';

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

function onTextContent(event: Event): void {
  emit('update-text', props.entity.id, { content: (event.target as HTMLInputElement).value });
}

function onTextAlignment(event: Event): void {
  emit('update-text', props.entity.id, {
    alignment: (event.target as HTMLSelectElement).value,
  });
}

function onTextNumber(field: 'rotation' | 'fontSize', event: Event): void {
  const text = props.entity.text!;
  const input = event.target as HTMLInputElement;
  const value = Number(input.value.trim());
  if (input.value.trim() === '' || !Number.isFinite(value)) {
    input.value = String(field === 'rotation' ? text.rotation : text.fontSize);
    return;
  }
  emit('update-text', props.entity.id, { [field]: value });
}

/**
 * Edit a circle's radius. An invalid or unchanged value snaps the field back
 * without emitting a command; a valid one is forwarded for the editor to turn
 * into a rim move or a driving-dimension update.
 */
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

    <SidebarSection
      v-if="props.entity.text"
      label="Annotation text"
      heading-id="entity-text-heading"
      data-testid="entity-text"
    >
      <dl class="space-y-2">
        <SidebarField label="Content">
          <SidebarInput
            maxlength="120"
            class="w-44"
            :value="props.entity.text.content"
            aria-label="Label content"
            data-testid="text-content"
            @change="onTextContent"
          />
        </SidebarField>
        <SidebarField label="Alignment">
          <SidebarSelect
            :value="props.entity.text.alignment"
            aria-label="Label alignment"
            data-testid="text-alignment"
            @change="onTextAlignment"
          >
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
          </SidebarSelect>
        </SidebarField>
        <SidebarField label="Rotation">
          <span class="inline-flex items-center gap-1">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="props.entity.text.rotation"
              aria-label="Label rotation in radians"
              data-testid="text-rotation"
              @change="onTextNumber('rotation', $event)"
            />
            <span class="text-2xs text-muted-foreground">rad</span>
          </span>
        </SidebarField>
        <SidebarField label="Size">
          <span class="inline-flex items-center gap-1">
            <SidebarInput
              type="number"
              min="1"
              max="100"
              step="0.5"
              class="w-20 tabular-nums"
              :value="props.entity.text.fontSize"
              aria-label="Label size in millimetres"
              data-testid="text-size"
              @change="onTextNumber('fontSize', $event)"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
          </span>
        </SidebarField>
      </dl>
    </SidebarSection>

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

    <SidebarSection label="Constraints" heading-id="entity-constraints-heading">
      <ul
        v-if="props.entity.constraints.length > 0"
        class="space-y-3"
        :aria-label="`Constraints for ${props.entity.id}`"
      >
        <li
          v-for="constraint in props.entity.constraints"
          :key="constraint.id"
          class="flex items-start justify-between gap-2"
          :data-testid="`entity-constraint-${constraint.id}`"
        >
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-1.5">
              <span class="shrink-0 text-[13px] font-medium">{{ constraint.label }}</span>
              <span class="truncate font-mono text-2xs text-muted-foreground">
                {{ constraint.id }}
              </span>
            </div>
            <p class="truncate text-2xs text-muted-foreground">
              ({{ constraint.entities.join(', ') }})
            </p>
          </div>
          <SidebarAction
            icon="delete"
            :label="`Remove constraint ${constraint.id}`"
            :data-testid="`entity-remove-constraint-${constraint.id}`"
            @click="emit('remove-constraint', constraint.id)"
          />
        </li>
      </ul>
      <SidebarEmpty v-else :message="`No constraints on this ${kindNoun}.`" />
    </SidebarSection>
  </section>
</template>
