<script setup lang="ts">
/**
 * The strip above the canvas: one border, one gutter and one rhythm for every
 * editor bar. `dense` is the compact toolbar variant; `default` carries the
 * prompt and editing bars.
 */
withDefaults(defineProps<{ variant?: 'default' | 'dense' }>(), { variant: 'default' });
</script>

<template>
  <div
    :class="[
      'flex flex-wrap items-center border-b',
      variant === 'dense' ? 'gap-x-3 gap-y-1 px-3 py-1.5 text-xs' : 'gap-2 bg-background px-2 py-1',
    ]"
  >
    <slot />
  </div>
</template>
