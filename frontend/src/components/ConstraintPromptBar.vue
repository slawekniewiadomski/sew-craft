<script setup lang="ts">
import type { ConstraintType, ParamInput, PatternDocument } from '@sewcraft/geometry';
import { computed, nextTick, ref, watch } from 'vue';

import { constraintValueSpec } from '@/lib/constraint-tools';
import { formulaIssue, parseParamEdit } from '@/lib/formula';

import { Button } from './ui/button';

const props = defineProps<{
  type: ConstraintType;
  prompt: string;
  rejection: string | null;
  valueReady: boolean;
  initialValue: string;
  /** The document whose variables a formula may name. */
  document?: PatternDocument;
}>();

const emit = defineEmits<{
  apply: [value: ParamInput];
  cancel: [];
}>();

const inputId = 'constraint-value-input';
const raw = ref<string | number>('');
/** Why the typed value cannot be applied, or `null` when it can. */
const error = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
const spec = computed(() => constraintValueSpec(props.type));
const canApply = computed(() => String(raw.value).trim() !== '' && error.value === null);

watch(
  () => props.valueReady,
  async (ready) => {
    if (!ready) return;
    raw.value = props.initialValue;
    error.value = null;
    await nextTick();
    input.value?.focus();
  },
  { immediate: true },
);

function apply(): void {
  const current = spec.value!;
  const text = String(raw.value).trim();

  if (current.acceptsFormula) {
    const edit = parseParamEdit(text);
    if (edit.kind === 'formula') {
      const issue = formulaIssue(props.document ?? {}, edit.expr);
      error.value = issue;
      if (issue === null) emit('apply', { expr: edit.expr });
      return;
    }
    if (edit.kind !== 'number') {
      error.value = current.invalidMessage;
      return;
    }
    error.value = current.isValid(edit.value) ? null : current.invalidMessage;
    if (error.value === null) emit('apply', edit.value);
    return;
  }

  const value = Number(text);
  error.value = text === '' || !current.isValid(value) ? current.invalidMessage : null;
  if (error.value === null) emit('apply', current.toCommandValue(value));
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
        :type="spec.acceptsFormula ? 'text' : 'number'"
        step="any"
        class="w-28 rounded-md border px-2 py-1 text-sm"
        data-testid="constraint-value"
        :aria-invalid="error !== null ? 'true' : undefined"
        @input="error = null"
      />
      <p
        v-if="error !== null"
        class="text-sm text-destructive"
        data-testid="constraint-value-error"
      >
        {{ error }}
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
