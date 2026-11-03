<script setup lang="ts">
import { cn } from '@/lib/utils';

/** One sidebar text/number field: fixed height, radius and type size. */
withDefaults(defineProps<{ class?: string }>(), { class: undefined });
</script>

<template>
  <input :class="cn('h-7 w-40 max-w-full rounded-sm border px-2 text-xs', $props.class)" />
</template>
