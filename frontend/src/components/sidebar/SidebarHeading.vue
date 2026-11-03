<script setup lang="ts">
defineProps<{
  label: string;
  /** Shown as a muted badge when positive; zero renders no badge. */
  count?: number;
}>();
</script>

<template>
  <h3
    class="flex min-w-0 items-baseline gap-1.5 text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
    <span
      v-if="count !== undefined && count > 0"
      class="shrink-0 font-medium tabular-nums"
      data-testid="heading-count"
      >{{ count }}</span
    >
  </h3>
</template>
