<script setup lang="ts">
import type { AllowanceKind, Assembly, EntityId, PatternDocument } from '@sewcraft/geometry';
import { computed } from 'vue';

import PieceParametersForm from '@/components/PieceParametersForm.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSection from '@/components/sidebar/SidebarSection.vue';
import { defaultAllowanceSummary } from '@/lib/allowance-defaults';
import { formatDimensionValue } from '@/lib/dimensions';
import { tabLabel } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    assembly: Assembly;
    selectedInstanceId?: EntityId | null;
    readOnly?: boolean;
  }>(),
  { selectedInstanceId: null, readOnly: false },
);

const emit = defineEmits<{
  'update-assembly': [name: string];
  'update-instance': [patch: { x?: number; y?: number; rotation?: number; mirrored?: boolean }];
  'update-piece': [
    piece: EntityId,
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ];
  'set-default': [
    piece: EntityId,
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: number; kind: AllowanceKind },
  ];
  'open-piece': [piece: EntityId];
  'remove-instance': [instance: EntityId];
}>();

const instance = computed(
  () => props.assembly.instances.find((entry) => entry.id === props.selectedInstanceId) ?? null,
);

const piece = computed(() =>
  instance.value === null
    ? null
    : (props.document.pieces.find((candidate) => candidate.id === instance.value!.piece) ?? null),
);

const inherited = computed(() => defaultAllowanceSummary(props.document));

/** Rotation is stored in radians and edited in degrees. */
function degrees(rotation: number | undefined): string {
  return formatDimensionValue(((rotation ?? 0) * 180) / Math.PI);
}

function coordinate(value: number | undefined): string {
  /* v8 ignore next -- an instance always stores x and y */
  return formatDimensionValue(value ?? 0);
}

function numberFrom(event: Event): number | null {
  const text = (event.target as HTMLInputElement).value.trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function xChanged(event: Event): void {
  const x = numberFrom(event);
  if (x === null || x === instance.value?.x) return;
  emit('update-instance', { x });
}

function yChanged(event: Event): void {
  const y = numberFrom(event);
  if (y === null || y === instance.value?.y) return;
  emit('update-instance', { y });
}

function angleChanged(event: Event): void {
  const angle = numberFrom(event);
  if (angle === null) return;
  const rotation = (angle * Math.PI) / 180;
  if (rotation === (instance.value?.rotation ?? 0)) return;
  emit('update-instance', { rotation });
}

function toggleMirror(): void {
  emit('update-instance', { mirrored: instance.value?.mirrored !== true });
}

function assemblyName(event: Event): void {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name === '' || name === props.assembly.name) return;
  emit('update-assembly', name);
}

function piecePatch(patch: {
  name?: string | null;
  quantity?: number | null;
  notes?: string | null;
  fabric?: string | null;
  color?: string | null;
}): void {
  /* v8 ignore next -- the piece section renders only when the piece exists */
  if (piece.value === null) return;
  emit('update-piece', piece.value.id, patch);
}

function pieceDefault(
  value:
    { mode: 'inherit' } | { mode: 'none' } | { mode: 'preset'; width: number; kind: AllowanceKind },
): void {
  /* v8 ignore next -- the piece section renders only when the piece exists */
  if (piece.value === null) return;
  emit('set-default', piece.value.id, value);
}
</script>

<template>
  <div>
    <SidebarSection label="Selection" data-testid="assembly-selection">
      <p v-if="instance === null" class="text-2xs text-muted-foreground">
        Select an instance to inspect it.
      </p>
      <template v-else>
        <dl class="space-y-2">
          <SidebarField label="X">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="coordinate(instance.x)"
              aria-label="Instance X"
              data-testid="instance-x"
              @change="xChanged"
            />
          </SidebarField>
          <SidebarField label="Y">
            <SidebarInput
              type="number"
              step="0.1"
              class="w-20 tabular-nums"
              :value="coordinate(instance.y)"
              aria-label="Instance Y"
              data-testid="instance-y"
              @change="yChanged"
            />
          </SidebarField>
          <SidebarField label="Angle">
            <SidebarInput
              type="number"
              step="1"
              class="w-20 tabular-nums"
              :value="degrees(instance.rotation)"
              aria-label="Instance angle in degrees"
              data-testid="instance-angle"
              @change="angleChanged"
            />
          </SidebarField>
        </dl>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <SidebarButton
            :aria-pressed="instance.mirrored === true ? 'true' : 'false'"
            :class="instance.mirrored === true ? 'bg-accent text-accent-foreground' : ''"
            data-testid="instance-mirror"
            @click="toggleMirror"
          >
            {{ instance.mirrored === true ? 'Mirrored' : 'Mirror' }}
          </SidebarButton>
          <SidebarButton
            :data-testid="`instance-open-piece-${instance.piece}`"
            @click="emit('open-piece', instance.piece)"
          >
            Open piece tab
          </SidebarButton>
          <SidebarButton
            data-testid="instance-remove"
            @click="emit('remove-instance', instance.id)"
          >
            Remove instance
          </SidebarButton>
        </div>
      </template>
    </SidebarSection>

    <SidebarSection v-if="piece !== null" label="Piece" data-testid="assembly-piece">
      <PieceParametersForm
        :piece="piece"
        :inherited="inherited"
        :read-only="props.readOnly"
        prefix="assembly-piece"
        @update-piece="piecePatch"
        @set-default="pieceDefault"
      />
    </SidebarSection>

    <SidebarSection label="Assembly" data-testid="assembly-details">
      <dl class="space-y-2">
        <SidebarField label="Name">
          <SidebarInput
            maxlength="80"
            :value="props.assembly.name"
            :aria-label="`Name for assembly ${props.assembly.id}`"
            data-testid="assembly-name"
            @change="assemblyName"
          />
        </SidebarField>
        <SidebarField label="Placed">
          <span data-testid="assembly-instance-count">
            {{ props.assembly.instances.length }}
            {{ props.assembly.instances.length === 1 ? 'instance' : 'instances' }}
          </span>
        </SidebarField>
        <SidebarField label="Tab">
          <span data-testid="assembly-tab-label">
            {{ tabLabel(props.document, { kind: 'assembly', id: props.assembly.id }) }}
          </span>
        </SidebarField>
      </dl>
    </SidebarSection>
  </div>
</template>
