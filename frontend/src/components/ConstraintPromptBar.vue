<script setup lang="ts">
import type { ConstraintType } from '@sewcraft/geometry';
import { computed, nextTick, ref, watch } from 'vue';

import { constraintValueSpec } from '@/lib/constraint-tools';

import { Button } from './ui/button';

const props = defineProps<{
  type: ConstraintType;
  prompt: string;
  rejection: string | null;
  valueReady: boolean;
  initialValue: string;
}>();

const emit = defineEmits<{
  apply: [value: number];
  cancel: [];
}>();

const inputId = 'constraint-value-input';
const raw = ref<string | number>('');
const invalid = ref(false);
const input = ref<HTMLInputElement | null>(null);
const spec = computed(() => constraintValueSpec(props.type));
const canApply = computed(() => String(raw.value).trim() !== '' && !invalid.value);

watch(
  () => props.valueReady,
  async (ready) => {
    if (!ready) return;
    raw.value = props.initialValue;
    invalid.value = false;
    await nextTick();
    input.value?.focus();
  },
  { immediate: true },
);

function apply(): void {
  const current = spec.value!;
  const text = String(raw.value).trim();
  const value = Number(text);
  invalid.value = text === '' || !current.isValid(value);
  if (invalid.value) return;

  emit('apply', current.toCommandValue(value));
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1"
    data-testid="constraint-prompt-bar"
  >
    <span class="text-sm" role="status" aria-live="polite" data-testid="constraint-prompt">
      {{ prompt }}
    </span>

    <span v-if="rejection" class="text-sm text-destructive" data-testid="constraint-rejection">
      {{ rejection }}
    </span>

    <form
      v-if="valueReady && spec"
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="apply"
    >
      <label :for="inputId" class="text-sm">{{ spec.label }}</label>
      <input
        :id="inputId"
        ref="input"
        v-model="raw"
        type="number"
        step="any"
        class="w-28 rounded-md border px-2 py-1 text-sm"
        data-testid="constraint-value"
        :aria-invalid="invalid ? 'true' : undefined"
        @input="invalid = false"
      />
      <p v-if="invalid" class="text-sm text-destructive" data-testid="constraint-value-error">
        {{ spec.invalidMessage }}
      </p>
      <Button type="submit" size="sm" :disabled="!canApply" data-testid="constraint-apply">
        Apply
      </Button>
    </form>

    <Button variant="outline" size="sm" data-testid="constraint-cancel" @click="emit('cancel')">
      Cancel
    </Button>
  </div>
</template>
