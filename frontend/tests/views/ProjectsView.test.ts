import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsApi, type Project } from '@/api/projects';

import ProjectsView from '@/views/ProjectsView.vue';

vi.mock('@/api/projects', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const listMock = vi.mocked(projectsApi.list);
const createMock = vi.mocked(projectsApi.create);
const updateMock = vi.mocked(projectsApi.update);
const removeMock = vi.mocked(projectsApi.remove);

const project = (id: number, description: string | null = null): Project => ({
  id,
  name: `Project ${id}`,
  description,
  created_at: '',
  updated_at: '',
});

const Stub = { template: '<div />' };

async function mountView(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: ProjectsView },
      { path: '/projects/:id/edit', name: 'editor', component: Stub },
    ],
  });
  await router.push('/projects');
  await router.isReady();
  const wrapper = mount(ProjectsView, {
    global: { plugins: [createPinia(), router] },
  });
  return { wrapper, router };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('ProjectsView', () => {
  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
  });

  it('shows a loading message while fetching', async () => {
    const pending = deferred<{ data: Project[] }>();
    listMock.mockReturnValue(pending.promise);

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Loading');

    pending.resolve({ data: [] });
    await flushPromises();
  });

  it('shows the error message when loading fails', async () => {
    listMock.mockRejectedValue(new Error('network down'));

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('network down');
  });

  it('renders an empty state', async () => {
    listMock.mockResolvedValue({ data: [] });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('No projects yet');
  });

  it('renders projects, including an optional description', async () => {
    listMock.mockResolvedValue({ data: [project(1, 'A-line block'), project(2)] });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Project 1');
    expect(wrapper.text()).toContain('A-line block');
    expect(wrapper.text()).toContain('Project 2');
    expect(wrapper.findAll('li')).toHaveLength(2);
  });

  it('edits a project name and description from the settings modal', async () => {
    listMock.mockResolvedValue({ data: [project(1, 'Old note')] });
    updateMock.mockResolvedValue({
      data: { ...project(1, 'New note'), name: 'Renamed' },
    });

    const { wrapper } = await mountView();
    await flushPromises();

    const settings = wrapper.findAll('button').filter((button) => button.text() === 'Settings');
    await settings[0]!.trigger('click');

    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-settings-allowance-kind"]').exists()).toBe(false);

    await wrapper.find('[data-testid="project-settings-name"]').setValue('Renamed');
    await wrapper.find('[data-testid="project-settings-description"]').setValue('New note');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledWith(1, { name: 'Renamed', description: 'New note' });
    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Renamed');
  });

  it('keeps the settings modal open with an inline error when saving fails', async () => {
    listMock.mockResolvedValue({ data: [project(1)] });
    updateMock.mockRejectedValueOnce(new Error('network down'));

    const { wrapper } = await mountView();
    await flushPromises();

    const settings = wrapper.findAll('button').filter((button) => button.text() === 'Settings');
    await settings[0]!.trigger('click');
    await wrapper.find('[data-testid="project-settings-name"]').setValue('Renamed');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-settings-error"]').text()).toBe('network down');
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    listMock.mockResolvedValue({ data: [project(1)] });
    updateMock.mockRejectedValueOnce('offline');

    const { wrapper } = await mountView();
    await flushPromises();

    const settings = wrapper.findAll('button').filter((button) => button.text() === 'Settings');
    await settings[0]!.trigger('click');
    await wrapper.find('[data-testid="project-settings-name"]').setValue('Renamed');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-settings-error"]').text()).toBe(
      'Failed to save project settings',
    );
  });

  it('closes the settings modal without saving on cancel', async () => {
    listMock.mockResolvedValue({ data: [project(1)] });

    const { wrapper } = await mountView();
    await flushPromises();

    const settings = wrapper.findAll('button').filter((button) => button.text() === 'Settings');
    await settings[0]!.trigger('click');
    await wrapper.find('[data-testid="project-settings-cancel"]').trigger('click');

    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('removes a project', async () => {
    listMock.mockResolvedValue({ data: [project(1), project(2)] });
    removeMock.mockResolvedValue(undefined);

    const { wrapper } = await mountView();
    await flushPromises();

    const deleteButtons = wrapper.findAll('button').filter((button) => button.text() === 'Delete');
    await deleteButtons[0]!.trigger('click');
    await flushPromises();

    expect(removeMock).toHaveBeenCalledWith(1);
    expect(wrapper.findAll('li')).toHaveLength(1);
  });

  it('ignores an empty submit and creates on a valid one', async () => {
    listMock.mockResolvedValue({ data: [] });
    createMock.mockResolvedValue({ data: project(9) });

    const { wrapper } = await mountView();
    await flushPromises();

    const input = wrapper.find('input');
    const form = wrapper.find('form');

    await form.trigger('submit');
    expect(createMock).not.toHaveBeenCalled();

    await input.setValue('  Summer dress  ');
    await form.trigger('submit');
    await flushPromises();

    expect(createMock).toHaveBeenCalledWith({ name: 'Summer dress' });
    expect((input.element as HTMLInputElement).value).toBe('');
  });
});
