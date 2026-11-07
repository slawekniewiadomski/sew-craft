<script setup lang="ts">
import ModalDialog from '@/components/ModalDialog.vue';
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
    <h2 id="save-conflict-title" class="text-sm font-semibold">Project changed elsewhere</h2>
    <p id="save-conflict-body" class="text-[13px] text-muted-foreground">
      <template v-if="savedTime === null">Another tab saved this project.</template>
      <template v-else>Another tab saved this project at {{ savedTime }}.</template>
      Reloading discards your unsaved edits.
    </p>

    <div class="flex justify-end gap-2">
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
    </div>
  </ModalDialog>
</template>
