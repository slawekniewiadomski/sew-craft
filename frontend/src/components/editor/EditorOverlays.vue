<script setup lang="ts">
import type { Piece } from '@sewcraft/geometry';

import type { Project } from '@/api/projects';
import type { ProjectSettingsDraft } from '@/components/dialogs/ProjectSettingsDialog.vue';
import ExportDialog from '@/components/dialogs/ExportDialog.vue';
import ProjectSettingsDialog from '@/components/dialogs/ProjectSettingsDialog.vue';
import SaveConflictDialog from '@/components/dialogs/SaveConflictDialog.vue';
import UpgradeDocumentDialog from '@/components/dialogs/UpgradeDocumentDialog.vue';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import type { ExportSettings } from '@/lib/display-settings';

/** The modals the editor can open, grouped away from the workspace markup. */
defineProps<{
  exportOpen: boolean;
  activePiece: Piece | null;
  activePieceLabel: string;
  exportSettings: ExportSettings;
  conflict: { savedAt: string | null } | null;
  settingsOpen: boolean;
  project: Project | null;
  defaultAllowance: AllowanceChoice;
  readOnly: boolean;
  settingsSaving: boolean;
  settingsError: string | null;
  pendingUpgrade: { schema: string } | null;
  /** The schema this build writes, shown by the upgrade dialog. */
  editorSchema: string;
}>();

const emit = defineEmits<{
  'update:exportSettings': [settings: ExportSettings];
  download: [];
  'close-export': [];
  'reload-conflict': [];
  overwrite: [];
  'save-settings': [draft: ProjectSettingsDraft];
  'close-settings': [];
  'open-readonly': [];
  'cancel-upgrade': [];
}>();
</script>

<template>
  <ExportDialog
    v-if="exportOpen && activePiece"
    :piece-label="activePieceLabel"
    :settings="exportSettings"
    @update:settings="emit('update:exportSettings', $event)"
    @download="emit('download')"
    @cancel="emit('close-export')"
  />

  <SaveConflictDialog
    v-if="conflict"
    :saved-at="conflict.savedAt"
    @reload="emit('reload-conflict')"
    @overwrite="emit('overwrite')"
  />

  <ProjectSettingsDialog
    v-if="settingsOpen && project"
    :project="project"
    :allowance="defaultAllowance"
    :read-only="readOnly"
    :saving="settingsSaving"
    :error="settingsError"
    @save="emit('save-settings', $event)"
    @cancel="emit('close-settings')"
  />

  <UpgradeDocumentDialog
    v-if="pendingUpgrade"
    :saved-schema="pendingUpgrade.schema"
    :editor-schema="editorSchema"
    @readonly="emit('open-readonly')"
    @cancel="emit('cancel-upgrade')"
  />
</template>
