<script setup lang="ts">
import { cn } from '@/lib/utils';

import { buttonVariants, type ButtonSize, type ButtonVariant } from './variants';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }>(),
  {
    variant: 'default',
    size: 'default',
    type: 'button',
    disabled: false,
  },
);
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }))"
  >
    <slot />
  </button>
</template>
