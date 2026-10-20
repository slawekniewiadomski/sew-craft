<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

import { parseSeamWidth } from '@/lib/seam-width';

const props = defineProps<{
  width: number;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  commit: [width: number];
  cancel: [];
}>();

const raw = ref(String(props.width));
const invalid = ref(false);
const input = ref<HTMLInputElement | null>(null);
let settled = false;

onMounted(async () => {
  await nextTick();
  input.value?.focus();
  input.value?.select();
});

/**
 * Emit at most one outcome. Enter commits and then the input unmounts, which
 * can fire `blur`; the guard keeps that from emitting a second outcome.
 */
function settle(action: () => void): void {
  if (settled) return;
  settled = true;
  action();
}

/** Enter / submit: commit a valid changed width, keep editing an invalid one. */
function submit(): void {
  const value = parseSeamWidth(raw.value);
  if (value === null) {
    invalid.value = true;
    return;
  }
  if (value === props.width) {
    settle(() => emit('cancel'));
    return;
  }
  settle(() => emit('commit', value));
}

function cancel(): void {
  settle(() => emit('cancel'));
}

/** Blur: commit a valid value and discard an invalid or unchanged one. */
function onBlur(): void {
  const value = parseSeamWidth(raw.value);
  if (value === null || value === props.width) {
    cancel();
    return;
  }
  settle(() => emit('commit', value));
}

function onInput(event: Event): void {
  raw.value = (event.target as HTMLInputElement).value;
  invalid.value = false;
}
</script>

<template>
  <form
    class="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-background px-1 py-0.5 text-xs shadow-sm"
    :style="{ left: `${x}px`, top: `${y}px` }"
    data-testid="seam-width-editor"
    @submit.prevent="submit"
    @pointerdown.stop
    @dblclick.stop.prevent
  >
    <span class="relative flex items-center gap-1">
      <input
        ref="input"
        :value="raw"
        type="text"
        inputmode="decimal"
        class="w-12 rounded-sm border-0 bg-transparent px-1 py-0 text-right outline-none"
        aria-label="Allowance width in millimetres"
        data-testid="seam-width-input"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-describedby="invalid ? 'seam-width-error' : undefined"
        @input="onInput"
        @keydown.enter.prevent.stop="submit"
        @keydown.esc.prevent.stop="cancel"
        @blur="onBlur"
      />
      <span class="text-muted-foreground">mm</span>
      <span
        v-if="invalid"
        id="seam-width-error"
        class="absolute left-0 top-full mt-1 whitespace-nowrap rounded-sm bg-background px-1 py-0.5 text-destructive shadow-sm"
        role="alert"
        data-testid="seam-width-error"
      >
        Use a width greater than 0.
      </span>
    </span>
  </form>
</template>
