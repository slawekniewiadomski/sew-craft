<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import BarShell from '@/components/bars/BarShell.vue';
import { Button } from '@/components/ui/button';

/**
 * The prompt and value form shared by the constraint and corner-round bars.
 * Validation stays with the caller; this owns the strip, the field, its focus
 * and the apply/cancel actions.
 */
const props = withDefaults(
  defineProps<{
    /** Prefix for every `data-testid` in the bar (`constraint`, `corner-round`). */
    testIdPrefix: string;
    prompt: string;
    rejection: string | null;
    /** Whether the picked geometry is complete enough to show the form. */
    ready: boolean;
    label: string;
    inputId: string;
    /** Why the current value cannot be applied, or `null` when it can. */
    error: string | null;
    canApply: boolean;
    inputType?: 'text' | 'number';
    /** Select the field's text when it becomes ready, for quick replacement. */
    selectOnReady?: boolean;
  }>(),
  { inputType: 'text', selectOnReady: false },
);

const raw = defineModel<string | number>({ required: true });

const emit = defineEmits<{
  submit: [];
  cancel: [];
  /** The maker typed; the caller clears its error or refreshes its preview. */
  input: [];
}>();

const input = ref<HTMLInputElement | null>(null);

watch(
  () => props.ready,
  async (ready) => {
    if (!ready) return;
    await nextTick();
    input.value?.focus();
    if (props.selectOnReady) input.value?.select();
  },
  { immediate: true },
);
</script>

<template>
  <BarShell :data-testid="`${testIdPrefix}-prompt-bar`">
    <span class="text-sm" role="status" aria-live="polite" :data-testid="`${testIdPrefix}-prompt`">
      {{ prompt }}
    </span>

    <span
      v-if="rejection"
      class="text-sm text-destructive"
      :data-testid="`${testIdPrefix}-rejection`"
    >
      {{ rejection }}
    </span>

    <form v-if="ready" class="flex flex-wrap items-center gap-2" @submit.prevent="emit('submit')">
      <label :for="inputId" class="text-sm">{{ label }}</label>
      <input
        :id="inputId"
        ref="input"
        v-model="raw"
        :type="inputType"
        step="any"
        class="w-28 rounded-md border px-2 py-1 text-sm"
        :data-testid="`${testIdPrefix}-value`"
        :aria-invalid="error !== null ? 'true' : undefined"
        @input="emit('input')"
      />
      <slot name="hint" />
      <p
        v-if="error !== null"
        class="text-sm text-destructive"
        :data-testid="`${testIdPrefix}-value-error`"
      >
        {{ error }}
      </p>
      <Button type="submit" size="sm" :disabled="!canApply" :data-testid="`${testIdPrefix}-apply`">
        Apply
      </Button>
    </form>

    <Button
      variant="outline"
      size="sm"
      :data-testid="`${testIdPrefix}-cancel`"
      @click="emit('cancel')"
    >
      Cancel
    </Button>
  </BarShell>
</template>
