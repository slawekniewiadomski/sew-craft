<script setup lang="ts">
import { ref } from 'vue';

import ModalDialog from '@/components/ModalDialog.vue';
import { Button } from '@/components/ui/button';
import { useDialogFocus } from '@/composables/use-dialog-focus';
import type { ExportSettings } from '@/lib/display-settings';

const props = defineProps<{
  /** The active piece's display name, shown under the title. */
  pieceLabel: string;
  settings: ExportSettings;
}>();

const emit = defineEmits<{
  'update:settings': [settings: ExportSettings];
  download: [];
  cancel: [];
}>();

const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);
const downloadButton = ref<{ $el: HTMLButtonElement } | null>(null);

const { trapTab } = useDialogFocus(downloadButton, cancelButton, downloadButton);

function toggle(key: keyof ExportSettings, value: boolean): void {
  emit('update:settings', { ...props.settings, [key]: value });
}
</script>

<template>
  <ModalDialog
    labelled-by="export-dialog-title"
    described-by="export-dialog-body"
    data-testid="export-dialog"
    @cancel="emit('cancel')"
    @keydown="trapTab"
  >
    <h2 id="export-dialog-title" class="text-sm font-semibold">Export SVG</h2>
    <p id="export-dialog-body" class="text-[13px] text-muted-foreground">
      {{ props.pieceLabel }} · millimetres
    </p>

    <div class="space-y-2">
      <label class="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="props.settings.construction"
          data-testid="export-construction"
          @change="toggle('construction', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          Include construction geometry
          <span class="block text-2xs text-muted-foreground">
            Guides, centre lines and reference shapes.
          </span>
        </span>
      </label>
      <label class="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="props.settings.stitch"
          data-testid="export-stitch"
          @change="toggle('stitch', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          Include stitch layer
          <span class="block text-2xs text-muted-foreground">
            The seam line inside the cut edge.
          </span>
        </span>
      </label>
      <label class="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          class="mt-0.5"
          :checked="props.settings.fold"
          data-testid="export-fold"
          @change="toggle('fold', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          Include fold lines
          <span class="block text-2xs text-muted-foreground">
            Dashed lines for fold-on edges.
          </span>
        </span>
      </label>
    </div>

    <div class="flex justify-end gap-2">
      <Button
        ref="cancelButton"
        variant="outline"
        size="sm"
        data-testid="export-cancel"
        @click="emit('cancel')"
      >
        Cancel
      </Button>
      <Button
        ref="downloadButton"
        size="sm"
        data-testid="export-download"
        @click="emit('download')"
      >
        Download SVG
      </Button>
    </div>
  </ModalDialog>
</template>
