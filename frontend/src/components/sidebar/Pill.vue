<script setup lang="ts">
import { computed } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'formula' | 'danger';
  }>(),
  { tone: 'neutral' },
);

const TONE_CLASSES = {
  neutral: 'border-border text-muted-foreground',
  accent: 'border-primary/40 bg-primary/10 text-foreground',
  formula: 'border-dimension-formula/45 bg-dimension-formula/10 text-dimension-formula',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
} as const;

const toneClass = computed(() => TONE_CLASSES[props.tone]);
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium',
        toneClass,
      )
    "
  >
    <slot />
  </span>
</template>
