import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ProjectSettingsDialog from '@/components/dialogs/ProjectSettingsDialog.vue';

enableAutoUnmount(afterEach);

const project = { name: 'Bodice', description: 'A fitted block' };
const allowance = { kind: 'seam' as const, width: 10 };

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ProjectSettingsDialog, {
    props: { project, allowance, ...props },
    attachTo: document.body,
  });
}

describe('ProjectSettingsDialog', () => {
  it('starts from the project and allowance, with Save disabled', () => {
    const wrapper = mountDialog();

    expect(
      (wrapper.find('[data-testid="project-settings-name"]').element as HTMLInputElement).value,
    ).toBe('Bodice');
    expect(
      (wrapper.find('[data-testid="project-settings-description"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('A fitted block');
    expect(wrapper.find('[data-testid="project-settings-allowance-kind"]').element).toHaveProperty(
      'value',
      'seam',
    );
    expect(wrapper.find('[data-testid="project-settings-allowance-width"]').element).toHaveProperty(
      'value',
      '10',
    );
    expect(
      wrapper.find('[data-testid="project-settings-save"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('rejects a name longer than 255 characters', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-name"]').setValue('x'.repeat(256));

    expect(wrapper.find('[data-testid="project-settings-name-error"]').text()).toBe(
      'Use 255 characters or fewer.',
    );
    expect(
      wrapper.find('[data-testid="project-settings-save"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('requires a non-empty name', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-name"]').setValue('   ');

    expect(wrapper.find('[data-testid="project-settings-name-error"]').text()).toBe(
      'A project name is required.',
    );
    expect(
      wrapper.find('[data-testid="project-settings-save"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('emits a trimmed draft with the unchanged allowance', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-name"]').setValue('  Summer bodice  ');
    await wrapper.find('[data-testid="project-settings-description"]').setValue('  Linen  ');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          name: 'Summer bodice',
          description: 'Linen',
          allowance: { kind: 'seam', width: 10 },
        },
      ],
    ]);
  });

  it('clears the description with null', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-description"]').setValue('   ');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ description: null });
  });

  it('emits none and disables the width when the default is cleared', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-allowance-kind"]').setValue('none');

    expect(
      (wrapper.find('[data-testid="project-settings-allowance-width"]').element as HTMLInputElement)
        .disabled,
    ).toBe(true);

    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      allowance: { kind: 'none', width: 0 },
    });
  });

  it('restores 10 mm when a kind is chosen after None', async () => {
    const wrapper = mountDialog({ allowance: { kind: 'none', width: 0 } });

    await wrapper.find('[data-testid="project-settings-allowance-kind"]').setValue('single');

    expect(wrapper.find('[data-testid="project-settings-allowance-width"]').element).toHaveProperty(
      'value',
      '10',
    );
  });

  it('blocks an invalid width and explains why', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="project-settings-allowance-width"]').setValue('0');

    expect(wrapper.find('[data-testid="project-settings-width-error"]').text()).toBe(
      'Enter a width greater than zero.',
    );
    expect(
      wrapper.find('[data-testid="project-settings-save"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('hides the allowance section when no document is loaded', async () => {
    const wrapper = mountDialog({ allowance: null });

    expect(wrapper.find('[data-testid="project-settings-allowance-kind"]').exists()).toBe(false);

    await wrapper.find('[data-testid="project-settings-name"]').setValue('Renamed');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ allowance: null });
  });

  it('ignores a submit that changes nothing', async () => {
    const wrapper = mountDialog();

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('disables the allowance for a read-only document', () => {
    const wrapper = mountDialog({ readOnly: true });

    expect(
      (wrapper.find('[data-testid="project-settings-allowance-kind"]').element as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (wrapper.find('[data-testid="project-settings-allowance-width"]').element as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it('shows a save error inline', () => {
    const wrapper = mountDialog({ error: 'network down' });

    expect(wrapper.find('[data-testid="project-settings-error"]').text()).toBe('network down');
  });

  it('disables both actions while saving and does not cancel', async () => {
    const wrapper = mountDialog({ saving: true });

    expect(
      wrapper.find('[data-testid="project-settings-cancel"]').attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[data-testid="project-settings-save"]').text()).toBe('Saving…');
    await wrapper.find('[data-testid="project-settings-dialog"]').trigger('click');
    await wrapper
      .find('[data-testid="project-settings-dialog"]')
      .trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('cancels from the button, the backdrop and Escape', async () => {
    const button = mountDialog();
    await button.find('[data-testid="project-settings-cancel"]').trigger('click');
    expect(button.emitted('cancel')).toHaveLength(1);

    const backdrop = mountDialog();
    await backdrop.find('[data-testid="project-settings-dialog"]').trigger('click');
    expect(backdrop.emitted('cancel')).toHaveLength(1);

    const escape = mountDialog();
    await escape
      .find('[data-testid="project-settings-dialog"]')
      .trigger('keydown', { key: 'Escape' });
    expect(escape.emitted('cancel')).toHaveLength(1);
  });

  it('traps Tab inside the dialog', async () => {
    const wrapper = mountDialog();

    await wrapper
      .find('[data-testid="project-settings-dialog"]')
      .trigger('keydown', { key: 'Tab' });

    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('focuses the name field and restores the previous focus on close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mountDialog();
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="project-settings-name"]').element,
    );

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
