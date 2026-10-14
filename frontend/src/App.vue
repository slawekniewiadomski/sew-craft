<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b">
      <nav class="flex w-full items-center gap-6 px-4 py-3">
        <RouterLink to="/projects" class="text-lg font-semibold">SewCraft</RouterLink>
        <RouterLink to="/projects" class="text-sm text-muted-foreground hover:text-foreground">
          Projects
        </RouterLink>
      </nav>
    </header>

    <main class="w-full flex-1 px-4 py-8">
      <RouterView />
    </main>

    <footer class="border-t">
      <div class="w-full px-4 py-4 text-xs text-muted-foreground">2D sewing pattern drafting.</div>
    </footer>
  </div>
</template>
