<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const confirmation = ref('');

async function submit(): Promise<void> {
  if (await auth.register(email.value.trim(), password.value, confirmation.value)) {
    await router.push({ name: 'projects' });
  }
}
</script>

<template>
  <section class="flex flex-1 items-center justify-center px-4 py-12">
    <form
      class="w-full max-w-sm space-y-5 rounded-lg border p-6"
      data-testid="register-form"
      @submit.prevent="submit"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">Create an account</h1>
        <p class="text-sm text-muted-foreground">
          Each account can keep up to three projects. Projects are public.
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
          minlength="8"
          autocomplete="new-password"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="auth-password"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm font-medium">Confirm password</span>
        <input
          v-model="confirmation"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="auth-password-confirmation"
        />
      </label>

      <p v-if="auth.error" class="text-sm text-destructive" data-testid="auth-error">
        {{ auth.error }}
      </p>

      <Button type="submit" class="w-full" :disabled="auth.busy" data-testid="auth-submit">
        {{ auth.busy ? 'Creating account…' : 'Create account' }}
      </Button>

      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <RouterLink to="/login" class="text-primary underline">Sign in</RouterLink>
      </p>
    </form>
  </section>
</template>
