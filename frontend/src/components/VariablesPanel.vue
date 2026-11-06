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
import {
  parseVariableValueInput,
  variableRows,
  type VariableRow,
  type VariableValueInput,
} from '@/lib/variables';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    readOnly?: boolean;
    canMeasure?: boolean;
    /** The measured row whose sources the canvas is showing. */
    activeSlug?: string | null;
  }>(),
  { readOnly: false, canMeasure: false, activeSlug: null },
);

const emit = defineEmits<{
  create: [];
  'create-measured': [];
  highlight: [slug: string | null];
  rename: [slug: string, name: string];
  'set-value': [slug: string, value: VariableValueInput];
  'set-unit': [slug: string, unit: Unit];
  'set-comment': [slug: string, comment: string | null];
  remove: [slug: string];
}>();

const rows = computed(() => variableRows(props.document));

/** Show or hide a measured row's chain on the canvas. */
function toggleHighlight(row: VariableRow): void {
  emit('highlight', props.activeSlug === row.slug ? null : row.slug);
}

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

/** A measured row's pill: the kind and how many edges it reads. */
function measuredPill(row: VariableRow): string {
  return row.broken ? 'Broken' : `Measured · ${row.sources.length}`;
}
</script>

<template>
  <div data-testid="variables-panel">
    <div class="mb-2 flex items-center justify-between gap-2">
      <SidebarHeading label="Measurements" :count="rows.length" />
      <div class="flex items-center gap-0.5">
        <SidebarAction
          icon="constraints"
          label="Add measured variable from selection"
          :disabled="props.readOnly || !props.canMeasure"
          data-testid="add-measured-variable"
          @click="emit('create-measured')"
        />
        <SidebarButton
          :disabled="props.readOnly"
          data-testid="add-variable"
          @click="emit('create')"
        >
          + New
        </SidebarButton>
      </div>
    </div>

    <table v-if="rows.length > 0" class="w-full table-fixed border-collapse text-left">
      <colgroup>
        <col class="w-[26%]" />
        <col class="w-[58px]" />
        <col class="w-[34px]" />
        <col class="w-[66px]" />
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
            <div
              v-if="row.type === 'measured'"
              class="flex h-6 w-full items-center justify-end gap-0.5 overflow-hidden px-0.5 font-mono text-[10px]"
              :title="row.resolved"
              :aria-label="`Measured length for variable ${row.slug}: ${row.resolved}`"
              :data-testid="`variable-value-${row.slug}`"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                aria-hidden="true"
                class="shrink-0 text-dimension-formula"
              >
                <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
              </svg>
              <span class="truncate">{{ row.valueText }}</span>
            </div>
            <SidebarInput
              v-else
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
            <button
              v-if="row.sources.length > 0"
              type="button"
              class="rounded-full"
              :aria-pressed="props.activeSlug === row.slug"
              :aria-label="`Highlight the ${row.sources.length} sources of ${row.name}`"
              :title="
                row.broken
                  ? 'A source is missing; click to see what is left'
                  : `${row.sources.length} connected edges; click to highlight`
              "
              :data-testid="`variable-highlight-${row.slug}`"
              @click="toggleHighlight(row)"
            >
              <Pill
                :tone="row.broken ? 'danger' : 'accent'"
                :data-testid="`variable-type-${row.slug}`"
                >{{ measuredPill(row) }}</Pill
              >
            </button>
            <Pill
              v-else
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
