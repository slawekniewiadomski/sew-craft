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
import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';
import type { EntityProperties } from '@/lib/entity-properties';
import { formatDimensionValue, type DimensionPatch } from '@/lib/dimensions';
import { pieceById } from '@sewcraft/geometry';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';
import {} from '@/lib/formula';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';

import EntityDimensionsSection from '@/components/panels/EntityDimensionsSection.vue';
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

const kindNoun = computed(() => KIND_NOUNS[props.entity.kind]);
const kindIcon = computed(() => ribbonIcon(KIND_ICONS[props.entity.kind]));

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

function kindLabel(kind: Entity['kind']): string {
  return KIND_LABELS[kind];
}

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

    <SidebarSection label="Geometry" heading-id="entity-geometry-heading">
      <dl class="space-y-2">
        <SidebarField label="Kind" data-testid="entity-kind">
          {{ kindLabel(props.entity.kind) }}
        </SidebarField>

        <template v-if="props.entity.geometry.kind === 'point'">
          <SidebarField label="X" data-testid="entity-x">
            {{ formatDimensionValue(props.entity.geometry.x)
            }}<span class="text-2xs text-muted-foreground"> mm</span>
          </SidebarField>
          <SidebarField label="Y" data-testid="entity-y">
            {{ formatDimensionValue(props.entity.geometry.y)
            }}<span class="text-2xs text-muted-foreground"> mm</span>
          </SidebarField>
          <SidebarField label="Fixed" data-testid="entity-fixed">
            {{ props.entity.fixed ? 'Yes' : 'No' }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'line'">
          <SidebarField label="Start" mono data-testid="entity-start">
            {{ props.entity.geometry.start }}
          </SidebarField>
          <SidebarField label="End" mono data-testid="entity-end">
            {{ props.entity.geometry.end }}
          </SidebarField>
          <SidebarField label="Length" data-testid="entity-length">
            {{ lengthText(props.entity.length) }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'arc'">
          <SidebarField label="Start" mono data-testid="entity-start">
            {{ props.entity.geometry.start }}
          </SidebarField>
          <SidebarField label="End" mono data-testid="entity-end">
            {{ props.entity.geometry.end }}
          </SidebarField>
          <SidebarField label="Through" mono data-testid="entity-through">
            {{ props.entity.geometry.through }}
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

        <template v-else-if="props.entity.geometry.kind === 'curve'">
          <SidebarField
            v-for="point in ['p0', 'p1', 'p2', 'p3'] as const"
            :key="point"
            :label="point"
            mono
          >
            {{ props.entity.geometry[point] }}
          </SidebarField>
        </template>

        <template v-else-if="props.entity.geometry.kind === 'circle'">
          <SidebarField label="Centre" mono data-testid="entity-circle-center">
            {{ props.entity.geometry.center }}
          </SidebarField>
          <SidebarField label="Rim" mono data-testid="entity-circle-rim">
            {{ props.entity.geometry.rim }}
          </SidebarField>
          <SidebarField label="Radius">
            <span class="inline-flex items-center gap-1">
              <SidebarInput
                type="number"
                min="0.001"
                step="0.001"
                class="w-24 tabular-nums"
                :value="props.entity.radius === null ? '' : formatCornerRadius(props.entity.radius)"
                :aria-label="`Radius for circle ${props.entity.id} (mm)`"
                data-testid="entity-circle-radius"
                @change="onCircleRadiusEdit"
              />
              <span class="text-2xs text-muted-foreground">mm</span>
            </span>
          </SidebarField>
        </template>

        <SidebarField v-if="props.entity.kind !== 'text'" label="Role">
          <SidebarSelect
            class="w-28"
            :value="props.entity.role"
            :aria-label="`Role for ${props.entity.id}`"
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
