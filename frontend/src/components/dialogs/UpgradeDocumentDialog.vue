<script setup lang="ts">
import DialogActions from '@/components/base/DialogActions.vue';
import DialogHeader from '@/components/base/DialogHeader.vue';
import ModalDialog from '@/components/base/ModalDialog.vue';
import { Button } from '@/components/ui/button';
import { useDialogFocus } from '@/composables/use-dialog-focus';
import { ref } from 'vue';

defineProps<{
  /** The schema the stored document was written with. */
  savedSchema: string;
  /** The schema this editor writes. */
  editorSchema: string;
}>();

const emit = defineEmits<{ readonly: []; cancel: [] }>();

const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);
const readOnlyButton = ref<{ $el: HTMLButtonElement } | null>(null);

const { trapTab } = useDialogFocus(cancelButton, cancelButton, readOnlyButton);
</script>

<template>
  <ModalDialog
    labelled-by="upgrade-dialog-title"
    described-by="upgrade-dialog-body"
    data-testid="upgrade-dialog"
    size="md"
    @cancel="emit('cancel')"
    @keydown="trapTab"
  >
    <DialogHeader
      title-id="upgrade-dialog-title"
      title="Unsupported project format"
      title-test-id="upgrade-dialog-title"
      description-id="upgrade-dialog-body"
    >
      This build reads <span class="font-mono">{{ editorSchema }}</span> only. The stored project
      was saved as <span class="font-mono">{{ savedSchema }}</span> and is never migrated or
      replaced silently. Open it read-only, or cancel and go back to Projects.
    </DialogHeader>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
      <dt class="text-muted-foreground">saved</dt>
      <dd class="font-mono" data-testid="saved-schema">{{ savedSchema }}</dd>
      <dt class="text-muted-foreground">editor</dt>
      <dd class="font-mono" data-testid="editor-schema">{{ editorSchema }}</dd>
    </dl>

    <DialogActions>
      <Button
        ref="cancelButton"
        variant="outline"
        size="sm"
        data-testid="upgrade-cancel"
        @click="emit('cancel')"
      >
        Cancel
      </Button>
      <Button
        ref="readOnlyButton"
        variant="outline"
        size="sm"
        data-testid="upgrade-readonly"
        @click="emit('readonly')"
      >
        Open read-only
      </Button>
    </DialogActions>
  </ModalDialog>
</template>
