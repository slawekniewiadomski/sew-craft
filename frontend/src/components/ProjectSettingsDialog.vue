<script lang="ts">
import type { AllowanceChoice } from '@/lib/allowance-defaults';

/** What the settings modal asks its parent to persist. */
export interface ProjectSettingsDraft {
  name: string;
  /** `null` clears the description. */
  description: string | null;
  /** `null` when the modal does not offer the allowance (no document loaded). */
  allowance: AllowanceChoice | null;
}
</script>

<script setup lang="ts">
import type { AllowanceKind } from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import ModalDialog from '@/components/ModalDialog.vue';
import { Button } from '@/components/ui/button';
import { useDialogFocus } from '@/composables/use-dialog-focus';
import { parseAllowanceWidth } from '@/lib/allowance-width';

const props = withDefaults(
  defineProps<{
    project: { name: string; description: string | null };
    /** `null` hides the allowance section (no document is loaded). */
    allowance?: AllowanceChoice | null;
    /** An older-format document: metadata stays editable, the allowance does not. */
    readOnly?: boolean;
    saving?: boolean;
    error?: string | null;
  }>(),
  { allowance: null, readOnly: false, saving: false, error: null },
);

const emit = defineEmits<{ save: [draft: ProjectSettingsDraft]; cancel: [] }>();

const name = ref(props.project.name);
const description = ref(props.project.description ?? '');
const kind = ref<AllowanceKind | 'none'>(props.allowance?.kind ?? 'none');
const width = ref(
  props.allowance !== null && props.allowance.kind !== 'none' ? String(props.allowance.width) : '',
);

const nameInput = ref<HTMLInputElement | null>(null);
const cancelButton = ref<{ $el: HTMLButtonElement } | null>(null);

const { trapTab } = useDialogFocus(nameInput, nameInput, cancelButton);

const hasAllowance = computed(() => props.allowance !== null);
const trimmedName = computed(() => name.value.trim());
const trimmedDescription = computed(() => description.value.trim());
const parsedWidth = computed(() => parseAllowanceWidth(width.value));

const nameError = computed(() => {
  if (trimmedName.value === '') return 'A project name is required.';
  if (trimmedName.value.length > 255) return 'Use 255 characters or fewer.';
  return null;
});

const widthError = computed(() => {
  if (!hasAllowance.value || kind.value === 'none') return null;
  return parsedWidth.value === null ? 'Enter a width greater than zero.' : null;
});

const allowanceDraft = computed<AllowanceChoice | null>(() => {
  if (!hasAllowance.value) return null;
  if (kind.value === 'none') return { kind: 'none', width: 0 };
  return { kind: kind.value, width: parsedWidth.value! };
});

const metadataChanged = computed(
  () =>
    trimmedName.value !== props.project.name ||
    (trimmedDescription.value === '' ? null : trimmedDescription.value) !==
      props.project.description,
);

const allowanceChanged = computed(() => {
  const current = props.allowance;
  if (current === null) return false;
  if (kind.value !== current.kind) return true;
  return kind.value !== 'none' && parsedWidth.value !== current.width;
});

const canSave = computed(
  () =>
    !props.saving &&
    nameError.value === null &&
    widthError.value === null &&
    (metadataChanged.value || allowanceChanged.value),
);

/** Keep the width as the raw input string so partial values stay editable. */
function onWidthInput(event: Event): void {
  width.value = (event.target as HTMLInputElement).value;
}

/** Switching away from None restores the usual 10 mm default when empty. */
function onKindChange(event: Event): void {
  kind.value = (event.target as HTMLSelectElement).value as AllowanceKind | 'none';
  if (kind.value !== 'none' && parsedWidth.value === null) {
    width.value = '10';
  }
}

function submit(): void {
  if (!canSave.value) return;
  emit('save', {
    name: trimmedName.value,
    description: trimmedDescription.value === '' ? null : trimmedDescription.value,
    allowance: allowanceDraft.value,
  });
}
</script>

<template>
  <ModalDialog
    labelled-by="project-settings-title"
    data-testid="project-settings-dialog"
    size="md"
    density="loose"
    :dismissible="!props.saving"
    @cancel="emit('cancel')"
    @keydown="trapTab"
  >
    <h2 id="project-settings-title" class="text-sm font-semibold">Project settings</h2>

    <form class="space-y-3" @submit.prevent="submit">
      <div class="space-y-1">
        <label for="project-settings-name" class="text-2xs text-muted-foreground">Name</label>
        <input
          id="project-settings-name"
          ref="nameInput"
          v-model="name"
          type="text"
          maxlength="255"
          autocomplete="off"
          :disabled="props.saving"
          :aria-invalid="nameError !== null"
          aria-describedby="project-settings-name-error"
          data-testid="project-settings-name"
          class="h-8 w-full rounded-sm border px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p
          v-if="nameError"
          id="project-settings-name-error"
          class="text-2xs text-destructive"
          data-testid="project-settings-name-error"
        >
          {{ nameError }}
        </p>
      </div>

      <div class="space-y-1">
        <label for="project-settings-description" class="text-2xs text-muted-foreground">
          Description
        </label>
        <textarea
          id="project-settings-description"
          v-model="description"
          rows="3"
          :disabled="props.saving"
          data-testid="project-settings-description"
          class="w-full resize-y rounded-sm border px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <fieldset v-if="hasAllowance" class="space-y-1 border-t pt-3">
        <legend class="text-2xs text-muted-foreground">Default seam allowance</legend>
        <div class="flex flex-wrap items-center gap-1.5">
          <select
            :value="kind"
            :disabled="props.readOnly || props.saving"
            aria-label="Default allowance kind"
            data-testid="project-settings-allowance-kind"
            class="h-7 rounded-sm border px-1.5 text-xs"
            @change="onKindChange"
          >
            <option value="none">None</option>
            <option value="seam">Seam</option>
            <option value="single">Single fold</option>
            <option value="double">Double fold</option>
          </select>
          <input
            :value="width"
            type="number"
            min="0.1"
            step="0.1"
            :disabled="kind === 'none' || props.readOnly || props.saving"
            :aria-invalid="widthError !== null"
            aria-label="Default allowance width"
            data-testid="project-settings-allowance-width"
            class="h-7 w-20 rounded-sm border px-2 text-xs tabular-nums"
            @input="onWidthInput"
          />
          <span class="text-2xs text-muted-foreground">mm</span>
        </div>
        <p class="text-2xs leading-snug text-muted-foreground">
          Copied onto new pieces that inherit it. Existing pieces are unchanged.
        </p>
        <p v-if="props.readOnly" class="text-2xs text-muted-foreground">
          The default is locked while the document is read-only.
        </p>
        <p
          v-if="widthError"
          class="text-2xs text-destructive"
          data-testid="project-settings-width-error"
        >
          {{ widthError }}
        </p>
      </fieldset>

      <p v-if="props.error" class="text-2xs text-destructive" data-testid="project-settings-error">
        {{ props.error }}
      </p>

      <div class="flex justify-end gap-2 border-t pt-3">
        <Button
          ref="cancelButton"
          variant="outline"
          size="sm"
          :disabled="props.saving"
          data-testid="project-settings-cancel"
          @click="emit('cancel')"
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" :disabled="!canSave" data-testid="project-settings-save">
          {{ props.saving ? 'Saving…' : 'Save' }}
        </Button>
      </div>
    </form>
  </ModalDialog>
</template>
