<script setup lang="ts">
import { cn } from '@/lib/utils';

/** One inline sidebar action button: same height and type size as the rail's. */
withDefaults(defineProps<{ class?: string }>(), { class: undefined });
</script>

<template>
  <button
    type="button"
    :class="
      cn(
        'inline-flex h-7 items-center rounded-sm border px-2 text-2xs font-medium whitespace-nowrap disabled:opacity-50',
        $props.class,
      )
    "
  >
    <slot />
  </button>
</template>
