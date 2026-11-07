<script setup lang="ts">
import { ref } from 'vue';

import DialogActions from '@/components/base/DialogActions.vue';
import DialogHeader from '@/components/base/DialogHeader.vue';
import ModalDialog from '@/components/base/ModalDialog.vue';
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
    <DialogHeader
      title-id="export-dialog-title"
      title="Export SVG"
      description-id="export-dialog-body"
    >
      {{ props.pieceLabel }} · millimetres
    </DialogHeader>

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

    <DialogActions>
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
    </DialogActions>
  </ModalDialog>
</template>
