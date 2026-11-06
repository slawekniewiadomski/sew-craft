import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import type { PatternDocument } from '@sewcraft/geometry';

import ConstraintPromptBar from '@/components/ConstraintPromptBar.vue';

enableAutoUnmount(afterEach);

function mountBar(
  overrides: Partial<{
    type: 'horizontal' | 'distance' | 'angle';
    prompt: string;
    rejection: string | null;
    valueReady: boolean;
    initialValue: string;
    document: PatternDocument;
  }> = {},
): VueWrapper {
  return mount(ConstraintPromptBar, {
    props: {
      type: 'horizontal',
      prompt: 'Pick a line, or two points.',
      rejection: null,
      valueReady: false,
      initialValue: '',
      ...overrides,
    },
    attachTo: document.body,
  });
}

function input(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="constraint-value"]');
}

describe('ConstraintPromptBar', () => {
  it('shows the prompt, rejection and a cancel button', async () => {
    const wrapper = mountBar({ rejection: 'Pick a point.' });

    expect(wrapper.find('[data-testid="constraint-prompt"]').text()).toBe(
      'Pick a line, or two points.',
    );
    expect(wrapper.find('[data-testid="constraint-prompt"]').attributes('role')).toBe('status');
    expect(wrapper.find('[data-testid="constraint-rejection"]').text()).toBe('Pick a point.');
    expect(wrapper.find('[data-testid="constraint-prompt-bar"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);

    await wrapper.find('[data-testid="constraint-cancel"]').trigger('click');

    expect(wrapper.emitted('cancel')).toEqual([[]]);
  });

  it('prefills and focuses the value field when the tuple is ready', async () => {
    const wrapper = mountBar({
      type: 'distance',
      valueReady: true,
      initialValue: '125.5',
    });
    await nextTick();

    expect(wrapper.find('label').text()).toBe('Distance (mm)');
    expect((input(wrapper).element as HTMLInputElement).value).toBe('125.5');
    expect(document.activeElement).toBe(input(wrapper).element);
  });

  it('applies a distance value', async () => {
    const wrapper = mountBar({
      type: 'distance',
      valueReady: true,
      initialValue: '125.5',
    });

    await input(wrapper).setValue('130.25');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('apply')).toEqual([[130.25]]);
  });

  it('applies a formula over the document variables', async () => {
    const wrapper = mountBar({
      type: 'distance',
      valueReady: true,
      initialValue: '125.5',
      document: {
        schema: 'sewcraft.pattern/0.7',
        units: 'mm',
        entities: [],
        constraints: [],
        pieces: [],
        assemblies: [],
        tabs: [],
        variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 880 }],
      },
    });

    await input(wrapper).setValue('$bust / 4');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('apply')).toEqual([[{ expr: '$bust / 4' }]]);

    await input(wrapper).setValue('$gone / 4');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.find('[data-testid="constraint-value-error"]').text()).toContain(
      'unknown variable $gone',
    );

    await input(wrapper).setValue('0');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[data-testid="constraint-value-error"]').text()).toContain(
      'greater than 0',
    );
  });

  it('reports a formula it cannot resolve without a document', async () => {
    const wrapper = mountBar({ type: 'distance', valueReady: true, initialValue: '' });

    await input(wrapper).setValue('$bust');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('apply')).toBeUndefined();
    expect(wrapper.find('[data-testid="constraint-value-error"]').text()).toContain(
      'unknown variable $bust',
    );
  });

  it('converts angle degrees to radians before applying', async () => {
    const wrapper = mountBar({
      type: 'angle',
      valueReady: true,
      initialValue: '90',
    });

    expect(wrapper.find('label').text()).toBe('Angle (°)');
    await input(wrapper).setValue('45');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('apply')).toEqual([[Math.PI / 4]]);
  });

  it('marks an invalid distance, shows its message and does not apply', async () => {
    const wrapper = mountBar({
      type: 'distance',
      valueReady: true,
      initialValue: '100',
    });

    await input(wrapper).setValue('0');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('apply')).toBeUndefined();
    expect(input(wrapper).attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-testid="constraint-value-error"]').text()).toContain(
      'greater than 0',
    );
    expect(wrapper.find('[data-testid="constraint-apply"]').attributes('disabled')).toBeDefined();

    await input(wrapper).setValue('10');
    expect(input(wrapper).attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.find('[data-testid="constraint-apply"]').attributes('disabled')).toBeUndefined();
  });

  it('rejects a blank value for both units', async () => {
    const distance = mountBar({ type: 'distance', valueReady: true, initialValue: '100' });
    await input(distance).setValue('');
    await distance.find('form').trigger('submit');

    expect(distance.emitted('apply')).toBeUndefined();
    expect(distance.find('[data-testid="constraint-apply"]').attributes('disabled')).toBeDefined();
    expect(distance.find('[data-testid="constraint-value-error"]').exists()).toBe(true);

    const angle = mountBar({ type: 'angle', valueReady: true, initialValue: '90' });
    await input(angle).setValue('');
    await angle.find('form').trigger('submit');

    expect(angle.emitted('apply')).toBeUndefined();
    expect(angle.find('[data-testid="constraint-value-error"]').text()).toContain('valid angle');
  });

  it('re-prefills when a new tuple becomes ready', async () => {
    const wrapper = mountBar({
      type: 'distance',
      valueReady: true,
      initialValue: '100',
    });

    await input(wrapper).setValue('5');
    await wrapper.setProps({ valueReady: false });
    await wrapper.setProps({ valueReady: true, initialValue: '200' });

    expect((input(wrapper).element as HTMLInputElement).value).toBe('200');
  });

  it('hides the value form for a non-dimensional type even when ready', () => {
    const wrapper = mountBar({ type: 'horizontal', valueReady: true, initialValue: '' });

    expect(wrapper.find('form').exists()).toBe(false);
  });
});
