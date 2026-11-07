<script setup lang="ts">
import type { PatternDocument, Unit } from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import {
  nextVariableSort,
  sortVariableRows,
  variableSortAria,
  variableSortArrow,
  type VariableSort,
  type VariableSortKey,
} from '@/lib/variable-sort';
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
const addOpen = ref(false);
const addRoot = ref<HTMLElement | null>(null);

function openAdd(): void {
  addOpen.value = !addOpen.value;
}

function chooseCreate(): void {
  addOpen.value = false;
  emit('create');
}

function chooseMeasured(): void {
  addOpen.value = false;
  emit('create-measured');
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!addOpen.value) return;
  if (addRoot.value!.contains(event.target as Node)) return;
  addOpen.value = false;
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') addOpen.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});

/** In compact mode the comment opens as a full-width row under its variable. */
const openCommentSlug = ref<string | null>(null);

function toggleComment(slug: string): void {
  openCommentSlug.value = openCommentSlug.value === slug ? null : slug;
}

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

/** The other display unit; the cell's toggle flips between the two. */
function nextUnit(unit: Unit): Unit {
  return unit === 'mm' ? 'cm' : 'mm';
}

/** Commit a unit change; measured rows keep their own display unit too. */
function onUnit(slug: string, unit: Unit): void {
  emit('set-unit', slug, unit);
}

/** Commit a comment edit; empty text clears it. */
function onComment(slug: string, event: Event): void {
  const input = event.target as HTMLInputElement;
  const comment = input.value.trim();
  emit('set-comment', slug, comment === '' ? null : comment);
}

/** A row's type label; compact mode uses short codes to fit the narrow grid. */
function typeLabel(row: VariableRow): string {
  if (row.broken) return props.compact ? 'Bad' : 'Broken';
  if (row.type === 'measured') {
    return props.compact ? `Meas ${row.sources.length}` : `Measured · ${row.sources.length}`;
  }
  if (props.compact) return { number: 'Num', formula: 'Fx', ratio: 'Ratio' }[row.type];
  return { number: 'Number', formula: 'Formula', ratio: 'Ratio' }[row.type];
}
</script>

<template>
  <div ref="addRoot" data-testid="variables-panel">
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
        <template v-for="(row, index) in displayedRows" :key="row.slug">
          <tr
            class="border-t border-border/70 align-middle hover:bg-muted/60"
            :class="{
              'bg-muted/40': props.activeSlug === row.slug,
              'bg-primary/10': props.editingSlug === row.slug,
            }"
            :data-testid="`variable-${row.slug}`"
          >
            <td class="rowno">{{ index + 1 }}</td>
            <td class="p-0">
              <input
                class="cell name"
                :value="row.name"
                :readonly="props.readOnly"
                :title="`$${row.slug}`"
                :aria-label="`Name for variable ${row.slug}`"
                :data-testid="`variable-name-${row.slug}`"
                @change="onName(row.slug, row.name, $event)"
              />
            </td>
            <td class="p-0">
              <div
                v-if="row.type === 'measured'"
                class="measured"
                :title="row.resolved"
                :aria-label="`Measured length for variable ${row.slug}: ${row.resolved}`"
                :data-testid="`variable-value-${row.slug}`"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  aria-hidden="true"
                  class="shrink-0"
                >
                  <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                </svg>
                <span class="truncate">{{ row.valueText }}</span>
                <button
                  v-if="props.compact"
                  type="button"
                  class="unit inline"
                  :disabled="props.readOnly"
                  :title="`Unit ${row.unit}; click to switch`"
                  :aria-label="`Unit for variable ${row.slug}: ${row.unit}`"
                  :data-testid="`variable-unit-${row.slug}`"
                  @click="onUnit(row.slug, nextUnit(row.unit))"
                >
                  {{ row.unit }}
                </button>
              </div>
              <div v-else-if="props.compact" class="value-wrap">
                <input
                  class="cell value"
                  :class="{ 'text-destructive': row.broken }"
                  :value="row.valueText"
                  :readonly="props.readOnly"
                  :title="row.resolved"
                  :aria-label="`Value for variable ${row.slug}`"
                  :data-testid="`variable-value-${row.slug}`"
                  @change="onValue(row.slug, row.valueText, $event)"
                />
                <button
                  type="button"
                  class="unit inline"
                  :disabled="props.readOnly"
                  :title="`Unit ${row.unit}; click to switch`"
                  :aria-label="`Unit for variable ${row.slug}: ${row.unit}`"
                  :data-testid="`variable-unit-${row.slug}`"
                  @click="onUnit(row.slug, nextUnit(row.unit))"
                >
                  {{ row.unit }}
                </button>
              </div>
              <input
                v-else
                class="cell value"
                :class="{ 'text-destructive': row.broken }"
                :value="row.valueText"
                :readonly="props.readOnly"
                :title="row.resolved"
                :aria-label="`Value for variable ${row.slug}`"
                :data-testid="`variable-value-${row.slug}`"
                @change="onValue(row.slug, row.valueText, $event)"
              />
            </td>
            <td v-if="!props.compact" class="p-0">
              <button
                type="button"
                class="unit"
                :disabled="props.readOnly"
                :title="`Unit ${row.unit}; click to switch`"
                :aria-label="`Unit for variable ${row.slug}: ${row.unit}`"
                :data-testid="`variable-unit-${row.slug}`"
                @click="onUnit(row.slug, nextUnit(row.unit))"
              >
                {{ row.unit }}
              </button>
            </td>
            <td class="p-0">
              <button
                v-if="row.sources.length > 0"
                type="button"
                :class="[
                  'type',
                  {
                    measured: row.type === 'measured',
                    formula: row.type === 'formula',
                    broken: row.broken,
                  },
                ]"
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
                <span :data-testid="`variable-type-${row.slug}`">{{ typeLabel(row) }}</span>
              </button>
              <span
                v-else
                class="type"
                :class="{ formula: row.type === 'formula', broken: row.broken }"
                :data-testid="`variable-type-${row.slug}`"
              >
                {{ typeLabel(row) }}
              </span>
            </td>
            <td v-if="!props.compact" class="p-0">
              <input
                class="cell comment"
                :value="row.comment"
                :readonly="props.readOnly"
                maxlength="120"
                :aria-label="`Comment for variable ${row.slug}`"
                :data-testid="`variable-comment-${row.slug}`"
                @change="onComment(row.slug, $event)"
              />
            </td>
            <td class="p-0">
              <div class="actions">
                <button
                  v-if="props.compact"
                  type="button"
                  class="iconbtn note"
                  :class="{ active: openCommentSlug === row.slug }"
                  :aria-expanded="openCommentSlug === row.slug ? 'true' : 'false'"
                  :title="row.comment === '' ? 'Add a comment' : row.comment"
                  :aria-label="`Comment for variable ${row.slug}`"
                  :data-testid="`variable-note-${row.slug}`"
                  @click="toggleComment(row.slug)"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 5h16v11H9l-5 4z" />
                  </svg>
                </button>
                <button
                  v-if="row.type === 'measured' && !props.readOnly"
                  type="button"
                  class="iconbtn edit"
                  :class="{ active: props.editingSlug === row.slug }"
                  :aria-pressed="props.editingSlug === row.slug"
                  title="Edit the edges this measurement reads"
                  :aria-label="`Edit measured edges for ${row.name}`"
                  :data-testid="`variable-edit-${row.slug}`"
                  @click="emit('edit-measured', row.slug)"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                    <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                  </svg>
                </button>
                <button
                  v-if="!props.readOnly"
                  type="button"
                  class="iconbtn"
                  :title="`Remove variable ${row.name}`"
                  :aria-label="`Remove variable ${row.name}`"
                  :data-testid="`variable-remove-${row.slug}`"
                  @click="emit('remove', row.slug)"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M5 7 H19" />
                    <path d="M9 7 V20 H15 V7" />
                    <path d="M10 7 V4.4 H14 V7" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
          <tr
            v-if="props.compact && openCommentSlug === row.slug"
            :data-testid="`variable-comment-row-${row.slug}`"
          >
            <td :colspan="5" class="p-1">
              <input
                class="cell comment"
                :value="row.comment"
                :readonly="props.readOnly"
                maxlength="120"
                placeholder="Comment"
                :aria-label="`Comment for variable ${row.slug}`"
                :data-testid="`variable-comment-${row.slug}`"
                @change="onComment(row.slug, $event)"
              />
            </td>
          </tr>
        </template>
        <tr class="foot">
          <td :colspan="props.compact ? 5 : 7" class="p-0">
            <button
              type="button"
              class="addbtn"
              :disabled="props.readOnly"
              aria-haspopup="menu"
              :aria-expanded="addOpen ? 'true' : 'false'"
              data-testid="variables-add"
              @click="openAdd"
            >
              + New variable <span aria-hidden="true" class="caret">▼</span>
            </button>
            <div v-if="addOpen" class="menu" role="menu" data-testid="variables-add-menu">
              <button
                type="button"
                role="menuitem"
                class="menu-item"
                :disabled="props.readOnly"
                data-testid="add-variable"
                @click="chooseCreate"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>
                  <span class="menu-label">New variable</span>
                  <span class="menu-hint">Name a number or write a formula</span>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="menu-item"
                :disabled="props.readOnly || !props.canMeasure"
                :title="
                  props.canMeasure
                    ? 'Measure the connected edges you have selected'
                    : 'Select one or more connected edges first'
                "
                data-testid="add-measured-variable"
                @click="chooseMeasured"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
                </svg>
                <span>
                  <span class="menu-label">New measured variable</span>
                  <span class="menu-hint">
                    {{
                      props.canMeasure
                        ? 'From the selected connected edges'
                        : 'Select connected edges first'
                    }}
                  </span>
                </span>
              </button>
            </div>
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

.rowno {
  background: color-mix(in oklab, var(--muted) 55%, transparent);
  color: var(--muted-foreground);
  font-family: var(--font-annotation);
  font-size: 9px;
  text-align: center;
  padding: 0;
}

tr:hover td:not(.rowno) {
  background: color-mix(in oklab, var(--muted) 45%, transparent);
}

.cell {
  display: block;
  width: 100%;
  height: 25px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  padding: 0 4px;
}

.cell.name {
  font-weight: 500;
}

.cell.comment {
  color: var(--muted-foreground);
  font-size: 10px;
}

.cell.value {
  font-family: var(--font-annotation);
  font-size: 10px;
  text-align: right;
}

.cell:focus {
  outline: 2px solid color-mix(in oklab, var(--primary) 55%, transparent);
  outline-offset: -2px;
  background: var(--background);
}

.measured {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  height: 25px;
  padding: 0 4px;
  color: color-mix(in oklab, var(--dimension-formula) 80%, var(--foreground));
  font-family: var(--font-annotation);
  font-size: 10px;
}

.value-wrap {
  display: flex;
  align-items: center;
  height: 25px;
  padding-right: 2px;
}

.unit.inline {
  width: 20px;
  flex: none;
  font-size: 8px;
  color: var(--muted-foreground);
}

.unit {
  display: block;
  width: 100%;
  height: 25px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: var(--font-annotation);
  font-size: 9px;
  cursor: pointer;
  padding: 0;
}

.unit:hover {
  background: color-mix(in oklab, var(--muted) 70%, transparent);
}

.type {
  display: block;
  height: 25px;
  overflow: hidden;
  padding: 0 4px;
  color: var(--muted-foreground);
  font-size: 9px;
  letter-spacing: 0.05em;
  line-height: 25px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  width: 100%;
  text-align: left;
}

.type.formula,
.type.measured {
  color: color-mix(in oklab, var(--dimension-formula) 80%, var(--foreground));
}

.type.broken {
  color: var(--destructive);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
  height: 25px;
  padding: 0 2px;
}

.iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  opacity: 0.55;
  padding: 0;
}

tr:hover .iconbtn,
tr:focus-within .iconbtn,
.iconbtn.active {
  opacity: 1;
}

.iconbtn:hover {
  background: color-mix(in oklab, var(--destructive) 10%, transparent);
  color: var(--destructive);
}

.iconbtn.note.active,
.iconbtn.edit.active,
.iconbtn.edit:hover {
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: color-mix(in oklab, var(--primary) 80%, var(--foreground));
}

.foot td {
  height: 24px;
  position: relative;
  background: color-mix(in oklab, var(--muted) 35%, transparent);
  padding: 0 4px;
}

.addbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
  padding: 0 4px;
}

.addbtn:hover:not(:disabled) {
  background: var(--muted);
  color: var(--foreground);
}

.addbtn:disabled {
  opacity: 0.5;
  cursor: default;
}

.caret {
  font-size: 7px;
  opacity: 0.7;
}

.menu {
  position: absolute;
  left: 4px;
  bottom: 26px;
  z-index: 20;
  width: 218px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  box-shadow: 0 8px 24px color-mix(in oklab, var(--foreground) 12%, transparent);
  padding: 3px;
}

.menu-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  width: 100%;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 5px 6px;
}

.menu-item:hover:not(:disabled) {
  background: var(--muted);
}

.menu-item:disabled {
  cursor: default;
  opacity: 0.5;
}

.menu-item svg {
  flex: none;
  margin-top: 1px;
  color: var(--muted-foreground);
}

.menu-label {
  display: block;
  font-size: 11px;
}

.menu-hint {
  display: block;
  margin-top: 1px;
  color: var(--muted-foreground);
  font-size: 9.5px;
}
</style>
