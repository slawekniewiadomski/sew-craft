<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <nav class="flex items-center gap-6">
    <RouterLink to="/projects" class="text-lg font-semibold">SewCraft</RouterLink>
    <RouterLink to="/projects" class="text-sm text-muted-foreground hover:text-foreground">
      Projects
    </RouterLink>
  </nav>
</template>
