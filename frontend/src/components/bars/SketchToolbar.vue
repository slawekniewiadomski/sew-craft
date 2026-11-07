<script setup lang="ts">
import type { EntityId, Piece } from '@sewcraft/geometry';

import BarShell from '@/components/bars/BarShell.vue';
import { Button } from '@/components/ui/button';

const props = withDefaults(
  defineProps<{
    pieces: Piece[];
    /** The piece new geometry goes to; `null` when the pattern has none. */
    target: EntityId | null;
    /** Arrange mode moves whole pieces instead of geometry. */
    arrange: boolean;
    readOnly?: boolean;
  }>(),
  { readOnly: false },
);

const emit = defineEmits<{
  'update:target': [id: EntityId];
  'update:arrange': [on: boolean];
  fit: [];
}>();

function label(piece: Piece, index: number): string {
  return piece.name?.trim() || `Piece ${index + 1}`;
}

function onTargetChange(event: Event): void {
  emit('update:target', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <BarShell variant="dense" data-testid="sketch-toolbar">
    <span class="font-medium">Sketch</span>
    <label class="flex items-center gap-1.5">
      <span class="text-muted-foreground">Drawing into</span>
      <select
        class="h-7 max-w-48 rounded-sm border bg-background px-1.5 text-xs"
        :value="props.target ?? ''"
        :disabled="props.readOnly || props.pieces.length === 0"
        data-testid="sketch-target"
        @change="onTargetChange"
      >
        <option v-for="(piece, index) in props.pieces" :key="piece.id" :value="piece.id">
          {{ label(piece, index) }}
        </option>
      </select>
    </label>
    <Button
      size="sm"
      :variant="props.arrange ? 'default' : 'outline'"
      :disabled="props.readOnly || props.target === null"
      :aria-pressed="props.arrange ? 'true' : 'false'"
      data-testid="sketch-arrange"
      @click="emit('update:arrange', !props.arrange)"
    >
      Arrange
    </Button>
    <span v-if="props.arrange" class="text-muted-foreground" data-testid="sketch-arrange-hint">
      Drag a piece to move it
    </span>
    <Button variant="ghost" size="sm" data-testid="sketch-fit" @click="emit('fit')">Fit all</Button>
  </BarShell>
</template>
