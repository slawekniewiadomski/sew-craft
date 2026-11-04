import { defineStore } from 'pinia';
import { ref } from 'vue';

import { projectsApi, type Project, type UpdateProjectPayload } from '@/api/projects';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchProjects(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await projectsApi.list();
      projects.value = response.data;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load projects';
    } finally {
      loading.value = false;
    }
  }

  async function createProject(payload: { name: string; description?: string }): Promise<Project> {
    const response = await projectsApi.create(payload);
    projects.value = [response.data, ...projects.value];
    return response.data;
  }

  /** Save metadata and replace the cached row, so the list reflects the edit. */
  async function updateProject(id: number, payload: UpdateProjectPayload): Promise<Project> {
    const response = await projectsApi.update(id, payload);
    projects.value = projects.value.map((project) => (project.id === id ? response.data : project));
    return response.data;
  }

  async function removeProject(id: number): Promise<void> {
    await projectsApi.remove(id);
    projects.value = projects.value.filter((project) => project.id !== id);
  }

  return { projects, loading, error, fetchProjects, createProject, updateProject, removeProject };
});
