<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { ParamInput, VariableScope } from '@sewcraft/geometry';

import PromptBar from '@/components/bars/PromptBar.vue';
import {
  formatCornerRadius,
  parseCornerRadiusField,
  type CornerRadiusField,
} from '@/lib/corner-round';

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
  (ready) => {
    raw.value = ready ? props.initialValue : '';
    if (!ready) {
      emit('preview', null);
      return;
    }

    preview();
  },
  { immediate: true },
);

function apply(): void {
  if (readyParam.value === null) return;
  emit('apply', readyParam.value.param);
}
</script>

<template>
  <PromptBar
    v-model="raw"
    test-id-prefix="corner-round"
    :prompt="prompt"
    :rejection="rejection"
    :ready="ready"
    label="Radius (mm)"
    :input-id="inputId"
    :error="problem"
    :can-apply="canApply"
    select-on-ready
    @input="preview"
    @submit="apply"
    @cancel="emit('cancel')"
  >
    <template #hint>
      <span class="text-xs text-muted-foreground" data-testid="corner-round-max">
        Maximum {{ formatCornerRadius(maxRadius) }} mm
      </span>
    </template>
  </PromptBar>
</template>
