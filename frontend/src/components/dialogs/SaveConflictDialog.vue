<script setup lang="ts">
import DialogActions from '@/components/base/DialogActions.vue';
import DialogHeader from '@/components/base/DialogHeader.vue';
import ModalDialog from '@/components/base/ModalDialog.vue';
import { Button } from '@/components/ui/button';
import { useDialogFocus } from '@/composables/use-dialog-focus';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    /** ISO-8601 timestamp of the checkpoint the other writer produced. */
    savedAt?: string | null;
  }>(),
  { savedAt: null },
);

const emit = defineEmits<{ reload: []; overwrite: [] }>();

const overwriteButton = ref<{ $el: HTMLButtonElement } | null>(null);
const reloadButton = ref<{ $el: HTMLButtonElement } | null>(null);

const { trapTab } = useDialogFocus(reloadButton, overwriteButton, reloadButton);

const savedTime = computed(() => {
  if (props.savedAt === null) return null;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(props.savedAt),
  );
});
</script>

<template>
  <ModalDialog
    labelled-by="save-conflict-title"
    described-by="save-conflict-body"
    data-testid="conflict-dialog"
    :dismissible="false"
    @keydown="trapTab"
  >
    <DialogHeader
      title-id="save-conflict-title"
      title="Project changed elsewhere"
      description-id="save-conflict-body"
    >
      <template v-if="savedTime === null">Another tab saved this project.</template>
      <template v-else>Another tab saved this project at {{ savedTime }}.</template>
      Reloading discards your unsaved edits.
    </DialogHeader>

    <DialogActions>
      <Button
        ref="overwriteButton"
        variant="outline"
        size="sm"
        data-testid="conflict-overwrite"
        @click="emit('overwrite')"
      >
        Overwrite
      </Button>
      <Button ref="reloadButton" size="sm" data-testid="conflict-reload" @click="emit('reload')">
        Reload
      </Button>
    </DialogActions>
  </ModalDialog>
</template>
