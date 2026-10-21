<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { formatCornerRadius, parseCornerRadius } from '@/lib/corner-round';

import { Button } from './ui/button';

const props = defineProps<{
  prompt: string;
  rejection: string | null;
  ready: boolean;
  initialValue: string;
  maxRadius: number;
}>();

const emit = defineEmits<{
  apply: [value: number];
  cancel: [];
  preview: [radius: number | null];
}>();

const inputId = 'corner-round-value-input';
const raw = ref<string | number>('');
const input = ref<HTMLInputElement | null>(null);

const radius = computed(() => parseCornerRadius(String(raw.value)));
const problem = computed(() => {
  if (radius.value === null) return 'Enter a radius of at least 0.001 mm.';
  if (radius.value > props.maxRadius) {
    return `Radius ${formatCornerRadius(radius.value)} mm is too large for these lines; the maximum is ${formatCornerRadius(props.maxRadius)} mm.`;
  }
  return null;
});
const canApply = computed(() => props.ready && radius.value !== null && problem.value === null);

function preview(): void {
  emit('preview', canApply.value ? radius.value : null);
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
  if (!canApply.value) return;
  emit('apply', radius.value!);
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
        type="number"
        step="any"
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
