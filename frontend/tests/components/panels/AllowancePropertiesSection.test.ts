import { createEmptyDocument, type BandTarget, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AllowancePropertiesSection from '@/components/panels/AllowancePropertiesSection.vue';
import type { PieceSummary } from '@/lib/pieces';

const document: PatternDocument = {
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, fixed: false },
    { id: 'ab', kind: 'line', start: 'a', end: 'b' },
    { id: 'bc', kind: 'line', start: 'b', end: 'a' },
  ],
};

const summary: PieceSummary = {
  id: 'p1',
  name: 'Front',
  quantity: 1,
  edges: ['ab', 'bc'],
  allowances: [
    { edge: 'ab', kind: 'double', width: 10, cutDistance: 20 },
    { edge: 'bc', kind: 'seam', width: 5, cutDistance: 5 },
  ],
  corners: [
    { round: 'r1', radius: 5, cutWidth: null, inherited: 10, halves: [], state: 'inherited' },
    { round: 'r2', radius: 6, cutWidth: 8, inherited: null, halves: [], state: 'own' },
    { round: 'r3', radius: 7, cutWidth: null, inherited: null, halves: [5, 2.5], state: 'split' },
    { round: 'r4', radius: 8, cutWidth: null, inherited: null, halves: [], state: 'none' },
    { round: 'r5', radius: 9, cutWidth: null, inherited: null, halves: [], state: 'broken' },
  ],
  uniform: null,
  metrics: null,
  hasLoop: true,
  broken: false,
  entityCount: 2,
};

function mountSection(targets: BandTarget[], overrides: Record<string, unknown> = {}) {
  return mount(AllowancePropertiesSection, {
    props: { document, summary, targets, ...overrides },
  });
}

describe('AllowancePropertiesSection', () => {
  it('shows one edge with its fold, width and cut distance', () => {
    const wrapper = mountSection([{ kind: 'edge', edge: 'ab' }]);

    expect(wrapper.find('[data-testid="allowance-context"]').text()).toBe('Front · 1 region');
    expect(wrapper.find('[data-testid="allowance-edge-ab"]').text()).toContain('a → b');
    expect(wrapper.find('[data-testid="allowance-edge-kind-ab"]').text()).toBe('Double fold 10 mm');
    expect(wrapper.text()).toContain('Cut distance 20 mm');
    expect(
      (wrapper.find('[data-testid="allowance-edge-width"]').element as HTMLInputElement).value,
    ).toBe('10');
  });

  it('treats a missing allowance as an addable width with no remove action', async () => {
    const noAllowance: PieceSummary = {
      ...summary,
      allowances: [{ edge: 'ab', kind: 'none', width: 0, cutDistance: 0 }],
    };
    const wrapper = mountSection([{ kind: 'edge', edge: 'ab' }], { summary: noAllowance });
    const input = wrapper.find('[data-testid="allowance-edge-width"]');

    expect(wrapper.find('[data-testid="allowance-edge-kind-ab"]').text()).toBe('No allowance');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('placeholder')).toBe('Add');
    expect(wrapper.find('[data-testid="allowance-edge-remove"]').exists()).toBe(false);

    await input.setValue('12');
    expect(wrapper.emitted('set-edge-widths')).toEqual([[[{ edge: 'ab', kind: 'seam' }], 12]]);
  });

  it('edits several edges as one width while keeping their kinds', async () => {
    const wrapper = mountSection([
      { kind: 'edge', edge: 'ab' },
      { kind: 'edge', edge: 'bc' },
    ]);
    const input = wrapper.find('[data-testid="allowance-edge-width"]');

    expect(wrapper.find('[data-testid="allowance-context"]').text()).toBe('Front · 2 regions');
    expect(wrapper.find('[data-testid="allowance-edge-mixed"]').text()).toBe('Mixed');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('placeholder')).toBe('Mixed');

    await input.setValue('12');
    expect(wrapper.emitted('set-edge-widths')).toEqual([
      [
        [
          { edge: 'ab', kind: 'double' },
          { edge: 'bc', kind: 'seam' },
        ],
        12,
      ],
    ]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(wrapper.emitted('set-edge-widths')).toHaveLength(1);
  });

  it('removes every selected edge allowance', async () => {
    const wrapper = mountSection([
      { kind: 'edge', edge: 'ab' },
      { kind: 'edge', edge: 'bc' },
    ]);

    await wrapper.find('[data-testid="allowance-edge-remove"]').trigger('click');

    expect(wrapper.emitted('remove-edge-allowances')).toEqual([[['ab', 'bc']]]);
  });

  it('shows an inherited corner and sets its own cut width', async () => {
    const wrapper = mountSection([{ kind: 'round', round: 'r1' }]);
    const input = wrapper.find('[data-testid="allowance-corner-width"]');

    expect(wrapper.find('[data-testid="allowance-corner-state-r1"]').text()).toBe(
      'Inherited 10 mm',
    );
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('placeholder')).toBe('Inherit');
    expect(wrapper.find('[data-testid="allowance-corner-inherit"]').exists()).toBe(false);

    await input.setValue('8');
    expect(wrapper.emitted('set-corner-widths')).toEqual([[['r1'], 8]]);

    await input.setValue('');
    expect(wrapper.emitted('clear-corner-widths')).toBeUndefined();
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('clears an own corner width back to its edges', async () => {
    const wrapper = mountSection([{ kind: 'round', round: 'r2' }]);
    const input = wrapper.find('[data-testid="allowance-corner-width"]');

    expect((input.element as HTMLInputElement).value).toBe('8');
    expect(wrapper.find('[data-testid="allowance-corner-inherit"]').exists()).toBe(true);

    await wrapper.find('[data-testid="allowance-corner-inherit"]').trigger('click');
    expect(wrapper.emitted('clear-corner-widths')).toEqual([[['r2']]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('8');

    await input.setValue('');
    expect(wrapper.emitted('clear-corner-widths')).toEqual([[['r2']], [['r2']]]);
  });

  it('labels every corner state and its effective width', () => {
    const wrapper = mountSection(
      ['r1', 'r2', 'r3', 'r4', 'r5'].map((round) => ({ kind: 'round' as const, round })),
    );

    expect(wrapper.find('[data-testid="allowance-corner-state-r1"]').text()).toBe(
      'Inherited 10 mm',
    );
    expect(wrapper.find('[data-testid="allowance-corner-state-r2"]').text()).toBe('Own 8 mm');
    expect(wrapper.find('[data-testid="allowance-corner-state-r3"]').text()).toBe(
      'Split 5 + 2.5 mm',
    );
    expect(wrapper.find('[data-testid="allowance-corner-state-r4"]').text()).toBe('No allowance —');
    expect(wrapper.find('[data-testid="allowance-corner-state-r5"]').text()).toBe('Broken —');
  });

  it('applies one width across several corners and can clear them all', async () => {
    const wrapper = mountSection([
      { kind: 'round', round: 'r1' },
      { kind: 'round', round: 'r2' },
    ]);
    const input = wrapper.find('[data-testid="allowance-corner-width"]');

    expect(wrapper.find('[data-testid="allowance-corner-mixed"]').text()).toBe('Mixed');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('placeholder')).toBe('Mixed');
    expect(wrapper.find('[data-testid="allowance-corner-inherit"]').exists()).toBe(true);

    await input.setValue('9');
    expect(wrapper.emitted('set-corner-widths')).toEqual([[['r1', 'r2'], 9]]);

    await wrapper.find('[data-testid="allowance-corner-inherit"]').trigger('click');
    expect(wrapper.emitted('clear-corner-widths')).toEqual([[['r1', 'r2']]]);
  });

  it('renders nothing when no selected target resolves', () => {
    const wrapper = mountSection([{ kind: 'edge', edge: 'missing' }]);

    expect(wrapper.find('[data-testid="allowance-properties"]').exists()).toBe(false);
  });
});
