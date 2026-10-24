<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';

type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed' | 'paused' | 'error';

const props = withDefaults(
  defineProps<{
    name: string;
    state: SaveBarState;
    /** ISO-8601 timestamp of the last checkpoint, or null when none exists. */
    savedAt?: string | null;
    /** Which writer produced the last save; only the saved copy uses it. */
    origin?: 'manual' | 'autosave' | null;
    readOnly?: boolean;
  }>(),
  { savedAt: null, origin: null, readOnly: false },
);

const emit = defineEmits<{ save: [] }>();

const savedTime = computed(() => {
  if (props.savedAt === null) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.savedAt),
  );
});

const savedLabel = computed(() => (props.origin === 'autosave' ? 'Autosaved' : 'Saved'));

const statusText = computed(() => {
  const labels: Record<SaveBarState, string> = {
    new: 'New pattern — not saved yet',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    failed: 'Save failed — retrying',
    error: 'Save failed',
    paused: 'Save paused — changed elsewhere',
    saved: savedTime.value === '' ? savedLabel.value : `${savedLabel.value} ${savedTime.value}`,
  };

  return labels[props.state];
});

const canSave = computed(
  () => !props.readOnly && props.state !== 'saving' && props.state !== 'saved',
);

const liveMode = computed(() =>
  props.state === 'failed' || props.state === 'error' || props.state === 'paused'
    ? 'assertive'
    : 'polite',
);

const attention = computed(
  () => props.state === 'failed' || props.state === 'error' || props.state === 'paused',
);
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
      :class="attention ? 'text-destructive' : 'text-muted-foreground'"
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
        v-if="state !== 'saved' && state !== 'saving' && state !== 'new'"
        aria-hidden="true"
        class="mr-1.5 inline-block size-1.5 rounded-full bg-primary"
        data-testid="save-dirty-dot"
      />
      Save
    </Button>
  </div>
</template>
