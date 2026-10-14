import { createRouter, createWebHistory } from 'vue-router';

import EditorView from '@/views/EditorView.vue';
import ProjectsView from '@/views/ProjectsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', name: 'projects', component: ProjectsView },
    { path: '/projects/:id/edit', name: 'editor', component: EditorView, props: true },
  ],
});
