<script setup lang="ts">
import type { AllowanceKind, Piece } from '@sewcraft/geometry';
import { computed } from 'vue';

import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarField from '@/components/sidebar/SidebarField.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import { parseAllowanceWidth } from '@/lib/allowance-width';

const props = withDefaults(
  defineProps<{
    piece: Piece;
    /** The preset the piece would inherit when it has no override. */
    inherited: AllowanceChoice;
    /** Prefix for the controls' data-testids. */
    prefix?: string;
    readOnly?: boolean;
  }>(),
  { prefix: 'piece-parameters', readOnly: false },
);

const emit = defineEmits<{
  'update-piece': [
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ];
  'set-default': [
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: number; kind: AllowanceKind },
  ];
}>();

const ALLOWANCE_KINDS: { value: AllowanceKind; label: string }[] = [
  { value: 'seam', label: 'Seam' },
  { value: 'single', label: 'Single fold' },
  { value: 'double', label: 'Double fold' },
];

const defaultMode = computed<'inherit' | 'none' | 'preset'>(() => {
  if (props.piece.defaults === undefined) return 'inherit';
  return props.piece.defaults.allowance === null ? 'none' : 'preset';
});

const defaultWidth = computed(() =>
  props.piece.defaults?.allowance === null || props.piece.defaults === undefined
    ? props.inherited.width
    : props.piece.defaults.allowance.width,
);

const defaultKind = computed<AllowanceKind>(() => {
  const preset = props.piece.defaults?.allowance;
  if (preset === null || preset === undefined)
    return props.inherited.kind === 'none' ? 'seam' : props.inherited.kind;
  return preset.kind ?? 'seam';
});

function testId(suffix: string): string {
  return `${props.prefix}-${suffix}`;
}

function nameChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim();
  if (name === (props.piece.name ?? '')) return;
  emit('update-piece', { name: name === '' ? null : name });
}

function quantityChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const quantity = Number(input.value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    input.value = String(props.piece.quantity ?? 1);
    return;
  }
  if (quantity === (props.piece.quantity ?? 1)) return;
  emit('update-piece', { quantity });
}

function notesChanged(event: Event): void {
  const input = event.target as HTMLTextAreaElement;
  const notes = input.value.trim();
  if (notes === (props.piece.notes ?? '')) return;
  emit('update-piece', { notes: notes === '' ? null : notes });
}

function fabricChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const fabric = input.value.trim();
  if (fabric === (props.piece.fabric ?? '')) return;
  emit('update-piece', { fabric: fabric === '' ? null : fabric });
}

function colorChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const color = input.value.toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    input.value = props.piece.color ?? '#000000';
    return;
  }
  if (color === (props.piece.color ?? '')) return;
  emit('update-piece', { color });
}

function clearColor(): void {
  emit('update-piece', { color: null });
}

function modeChanged(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as 'inherit' | 'none' | 'preset';
  if (mode === 'inherit') {
    emit('set-default', { mode: 'inherit' });
    return;
  }
  if (mode === 'none') {
    emit('set-default', { mode: 'none' });
    return;
  }
  emit('set-default', {
    mode: 'preset',
    width: defaultWidth.value > 0 ? defaultWidth.value : 10,
    kind: defaultKind.value,
  });
}

function widthChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const width = parseAllowanceWidth(input.value);
  if (width === null) {
    input.value = String(defaultWidth.value);
    return;
  }
  /* v8 ignore next -- the width input renders only in preset mode */
  if (defaultMode.value !== 'preset' || width === defaultWidth.value) return;
  emit('set-default', { mode: 'preset', width, kind: defaultKind.value });
}

function kindChanged(event: Event): void {
  const kind = (event.target as HTMLSelectElement).value as AllowanceKind;
  if (defaultMode.value !== 'preset' || kind === defaultKind.value) return;
  emit('set-default', {
    mode: 'preset',
    width: defaultWidth.value > 0 ? defaultWidth.value : 10,
    kind,
  });
}
</script>

<template>
  <fieldset class="contents" :disabled="props.readOnly">
    <dl class="space-y-2" :data-testid="testId('form')">
      <SidebarField label="Name">
        <SidebarInput
          :value="props.piece.name ?? ''"
          :aria-label="`Name for piece ${props.piece.id}`"
          :data-testid="testId('name')"
          @change="nameChanged"
        />
      </SidebarField>
      <SidebarField label="Quantity">
        <SidebarInput
          type="number"
          min="1"
          step="1"
          class="w-20 tabular-nums"
          :value="props.piece.quantity ?? 1"
          :aria-label="`Quantity for piece ${props.piece.id}`"
          :data-testid="testId('quantity')"
          @change="quantityChanged"
        />
      </SidebarField>
      <SidebarField label="Default allowance">
        <div class="flex flex-wrap items-center justify-end gap-1.5">
          <SidebarSelect
            :value="defaultMode"
            :aria-label="`Default allowance mode for piece ${props.piece.id}`"
            :data-testid="testId('default-mode')"
            @change="modeChanged"
          >
            <option value="inherit">Inherit</option>
            <option value="none">None</option>
            <option value="preset">Preset</option>
          </SidebarSelect>
          <template v-if="defaultMode === 'preset'">
            <SidebarSelect
              :value="defaultKind"
              :aria-label="`Default allowance kind for piece ${props.piece.id}`"
              :data-testid="testId('default-kind')"
              @change="kindChanged"
            >
              <option v-for="option in ALLOWANCE_KINDS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </SidebarSelect>
            <SidebarInput
              type="number"
              min="0.1"
              step="0.1"
              class="w-16 tabular-nums"
              :value="defaultWidth"
              :aria-label="`Default allowance width for piece ${props.piece.id}`"
              :data-testid="testId('default-width')"
              @change="widthChanged"
            />
            <span class="text-2xs text-muted-foreground">mm</span>
          </template>
        </div>
      </SidebarField>
      <SidebarField label="Fabric">
        <SidebarInput
          maxlength="120"
          :value="props.piece.fabric ?? ''"
          :aria-label="`Fabric for piece ${props.piece.id}`"
          :data-testid="testId('fabric')"
          @change="fabricChanged"
        />
      </SidebarField>
      <SidebarField label="Colour">
        <div class="flex items-center gap-1.5">
          <input
            type="color"
            class="h-7 w-10 rounded-sm border bg-transparent"
            :value="props.piece.color ?? '#94a3b8'"
            :aria-label="`Colour for piece ${props.piece.id}`"
            :data-testid="testId('color')"
            @change="colorChanged"
          />
          <SidebarButton :data-testid="testId('color-clear')" @click="clearColor">
            Clear
          </SidebarButton>
        </div>
      </SidebarField>
      <SidebarField label="Notes">
        <textarea
          rows="2"
          maxlength="500"
          class="w-44 max-w-full rounded-sm border px-2 py-1 text-xs"
          :value="props.piece.notes ?? ''"
          :aria-label="`Notes for piece ${props.piece.id}`"
          :data-testid="testId('notes')"
          @change="notesChanged"
        />
      </SidebarField>
    </dl>
  </fieldset>
</template>
