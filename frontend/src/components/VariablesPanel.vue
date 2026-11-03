<script setup lang="ts">
import type { PatternDocument, Unit } from '@sewcraft/geometry';
import { computed } from 'vue';

import Pill from '@/components/sidebar/Pill.vue';
import SidebarAction from '@/components/sidebar/SidebarAction.vue';
import SidebarButton from '@/components/sidebar/SidebarButton.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import SidebarHeading from '@/components/sidebar/SidebarHeading.vue';
import SidebarInput from '@/components/sidebar/SidebarInput.vue';
import SidebarSelect from '@/components/sidebar/SidebarSelect.vue';
import { parseVariableValueInput, variableRows, type VariableValueInput } from '@/lib/variables';

const props = withDefaults(defineProps<{ document: PatternDocument; readOnly?: boolean }>(), {
  readOnly: false,
});

const emit = defineEmits<{
  create: [];
  rename: [slug: string, name: string];
  'set-value': [slug: string, value: VariableValueInput];
  'set-unit': [slug: string, unit: Unit];
  'set-comment': [slug: string, comment: string | null];
  remove: [slug: string];
}>();

const rows = computed(() => variableRows(props.document));

/** Commit a name edit; an empty or unchanged name snaps back. */
function onName(slug: string, current: string, event: Event): void {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim();
  if (name === '' || name === current) {
    input.value = current;
    return;
  }
  emit('rename', slug, name);
}

/** Commit a value edit; unparsable text snaps back to what is stored. */
function onValue(slug: string, current: string, event: Event): void {
  const input = event.target as HTMLInputElement;
  const value = parseVariableValueInput(input.value);
  if (value === null) {
    input.value = current;
    return;
  }
  emit('set-value', slug, value);
}

function onUnit(slug: string, unit: Unit): void {
  emit('set-unit', slug, unit);
}

/** Commit a comment edit; empty text clears it. */
function onComment(slug: string, event: Event): void {
  const input = event.target as HTMLInputElement;
  const comment = input.value.trim();
  emit('set-comment', slug, comment === '' ? null : comment);
}

/** A formula marker so a formula reads as computed, not as a typed number. */
const typeLabel: Record<string, string> = { number: 'Number', formula: 'Formula', ratio: 'Ratio' };
</script>

<template>
  <div data-testid="variables-panel">
    <div class="mb-2 flex items-center justify-between gap-2">
      <SidebarHeading label="Measurements" :count="rows.length" />
      <SidebarButton :disabled="props.readOnly" data-testid="add-variable" @click="emit('create')">
        + New
      </SidebarButton>
    </div>

    <table v-if="rows.length > 0" class="w-full table-fixed border-collapse text-left">
      <colgroup>
        <col class="w-[26%]" />
        <col class="w-[64px]" />
        <col class="w-[34px]" />
        <col class="w-[54px]" />
        <col />
      </colgroup>
      <thead>
        <tr class="text-2xs uppercase tracking-[0.07em] text-muted-foreground">
          <th class="pb-1 pr-0.5 font-semibold">Name</th>
          <th class="pb-1 pr-0.5 font-semibold">Value</th>
          <th class="pb-1 pr-0.5 font-semibold">Unit</th>
          <th class="pb-1 pr-0.5 font-semibold">Type</th>
          <th class="pb-1 font-semibold">Comment</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.slug"
          class="border-t border-border/70 align-middle hover:bg-muted/60"
          :data-testid="`variable-${row.slug}`"
        >
          <td class="py-1 pr-0.5">
            <div class="flex items-center gap-1">
              <SidebarInput
                class="h-6 min-w-0 flex-1 text-xs font-medium"
                :value="row.name"
                :readonly="props.readOnly"
                :title="`$${row.slug}`"
                :aria-label="`Name for variable ${row.slug}`"
                :data-testid="`variable-name-${row.slug}`"
                @change="onName(row.slug, row.name, $event)"
              />
              <SidebarAction
                v-if="!props.readOnly"
                icon="delete"
                :label="`Remove variable ${row.name}`"
                :data-testid="`variable-remove-${row.slug}`"
                @click="emit('remove', row.slug)"
              />
            </div>
          </td>
          <td class="py-1 pr-0.5">
            <SidebarInput
              class="h-6 w-full px-0.5 font-mono text-[10px]"
              :value="row.valueText"
              :readonly="props.readOnly"
              :title="row.resolved"
              :aria-label="`Value for variable ${row.slug}`"
              :data-testid="`variable-value-${row.slug}`"
              @change="onValue(row.slug, row.valueText, $event)"
            />
          </td>
          <td class="py-1 pr-0.5">
            <button
              type="button"
              class="h-6 w-full rounded-sm border px-0.5 font-mono text-2xs disabled:opacity-50"
              :disabled="props.readOnly"
              :title="`Unit ${row.unit}; click to switch`"
              :aria-label="`Unit for variable ${row.slug}: ${row.unit}`"
              :data-testid="`variable-unit-${row.slug}`"
              @click="onUnit(row.slug, row.unit === 'mm' ? 'cm' : 'mm')"
            >
              {{ row.unit }}
            </button>
          </td>
          <td class="py-1 pr-0.5">
            <Pill
              :tone="row.broken ? 'danger' : row.type === 'number' ? 'neutral' : 'accent'"
              :data-testid="`variable-type-${row.slug}`"
            >
              {{ row.broken ? 'Broken' : typeLabel[row.type] }}
            </Pill>
          </td>
          <td class="py-1">
            <SidebarInput
              class="h-6 w-full px-0.5 text-2xs"
              :value="row.comment"
              :readonly="props.readOnly"
              maxlength="120"
              :aria-label="`Comment for variable ${row.slug}`"
              :data-testid="`variable-comment-${row.slug}`"
              @change="onComment(row.slug, $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <SidebarEmpty
      v-else
      icon="constraints"
      message="No variables yet."
      hint="Name a measurement once — Bust (cm) = 88 — then use $bust_cm/4 in a dimension."
    />
  </div>
</template>
