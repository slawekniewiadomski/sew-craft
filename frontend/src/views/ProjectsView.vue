<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { Button } from '@/components/ui/button';
import ProjectSettingsDialog from '@/components/dialogs/ProjectSettingsDialog.vue';
import type { ProjectSettingsDraft } from '@/components/dialogs/ProjectSettingsDialog.vue';
import { useProjectsStore } from '@/stores/projects';
import type { Project } from '@/api/projects';

const store = useProjectsStore();
const name = ref('');
const createError = ref<string | null>(null);
const editing = ref<Project | null>(null);
const saving = ref(false);
const settingsError = ref<string | null>(null);
const atLimit = computed(() => store.myProjectCount >= 3);

onMounted(() => {
  void store.fetchProjects();
});

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (trimmed === '' || atLimit.value) return;

  createError.value = null;
  try {
    await store.createProject({ name: trimmed });
    name.value = '';
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : 'Failed to create the project';
  }
}

function openSettings(project: Project): void {
  settingsError.value = null;
  editing.value = project;
}

async function onSaveSettings(draft: ProjectSettingsDraft): Promise<void> {
  /* v8 ignore next -- the dialog renders only while a row is edited */
  if (editing.value === null) return;

  saving.value = true;
  settingsError.value = null;

  try {
    await store.updateProject(editing.value.id, {
      name: draft.name,
      description: draft.description,
    });
    editing.value = null;
  } catch (cause) {
    settingsError.value =
      cause instanceof Error ? cause.message : 'Failed to save project settings';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="h-full space-y-6 overflow-y-auto px-4 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Projects</h1>
    </div>

    <div class="space-y-2">
      <form class="flex gap-2" @submit.prevent="submit">
        <input
          v-model="name"
          type="text"
          placeholder="New project name"
          :disabled="atLimit"
          class="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="project-name-input"
        />
        <Button
          type="submit"
          :disabled="atLimit || name.trim() === ''"
          data-testid="project-create"
        >
          Create
        </Button>
      </form>
      <p class="text-xs text-muted-foreground" data-testid="project-quota">
        {{ store.myProjectCount }} of 3 projects used
      </p>
      <p v-if="atLimit" class="text-xs text-muted-foreground" data-testid="project-limit">
        You have reached the limit for this account.
      </p>
      <p v-if="createError" class="text-sm text-destructive" data-testid="project-create-error">
        {{ createError }}
      </p>
    </div>

    <p v-if="store.loading" class="text-sm text-muted-foreground">Loading…</p>
    <p v-else-if="store.error" class="text-sm text-destructive">{{ store.error }}</p>

    <ul v-else class="divide-y rounded-md border">
      <li
        v-for="project in store.projects"
        :key="project.id"
        class="flex items-center justify-between px-4 py-3"
      >
        <div class="min-w-0">
          <p class="font-medium">{{ project.name }}</p>
          <p v-if="project.description" class="text-sm text-muted-foreground">
            {{ project.description }}
          </p>
          <p class="text-xs text-muted-foreground" data-testid="project-owner">
            {{ project.can_edit ? 'Yours' : (project.owner?.email ?? 'Public project') }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <RouterLink :to="`/projects/${project.id}/edit`">
            <Button variant="outline" size="sm">
              {{ project.can_edit ? 'Open' : 'View' }}
            </Button>
          </RouterLink>
          <template v-if="project.can_edit">
            <Button
              variant="ghost"
              size="sm"
              :aria-label="`Settings for ${project.name}`"
              @click="openSettings(project)"
            >
              Settings
            </Button>
            <Button variant="ghost" size="sm" @click="store.removeProject(project.id)">
              Delete
            </Button>
          </template>
        </div>
      </li>
      <li
        v-if="store.projects.length === 0"
        class="px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No projects yet. Create your first one above.
      </li>
    </ul>

    <ProjectSettingsDialog
      v-if="editing"
      :project="editing"
      :saving="saving"
      :error="settingsError"
      @save="onSaveSettings"
      @cancel="editing = null"
    />
  </section>
</template>
