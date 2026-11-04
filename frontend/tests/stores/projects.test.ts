import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsApi } from '@/api/projects';

import { useProjectsStore } from '@/stores/projects';

vi.mock('@/api/projects', () => ({
  projectsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const listMock = vi.mocked(projectsApi.list);
const createMock = vi.mocked(projectsApi.create);
const updateMock = vi.mocked(projectsApi.update);
const removeMock = vi.mocked(projectsApi.remove);

describe('projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
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

  it('replaces a cached row after an update', async () => {
    listMock.mockResolvedValue({
      data: [{ id: 1, name: 'A', description: null, created_at: '', updated_at: '' }],
    });
    updateMock.mockResolvedValue({
      data: { id: 1, name: 'Renamed', description: 'new', created_at: '', updated_at: '' },
    });
    const store = useProjectsStore();
    await store.fetchProjects();

    const updated = await store.updateProject(1, { name: 'Renamed', description: 'new' });

    expect(updated.name).toBe('Renamed');
    expect(updateMock).toHaveBeenCalledWith(1, { name: 'Renamed', description: 'new' });
    expect(store.projects).toEqual([
      { id: 1, name: 'Renamed', description: 'new', created_at: '', updated_at: '' },
    ]);
  });

  it('keeps unrelated rows when an update returns', async () => {
    listMock.mockResolvedValue({
      data: [
        { id: 1, name: 'A', description: null, created_at: '', updated_at: '' },
        { id: 2, name: 'B', description: null, created_at: '', updated_at: '' },
      ],
    });
    updateMock.mockResolvedValue({
      data: { id: 1, name: 'A2', description: null, created_at: '', updated_at: '' },
    });
    const store = useProjectsStore();
    await store.fetchProjects();

    await store.updateProject(1, { name: 'A2', description: null });

    expect(store.projects.map((project) => project.name)).toEqual(['A2', 'B']);
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
