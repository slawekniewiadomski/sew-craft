<script setup lang="ts">
import type { VariableOption } from '@/lib/formula';

/**
 * The `$` variable list a picker opens under the field being edited. It owns the
 * list, the rows and the pick event; the field keeps its own draft and decides
 * what a picked slug means.
 */
withDefaults(
  defineProps<{
    options: VariableOption[];
    /** Accessible name naming the field the list belongs to. */
    label: string;
    listTestId: string;
    /** Prefix for each row's test id; the slug is appended. */
    optionTestIdPrefix: string;
    /** Id the owning field points at with `aria-controls`. */
    listId?: string;
    /** `panel` is the sidebar drawer list; `canvas` sits over the drawing. */
    size?: 'panel' | 'canvas';
  }>(),
  { listId: undefined, size: 'panel' },
);

const emit = defineEmits<{ pick: [slug: string] }>();
</script>

<template>
  <ul
    v-if="options.length > 0"
    :id="listId"
    :data-testid="listTestId"
    :aria-label="label"
    class="absolute z-20 overflow-auto border bg-background p-1"
    :class="
      size === 'canvas'
        ? 'w-44 rounded-md text-xs shadow-sm'
        : 'mt-1 max-h-40 w-56 rounded-sm text-2xs shadow-sm'
    "
  >
    <li v-for="option in options" :key="option.slug">
      <button
        type="button"
        class="flex w-full items-baseline justify-between gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-muted"
        :data-testid="`${optionTestIdPrefix}-${option.slug}`"
        @mousedown.prevent="emit('pick', option.slug)"
      >
        <span class="truncate">
          {{ option.name }}
          <span class="font-mono text-muted-foreground">${{ option.slug }}</span>
        </span>
        <span class="shrink-0 text-muted-foreground">{{ option.resolved }}</span>
      </button>
    </li>
  </ul>
</template>
