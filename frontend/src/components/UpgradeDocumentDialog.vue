<script setup lang="ts">
import ModalDialog from '@/components/ModalDialog.vue';
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
    <h2 id="upgrade-dialog-title" class="text-sm font-semibold" data-testid="upgrade-dialog-title">
      Unsupported project format
    </h2>

    <p id="upgrade-dialog-body" class="text-[13px] text-muted-foreground">
      This build reads <span class="font-mono">{{ editorSchema }}</span> only. The stored project
      was saved as <span class="font-mono">{{ savedSchema }}</span> and is never migrated or
      replaced silently. Open it read-only, or cancel and go back to Projects.
    </p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
      <dt class="text-muted-foreground">saved</dt>
      <dd class="font-mono" data-testid="saved-schema">{{ savedSchema }}</dd>
      <dt class="text-muted-foreground">editor</dt>
      <dd class="font-mono" data-testid="editor-schema">{{ editorSchema }}</dd>
    </dl>

    <div class="flex flex-wrap justify-end gap-2">
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
    </div>
  </ModalDialog>
</template>
