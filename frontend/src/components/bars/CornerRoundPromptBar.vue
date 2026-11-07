<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import type { ParamInput, VariableScope } from '@sewcraft/geometry';

import {
  formatCornerRadius,
  parseCornerRadiusField,
  type CornerRadiusField,
} from '@/lib/corner-round';

import { Button } from '@/components/ui/button';

const props = defineProps<{
  prompt: string;
  rejection: string | null;
  ready: boolean;
  initialValue: string;
  maxRadius: number;
  /** The document whose variables a radius formula may name. */
  document: VariableScope;
}>();

const emit = defineEmits<{
  apply: [value: ParamInput];
  cancel: [];
  preview: [radius: number | null];
}>();

const inputId = 'corner-round-value-input';
const raw = ref<string | number>('');
const input = ref<HTMLInputElement | null>(null);

const field = computed<CornerRadiusField>(() =>
  parseCornerRadiusField(props.document, String(raw.value)),
);
const problem = computed(() => {
  if (field.value.kind === 'invalid') return field.value.message;
  if (field.value.radius > props.maxRadius) {
    return `Radius ${formatCornerRadius(field.value.radius)} mm is too large for these lines; the maximum is ${formatCornerRadius(props.maxRadius)} mm.`;
  }
  return null;
});
const readyParam = computed<{ param: ParamInput; radius: number } | null>(() => {
  const current = field.value;
  if (!props.ready || current.kind === 'invalid' || current.radius > props.maxRadius) return null;
  return { param: current.param, radius: current.radius };
});
const canApply = computed(() => readyParam.value !== null);

function preview(): void {
  emit('preview', readyParam.value?.radius ?? null);
}

watch(
  () => props.ready,
  async (ready) => {
    raw.value = ready ? props.initialValue : '';
    if (!ready) {
      emit('preview', null);
      return;
    }

    preview();
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
  { immediate: true },
);

function apply(): void {
  if (readyParam.value === null) return;
  emit('apply', readyParam.value.param);
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1"
    data-testid="corner-round-prompt-bar"
  >
    <span class="text-sm" role="status" aria-live="polite" data-testid="corner-round-prompt">
      {{ prompt }}
    </span>

    <span v-if="rejection" class="text-sm text-destructive" data-testid="corner-round-rejection">
      {{ rejection }}
    </span>

    <form v-if="ready" class="flex flex-wrap items-center gap-2" @submit.prevent="apply">
      <label :for="inputId" class="text-sm">Radius (mm)</label>
      <input
        :id="inputId"
        ref="input"
        v-model="raw"
        type="text"
        class="w-28 rounded-md border px-2 py-1 text-sm"
        data-testid="corner-round-value"
        :aria-invalid="problem ? 'true' : undefined"
        @input="preview"
      />
      <span class="text-xs text-muted-foreground" data-testid="corner-round-max">
        Maximum {{ formatCornerRadius(maxRadius) }} mm
      </span>
      <p v-if="problem" class="text-sm text-destructive" data-testid="corner-round-value-error">
        {{ problem }}
      </p>
      <Button type="submit" size="sm" :disabled="!canApply" data-testid="corner-round-apply">
        Apply
      </Button>
    </form>

    <Button variant="outline" size="sm" data-testid="corner-round-cancel" @click="emit('cancel')">
      Cancel
    </Button>
  </div>
</template>
