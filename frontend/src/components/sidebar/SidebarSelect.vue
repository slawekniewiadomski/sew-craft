<script setup lang="ts">
import { cn } from '@/lib/utils';

/** One sidebar picker: same height and radius as `SidebarInput`. */
withDefaults(defineProps<{ class?: string }>(), { class: undefined });
</script>

<template>
  <select :class="cn('h-7 max-w-full rounded-sm border px-1.5 text-xs', $props.class)">
    <slot />
  </select>
</template>
