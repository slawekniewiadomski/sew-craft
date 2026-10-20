import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SeamWidthEditor from './SeamWidthEditor.vue';

enableAutoUnmount(afterEach);

function mountEditor(width = 10): VueWrapper {
  return mount(SeamWidthEditor, { props: { width, x: 40, y: 60 }, attachTo: document.body });
}

function input(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="seam-width-input"]');
}

describe('SeamWidthEditor', () => {
  it('renders the current width and focuses and selects the input', async () => {
    const wrapper = mountEditor(12);
    await wrapper.vm.$nextTick();

    const field = input(wrapper).element as HTMLInputElement;
    expect(field.value).toBe('12');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(2);
  });

  it('commits a valid changed width on Enter', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).setValue('15');
    await input(wrapper).trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('commit')).toEqual([[15]]);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('cancels on Enter when the width is unchanged', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('commit')).toBeUndefined();
  });

  it('keeps editing and shows an error for an invalid value', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).setValue('0');
    await input(wrapper).trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('commit')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(wrapper.find('[data-testid="seam-width-error"]').text()).toBe(
      'Use a width greater than 0.',
    );
    expect(input(wrapper).attributes('aria-invalid')).toBe('true');
  });

  it('clears the error when the raw input is edited', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).setValue('abc');
    await input(wrapper).trigger('keydown', { key: 'Enter' });
    expect(input(wrapper).attributes('aria-invalid')).toBe('true');

    await input(wrapper).setValue('12');

    expect(wrapper.find('[data-testid="seam-width-error"]').exists()).toBe(false);
    expect(input(wrapper).attributes('aria-invalid')).toBeUndefined();
  });

  it('cancels on Escape and never commits', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).setValue('15');
    await input(wrapper).trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('commit')).toBeUndefined();
  });

  it('commits a valid value on blur and discards an invalid one', async () => {
    const valid = mountEditor(10);
    await input(valid).setValue('15');
    await input(valid).trigger('blur');
    expect(valid.emitted('commit')).toEqual([[15]]);

    const invalid = mountEditor(10);
    await input(invalid).setValue('');
    await input(invalid).trigger('blur');
    expect(invalid.emitted('cancel')).toHaveLength(1);
    expect(invalid.emitted('commit')).toBeUndefined();
  });

  it('cancels on blur when the width is unchanged', async () => {
    const wrapper = mountEditor(10);
    await input(wrapper).trigger('blur');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('commit')).toBeUndefined();
  });
});
