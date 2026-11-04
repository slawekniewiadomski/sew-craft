import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsApi } from '@/api/projects';

import { lineDoc, mountLoaded } from './support/editor-harness';

vi.mock('@/lib/download', async () => (await import('./support/editor-mocks')).downloadMock());
vi.mock('@/api/projects', async () => (await import('./support/editor-mocks')).projectsApiMock());

const updateMock = vi.mocked(projectsApi.update);
const getMock = vi.mocked(projectsApi.get);

describe('EditorView project settings', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockImplementation(async (id, payload) => ({
      data: {
        id,
        name: payload.name,
        description: payload.description,
        created_at: '',
        updated_at: '',
      },
    }));
    getMock.mockImplementation(async () => ({
      data: {
        id: 1,
        name: 'Bodice',
        description: 'A fitted bodice block',
        created_at: '',
        updated_at: '',
      },
    }));
  });

  it('opens the modal from the top bar and closes it on cancel', async () => {
    const { wrapper } = await mountLoaded(lineDoc);

    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(false);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');
    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-settings-allowance-kind"]').element).toHaveProperty(
      'value',
      'seam',
    );

    await wrapper.find('[data-testid="project-settings-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(false);
  });

  it('saves the name and description through the API', async () => {
    const { wrapper } = await mountLoaded(lineDoc);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-name"]').setValue('  Summer bodice  ');
    await wrapper.find('[data-testid="project-settings-description"]').setValue('Linen block');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledWith(1, {
      name: 'Summer bodice',
      description: 'Linen block',
    });
    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Summer bodice');
  });

  it('applies a changed allowance as one undoable command and closes', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-allowance-kind"]').setValue('double');
    await wrapper.find('[data-testid="project-settings-allowance-width"]').setValue('15');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(updateMock).not.toHaveBeenCalled();
    expect(store.document.defaults).toEqual({ allowance: { width: 15, kind: 'double' } });
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.document.defaults).toEqual({ allowance: { width: 10, kind: 'seam' } });
  });

  it('clears the default when None is chosen', async () => {
    const { wrapper, store } = await mountLoaded(lineDoc);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-allowance-kind"]').setValue('none');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(store.document.defaults).toEqual({ allowance: null });
  });

  it('leaves the document untouched when None stays None', async () => {
    const { wrapper, store } = await mountLoaded({ ...lineDoc, defaults: { allowance: null } });
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-name"]').setValue('No allowance');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(updateMock).toHaveBeenCalled();
    expect(store.document.defaults).toEqual({ allowance: null });
    expect(store.canUndo).toBe(false);
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    updateMock.mockRejectedValueOnce('offline');
    const { wrapper } = await mountLoaded(lineDoc);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-name"]').setValue('Summer bodice');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-settings-error"]').text()).toBe(
      'Failed to save project settings',
    );
  });

  it('keeps the modal open and shows an API error', async () => {
    updateMock.mockRejectedValueOnce(new Error('network down'));
    const { wrapper } = await mountLoaded(lineDoc);
    await wrapper.find('[data-testid="project-settings"]').trigger('click');

    await wrapper.find('[data-testid="project-settings-name"]').setValue('Summer bodice');
    await wrapper.find('[data-testid="project-settings-dialog"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="project-settings-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="project-settings-error"]').text()).toBe('network down');
    expect(wrapper.find('[data-testid="project-name"]').text()).toBe('Bodice');
  });
});
