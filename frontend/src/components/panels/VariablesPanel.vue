<script setup lang="ts">
import type { PatternDocument, Unit } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import {
  nextVariableSort,
  sortVariableRows,
  variableSortAria,
  variableSortArrow,
  type VariableSort,
  type VariableSortKey,
} from '@/lib/variable-sort';
import { variableRows, type VariableValueInput } from '@/lib/variables';
import VariableAddMenu from '@/components/panels/VariableAddMenu.vue';
import VariableRow from '@/components/panels/VariableRow.vue';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    readOnly?: boolean;
    canMeasure?: boolean;
    /** The measured row whose sources the canvas is showing. */
    activeSlug?: string | null;
    /** The measured row being edited, if any. */
    editingSlug?: string | null;
    /** The sidebar is too narrow for the comment column. */
    compact?: boolean;
  }>(),
  { readOnly: false, canMeasure: false, activeSlug: null, editingSlug: null, compact: false },
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
  'edit-measured': [slug: string];
}>();

function onHighlight(slug: string): void {
  emit('highlight', props.activeSlug === slug ? null : slug);
}

function forwardRename(slug: string, name: string): void {
  emit('rename', slug, name);
}

function forwardValue(slug: string, value: VariableValueInput): void {
  emit('set-value', slug, value);
}

function forwardUnit(slug: string, unit: Unit): void {
  emit('set-unit', slug, unit);
}

function forwardComment(slug: string, comment: string | null): void {
  emit('set-comment', slug, comment);
}

const rows = computed(() => variableRows(props.document));

/** The current sort, or `null` for document order. */
const sort = ref<VariableSort | null>(null);

/** Rows in document order, or in the selected column's order with ties stable. */
const displayedRows = computed(() => sortVariableRows(rows.value, sort.value));

/** Clicking a header cycles ascending, descending, then back to document order. */
function toggleSort(key: VariableSortKey): void {
  sort.value = nextVariableSort(sort.value, key);
}

function ariaSort(key: VariableSortKey): 'ascending' | 'descending' | 'none' {
  return variableSortAria(sort.value, key);
}

function sortArrow(key: VariableSortKey): string {
  return variableSortArrow(sort.value, key);
}

/** Sortable columns in display order; compact mode folds Unit into the value cell. */
const COLUMNS = [
  { key: 'name', label: 'Name', numeric: false },
  { key: 'value', label: 'Value', numeric: true },
  { key: 'unit', label: 'Unit', numeric: false },
  { key: 'type', label: 'Type', numeric: false },
] as const;

const visibleColumns = computed(() =>
  props.compact ? COLUMNS.filter((column) => column.key !== 'unit') : COLUMNS,
);

/** The add-row menu, its measured entry enabled only for a valid chain. */
/** In compact mode the comment opens as a full-width row under its variable. */
const openCommentSlug = ref<string | null>(null);

function toggleComment(slug: string): void {
  openCommentSlug.value = openCommentSlug.value === slug ? null : slug;
}
</script>

<template>
  <div data-testid="variables-panel">
    <table class="w-full table-fixed border-collapse text-left" data-testid="variables-table">
      <colgroup>
        <col class="w-[16px]" />
        <col />
        <col :class="props.compact ? 'w-[72px]' : 'w-[64px]'" />
        <col v-if="!props.compact" class="w-[38px]" />
        <col :class="props.compact ? 'w-[50px]' : 'w-[86px]'" />
        <col v-if="!props.compact" class="w-[78px]" />
        <col :class="props.compact ? 'w-[58px]' : 'w-[40px]'" />
      </colgroup>
      <thead>
        <tr>
          <th class="num" scope="col"><span class="sr-only">Row</span></th>
          <th
            v-for="column in visibleColumns"
            :key="column.key"
            scope="col"
            :aria-sort="ariaSort(column.key)"
            :class="column.numeric ? 'text-right' : undefined"
          >
            <button
              type="button"
              class="inline-flex w-full items-center gap-0.5 text-2xs font-semibold uppercase tracking-[0.07em] text-muted-foreground hover:text-foreground"
              :class="column.numeric ? 'justify-end' : undefined"
              :data-testid="`variable-sort-${column.key}`"
              @click="toggleSort(column.key)"
            >
              <span>{{ column.label }}</span>
              <span
                aria-hidden="true"
                class="text-[9px]"
                :class="sort?.key === column.key ? 'opacity-100' : 'opacity-30'"
                >{{ sortArrow(column.key) }}</span
              >
            </button>
          </th>
          <th v-if="!props.compact" scope="col" :aria-sort="ariaSort('comment')">
            <button
              type="button"
              class="inline-flex w-full items-center gap-0.5 text-2xs font-semibold uppercase tracking-[0.07em] text-muted-foreground hover:text-foreground"
              data-testid="variable-sort-comment"
              @click="toggleSort('comment')"
            >
              <span>Comment</span>
              <span
                aria-hidden="true"
                class="text-[9px]"
                :class="sort?.key === 'comment' ? 'opacity-100' : 'opacity-30'"
                >{{ sortArrow('comment') }}</span
              >
            </button>
          </th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <VariableRow
          v-for="(row, index) in displayedRows"
          :key="row.slug"
          :row="row"
          :row-number="index + 1"
          :read-only="props.readOnly"
          :compact="props.compact"
          :active="props.activeSlug === row.slug"
          :editing="props.editingSlug === row.slug"
          :comment-open="openCommentSlug === row.slug"
          @highlight="onHighlight"
          @rename="forwardRename"
          @set-value="forwardValue"
          @set-unit="forwardUnit"
          @set-comment="forwardComment"
          @remove="emit('remove', $event)"
          @edit-measured="emit('edit-measured', $event)"
          @toggle-comment="toggleComment"
        />
        <tr class="foot">
          <td :colspan="props.compact ? 5 : 7" class="p-0">
            <VariableAddMenu
              :read-only="props.readOnly"
              :can-measure="props.canMeasure"
              @create="emit('create')"
              @create-measured="emit('create-measured')"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <SidebarEmpty
      v-if="rows.length === 0"
      icon="variables"
      message="No variables yet."
      hint="Name a measurement once — Bust (cm) = 88 — then use $bust_cm/4 in a dimension."
    />
  </div>
</template>

<style scoped>
table {
  table-layout: fixed;
}

th {
  height: 18px;
  border: 1px solid var(--border);
  background: var(--muted);
  overflow: hidden;
  padding: 0 3px;
  text-align: left;
  white-space: nowrap;
}

th.num {
  text-align: center;
}

td {
  height: 26px;
  border: 1px solid var(--border);
  vertical-align: middle;
}

.foot td {
  height: 24px;
  position: relative;
  background: color-mix(in oklab, var(--muted) 35%, transparent);
  padding: 0 4px;
}
</style>
