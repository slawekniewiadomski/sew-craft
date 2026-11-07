import { enableAutoUnmount, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import CornerRoundPromptBar from '@/components/bars/CornerRoundPromptBar.vue';
import type { VariableScope } from '@sewcraft/geometry';

enableAutoUnmount(afterEach);

function mountBar(
  overrides: Partial<{
    prompt: string;
    rejection: string | null;
    ready: boolean;
    initialValue: string;
    maxRadius: number;
    document: VariableScope;
  }> = {},
): VueWrapper {
  return mount(CornerRoundPromptBar, {
    props: {
      prompt: 'Round corner — pick two lines or a corner.',
      rejection: null,
      ready: false,
      initialValue: '5',
      maxRadius: 18.4,
      document: { variables: [] as const },
      ...overrides,
    },
    attachTo: document.body,
  });
}

function valueInput(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
  return wrapper.find('[data-testid="corner-round-value"]') as DOMWrapper<HTMLInputElement>;
}

describe('CornerRoundPromptBar', () => {
  it('shows the prompt, a rejection and Cancel while picking', async () => {
    const wrapper = mountBar({ rejection: 'The lines must meet at a corner.' });

    expect(wrapper.find('[data-testid="corner-round-prompt"]').text()).toBe(
      'Round corner — pick two lines or a corner.',
    );
    expect(wrapper.find('[data-testid="corner-round-prompt"]').attributes('role')).toBe('status');
    expect(wrapper.find('[data-testid="corner-round-rejection"]').text()).toBe(
      'The lines must meet at a corner.',
    );
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.emitted('preview')).toEqual([[null]]);

    await wrapper.find('[data-testid="corner-round-cancel"]').trigger('click');

    expect(wrapper.emitted('cancel')).toEqual([[]]);
  });

  it('prefills, focuses and previews the radius once both lines are picked', async () => {
    const wrapper = mountBar({ ready: true, initialValue: '5' });
    await nextTick();

    expect(wrapper.find('label').text()).toBe('Radius (mm)');
    expect(valueInput(wrapper).element.value).toBe('5');
    expect(wrapper.find('[data-testid="corner-round-max"]').text()).toBe('Maximum 18.4 mm');
    expect(document.activeElement).toBe(valueInput(wrapper).element);
    expect(wrapper.emitted('preview')).toEqual([[5]]);
  });

  it('previews a valid edit and applies it', async () => {
    const wrapper = mountBar({ ready: true });
    await valueInput(wrapper).setValue('12.5');

    expect(wrapper.emitted('preview')?.at(-1)).toEqual([12.5]);

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('apply')).toEqual([[12.5]]);
  });

  it('rejects an empty, zero or non-numeric radius', async () => {
    const wrapper = mountBar({ ready: true });

    await valueInput(wrapper).setValue('');
    expect(wrapper.find('[data-testid="corner-round-value-error"]').text()).toBe(
      'Enter a radius of at least 0.001 mm.',
    );
    expect(wrapper.find('[data-testid="corner-round-apply"]').attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('preview')?.at(-1)).toEqual([null]);

    await valueInput(wrapper).setValue('0');
    expect(wrapper.find('[data-testid="corner-round-value-error"]').exists()).toBe(true);

    await valueInput(wrapper).setValue('abc');
    expect(wrapper.find('[data-testid="corner-round-value-error"]').exists()).toBe(true);

    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  it('names the concrete maximum when the radius is too large', async () => {
    const wrapper = mountBar({ ready: true });

    await valueInput(wrapper).setValue('30');

    expect(wrapper.find('[data-testid="corner-round-value-error"]').text()).toBe(
      'Radius 30 mm is too large for these lines; the maximum is 18.4 mm.',
    );
    expect(valueInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(wrapper.emitted('preview')?.at(-1)).toEqual([null]);
  });

  it('accepts a formula and applies the expression, previewing its value', async () => {
    const wrapper = mountBar({
      ready: true,
      maxRadius: 30,
      document: { variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 90 }] },
    });

    await valueInput(wrapper).setValue('$bust / 10');

    expect(wrapper.emitted('preview')?.at(-1)).toEqual([9]);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('apply')).toEqual([[{ expr: '$bust / 10' }]]);
  });

  it('reports a formula that does not resolve', async () => {
    const wrapper = mountBar({
      ready: true,
      document: { variables: [{ slug: 'bust', name: 'Bust', unit: 'mm', value: 90 }] },
    });

    await valueInput(wrapper).setValue('$waist');

    expect(wrapper.find('[data-testid="corner-round-value-error"]').text()).toContain(
      'unknown variable $waist',
    );
    expect(wrapper.find('[data-testid="corner-round-apply"]').attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('preview')?.at(-1)).toEqual([null]);
  });

  it('clears the preview when the picks go away', async () => {
    const wrapper = mountBar({ ready: true });
    await wrapper.setProps({ ready: false });

    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.emitted('preview')?.at(-1)).toEqual([null]);
  });
});
