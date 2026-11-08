import type { PatternDocument } from '@sewcraft/geometry';
import { PATTERN_SCHEMA } from '@sewcraft/geometry';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';

import { ApiError, projectsApi, type Pattern, type Project } from '@/api/projects';
import { createAutosave, fitsKeepaliveBudget, type AutosaveScheduler } from '@/lib/autosave';
import { readPersistedTab } from '@/lib/tabs';
import type { useEditorStore } from '@/stores/editor';

type EditorStore = ReturnType<typeof useEditorStore>;

export type LoadState = 'loading' | 'ready' | 'error';
export type SaveBarState = 'new' | 'dirty' | 'saving' | 'saved' | 'failed' | 'paused' | 'error';
type SaveOutcome = 'saved' | 'retry' | 'stop';

interface SaveOptions {
  origin?: 'manual' | 'autosave';
  /** Keep the request alive when the page is hidden or unloading. */
  keepalive?: boolean;
}

interface PendingUpgrade {
  /** The document exactly as stored; a failed upgrade keeps this read-only. */
  stored: PatternDocument;
  /** The document to open: normalised for an older known schema. */
  document: PatternDocument;
  schema: string;
  version: number;
  savedAt: string | null;
  unknown: boolean;
}

export interface ProjectSessionOptions {
  projectId: () => string;
  editor: EditorStore;
  pattern: () => PatternDocument;
  /** Surface a save failure in the editor's error strip. */
  reportError: (message: string | null) => void;
}

/**
 * The editor's project session: loading the stored pattern, the one write path
 * shared by Save and autosave, and the save/upgrade/conflict dialogs it drives.
 *
 * The view owns the document and the store; this owns the lifecycle of talking
 * to the API about them, so the same state machine serves the toolbar, the
 * keyboard shortcut and the unload guard.
 */
export function useProjectSession({
  projectId,
  editor,
  pattern,
  reportError,
}: ProjectSessionOptions) {
  const router = useRouter();

  const loadState = ref<LoadState>('loading');
  const loadError = ref<string | null>(null);
  const project = ref<Project | null>(null);
  const settingsOpen = ref(false);
  const settingsSaving = ref(false);
  const settingsError = ref<string | null>(null);
  const pendingUpgrade = ref<PendingUpgrade | null>(null);
  /** Set when a save lost the version race; `savedAt` is the winner's checkpoint. */
  const conflict = ref<{ savedAt: string | null } | null>(null);
  /** Any open modal owns the keyboard and blocks the editor shortcuts. */
  const dialogOpen = computed(
    () => pendingUpgrade.value !== null || conflict.value !== null || settingsOpen.value,
  );

  /** The one status the save bar shows: paused > saving > error > dirty/failed > saved. */
  const saveBarState = computed<SaveBarState>(() => {
    if (editor.saveState === 'paused') return 'paused';
    if (editor.saveState === 'saving') return 'saving';
    if (editor.saveState === 'error') return 'error';
    if (editor.isDirty) return editor.saveState === 'failed' ? 'failed' : 'dirty';
    return editor.isNew ? 'new' : 'saved';
  });

  /** Whether a background write is meaningful right now. */
  function canAutosave(): boolean {
    if (loadState.value !== 'ready') return false;
    if (editor.readOnly) return false;
    if (dialogOpen.value) return false;
    if (editor.saveState === 'paused') return false;
    // A manual save (or a lifecycle flush) already writes this document.
    if (editor.saveState === 'saving') return false;
    return editor.isDirty;
  }

  /** Whether a stored document has the arrays every render path dereferences. */
  function isRenderableDocument(stored: PatternDocument): boolean {
    return (
      Array.isArray(stored.entities) &&
      Array.isArray(stored.constraints) &&
      Array.isArray(stored.pieces)
    );
  }

  function unreadableMessage(projectName: string): string {
    return `The stored pattern for "${projectName}" is unreadable.`;
  }

  /** Load the project row and its stored pattern; a new project opens empty. */
  async function loadProject(): Promise<void> {
    autosave.cancel();
    loadState.value = 'loading';
    loadError.value = null;
    // Drop any previous project's document so a shortcut or save can never send
    // it to this project before the load resolves.
    editor.markNew();

    try {
      const [projectResponse, patternResponse] = await Promise.all([
        projectsApi.get(Number(projectId())),
        projectsApi.getPattern(Number(projectId())),
      ]);
      project.value = projectResponse.data;
      applySnapshot(patternResponse.data, projectResponse.data.name);
      // Every account may open every public project, but only its owner edits.
      if (!projectResponse.data.can_edit) editor.setReadOnly(true);
      loadState.value = 'ready';
    } catch (cause) {
      loadError.value = cause instanceof Error ? cause.message : 'Failed to load the project';
      loadState.value = 'error';
    }
  }

  /**
   * Adopt a stored pattern. This build reads the current schema only; anything
   * else is rendered read-only and never migrated, copied or rewritten.
   */
  function applySnapshot(snapshot: Pattern, projectName: string): void {
    const stored = snapshot.document;

    if (stored === null) {
      editor.markNew();
      return;
    }

    if (stored.schema === PATTERN_SCHEMA) {
      if (!isRenderableDocument(stored)) throw new Error(unreadableMessage(projectName));
      editor.markLoaded(
        stored,
        snapshot.version,
        snapshot.saved_at,
        readPersistedTab(window.localStorage, projectId()),
      );
      return;
    }

    if (!isRenderableDocument(stored)) throw new Error(unreadableMessage(projectName));
    editor.markReadOnlyLoaded(stored, snapshot.version, snapshot.saved_at);
    pendingUpgrade.value = {
      stored,
      document: stored,
      schema: stored.schema,
      version: snapshot.version,
      savedAt: snapshot.saved_at,
      unknown: true,
    };
  }

  /**
   * Write the current document. Returns what the writer should do next: an
   * explicit save that tripped a conflict opens the dialog instead and leaves
   * the work untouched, while an autosave pauses quietly and waits for a manual
   * Save.
   */
  async function persist(
    expectedVersion: number | null,
    { origin = 'manual', keepalive = false }: SaveOptions = {},
  ): Promise<SaveOutcome> {
    const snapshot = pattern();
    editor.markSaving();

    try {
      const payload = {
        document: snapshot,
        expected_version: expectedVersion,
        ...(origin === 'autosave' ? { origin } : {}),
      };

      const response = keepalive
        ? await projectsApi.savePattern(Number(projectId()), payload, { keepalive: true })
        : await projectsApi.savePattern(Number(projectId()), payload);
      editor.markSaved(snapshot, response.data.version, response.data.saved_at, origin);
      reportError(null);
      return 'saved';
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const body = cause.body as { saved_at?: string | null } | null;

        // Never open a modal while the maker is typing: an autosave conflict only
        // pauses the bar, and the explicit Save reuses the existing dialog.
        if (origin === 'autosave') {
          editor.markSavePaused();
          return 'stop';
        }

        conflict.value = { savedAt: body?.saved_at ?? null };
        editor.markSaveFailed();
        return 'stop';
      }

      if (cause instanceof ApiError && cause.status === 404) {
        editor.markSaveFailed();
        loadError.value = 'This project no longer exists.';
        loadState.value = 'error';
        return 'stop';
      }

      // A 4xx other than a conflict or a missing project is permanent: retrying
      // the same document would fail the same way, so a new change is required.
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        editor.markSaveError();
        reportError(cause.message);
        return 'stop';
      }

      editor.markSaveFailed();
      reportError(cause instanceof Error ? cause.message : 'Save failed');
      return 'retry';
    }
  }

  /**
   * The one background writer. It owns timing only: every write still goes
   * through `persist`, so autosave and the Save button share one code path.
   */
  const autosave: AutosaveScheduler = createAutosave({
    write: (origin) => persist(editor.savedVersion, { origin }),
    shouldWrite: canAutosave,
  });

  /** Save through the button and Cmd/Ctrl+S; clean, saving or read-only is a no-op. */
  function save(): void {
    if (loadState.value !== 'ready') return;
    if (editor.readOnly || editor.saveState === 'saving') return;
    if (!editor.isDirty && !editor.isNew) return;

    // A retryable failure arms the background ladder inside the scheduler.
    void autosave.flush();
  }

  function reloadFromConflict(): void {
    conflict.value = null;
    autosave.cancel();
    void loadProject();
  }

  /** Explicit overwrite: no expected version, so the save appends a checkpoint. */
  function overwrite(): void {
    conflict.value = null;
    autosave.cancel();
    void persist(null).then((outcome) => {
      if (outcome === 'retry') autosave.retry();
    });
  }

  function openReadOnlyDocument(): void {
    const pending = pendingUpgrade.value;
    if (pending === null) return;

    editor.markReadOnlyLoaded(pending.stored, pending.version, pending.savedAt);
    editor.setReadOnly(true);
    pendingUpgrade.value = null;
  }

  function cancelUpgrade(): void {
    pendingUpgrade.value = null;
    void router.push({ name: 'projects' });
  }

  /** The browser's own prompt; there is no silent discard on a reload or close. */
  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!editor.isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onBeforeRouteLeave(() => {
    if (!editor.isDirty) return true;
    return window.confirm('You have unsaved changes. Leave without saving?');
  });

  /**
   * Best-effort write while the tab is hidden or the page is unloading. The
   * browser drops oversized keepalive requests, so an over-budget payload is
   * skipped and the unload guard remains the backstop.
   */
  function flushBeforeUnload(): void {
    if (!canAutosave()) return;

    const payload = {
      document: pattern(),
      expected_version: editor.savedVersion,
      origin: 'autosave' as const,
    };

    if (!fitsKeepaliveBudget(JSON.stringify(payload))) return;

    autosave.cancel();
    // The response still updates the bar when the tab merely lost focus; during a
    // real unload there is nothing left to update, which is harmless.
    void persist(editor.savedVersion, { origin: 'autosave', keepalive: true });
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      flushBeforeUnload();
      return;
    }

    // A hidden tab cancelled the pending timers; re-arm when the maker returns.
    if (editor.isDirty) autosave.schedule();
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushBeforeUnload);
    void loadProject();
  });

  onBeforeUnmount(() => {
    autosave.cancel();
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', flushBeforeUnload);
  });

  return {
    loadState,
    loadError,
    project,
    settingsOpen,
    settingsSaving,
    settingsError,
    pendingUpgrade,
    conflict,
    dialogOpen,
    saveBarState,
    autosave,
    persist,
    save,
    reloadFromConflict,
    overwrite,
    openReadOnlyDocument,
    cancelUpgrade,
  };
}
