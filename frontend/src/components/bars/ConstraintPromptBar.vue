<script setup lang="ts">
import type { ConstraintType, ParamInput, PatternDocument } from '@sewcraft/geometry';
import { computed, ref, watch } from 'vue';

import PromptBar from '@/components/bars/PromptBar.vue';
import { constraintValueSpec } from '@/lib/constraint-tools';
import { formulaIssue, parseParamEdit } from '@/lib/formula';

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
const spec = computed(() => constraintValueSpec(props.type));
const formReady = computed(() => props.valueReady && spec.value !== null);
const canApply = computed(() => String(raw.value).trim() !== '' && error.value === null);

watch(
  () => props.valueReady,
  (ready) => {
    if (!ready) return;
    raw.value = props.initialValue;
    error.value = null;
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
  <PromptBar
    v-model="raw"
    test-id-prefix="constraint"
    :prompt="prompt"
    :rejection="rejection"
    :ready="formReady"
    :label="spec?.label ?? ''"
    :input-id="inputId"
    :input-type="spec?.acceptsFormula ? 'text' : 'number'"
    :error="error"
    :can-apply="canApply"
    @input="error = null"
    @submit="apply"
    @cancel="emit('cancel')"
  />
</template>
