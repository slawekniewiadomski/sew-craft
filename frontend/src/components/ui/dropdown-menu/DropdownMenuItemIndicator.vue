<script setup lang="ts">
import type { DropdownMenuItemIndicatorProps } from 'reka-ui';
import { DropdownMenuItemIndicator } from 'reka-ui';

const props = defineProps<DropdownMenuItemIndicatorProps>();
</script>

<template>
  <DropdownMenuItemIndicator v-bind="props">
    <slot />
  </DropdownMenuItemIndicator>
</template>
