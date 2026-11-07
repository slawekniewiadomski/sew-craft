<script setup lang="ts">
/**
 * The title and optional description every dialog opens with. The ids stay with
 * the caller because `ModalDialog` points its `aria-labelledby` and
 * `aria-describedby` at them.
 */
withDefaults(
  defineProps<{
    titleId: string;
    title: string;
    /** Id of the description; required when the default slot renders one. */
    descriptionId?: string;
    /** Extra hook for a dialog whose title is asserted by test id. */
    titleTestId?: string;
  }>(),
  { descriptionId: undefined, titleTestId: undefined },
);
</script>

<template>
  <h2 :id="titleId" :data-testid="titleTestId" class="text-sm font-semibold">{{ title }}</h2>
  <p v-if="$slots.default" :id="descriptionId" class="text-[13px] text-muted-foreground">
    <slot />
  </p>
</template>
