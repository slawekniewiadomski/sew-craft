<script setup lang="ts">
import RibbonIcon from '@/components/RibbonIcon.vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ribbonIcon, type RibbonIconName } from '@/lib/ribbon-icons';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    icon: RibbonIconName;
    /** Accessible name; the tooltip repeats it verbatim. */
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          v-bind="$attrs"
          variant="ghost"
          size="icon-sm"
          :disabled="props.disabled"
          :aria-label="props.label"
          @click="emit('click')"
        >
          <RibbonIcon :icon="ribbonIcon(props.icon)" :size="14" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ props.label }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
