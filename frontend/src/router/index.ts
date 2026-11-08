import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from '@/stores/auth';
import EditorView from '@/views/EditorView.vue';
import LoginView from '@/views/LoginView.vue';
import ProjectsView from '@/views/ProjectsView.vue';
import RegisterView from '@/views/RegisterView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/projects', name: 'projects', component: ProjectsView },
    { path: '/projects/:id/edit', name: 'editor', component: EditorView, props: true },
  ],
});

/**
 * The app is private by default: every route except the auth screens needs a
 * signed-in account. `restore` owns the one boot-time token check.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.restore();

  const authRoute = to.name === 'login' || to.name === 'register';
  if (!auth.isAuthenticated) {
    return authRoute ? true : { name: 'login', query: { redirect: to.fullPath } };
  }

  return authRoute ? { name: 'projects' } : true;
});
