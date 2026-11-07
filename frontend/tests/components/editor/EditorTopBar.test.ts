import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import EditorTopBar from '@/components/editor/EditorTopBar.vue';

enableAutoUnmount(afterEach);

const savedAt = '2026-10-23T14:32:00.000Z';

function formatSavedTime(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(savedAt),
  );
}

/** The brand nav links to `/projects`, so the bar is mounted with a real router. */
async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects', name: 'projects', component: { template: '<div />' } }],
  });
  await router.push('/projects');
  await router.isReady();
  return router;
}

async function mountBar(props: Record<string, unknown> = {}) {
  const router = await makeRouter();
  return mount(EditorTopBar, {
    props: { name: 'Bodice', state: 'dirty', savedAt: null, ...props },
    global: { plugins: [router] },
  });
}

describe('EditorTopBar', () => {
  it('names the pattern and marks a new project as unsaved', async () => {
    const wrapper = await mountBar({ state: 'new' });

    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Bodice');
    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('New pattern — not saved yet');
    // An empty first save is legitimate, so a new project can be saved at once.
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(false);
  });

  it('shows unsaved changes with a dot and an enabled Save', async () => {
    const wrapper = await mountBar({ state: 'dirty' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Unsaved changes');
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('polite');
  });

  it('shows the saving state with Save disabled', async () => {
    const wrapper = await mountBar({ state: 'saving' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Saving…');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
  });

  it('shows the saved time when a checkpoint exists', async () => {
    const wrapper = await mountBar({ state: 'saved', savedAt });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe(`Saved ${formatSavedTime()}`);
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(false);
  });

  it('shows a plain saved state without a checkpoint timestamp', async () => {
    const wrapper = await mountBar({ state: 'saved', savedAt: null });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Saved');
  });

  it('shows a retryable failure assertively', async () => {
    const wrapper = await mountBar({ state: 'failed' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed — retrying');
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('assertive');
    expect(wrapper.find('[data-testid="save-status"]').classes()).toContain('text-destructive');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
  });

  it('shows a terminal failure without offering an immediate retry', async () => {
    const wrapper = await mountBar({ state: 'error' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Save failed');
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('assertive');
    expect(wrapper.find('[data-testid="save-status"]').classes()).toContain('text-destructive');
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
  });

  it('shows a paused autosave and keeps Save available for the conflict dialog', async () => {
    const wrapper = await mountBar({ state: 'paused' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe(
      'Save paused — changed elsewhere',
    );
    expect(wrapper.find('[data-testid="save-status"]').attributes('aria-live')).toBe('assertive');
    expect(wrapper.find('[data-testid="save-status"]').classes()).toContain('text-destructive');
    expect(wrapper.find('[data-testid="save-dirty-dot"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeUndefined();
  });

  it('words the saved state by the writer that produced it', async () => {
    const automatic = await mountBar({ state: 'saved', savedAt, origin: 'autosave' });

    expect(automatic.find('[data-testid="save-status"]').text()).toBe(
      `Autosaved ${formatSavedTime()}`,
    );

    const manual = await mountBar({ state: 'saved', savedAt, origin: 'manual' });

    expect(manual.find('[data-testid="save-status"]').text()).toBe(`Saved ${formatSavedTime()}`);
  });

  it('shows a plain autosaved state without a checkpoint timestamp', async () => {
    const wrapper = await mountBar({ state: 'saved', savedAt: null, origin: 'autosave' });

    expect(wrapper.find('[data-testid="save-status"]').text()).toBe('Autosaved');
  });

  it('disables Save when the document is clean', async () => {
    const wrapper = await mountBar({ state: 'saved', savedAt });

    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
  });

  it('blocks saving and shows the read-only pill for a read-only document', async () => {
    const wrapper = await mountBar({ state: 'dirty', readOnly: true });

    expect(wrapper.find('[data-testid="read-only-pill"]').text()).toBe('Read-only (older format)');
    expect(wrapper.find('[data-testid="save-project"]').attributes('disabled')).toBeDefined();
  });

  it('emits save from the button', async () => {
    const wrapper = await mountBar({ state: 'dirty' });

    await wrapper.find('[data-testid="save-project"]').trigger('click');

    expect(wrapper.emitted('save')).toHaveLength(1);
  });

  it('emits settings from the button beside the project name', async () => {
    const wrapper = await mountBar({ state: 'dirty' });

    const settings = wrapper.find('[data-testid="project-settings"]');
    expect(settings.attributes('aria-label')).toBe('Project settings');
    await settings.trigger('click');

    expect(wrapper.emitted('settings')).toHaveLength(1);
  });

  it('hides the settings button until the project loads', async () => {
    const loading = await mountBar({ state: 'new', loadState: 'loading' });
    expect(loading.find('[data-testid="project-settings"]').exists()).toBe(false);

    const failed = await mountBar({ state: 'new', loadState: 'error' });
    expect(failed.find('[data-testid="project-settings"]').exists()).toBe(false);
  });
});

describe('EditorTopBar layout', () => {
  it('merges brand navigation and project identity into one header row', async () => {
    const wrapper = await mountBar({ state: 'dirty' });

    expect(wrapper.find('header').attributes('data-testid')).toBe('editor-top-bar');
    expect(wrapper.find('[data-testid="top-bar-divider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Bodice');
    expect(wrapper.find('[data-testid="project-name"]').attributes('title')).toBe('Bodice');
    expect(wrapper.text()).toContain('SewCraft');
    expect(wrapper.text()).toContain('Projects');
  });

  it('shows the placeholder identity while the project loads', async () => {
    const wrapper = await mountBar({ state: 'new', loadState: 'loading', readOnly: true });

    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Loading…');
    expect(wrapper.find('[data-testid="save-status"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="read-only-pill"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('SewCraft');
    expect(wrapper.text()).toContain('Projects');
  });

  it('shows the error placeholder and keeps the way back to Projects', async () => {
    const wrapper = await mountBar({ loadState: 'error' });

    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Project unavailable');
    expect(wrapper.find('[data-testid="save-status"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="read-only-pill"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Projects');
  });

  it('collapses the status to a dot below 640 px', async () => {
    const wrapper = await mountBar({ state: 'dirty' });

    const status = wrapper.find('[data-testid="save-status"]');
    expect(status.classes()).toContain('whitespace-nowrap');
    expect(status.find('span').classes()).toEqual(['sr-only', 'sm:not-sr-only']);
    expect(status.attributes('title')).toBe('Unsaved changes');

    const dot = wrapper.find('[data-testid="save-status-dot"]');
    expect(dot.classes()).toContain('sm:hidden');
    expect(dot.classes()).toContain('bg-primary');
    expect(dot.attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('[data-testid="save-dirty-dot"]').classes()).toContain('sm:inline-block');
  });

  it('tones the dot for each save state', async () => {
    const tones = {
      new: 'bg-muted-foreground',
      saved: 'bg-muted-foreground',
      saving: 'bg-primary',
      failed: 'bg-destructive',
      error: 'bg-destructive',
      paused: 'bg-destructive',
    } as const;

    for (const [state, tone] of Object.entries(tones)) {
      const wrapper = await mountBar({ state });
      expect(wrapper.find('[data-testid="save-status-dot"]').classes()).toContain(tone);
    }
  });
});
