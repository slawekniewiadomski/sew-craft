<script setup lang="ts">
/** The action row at the bottom of a dialog, right-aligned and wrapping. */
withDefaults(defineProps<{ bordered?: boolean }>(), { bordered: false });
</script>

<template>
  <div :class="['flex flex-wrap justify-end gap-2', bordered ? 'border-t pt-3' : '']">
    <slot />
  </div>
</template>
