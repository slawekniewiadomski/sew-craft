<script setup lang="ts">
import { computed } from 'vue';

import { cn } from '@/lib/utils';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    /** Render the value as trailing mono metadata rather than a value to scan. */
    mono?: boolean;
  }>(),
  { mono: false },
);

const valueClass = computed(() =>
  props.mono
    ? 'font-mono text-2xs font-normal text-muted-foreground'
    : 'text-[13px] font-medium tabular-nums text-foreground',
);
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <dt class="text-2xs text-muted-foreground">{{ props.label }}</dt>
    <dd v-bind="$attrs" :class="cn('text-right', valueClass)">
      <slot />
    </dd>
  </div>
</template>
