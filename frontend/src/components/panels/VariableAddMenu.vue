<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ readOnly?: boolean; canMeasure?: boolean }>(), {
  readOnly: false,
  canMeasure: false,
});

const emit = defineEmits<{ create: []; 'create-measured': [] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function toggle(): void {
  open.value = !open.value;
}

function chooseCreate(): void {
  open.value = false;
  emit('create');
}

function chooseMeasured(): void {
  open.value = false;
  emit('create-measured');
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return;
  if (root.value!.contains(event.target as Node)) return;
  open.value = false;
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <span ref="root">
    <button
      type="button"
      class="addbtn"
      :disabled="props.readOnly"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      data-testid="variables-add"
      @click="toggle"
    >
      + New variable <span aria-hidden="true" class="caret">▼</span>
    </button>
    <div v-if="open" class="menu" role="menu" data-testid="variables-add-menu">
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
  </span>
</template>

<style scoped>
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
