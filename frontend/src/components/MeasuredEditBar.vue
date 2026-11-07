<script setup lang="ts">
import { Button } from '@/components/ui/button';

export interface MeasuredSourceChip {
  id: string;
  label: string;
}

const props = defineProps<{
  name: string;
  /** The chain the variable reads, in traversal order. */
  sources: MeasuredSourceChip[];
  /** Why the last toggle was refused; `null` when the chain is valid. */
  message: string | null;
}>();

const emit = defineEmits<{
  remove: [id: string];
  done: [];
  cancel: [];
}>();
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1"
    data-testid="measured-edit-bar"
  >
    <span class="text-sm">
      Editing <span class="font-medium">{{ props.name }}</span>
    </span>

    <span class="flex flex-wrap items-center gap-1" data-testid="measured-edit-chips">
      <span
        v-for="source in props.sources"
        :key="source.id"
        class="inline-flex items-center gap-1 rounded-sm border bg-muted py-0.5 pl-1.5 pr-0.5"
      >
        <span class="font-mono text-[10px]">{{ source.label }}</span>
        <button
          type="button"
          class="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          :aria-label="`Remove ${source.label} from ${props.name}`"
          :data-testid="`measured-edit-remove-${source.id}`"
          @click="emit('remove', source.id)"
        >
          ×
        </button>
      </span>
    </span>

    <span class="text-xs text-muted-foreground" data-testid="measured-edit-hint">
      {{ props.sources.length }} {{ props.sources.length === 1 ? 'edge' : 'edges' }} · click edges
      to add or remove
    </span>

    <span v-if="props.message" class="text-sm text-destructive" data-testid="measured-edit-message">
      {{ props.message }}
    </span>

    <span class="ml-auto flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        data-testid="measured-edit-cancel"
        @click="emit('cancel')"
      >
        Revert
      </Button>
      <Button size="sm" data-testid="measured-edit-done" @click="emit('done')">Done</Button>
    </span>
  </div>
</template>
