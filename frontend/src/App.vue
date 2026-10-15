<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();

/** The editor owns the whole viewport; the footer only belongs on other routes. */
const isEditor = computed(() => route.name === 'editor');
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <header class="border-b">
      <nav class="flex w-full items-center gap-6 px-4 py-3">
        <RouterLink to="/projects" class="text-lg font-semibold">SewCraft</RouterLink>
        <RouterLink to="/projects" class="text-sm text-muted-foreground hover:text-foreground">
          Projects
        </RouterLink>
      </nav>
    </header>

    <main class="flex min-h-0 w-full flex-1 flex-col">
      <RouterView />
    </main>

    <footer v-if="!isEditor" class="border-t">
      <div class="w-full px-4 py-4 text-xs text-muted-foreground">2D sewing pattern drafting.</div>
    </footer>
  </div>
</template>
