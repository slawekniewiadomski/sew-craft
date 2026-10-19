<script setup lang="ts">
import type { RibbonIcon } from '@/lib/ribbon-icons';

withDefaults(
  defineProps<{
    icon: RibbonIcon;
    size?: number;
  }>(),
  { size: 16 },
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    stroke-width="1.3"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in icon.paths" :key="index" :d="d" />
    <circle
      v-for="(dot, index) in icon.dots ?? []"
      :key="index"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="dot.r"
      fill="currentColor"
      stroke="none"
    />
  </svg>
</template>
