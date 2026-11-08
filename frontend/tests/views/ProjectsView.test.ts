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

const project = (
  id: number,
  description: string | null = null,
  overrides: Partial<Project> = {},
): Project => ({
  id,
  user_id: 1,
  name: `Project ${id}`,
  description,
  owner: { id: 1, email: 'maker@example.com' },
  can_edit: true,
  created_at: '',
  updated_at: '',
  ...overrides,
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

  it('disables creation once the account owns three projects', async () => {
    listMock.mockResolvedValue({ data: [project(1)], my_project_count: 3 });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="project-quota"]').text()).toBe('3 of 3 projects used');
    expect(wrapper.find('[data-testid="project-limit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-create"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="project-name-input"]').attributes('disabled')).toBeDefined();

    await wrapper.find('form').trigger('submit');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('shows a create error from the server', async () => {
    listMock.mockResolvedValue({ data: [], my_project_count: 0 });
    createMock.mockRejectedValue(new Error('You can have at most 3 projects.'));

    const { wrapper } = await mountView();
    await flushPromises();

    await wrapper.find('[data-testid="project-name-input"]').setValue('Fourth');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-create-error"]').text()).toBe(
      'You can have at most 3 projects.',
    );
  });

  it('falls back for a non-Error create failure', async () => {
    listMock.mockResolvedValue({ data: [], my_project_count: 0 });
    createMock.mockRejectedValue('offline');

    const { wrapper } = await mountView();
    await flushPromises();

    await wrapper.find('[data-testid="project-name-input"]').setValue('Fourth');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-create-error"]').text()).toBe(
      'Failed to create the project',
    );
  });

  it('shows another account project without edit actions', async () => {
    listMock.mockResolvedValue({
      data: [
        project(1, null, {
          can_edit: false,
          owner: { id: 2, email: 'other@example.com' },
        }),
      ],
      my_project_count: 0,
    });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="project-owner"]').text()).toBe('other@example.com');
    expect(wrapper.text()).toContain('View');
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Delete');
  });

  it('labels a public project whose owner is not included', async () => {
    listMock.mockResolvedValue({
      data: [project(1, null, { can_edit: false, owner: undefined })],
      my_project_count: 0,
    });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="project-owner"]').text()).toBe('Public project');
  });

  it('marks an owned project as yours', async () => {
    listMock.mockResolvedValue({ data: [project(1)], my_project_count: 1 });

    const { wrapper } = await mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="project-owner"]').text()).toBe('Yours');
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
