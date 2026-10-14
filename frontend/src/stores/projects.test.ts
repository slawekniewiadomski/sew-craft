import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsApi } from '@/api/projects';

import { useProjectsStore } from './projects';

vi.mock('@/api/projects', () => ({
  projectsApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const listMock = vi.mocked(projectsApi.list);
const createMock = vi.mocked(projectsApi.create);
const removeMock = vi.mocked(projectsApi.remove);

describe('projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listMock.mockReset();
    createMock.mockReset();
    removeMock.mockReset();
  });

  it('loads projects and clears the loading flag', async () => {
    listMock.mockResolvedValue({
      data: [{ id: 1, name: 'A', description: null, created_at: '', updated_at: '' }],
    });
    const store = useProjectsStore();

    const pending = store.fetchProjects();
    expect(store.loading).toBe(true);
    await pending;

    expect(store.projects).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('records an error message when loading rejects with an Error', async () => {
    listMock.mockRejectedValue(new Error('boom'));
    const store = useProjectsStore();

    await store.fetchProjects();

    expect(store.error).toBe('boom');
    expect(store.loading).toBe(false);
    expect(store.projects).toEqual([]);
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    listMock.mockRejectedValue('nope');
    const store = useProjectsStore();

    await store.fetchProjects();

    expect(store.error).toBe('Failed to load projects');
  });

  it('prepends a created project', async () => {
    listMock.mockResolvedValue({
      data: [{ id: 1, name: 'A', description: null, created_at: '', updated_at: '' }],
    });
    createMock.mockResolvedValue({
      data: { id: 2, name: 'B', description: null, created_at: '', updated_at: '' },
    });
    const store = useProjectsStore();
    await store.fetchProjects();

    const created = await store.createProject({ name: 'B' });

    expect(created.id).toBe(2);
    expect(store.projects.map((project) => project.id)).toEqual([2, 1]);
  });

  it('removes a project', async () => {
    listMock.mockResolvedValue({
      data: [
        { id: 1, name: 'A', description: null, created_at: '', updated_at: '' },
        { id: 2, name: 'B', description: null, created_at: '', updated_at: '' },
      ],
    });
    removeMock.mockResolvedValue(undefined);
    const store = useProjectsStore();
    await store.fetchProjects();

    await store.removeProject(1);

    expect(store.projects.map((project) => project.id)).toEqual([2]);
    expect(removeMock).toHaveBeenCalledWith(1);
  });
});
