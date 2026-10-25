import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import type { ExportSettings } from '@/lib/display-settings';

import ExportDialog from './ExportDialog.vue';

enableAutoUnmount(afterEach);

const settings: ExportSettings = { construction: false, stitch: true, fold: true };

function mountDialog() {
  return mount(ExportDialog, {
    props: { pieceLabel: 'Front', settings },
    attachTo: document.body,
  });
}

describe('ExportDialog', () => {
  it('names the piece and reflects the stored layer choices', () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain('Front');
    expect(
      (wrapper.find('[data-testid="export-construction"]').element as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (wrapper.find('[data-testid="export-stitch"]').element as HTMLInputElement).checked,
    ).toBe(true);
    expect(document.activeElement).toBe(wrapper.find('[data-testid="export-download"]').element);
  });

  it('emits the whole settings object when a layer changes', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="export-construction"]').setValue(true);
    await wrapper.find('[data-testid="export-stitch"]').setValue(false);

    expect(wrapper.emitted('update:settings')).toEqual([
      [{ construction: true, stitch: true, fold: true }],
      [{ construction: false, stitch: false, fold: true }],
    ]);
  });

  it('emits download, cancel and Escape', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="export-download"]').trigger('click');
    await wrapper.find('[data-testid="export-cancel"]').trigger('click');
    await wrapper.find('[data-testid="export-dialog"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('download')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });

  it('keeps Tab between its actions', async () => {
    const wrapper = mountDialog();
    const overlay = wrapper.find('[data-testid="export-dialog"]');

    await overlay.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(wrapper.find('[data-testid="export-cancel"]').element);

    await overlay.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(wrapper.find('[data-testid="export-download"]').element);
  });
});
