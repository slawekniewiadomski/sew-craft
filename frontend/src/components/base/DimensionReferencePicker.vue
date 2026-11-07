<script setup lang="ts">
import { referenceOptionLabel, type DimensionReferenceOption } from '@/lib/dimensions';

/**
 * The `#` picker: a presentational listbox of dimensions the edited dimension
 * may link to. It owns rendering and pointer selection only; the field that
 * anchors it owns filtering, keyboard navigation and the command dispatch.
 */
const props = defineProps<{
  /** Element id the owning field points at with `aria-controls`. */
  listId: string;
  options: DimensionReferenceOption[];
  activeIndex: number;
  emptyLabel?: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();

function optionId(id: string): string {
  return `${props.listId}-${id}`;
}
</script>

<template>
  <ul
    :id="listId"
    role="listbox"
    aria-label="Referenceable dimensions"
    class="absolute z-20 max-h-48 w-64 overflow-auto rounded-md border bg-background py-1 text-xs shadow-md"
    data-testid="dimension-reference-picker"
  >
    <li
      v-for="(option, index) in props.options"
      :id="optionId(option.id)"
      :key="option.id"
      role="option"
      :aria-selected="index === props.activeIndex"
      :class="[
        'cursor-pointer px-2 py-1',
        index === props.activeIndex ? 'bg-accent text-accent-foreground' : '',
      ]"
      :data-testid="`dimension-reference-option-${option.id}`"
      @mousedown.prevent
      @click="emit('select', option.id)"
    >
      {{ referenceOptionLabel(option) }}
    </li>
    <li
      v-if="props.options.length === 0"
      role="presentation"
      class="px-2 py-1 text-muted-foreground"
      data-testid="dimension-reference-empty"
    >
      {{ props.emptyLabel ?? 'No other dimensions can be referenced.' }}
    </li>
  </ul>
</template>
