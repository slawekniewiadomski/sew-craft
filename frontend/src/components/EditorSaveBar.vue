<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';

type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed';

const props = withDefaults(
  defineProps<{
    name: string;
    state: SaveBarState;
    /** ISO-8601 timestamp of the last checkpoint, or null when none exists. */
    savedAt?: string | null;
    readOnly?: boolean;
  }>(),
  { savedAt: null, readOnly: false },
);

const emit = defineEmits<{ save: [] }>();

const savedTime = computed(() => {
  if (props.savedAt === null) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.savedAt),
  );
});

const statusText = computed(() => {
  const labels: Record<SaveBarState, string> = {
    new: 'New pattern — not saved yet',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    failed: 'Save failed — retry',
    saved: savedTime.value === '' ? 'Saved' : `Saved ${savedTime.value}`,
  };

  return labels[props.state];
});

const canSave = computed(
  () => !props.readOnly && (props.state === 'dirty' || props.state === 'failed'),
);

const liveMode = computed(() => (props.state === 'failed' ? 'assertive' : 'polite'));
</script>

<template>
  <div
    class="flex items-center gap-3 border-b bg-background px-3 py-1.5"
    data-testid="editor-save-bar"
  >
    <p class="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
      <span class="text-[13px] font-medium text-foreground" data-testid="pattern-name">
        {{ name }}
      </span>
      <span aria-hidden="true"> · Pattern</span>
    </p>

    <span
      v-if="readOnly"
      class="rounded-sm border px-1.5 py-0.5 text-2xs font-medium"
      data-testid="read-only-pill"
    >
      Read-only (older format)
    </span>

    <p
      class="text-2xs"
      :class="state === 'failed' ? 'text-destructive' : 'text-muted-foreground'"
      role="status"
      :aria-live="liveMode"
      data-testid="save-status"
    >
      {{ statusText }}
    </p>

    <Button
      size="sm"
      variant="outline"
      :disabled="!canSave"
      title="Save project (Ctrl+S)"
      data-testid="save-project"
      @click="emit('save')"
    >
      <span
        v-if="state === 'dirty' || state === 'failed'"
        aria-hidden="true"
        class="mr-1.5 inline-block size-1.5 rounded-full bg-primary"
        data-testid="save-dirty-dot"
      />
      Save
    </Button>
  </div>
</template>
