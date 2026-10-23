<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { onMounted, ref } from 'vue';

withDefaults(
  defineProps<{
    /** The schema the stored document was written with. */
    savedSchema: string;
    /** The schema this editor writes. */
    editorSchema: string;
    /** True when the stored schema is newer than this build understands. */
    unknown?: boolean;
  }>(),
  { unknown: false },
);

const emit = defineEmits<{ update: []; readonly: []; cancel: [] }>();

const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);

onMounted(() => cancelButton.value?.$el.focus());
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    data-testid="upgrade-dialog"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-dialog-title"
      aria-describedby="upgrade-dialog-body"
      class="w-full max-w-md space-y-3 rounded-md border bg-background p-4 shadow-lg"
    >
      <h2
        id="upgrade-dialog-title"
        class="text-sm font-semibold"
        data-testid="upgrade-dialog-title"
      >
        {{ unknown ? 'Project saved by a newer version' : 'Save format upgrade' }}
      </h2>

      <template v-if="unknown">
        <p id="upgrade-dialog-body" class="text-[13px] text-muted-foreground">
          This project was saved by a newer version of SewCraft. It is never migrated or replaced
          silently. You can open it read-only, or cancel and go back to Projects.
        </p>
        <p class="text-2xs text-muted-foreground" data-testid="unknown-schema">{{ savedSchema }}</p>
      </template>

      <template v-else>
        <p id="upgrade-dialog-body" class="text-[13px] text-muted-foreground">
          This project was saved in an older format. Updating rewrites the project and keeps the old
          version as a checkpoint.
        </p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-2xs">
          <dt class="text-muted-foreground">saved</dt>
          <dd class="font-mono" data-testid="saved-schema">{{ savedSchema }}</dd>
          <dt class="text-muted-foreground">editor</dt>
          <dd class="font-mono" data-testid="editor-schema">{{ editorSchema }}</dd>
        </dl>
      </template>

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
          variant="outline"
          size="sm"
          data-testid="upgrade-readonly"
          @click="emit('readonly')"
        >
          {{ unknown ? 'Open read-only' : 'Read-only' }}
        </Button>
        <Button v-if="!unknown" size="sm" data-testid="upgrade-update" @click="emit('update')">
          Update and open
        </Button>
      </div>
    </div>
  </div>
</template>
