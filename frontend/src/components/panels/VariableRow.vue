<script setup lang="ts">
import type { Unit } from '@sewcraft/geometry';

import {
  parseVariableValueInput,
  type VariableRow,
  type VariableValueInput,
} from '@/lib/variables';

const props = defineProps<{
  row: VariableRow;
  rowNumber: number;
  readOnly: boolean;
  compact: boolean;
  /** The measured row whose sources the canvas is showing. */
  active: boolean;
  /** The measured row being edited, if any. */
  editing: boolean;
  /** Compact mode: the comment row under this variable is open. */
  commentOpen: boolean;
}>();

const emit = defineEmits<{
  highlight: [slug: string];
  rename: [slug: string, name: string];
  'set-value': [slug: string, value: VariableValueInput];
  'set-unit': [slug: string, unit: Unit];
  'set-comment': [slug: string, comment: string | null];
  remove: [slug: string];
  'edit-measured': [slug: string];
  'toggle-comment': [slug: string];
}>();

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

function toggleHighlight(row: VariableRow): void {
  emit('highlight', row.slug);
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
  <tr
    class="border-t border-border/70 align-middle hover:bg-muted/60"
    :class="{ 'bg-muted/40': active, 'bg-primary/10': editing }"
    :data-testid="`variable-${row.slug}`"
  >
    <td class="rowno">{{ rowNumber }}</td>
    <td class="p-0">
      <input
        class="cell name"
        :value="row.name"
        :readonly="readOnly"
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
          v-if="compact"
          type="button"
          class="unit inline"
          :disabled="readOnly"
          :title="`Unit ${row.unit}; click to switch`"
          :aria-label="`Unit for variable ${row.slug}: ${row.unit}`"
          :data-testid="`variable-unit-${row.slug}`"
          @click="onUnit(row.slug, nextUnit(row.unit))"
        >
          {{ row.unit }}
        </button>
      </div>
      <div v-else-if="compact" class="value-wrap">
        <input
          class="cell value"
          :class="{ 'text-destructive': row.broken }"
          :value="row.valueText"
          :readonly="readOnly"
          :title="row.resolved"
          :aria-label="`Value for variable ${row.slug}`"
          :data-testid="`variable-value-${row.slug}`"
          @change="onValue(row.slug, row.valueText, $event)"
        />
        <button
          type="button"
          class="unit inline"
          :disabled="readOnly"
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
        :readonly="readOnly"
        :title="row.resolved"
        :aria-label="`Value for variable ${row.slug}`"
        :data-testid="`variable-value-${row.slug}`"
        @change="onValue(row.slug, row.valueText, $event)"
      />
    </td>
    <td v-if="!compact" class="p-0">
      <button
        type="button"
        class="unit"
        :disabled="readOnly"
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
        :aria-pressed="active"
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
    <td v-if="!compact" class="p-0">
      <input
        class="cell comment"
        :value="row.comment"
        :readonly="readOnly"
        maxlength="120"
        :aria-label="`Comment for variable ${row.slug}`"
        :data-testid="`variable-comment-${row.slug}`"
        @change="onComment(row.slug, $event)"
      />
    </td>
    <td class="p-0">
      <div class="actions">
        <button
          v-if="compact"
          type="button"
          class="iconbtn note"
          :class="{ active: commentOpen }"
          :aria-expanded="commentOpen ? 'true' : 'false'"
          :title="row.comment === '' ? 'Add a comment' : row.comment"
          :aria-label="`Comment for variable ${row.slug}`"
          :data-testid="`variable-note-${row.slug}`"
          @click="emit('toggle-comment', row.slug)"
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
          v-if="row.type === 'measured' && !readOnly"
          type="button"
          class="iconbtn edit"
          :class="{ active: editing }"
          :aria-pressed="editing"
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
          v-if="!readOnly"
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
  <tr v-if="compact && commentOpen" :data-testid="`variable-comment-row-${row.slug}`">
    <td :colspan="5" class="p-1">
      <input
        class="cell comment"
        :value="row.comment"
        :readonly="readOnly"
        maxlength="120"
        placeholder="Comment"
        :aria-label="`Comment for variable ${row.slug}`"
        :data-testid="`variable-comment-${row.slug}`"
        @change="onComment(row.slug, $event)"
      />
    </td>
  </tr>
</template>

<style scoped>
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
</style>
