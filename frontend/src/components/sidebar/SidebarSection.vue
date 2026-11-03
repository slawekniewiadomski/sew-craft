<script setup lang="ts">
import SidebarHeading from './SidebarHeading.vue';

withDefaults(
  defineProps<{
    label: string;
    /** The heading's id, so a region can be labelled by it. */
    headingId?: string;
    /** Positive count shown as a muted badge. */
    count?: number;
  }>(),
  { headingId: undefined, count: undefined },
);
</script>

<template>
  <section
    class="mt-3 border-t pt-3 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-0"
  >
    <div class="mb-2 flex items-center justify-between gap-2">
      <SidebarHeading :id="headingId" :label="label" :count="count" />
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
