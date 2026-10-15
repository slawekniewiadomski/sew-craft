<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { Button } from '@/components/ui/button';
import { useProjectsStore } from '@/stores/projects';

const store = useProjectsStore();
const name = ref('');

onMounted(() => {
  void store.fetchProjects();
});

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (trimmed === '') return;

  await store.createProject({ name: trimmed });
  name.value = '';
}
</script>

<template>
  <section class="h-full space-y-6 overflow-y-auto px-4 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Projects</h1>
    </div>

    <form class="flex gap-2" @submit.prevent="submit">
      <input
        v-model="name"
        type="text"
        placeholder="New project name"
        class="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="submit" :disabled="name.trim() === ''">Create</Button>
    </form>

    <p v-if="store.loading" class="text-sm text-muted-foreground">Loading…</p>
    <p v-else-if="store.error" class="text-sm text-destructive">{{ store.error }}</p>

    <ul v-else class="divide-y rounded-md border">
      <li
        v-for="project in store.projects"
        :key="project.id"
        class="flex items-center justify-between px-4 py-3"
      >
        <div>
          <p class="font-medium">{{ project.name }}</p>
          <p v-if="project.description" class="text-sm text-muted-foreground">
            {{ project.description }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink :to="`/projects/${project.id}/edit`">
            <Button variant="outline" size="sm">Open</Button>
          </RouterLink>
          <Button variant="ghost" size="sm" @click="store.removeProject(project.id)">
            Delete
          </Button>
        </div>
      </li>
      <li
        v-if="store.projects.length === 0"
        class="px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No projects yet. Create your first one above.
      </li>
    </ul>
  </section>
</template>
