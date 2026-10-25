<script setup lang="ts">
import type { PatternDocument, TabRef } from '@sewcraft/geometry';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { Button } from '@/components/ui/button';
import { moveTab, sameTab, tabColor, tabIndex, tabKey, tabLabel } from '@/lib/tabs';

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    /** The active tab, or `null` in a document with no tabs. */
    modelValue: TabRef | null;
    /** A read-only document disables creation and reordering. */
    readOnly?: boolean;
  }>(),
  { readOnly: false },
);

const emit = defineEmits<{
  'update:modelValue': [tab: TabRef];
  'new-piece': [];
  'new-assembly': [];
  reorder: [tabs: TabRef[]];
}>();

const menuOpen = ref(false);
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const tabElements = ref<HTMLButtonElement[]>([]);

const activeIndex = computed(() => tabIndex(props.document, props.modelValue));

function setTabElement(index: number, element: unknown): void {
  if (element instanceof HTMLButtonElement) tabElements.value[index] = element;
}

/** The tab a keyboard user should focus; the active one, or the first. */
function focusIndex(): number {
  return activeIndex.value >= 0 ? activeIndex.value : 0;
}

function activate(tab: TabRef): void {
  emit('update:modelValue', tab);
}

function onTabKeydown(index: number, event: KeyboardEvent): void {
  const count = props.document.tabs.length;
  /* v8 ignore next -- no tab element exists to receive the keydown */
  if (count === 0) return;
  const tab = props.document.tabs[index]!;

  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + step + count) % count;
    event.preventDefault();
    if (event.altKey && event.shiftKey) {
      if (!props.readOnly) emit('reorder', moveTab(props.document, index, next));
      return;
    }
    activate(props.document.tabs[next]!);
    focusTab(next);
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    const next = event.key === 'Home' ? 0 : count - 1;
    event.preventDefault();
    activate(props.document.tabs[next]!);
    focusTab(next);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate(tab);
  }
}

function focusTab(index: number): void {
  void nextTick(() => tabElements.value[index]?.focus());
}

let dragIndex: number | null = null;

function onDragStart(index: number, event: DragEvent): void {
  if (props.readOnly) {
    event.preventDefault();
    return;
  }
  dragIndex = index;
  event.dataTransfer?.setData('text/plain', tabKey(props.document.tabs[index]!));
  if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move';
}

function onDrop(index: number, event: DragEvent): void {
  event.preventDefault();
  if (props.readOnly || dragIndex === null) return;
  const tabs = moveTab(props.document, dragIndex, index);
  dragIndex = null;
  if (tabs.some((tab, position) => !sameTab(tab, props.document.tabs[position]))) {
    emit('reorder', tabs);
  }
}

function newPiece(): void {
  /* v8 ignore next -- the menu never opens while read-only */
  if (props.readOnly) return;
  menuOpen.value = false;
  emit('new-piece');
}

function newAssembly(): void {
  /* v8 ignore next -- the menu never opens while read-only */
  if (props.readOnly) return;
  menuOpen.value = false;
  emit('new-assembly');
}

function toggleMenu(): void {
  /* v8 ignore next -- the trigger is disabled while read-only */
  if (props.readOnly) return;
  menuOpen.value = !menuOpen.value;
}

/** A click outside the bar closes the menu. */
function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuOpen.value) return;
  if (root.value !== null && !root.value.contains(event.target as Node)) menuOpen.value = false;
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') menuOpen.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});

/** Keep the active tab visible when it changes or a new tab is appended. */
watch(
  () => [props.document.tabs.length, props.modelValue?.kind, props.modelValue?.id],
  () => {
    void nextTick(() => {
      const index = activeIndex.value;
      if (index < 0) return;
      tabElements.value[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  },
);
</script>

<template>
  <div
    ref="root"
    class="flex w-full items-stretch border-t bg-background"
    data-testid="editor-tabs"
  >
    <div class="relative flex shrink-0 items-stretch border-r">
      <Button
        variant="ghost"
        size="icon"
        class="h-full rounded-none"
        aria-label="New tab"
        aria-haspopup="menu"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        :disabled="props.readOnly"
        data-testid="tabs-new"
        @click="toggleMenu"
      >
        +
      </Button>
      <div
        v-if="menuOpen"
        class="absolute bottom-full left-0 z-20 mb-1 w-48 rounded-md border bg-popover p-1 shadow-md"
        role="menu"
        data-testid="tabs-menu"
      >
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          data-testid="tabs-menu-piece"
          @click="newPiece"
        >
          New piece
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          data-testid="tabs-menu-assembly"
          @click="newAssembly"
        >
          New assembly
        </button>
        <button
          type="button"
          role="menuitem"
          aria-disabled="true"
          disabled
          class="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground opacity-60"
          data-testid="tabs-menu-drawing"
        >
          <span>New drawing</span>
          <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">Soon</span>
        </button>
      </div>
    </div>

    <div
      ref="list"
      class="flex min-w-0 flex-1 items-stretch overflow-x-auto"
      role="tablist"
      aria-label="Pattern tabs"
      data-testid="tabs-list"
    >
      <button
        v-for="(tab, index) in props.document.tabs"
        :key="tabKey(tab)"
        :ref="(element) => setTabElement(index, element)"
        type="button"
        role="tab"
        draggable="true"
        class="group flex shrink-0 items-center gap-1.5 border-t-2 px-3 text-[13px]"
        :class="
          sameTab(tab, props.modelValue)
            ? 'border-t-primary bg-surface font-medium'
            : 'border-t-transparent hover:bg-accent/50'
        "
        :aria-selected="sameTab(tab, props.modelValue) ? 'true' : 'false'"
        :tabindex="index === focusIndex() ? 0 : -1"
        :data-testid="`tab-${tab.kind}-${tab.id}`"
        @click="activate(tab)"
        @keydown="onTabKeydown(index, $event)"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent
        @drop="onDrop(index, $event)"
      >
        <span
          v-if="tab.kind === 'piece'"
          class="size-2 shrink-0 rounded-full border"
          :style="{ backgroundColor: tabColor(props.document, tab) ?? 'transparent' }"
          aria-hidden="true"
          :data-testid="`tab-dot-${tab.id}`"
        />
        <span v-else class="text-xs" aria-hidden="true" data-testid="tab-assembly-glyph">▣</span>
        <span class="truncate">{{ tabLabel(props.document, tab) }}</span>
      </button>
    </div>
  </div>
</template>
