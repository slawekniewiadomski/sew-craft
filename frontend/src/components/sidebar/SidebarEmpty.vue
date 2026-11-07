<script setup lang="ts">
import RibbonIcon from '@/components/base/RibbonIcon.vue';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';

defineProps<{
  message: string;
  hint?: string;
  icon?: RibbonIconName;
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-1 px-2 py-4 text-center">
    <RibbonIcon
      v-if="icon !== undefined"
      :icon="ribbonIcon(icon)"
      :size="14"
      class="text-muted-foreground"
    />
    <p class="text-[13px] font-medium text-foreground">{{ message }}</p>
    <p v-if="hint !== undefined" class="text-2xs leading-snug text-muted-foreground">{{ hint }}</p>
    <div v-if="$slots.action" class="mt-1">
      <slot name="action" />
    </div>
  </div>
</template>
