<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b">
      <nav class="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
        <RouterLink to="/projects" class="text-lg font-semibold">SewCraft</RouterLink>
        <RouterLink to="/projects" class="text-sm text-muted-foreground hover:text-foreground">
          Projects
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <RouterView />
    </main>

    <footer class="border-t">
      <div class="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-muted-foreground">
        2D sewing pattern drafting.
      </div>
    </footer>
  </div>
</template>
