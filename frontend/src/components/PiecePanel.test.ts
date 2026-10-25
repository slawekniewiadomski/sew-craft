import type { PieceMetrics } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { formatDimensionValue } from '@/lib/dimensions';
import type { PieceSummary } from '@/lib/pieces';

import PiecePanel from './PiecePanel.vue';

const metrics: PieceMetrics = {
  finished: { width: 220, height: 210 },
  cut: { width: 240, height: 230 },
  cutArea: 55_200,
  allowanceArea: 8_800,
  quantity: 2,
};

const summary: PieceSummary = {
  id: 'p1',
  name: 'Front panel',
  quantity: 2,
  edges: ['ab', 'bc', 'cd', 'da'],
  allowances: [
    { edge: 'ab', kind: 'seam', width: 10, cutDistance: 10 },
    { edge: 'bc', kind: 'double', width: 5, cutDistance: 10 },
    { edge: 'cd', kind: 'none', width: 0, cutDistance: 0 },
  ],
  uniform: null,
  metrics,
  hasLoop: true,
  broken: false,
  entityCount: 4,
};

function mountPanel(overrides: Partial<PieceSummary> = {}, props: Record<string, unknown> = {}) {
  return mount(PiecePanel, {
    props: { summary: { ...summary, ...overrides }, label: 'Front panel', ...props },
  });
}

describe('PiecePanel', () => {
  it('renders the label, id, metrics and one allowance row per edge', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-testid="entity-piece"]').exists()).toBe(true);
    expect(wrapper.find('h3').text()).toBe('Front panel');
    expect(wrapper.find('[data-testid="entity-piece-id"]').text()).toBe('p1');
    expect(wrapper.find('[data-testid="entity-piece-finished"]').text()).toBe('220 × 210 mm');
    expect(wrapper.find('[data-testid="entity-piece-cut"]').text()).toBe('240 × 230 mm');
    expect(wrapper.find('[data-testid="entity-piece-cut-area"]').text()).toBe(
      `${formatDimensionValue(metrics.cutArea)} mm² (${formatDimensionValue(metrics.cutArea / 100)} cm²)`,
    );
    expect(wrapper.find('[data-testid="entity-piece-allowance-area"]').text()).toContain('mm²');

    expect(wrapper.find('[data-testid="entity-piece-allowance-ab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-piece-kind-ab"]').element).toHaveProperty(
      'value',
      'seam',
    );
    expect(wrapper.find('[data-testid="entity-piece-width-bc"]').element).toHaveProperty(
      'value',
      '5',
    );

    const empty = wrapper.find('[data-testid="entity-piece-allowance-cd"]');
    expect((empty.find('select').element as HTMLSelectElement).value).toBe('none');
    expect((empty.find('input').element as HTMLInputElement).disabled).toBe(true);
    expect((empty.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('shows em dashes when the loop cannot be measured', () => {
    const wrapper = mountPanel({ metrics: null });

    for (const field of ['finished', 'cut', 'cut-area', 'allowance-area']) {
      expect(wrapper.find(`[data-testid="entity-piece-${field}"]`).text()).toBe('—');
    }
  });

  it('prefixes every test id so two cards can mount together', () => {
    const wrapper = mountPanel({}, { prefix: 'drawer', label: 'Piece 1' });

    expect(wrapper.find('[data-testid="drawer-piece"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawer-piece-heading"]').text()).toBe('Piece 1');
    expect(wrapper.find('[data-testid="drawer-remove-piece-p1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-piece"]').exists()).toBe(false);
  });

  it('falls back to the default prefix', () => {
    const wrapper = mountPanel({}, { label: 'Piece' });

    expect(wrapper.find('[data-testid="entity-piece-heading"]').text()).toBe('Piece');
  });

  it('renames a piece, clears the name and ignores an unchanged one', async () => {
    const wrapper = mountPanel();
    const name = wrapper.find('[data-testid="entity-piece-name"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await name.setValue('Back');
    await name.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { name: 'Back' }]);

    const count = emitted().length;
    await name.setValue('Front panel');
    await name.trigger('change');
    expect(emitted()).toHaveLength(count);

    await name.setValue('   ');
    await name.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { name: null }]);
  });

  it('edits and validates the quantity', async () => {
    const wrapper = mountPanel();
    const quantity = wrapper.find('[data-testid="entity-piece-quantity"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await quantity.setValue('3');
    await quantity.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { quantity: 3 }]);

    const count = emitted().length;
    await quantity.setValue('2');
    await quantity.trigger('change');
    expect(emitted()).toHaveLength(count);

    for (const invalid of ['0', '1.5', '-2']) {
      await quantity.setValue(invalid);
      await quantity.trigger('change');
      expect((quantity.element as HTMLInputElement).value).toBe('2');
      expect(emitted()).toHaveLength(count);
    }
  });

  it('changes an allowance kind, removing it with none', async () => {
    const wrapper = mountPanel();
    const kind = wrapper.find('[data-testid="entity-piece-kind-ab"]');
    const emitted = () => wrapper.emitted('set-piece-allowance') ?? [];

    await kind.setValue('single');
    expect(emitted().at(-1)).toEqual(['p1', 'ab', { kind: 'single', width: 10 }]);

    await kind.setValue('none');
    expect(emitted().at(-1)).toEqual(['p1', 'ab', null]);
  });

  it('gives an empty allowance the default width when a kind is chosen', async () => {
    const wrapper = mountPanel();
    const kind = wrapper.find('[data-testid="entity-piece-kind-cd"]');

    await kind.setValue('double');

    expect(wrapper.emitted('set-piece-allowance')?.at(-1)).toEqual([
      'p1',
      'cd',
      { kind: 'double', width: 10 },
    ]);
  });

  it('edits an allowance width and snaps back on invalid or unchanged input', async () => {
    const wrapper = mountPanel();
    const width = wrapper.find('[data-testid="entity-piece-width-ab"]');
    const emitted = () => wrapper.emitted('set-piece-allowance') ?? [];

    await width.setValue('12');
    await width.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', 'ab', { kind: 'seam', width: 12 }]);

    const count = emitted().length;
    for (const invalid of ['0', 'abc', '10']) {
      await width.setValue(invalid);
      await width.trigger('change');
      expect(emitted()).toHaveLength(count);
      expect((width.element as HTMLInputElement).value).toBe('10');
    }

    const zero = mountPanel({
      allowances: [{ edge: 'da', kind: 'seam', width: 0, cutDistance: 0 }],
    });
    const zeroWidth = zero.find('[data-testid="entity-piece-width-da"]');
    await zeroWidth.setValue('abc');
    await zeroWidth.trigger('change');
    expect(zero.emitted('set-piece-allowance')).toBeUndefined();
    expect((zeroWidth.element as HTMLInputElement).value).toBe('');
  });

  it('emits remove-piece', async () => {
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="entity-remove-piece-p1"]').trigger('click');

    expect(wrapper.emitted('remove-piece')).toEqual([['p1']]);
  });
});

describe('PiecePanel all edges', () => {
  const uniformSummary = (): PieceSummary => ({
    ...summary,
    allowances: summary.edges.map((edge) => ({
      edge,
      kind: 'seam' as const,
      width: 10,
      cutDistance: 10,
    })),
    uniform: { kind: 'seam', width: 10 },
  });

  it('starts from the shared value and applies it to every edge', async () => {
    const wrapper = mountPanel(uniformSummary());

    expect(wrapper.find('[data-testid="entity-piece-all-kind"]').element).toHaveProperty(
      'value',
      'seam',
    );
    expect(wrapper.find('[data-testid="entity-piece-all-width"]').element).toHaveProperty(
      'value',
      '10',
    );
    expect(wrapper.find('[data-testid="entity-piece-all-mixed"]').exists()).toBe(false);

    await wrapper.find('[data-testid="entity-piece-all-kind"]').setValue('double');
    await wrapper.find('[data-testid="entity-piece-all-width"]').setValue('15');
    await wrapper.find('[data-testid="entity-piece-all-apply"]').trigger('click');

    expect(wrapper.emitted('set-all-allowances')?.at(-1)).toEqual([
      'p1',
      { kind: 'double', width: 15 },
    ]);
  });

  it('shows the mixed pill and starts from the project default', () => {
    const wrapper = mountPanel({}, { defaultAllowance: { kind: 'single', width: 12 } });

    expect(wrapper.find('[data-testid="entity-piece-all-mixed"]').text()).toBe('Mixed');
    expect(wrapper.find('[data-testid="entity-piece-all-kind"]').element).toHaveProperty(
      'value',
      'single',
    );
    expect(wrapper.find('[data-testid="entity-piece-all-width"]').element).toHaveProperty(
      'value',
      '12',
    );
  });

  it('removes every allowance with the none kind', async () => {
    const wrapper = mountPanel(uniformSummary());

    await wrapper.find('[data-testid="entity-piece-all-kind"]').setValue('none');
    expect(
      (wrapper.find('[data-testid="entity-piece-all-width"]').element as HTMLInputElement).disabled,
    ).toBe(true);

    await wrapper.find('[data-testid="entity-piece-all-apply"]').trigger('click');
    expect(wrapper.emitted('set-all-allowances')?.at(-1)).toEqual(['p1', null]);
  });

  it('snaps an invalid width back and keeps apply disabled', async () => {
    const wrapper = mountPanel(uniformSummary());
    const width = wrapper.find('[data-testid="entity-piece-all-width"]');

    await width.setValue('0');
    await width.trigger('change');
    expect((width.element as HTMLInputElement).value).toBe('10');

    await width.setValue('abc');
    await width.trigger('change');
    expect((width.element as HTMLInputElement).value).toBe('10');
  });

  it('disables apply for a piece with no edges', () => {
    const wrapper = mountPanel({ ...summary, edges: [], allowances: [], uniform: null });

    expect(
      (wrapper.find('[data-testid="entity-piece-all-apply"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('PiecePanel loop state and actions', () => {
  it('shows the incomplete and broken loop states', () => {
    const empty = mountPanel({ hasLoop: false, metrics: null });
    expect(empty.find('[data-testid="entity-piece-loop-state"]').text()).toBe('No cut loop');
    expect(empty.find('[data-testid="entity-piece-finished"]').text()).toContain('No cut loop');
    expect(empty.find('[data-testid="entity-clear-cut-loop"]').attributes('disabled')).toBeDefined();

    const broken = mountPanel({ broken: true, metrics: null });
    expect(broken.find('[data-testid="entity-piece-loop-state"]').text()).toContain('Cut loop broken');
  });

  it('emits Set, Clear, Move and Activate', async () => {
    const wrapper = mountPanel({}, { prefix: 'drawer' });

    await wrapper.find('[data-testid="drawer-set-cut-loop"]').trigger('click');
    await wrapper.find('[data-testid="drawer-clear-cut-loop"]').trigger('click');
    await wrapper.find('[data-testid="drawer-piece-move-toggle"]').trigger('click');
    await wrapper.find('[data-testid="drawer-piece-activate"]').trigger('click');

    expect(wrapper.emitted('set-cut-loop')).toEqual([['p1']]);
    expect(wrapper.emitted('clear-cut-loop')).toEqual([['p1']]);
    expect(wrapper.emitted('toggle-move')).toEqual([['p1']]);
    expect(wrapper.emitted('activate')).toEqual([['p1']]);
  });

  it('marks the active piece and armed Move toggle', () => {
    const wrapper = mountPanel({}, { active: true, moveMode: true });

    expect(wrapper.find('[data-testid="entity-piece"]').classes()).toContain('border-primary');
    expect(wrapper.find('[data-testid="entity-piece-move-toggle"]').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.find('[data-testid="entity-piece-activate"]').text()).toBe('Active');
  });
});
