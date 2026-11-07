<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import AppBrandNav from '@/components/editor/AppBrandNav.vue';

const route = useRoute();

/**
 * The editor owns the whole viewport and renders its own top bar, so neither
 * the app header nor the footer belongs on that route.
 */
const isEditor = computed(() => route.name === 'editor');
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <header v-if="!isEditor" class="border-b">
      <AppBrandNav class="w-full px-4 py-3" />
    </header>

    <main class="flex min-h-0 w-full flex-1 flex-col">
      <RouterView />
    </main>

    <footer v-if="!isEditor" class="border-t">
      <div class="w-full px-4 py-4 text-xs text-muted-foreground">2D sewing pattern drafting.</div>
    </footer>
  </div>
</template>
