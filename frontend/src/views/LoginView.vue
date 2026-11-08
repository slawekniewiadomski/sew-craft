<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');

function redirectTarget(): string | null {
  const target = route.query.redirect;
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : null;
}

async function submit(): Promise<void> {
  if (await auth.login(email.value.trim(), password.value)) {
    await router.push(redirectTarget() ?? { name: 'projects' });
  }
}
</script>

<template>
  <section class="flex flex-1 items-center justify-center px-4 py-12">
    <form
      class="w-full max-w-sm space-y-5 rounded-lg border p-6"
      data-testid="login-form"
      @submit.prevent="submit"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">Sign in</h1>
        <p class="text-sm text-muted-foreground">
          Your projects stay public to the other makers on this instance.
        </p>
      </div>

      <label class="block space-y-1.5">
        <span class="text-sm font-medium">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="auth-email"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm font-medium">Password</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="auth-password"
        />
      </label>

      <p v-if="auth.error" class="text-sm text-destructive" data-testid="auth-error">
        {{ auth.error }}
      </p>

      <Button type="submit" class="w-full" :disabled="auth.busy" data-testid="auth-submit">
        {{ auth.busy ? 'Signing in…' : 'Sign in' }}
      </Button>

      <p class="text-center text-sm text-muted-foreground">
        No account?
        <RouterLink to="/register" class="text-primary underline">Create one</RouterLink>
      </p>
    </form>
  </section>
</template>
