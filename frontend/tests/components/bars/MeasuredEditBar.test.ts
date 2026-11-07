import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MeasuredEditBar from '@/components/bars/MeasuredEditBar.vue';

const sources = [
  { id: 'ab', label: 'a → b' },
  { id: 'bc', label: 'b → c' },
];

function mountBar(props: Record<string, unknown> = {}) {
  return mount(MeasuredEditBar, { props: { name: 'Neckline', sources, message: null, ...props } });
}

describe('MeasuredEditBar', () => {
  it('names the variable, lists its sources and explains the mode', () => {
    const wrapper = mountBar();

    expect(wrapper.text()).toContain('Editing');
    expect(wrapper.text()).toContain('Neckline');
    expect(wrapper.findAll('[data-testid="measured-edit-chips"] > span')).toHaveLength(2);
    expect(wrapper.find('[data-testid="measured-edit-chips"]').text()).toContain('a → b');
    expect(wrapper.find('[data-testid="measured-edit-hint"]').text()).toBe(
      '2 edges · click edges to add or remove',
    );
  });

  it('uses the singular for one edge', () => {
    const wrapper = mountBar({ sources: [sources[0]] });

    expect(wrapper.find('[data-testid="measured-edit-hint"]').text()).toContain('1 edge ·');
  });

  it('removes a source and finishes with done or cancel', async () => {
    const wrapper = mountBar();

    await wrapper.find('[data-testid="measured-edit-remove-bc"]').trigger('click');
    expect(wrapper.emitted('remove')?.[0]).toEqual(['bc']);

    await wrapper.find('[data-testid="measured-edit-done"]').trigger('click');
    expect(wrapper.emitted('done')).toHaveLength(1);

    await wrapper.find('[data-testid="measured-edit-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('shows why the last toggle was refused', () => {
    const wrapper = mountBar({ message: 'the selected edges do not share an endpoint' });

    expect(wrapper.find('[data-testid="measured-edit-message"]').text()).toBe(
      'the selected edges do not share an endpoint',
    );
  });
});
