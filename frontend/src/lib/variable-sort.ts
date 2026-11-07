import type { VariableRow } from './variables';

/** A column the variables table can sort by; actions and row numbers cannot. */
export type VariableSortKey = 'name' | 'value' | 'unit' | 'type' | 'comment';

export type VariableSortDirection = 'asc' | 'desc';

export interface VariableSort {
  key: VariableSortKey;
  direction: VariableSortDirection;
}

/** The type's display order: numbers, ratios, formulas, measured chains. */
const TYPE_RANK: Record<VariableRow['type'], number> = {
  number: 0,
  ratio: 1,
  formula: 2,
  measured: 3,
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Text compare; blanks never take part in the direction and always sink. */
export function compareText(a: string, b: string): number {
  if (a === '' && b === '') return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return collator.compare(a, b);
}

/** Numeric compare; unresolved values always sink regardless of direction. */
export function compareNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareRows(a: VariableRow, b: VariableRow, key: VariableSortKey): number {
  switch (key) {
    case 'name':
      return compareText(a.name, b.name);
    case 'value':
      return compareNumber(a.sortValue, b.sortValue);
    case 'unit':
      return compareText(a.unit, b.unit);
    case 'type': {
      const rank = TYPE_RANK[a.type] - TYPE_RANK[b.type];
      return rank === 0 ? compareText(a.name, b.name) : rank;
    }
    case 'comment':
      return compareText(a.comment, b.comment);
  }
}

/** Whether a row has no value for a column, so it must stay at the bottom. */
function isEmptyFor(row: VariableRow, key: VariableSortKey): boolean {
  switch (key) {
    case 'value':
      return row.sortValue === null;
    case 'name':
    case 'unit':
    case 'comment':
      return row[key].trim() === '';
    case 'type':
      return false;
  }
}

/**
 * The rows in the chosen order, with ties kept in document order. Rows without
 * a value for the column stay last in both directions.
 */
export function sortVariableRows(
  rows: readonly VariableRow[],
  sort: VariableSort | null,
): VariableRow[] {
  if (sort === null) return [...rows];

  const direction = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aEmpty = isEmptyFor(a.row, sort.key);
      const bEmpty = isEmptyFor(b.row, sort.key);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

      const result = compareRows(a.row, b.row, sort.key);
      return result === 0 ? a.index - b.index : result * direction;
    })
    .map((entry) => entry.row);
}

/** Header clicks cycle: ascending, descending, then back to document order. */
export function nextVariableSort(
  current: VariableSort | null,
  key: VariableSortKey,
): VariableSort | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

/** The `aria-sort` value a column header carries. */
export function variableSortAria(
  sort: VariableSort | null,
  key: VariableSortKey,
): 'ascending' | 'descending' | 'none' {
  if (sort?.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/** The arrow a sorted header shows; unsorted columns get a faint hint. */
export function variableSortArrow(sort: VariableSort | null, key: VariableSortKey): string {
  if (sort?.key !== key) return '↕';
  return sort.direction === 'asc' ? '↑' : '↓';
}
