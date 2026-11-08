import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { authApi, type AuthSession } from '@/api/auth';
import { readAuthToken, writeAuthToken } from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthSession['user'] | null>(null);
  /** Whether the boot-time token check has finished. */
  const loaded = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);

  function adopt(session: AuthSession): void {
    writeAuthToken(session.token);
    user.value = session.user;
    loaded.value = true;
  }

  /** Restore the stored session once per page load. */
  async function restore(): Promise<void> {
    if (loaded.value) return;
    if (readAuthToken() === null) {
      loaded.value = true;
      return;
    }

    try {
      user.value = (await authApi.user()).data;
    } catch {
      writeAuthToken(null);
      user.value = null;
    } finally {
      loaded.value = true;
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    busy.value = true;
    error.value = null;
    let ok = false;
    try {
      adopt((await authApi.login({ email, password })).data);
      ok = true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not sign in';
    } finally {
      busy.value = false;
    }
    return ok;
  }

  async function register(
    email: string,
    password: string,
    passwordConfirmation: string,
  ): Promise<boolean> {
    busy.value = true;
    error.value = null;
    let ok = false;
    try {
      adopt(
        (await authApi.register({ email, password, password_confirmation: passwordConfirmation }))
          .data,
      );
      ok = true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not create the account';
    } finally {
      busy.value = false;
    }
    return ok;
  }

  async function logout(): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await authApi.logout();
    } catch {
      // The local session is the source of truth for this browser: a failed
      // server-side revoke still signs the user out here.
    } finally {
      writeAuthToken(null);
      user.value = null;
      loaded.value = true;
      busy.value = false;
    }
  }

  return { user, loaded, busy, error, isAuthenticated, restore, login, register, logout };
});
