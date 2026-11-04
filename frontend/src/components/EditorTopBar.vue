<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { computed } from 'vue';

import AppBrandNav from './AppBrandNav.vue';

type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed' | 'paused' | 'error';
type LoadState = 'loading' | 'ready' | 'error';

const props = withDefaults(
  defineProps<{
    name: string;
    state: SaveBarState;
    /** ISO-8601 timestamp of the last checkpoint, or null when none exists. */
    savedAt?: string | null;
    /** Which writer produced the last save; only the saved copy uses it. */
    origin?: 'manual' | 'autosave' | null;
    readOnly?: boolean;
    /** Until the document is ready the bar shows identity only. */
    loadState?: LoadState;
  }>(),
  { savedAt: null, origin: null, readOnly: false, loadState: 'ready' },
);

const emit = defineEmits<{ save: []; settings: [] }>();

/** Status and Save belong to a loaded document; identity never waits for it. */
const ready = computed(() => props.loadState === 'ready');

/** The bar's two placeholders keep the way back to Projects on a slow or failed load. */
const displayName = computed(() => {
  if (props.loadState === 'loading') return 'Loading…';
  if (props.loadState === 'error') return 'Project unavailable';
  return props.name;
});

const showReadOnlyPill = computed(() => ready.value && props.readOnly);

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

/** Below 640 px the status text collapses to a dot; the tone still carries the meaning. */
const dotTone = computed(() => {
  if (attention.value) return 'bg-destructive';
  return props.state === 'dirty' || props.state === 'saving' ? 'bg-primary' : 'bg-muted-foreground';
});
</script>

<template>
  <header
    class="flex h-10 items-center gap-3 border-b bg-background px-3"
    data-testid="editor-top-bar"
  >
    <AppBrandNav class="shrink-0" />

    <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true" data-testid="top-bar-divider" />

    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <span
        class="min-w-0 truncate text-[13px] font-medium text-foreground"
        :title="displayName"
        data-testid="project-name"
      >
        {{ displayName }}
      </span>
      <span v-if="ready" class="shrink-0 text-2xs text-muted-foreground" aria-hidden="true">
        · Project
      </span>
      <Button
        v-if="ready"
        variant="ghost"
        size="icon-sm"
        title="Project settings"
        aria-label="Project settings"
        data-testid="project-settings"
        @click="emit('settings')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          class="size-4"
          aria-hidden="true"
        >
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      </Button>
      <span
        v-if="showReadOnlyPill"
        class="shrink-0 rounded-sm border px-1.5 py-0.5 text-2xs font-medium"
        data-testid="read-only-pill"
      >
        Read-only (older format)
      </span>
    </div>

    <p
      v-if="ready"
      class="flex shrink-0 items-center whitespace-nowrap text-2xs"
      :class="attention ? 'text-destructive' : 'text-muted-foreground'"
      :title="statusText"
      role="status"
      :aria-live="liveMode"
      data-testid="save-status"
    >
      <span class="sr-only sm:not-sr-only">{{ statusText }}</span>
      <span
        class="inline-block size-1.5 rounded-full sm:hidden"
        :class="dotTone"
        aria-hidden="true"
        data-testid="save-status-dot"
      />
    </p>

    <Button
      v-if="ready"
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
        class="mr-1.5 hidden size-1.5 rounded-full bg-primary sm:inline-block"
        data-testid="save-dirty-dot"
      />
      Save
    </Button>
  </header>
</template>
