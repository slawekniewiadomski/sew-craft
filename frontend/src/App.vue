<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

import AppBrandNav from '@/components/editor/AppBrandNav.vue';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/**
 * The editor owns the whole viewport and renders its own top bar, so neither
 * the app header nor the footer belongs on that route.
 */
const isEditor = computed(() => route.name === 'editor');

onMounted(() => {
  void auth.restore();
});

async function logout(): Promise<void> {
  await auth.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <header v-if="!isEditor" class="border-b">
      <div class="flex items-center">
        <AppBrandNav class="min-w-0 flex-1 px-4 py-3" />
        <div
          v-if="auth.isAuthenticated"
          class="flex shrink-0 items-center gap-3 pr-4 text-sm text-muted-foreground"
          data-testid="account-menu"
        >
          <span class="hidden sm:inline">{{ auth.user?.email }}</span>
          <Button variant="ghost" size="sm" data-testid="auth-logout" @click="logout">
            Log out
          </Button>
        </div>
      </div>
    </header>

    <main class="flex min-h-0 w-full flex-1 flex-col">
      <RouterView />
    </main>

    <footer v-if="!isEditor" class="border-t">
      <div class="w-full px-4 py-4 text-xs text-muted-foreground">2D sewing pattern drafting.</div>
    </footer>
  </div>
</template>
