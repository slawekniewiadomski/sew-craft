<script setup lang="ts">
import type { EntityId } from '@sewcraft/geometry';
import { nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';

import RibbonIcon from '@/components/base/RibbonIcon.vue';
import SidebarEmpty from '@/components/sidebar/SidebarEmpty.vue';
import type { OutlineGroup, OutlinePieceNode, OutlineRow } from '@/lib/outline-tree';
import { ribbonIcon } from '@/lib/ribbon-icons';
import { selectionModeFrom, type SelectionMode } from '@/lib/selection';

const props = defineProps<{
  outline: OutlinePieceNode[];
  selectedIds: ReadonlySet<EntityId>;
  selectedDimensionIds: ReadonlySet<EntityId>;
  activePieceId: EntityId | null;
  /** The row to reveal when the selection changes. */
  focusId: EntityId | null;
}>();

const emit = defineEmits<{
  select: [ids: EntityId[], mode: SelectionMode];
  'select-dimension': [id: EntityId, mode: SelectionMode];
  'open-piece': [id: EntityId];
}>();

/** Roots and groups start expanded, so the outline reads like the old flat list. */
const collapsedPieces = ref(new Set<string>());
const collapsedGroups = ref(new Set<string>());

function pieceKey(node: OutlinePieceNode): string {
  return node.pieceId ?? 'unassigned';
}

function groupKey(node: OutlinePieceNode, group: OutlineGroup): string {
  return `${pieceKey(node)}-${group.id}`;
}

function isPieceOpen(node: OutlinePieceNode): boolean {
  return !collapsedPieces.value.has(pieceKey(node));
}

function isGroupOpen(node: OutlinePieceNode, group: OutlineGroup): boolean {
  return !collapsedGroups.value.has(groupKey(node, group));
}

function togglePiece(node: OutlinePieceNode): void {
  const key = pieceKey(node);
  if (collapsedPieces.value.has(key)) collapsedPieces.value.delete(key);
  else collapsedPieces.value.add(key);
  if (node.pieceId !== null) emit('open-piece', node.pieceId);
}

function toggleGroup(node: OutlinePieceNode, group: OutlineGroup): void {
  const key = groupKey(node, group);
  if (collapsedGroups.value.has(key)) collapsedGroups.value.delete(key);
  else collapsedGroups.value.add(key);
}

function onRowClick(row: OutlineRow, event: MouseEvent): void {
  const mode = selectionModeFrom(event);
  if (row.target === 'dimension') emit('select-dimension', row.id, mode);
  else if (row.target === 'references') emit('select', row.references, mode);
  else emit('select', [row.id], mode);
}

function rowIsCurrent(row: OutlineRow): boolean {
  if (row.target === 'dimension') return props.selectedDimensionIds.has(row.id);
  if (row.target === 'references') return row.references.every((id) => props.selectedIds.has(id));
  return props.selectedIds.has(row.id);
}

/** The row elements by id, so a selection can be scrolled into view. */
const rowElements = new Map<EntityId, HTMLElement>();

function setRowElement(id: EntityId, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) rowElements.set(id, element);
  else rowElements.delete(id);
}

function findRow(id: EntityId): { node: OutlinePieceNode; group: OutlineGroup } | null {
  for (const node of props.outline) {
    for (const group of node.groups) {
      if (group.rows.some((row) => row.id === id)) return { node, group };
    }
  }
  return null;
}

/**
 * Open the branch around a row and scroll it into view. The outline follows the
 * canvas: the row the maker just clicked is always reachable without expanding
 * groups by hand.
 */
function reveal(id: EntityId): void {
  const found = findRow(id);
  if (found === null) return;

  collapsedPieces.value.delete(pieceKey(found.node));
  collapsedGroups.value.delete(groupKey(found.node, found.group));
  void nextTick(() => {
    rowElements.get(id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
}

watch(
  () => props.focusId,
  (id) => {
    if (id !== null) reveal(id);
  },
  { flush: 'post' },
);

onMounted(() => {
  if (props.focusId !== null) reveal(props.focusId);
});
</script>

<template>
  <div v-if="outline.length > 0" class="space-y-1" aria-label="Document outline">
    <section
      v-for="piece in outline"
      :key="pieceKey(piece)"
      :data-testid="`outline-piece-${pieceKey(piece)}`"
    >
      <button
        type="button"
        class="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :class="
          piece.pieceId !== null && piece.pieceId === activePieceId
            ? 'bg-primary/10 text-primary'
            : ''
        "
        :aria-expanded="isPieceOpen(piece)"
        :data-testid="`outline-toggle-piece-${pieceKey(piece)}`"
        @click="togglePiece(piece)"
      >
        <RibbonIcon
          :icon="ribbonIcon('chevron-down')"
          :size="12"
          class="shrink-0 transition-transform"
          :class="isPieceOpen(piece) ? '' : '-rotate-90'"
        />
        <RibbonIcon :icon="ribbonIcon('piece')" :size="13" class="shrink-0" />
        <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ piece.label }}</span>
        <span class="shrink-0 text-2xs tabular-nums text-muted-foreground">{{ piece.count }}</span>
      </button>

      <ul
        v-show="isPieceOpen(piece)"
        class="mt-0.5 space-y-0.5"
        :data-testid="`outline-groups-${pieceKey(piece)}`"
      >
        <li
          v-for="group in piece.groups"
          :key="group.id"
          :data-testid="`outline-group-${groupKey(piece, group)}`"
        >
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-1 pl-6 pr-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :aria-expanded="isGroupOpen(piece, group)"
            :data-testid="`outline-toggle-group-${groupKey(piece, group)}`"
            @click="toggleGroup(piece, group)"
          >
            <RibbonIcon
              :icon="ribbonIcon('chevron-down')"
              :size="10"
              class="shrink-0 text-muted-foreground transition-transform"
              :class="isGroupOpen(piece, group) ? '' : '-rotate-90'"
            />
            <span class="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
              {{ group.label }}
            </span>
            <span class="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {{ group.rows.length }}
            </span>
          </button>

          <ul
            v-show="isGroupOpen(piece, group)"
            class="space-y-0.5"
            :data-testid="`outline-rows-${groupKey(piece, group)}`"
          >
            <li
              v-for="row in group.rows"
              :key="row.id"
              :ref="(element) => setRowElement(row.id, element)"
              class="flex items-center gap-1 rounded-sm border-l-2 border-transparent"
              :class="rowIsCurrent(row) ? 'border-primary bg-primary/10' : ''"
              :data-testid="`outline-row-${row.id}`"
            >
              <button
                type="button"
                class="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-1 pl-8 pr-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                :aria-label="`${row.typeLabel} ${row.label}`"
                :aria-current="rowIsCurrent(row) ? 'true' : undefined"
                :data-testid="`outline-select-${row.id}`"
                @click="onRowClick(row, $event)"
              >
                <RibbonIcon
                  :icon="ribbonIcon(row.icon)"
                  :size="12"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate text-xs">{{ row.label }}</span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
  <SidebarEmpty
    v-else
    icon="line"
    message="Nothing to outline yet."
    hint="Draw geometry or create a piece to see the document tree here."
  />
</template>
