import { createEmptyDocument, type PatternDocument, type Piece } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PieceParametersForm from '@/components/panels/PieceParametersForm.vue';

const piece = (overrides: Partial<Piece> = {}): Piece => ({
  id: 'p1',
  name: 'Front',
  quantity: 2,
  edges: [],
  allowances: [],
  notes: 'Cut two',
  fabric: 'Linen',
  color: '#336699',
  ...overrides,
});

function mountForm(props: Record<string, unknown> = {}) {
  return mount(PieceParametersForm, {
    props: {
      piece: piece(),
      inherited: { kind: 'seam' as const, width: 10 },
      ...props,
    },
  });
}

describe('PieceParametersForm', () => {
  it('renders the stored parameters', () => {
    const wrapper = mountForm();

    expect(wrapper.find('[data-testid="piece-parameters-name"]').element).toHaveProperty(
      'value',
      'Front',
    );
    expect(wrapper.find('[data-testid="piece-parameters-quantity"]').element).toHaveProperty(
      'value',
      '2',
    );
    expect(wrapper.find('[data-testid="piece-parameters-fabric"]').element).toHaveProperty(
      'value',
      'Linen',
    );
    expect(wrapper.find('[data-testid="piece-parameters-notes"]').element).toHaveProperty(
      'value',
      'Cut two',
    );
    expect(wrapper.find('[data-testid="piece-parameters-color"]').element).toHaveProperty(
      'value',
      '#336699',
    );
    expect(wrapper.find('[data-testid="piece-parameters-default-mode"]').element).toHaveProperty(
      'value',
      'inherit',
    );
  });

  it('edits, clears and ignores unchanged text fields', async () => {
    const wrapper = mountForm();
    const name = wrapper.find('[data-testid="piece-parameters-name"]');
    const fabric = wrapper.find('[data-testid="piece-parameters-fabric"]');
    const notes = wrapper.find('[data-testid="piece-parameters-notes"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await name.setValue('Front');
    expect(emitted()).toHaveLength(0);

    await name.setValue('Back');
    expect(emitted().at(-1)).toEqual([{ name: 'Back' }]);

    await name.setValue('   ');
    expect(emitted().at(-1)).toEqual([{ name: null }]);

    await fabric.setValue('  ');
    expect(emitted().at(-1)).toEqual([{ fabric: null }]);

    await notes.setValue('  ');
    expect(emitted().at(-1)).toEqual([{ notes: null }]);
  });

  it('ignores an empty name when the piece has none', async () => {
    const wrapper = mountForm({ piece: piece({ name: undefined }) });
    const name = wrapper.find('[data-testid="piece-parameters-name"]');

    await name.setValue('');

    expect(wrapper.emitted('update-piece')).toBeUndefined();
  });

  it('validates the quantity', async () => {
    const wrapper = mountForm();
    const quantity = wrapper.find('[data-testid="piece-parameters-quantity"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await quantity.setValue('4');
    expect(emitted().at(-1)).toEqual([{ quantity: 4 }]);

    const count = emitted().length;
    await quantity.setValue('2');
    expect(emitted()).toHaveLength(count);

    for (const invalid of ['0', '1.5', '-3']) {
      await quantity.setValue(invalid);
      expect((quantity.element as HTMLInputElement).value).toBe('2');
      expect(emitted()).toHaveLength(count);
    }
  });

  it('sets and clears the colour', async () => {
    const wrapper = mountForm();
    const color = wrapper.find('[data-testid="piece-parameters-color"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await color.setValue('#A1B2C3');
    expect(emitted().at(-1)).toEqual([{ color: '#a1b2c3' }]);

    const count = emitted().length;
    await color.setValue('#336699');
    expect(emitted()).toHaveLength(count);

    await wrapper.find('[data-testid="piece-parameters-color-clear"]').trigger('click');
    expect(emitted().at(-1)).toEqual([{ color: null }]);
  });

  it('switches the allowance override between inherit, none and preset', async () => {
    const wrapper = mountForm();
    const mode = wrapper.find('[data-testid="piece-parameters-default-mode"]');
    const emitted = () => wrapper.emitted('set-default') ?? [];

    await mode.setValue('inherit');
    await mode.setValue('none');
    expect(emitted().at(-1)).toEqual([{ mode: 'none' }]);

    await mode.setValue('preset');
    expect(emitted().at(-1)).toEqual([{ mode: 'preset', width: 10, kind: 'seam' }]);
  });

  it('edits the preset width and kind only in preset mode', async () => {
    const inherited = piece({ defaults: { allowance: { width: 12, kind: 'double' } } });
    const wrapper = mountForm({ piece: inherited });
    const width = wrapper.find('[data-testid="piece-parameters-default-width"]');
    const kind = wrapper.find('[data-testid="piece-parameters-default-kind"]');
    const emitted = () => wrapper.emitted('set-default') ?? [];

    expect(wrapper.find('[data-testid="piece-parameters-default-mode"]').element).toHaveProperty(
      'value',
      'preset',
    );

    await kind.setValue('double');
    expect(emitted()).toHaveLength(0);

    await kind.setValue('seam');
    expect(emitted().at(-1)).toEqual([{ mode: 'preset', width: 12, kind: 'seam' }]);

    await width.setValue('20');
    expect(emitted().at(-1)).toEqual([{ mode: 'preset', width: 20, kind: 'double' }]);

    await width.setValue('0');
    expect((width.element as HTMLInputElement).value).toBe('12');
  });

  it('starts a preset from the inherited value when the piece has none', async () => {
    const wrapper = mountForm({ inherited: { kind: 'single' as const, width: 8 } });

    await wrapper.find('[data-testid="piece-parameters-default-mode"]').setValue('preset');

    expect(wrapper.emitted('set-default')).toEqual([
      [{ mode: 'preset', width: 8, kind: 'single' }],
    ]);
  });

  it('shows the effective preset when the override is explicitly none', () => {
    const wrapper = mountForm({
      piece: piece({ defaults: { allowance: null } }),
      inherited: { kind: 'none' as const, width: 0 },
    });

    expect(wrapper.find('[data-testid="piece-parameters-default-mode"]').element).toHaveProperty(
      'value',
      'none',
    );
  });

  it('falls back to a seam kind and a 10 mm width for a bare override', async () => {
    const wrapper = mountForm({
      piece: piece({ defaults: { allowance: { width: 0 } } }),
      inherited: { kind: 'none' as const, width: 0 },
    });

    expect(wrapper.find('[data-testid="piece-parameters-default-kind"]').element).toHaveProperty(
      'value',
      'seam',
    );

    await wrapper.find('[data-testid="piece-parameters-default-kind"]').setValue('double');
    expect(wrapper.emitted('set-default')).toEqual([
      [{ mode: 'preset', width: 10, kind: 'double' }],
    ]);
  });

  it('falls back to seam when the inherited default is off', () => {
    const wrapper = mountForm({
      piece: piece({ defaults: undefined }),
      inherited: { kind: 'none' as const, width: 0 },
    });

    expect(wrapper.find('[data-testid="piece-parameters-default-mode"]').element).toHaveProperty(
      'value',
      'inherit',
    );

    // Switching to preset uses the 10 mm fallback because the inherited width is 0.
    return wrapper
      .find('[data-testid="piece-parameters-default-mode"]')
      .setValue('preset')
      .then(() => {
        expect(wrapper.emitted('set-default')).toEqual([
          [{ mode: 'preset', width: 10, kind: 'seam' }],
        ]);
      });
  });

  it('uses the inherited kind when a bare override has none', () => {
    const wrapper = mountForm({
      piece: piece({ defaults: { allowance: { width: 5 } } }),
      inherited: { kind: 'single' as const, width: 5 },
    });

    expect(wrapper.find('[data-testid="piece-parameters-default-kind"]').element).toHaveProperty(
      'value',
      'seam',
    );
  });

  it('commits a formula width and reports an unresolved one', async () => {
    const document = {
      ...createEmptyDocument(),
      variables: [{ slug: 'seam', name: 'Seam', unit: 'mm', value: 12 }],
    } as PatternDocument;
    const wrapper = mountForm({
      piece: piece({ defaults: { allowance: { width: 12 } } }),
      document,
    });
    const width = wrapper.find('[data-testid="piece-parameters-default-width"]');

    await width.setValue('$seam / 2');
    expect(wrapper.emitted('set-default')?.at(-1)).toEqual([
      { mode: 'preset', width: { expr: '$seam / 2' }, kind: 'seam' },
    ]);

    await width.setValue('$missing');
    expect(wrapper.emitted('set-default')).toHaveLength(1);
    expect(wrapper.find('[data-testid="piece-parameters-default-width-issue"]').text()).toContain(
      'unknown variable $missing',
    );

    const withoutDocument = mountForm({
      piece: piece({ defaults: { allowance: { width: 12 } } }),
    });
    const bareWidth = withoutDocument.find('[data-testid="piece-parameters-default-width"]');
    await bareWidth.setValue('$seam');
    expect(withoutDocument.emitted('set-default')).toBeUndefined();
    expect(
      withoutDocument.find('[data-testid="piece-parameters-default-width-issue"]').exists(),
    ).toBe(true);
  });

  it('ignores a width edit outside preset mode', async () => {
    const wrapper = mountForm();
    const width = wrapper.find('[data-testid="piece-parameters-default-width"]');

    expect(width.exists()).toBe(false);
    await wrapper.find('[data-testid="piece-parameters-default-mode"]').setValue('preset');
    await wrapper.find('[data-testid="piece-parameters-default-mode"]').setValue('inherit');
    expect(wrapper.emitted('set-default')?.at(-1)).toEqual([{ mode: 'inherit' }]);
  });

  it('snaps a missing quantity back to one', async () => {
    const wrapper = mountForm({ piece: piece({ quantity: undefined }) });
    const quantity = wrapper.find('[data-testid="piece-parameters-quantity"]');

    await quantity.setValue('0');
    expect((quantity.element as HTMLInputElement).value).toBe('1');

    await quantity.setValue('1');
    expect(wrapper.emitted('update-piece')).toBeUndefined();
  });

  it('rejects an invalid colour from a text field', async () => {
    const wrapper = mountForm();
    const color = wrapper.find('[data-testid="piece-parameters-color"]');
    const input = color.element as HTMLInputElement;
    input.type = 'text';
    input.value = 'red';

    await color.trigger('change');

    expect((color.element as HTMLInputElement).value).toBe('#336699');
    expect(wrapper.emitted('update-piece')).toBeUndefined();
  });

  it('clears an absent colour back to the neutral fallback', async () => {
    const wrapper = mountForm({ piece: piece({ color: undefined }) });
    const color = wrapper.find('[data-testid="piece-parameters-color"]');
    const input = color.element as HTMLInputElement;
    input.type = 'text';
    input.value = 'red';

    await color.trigger('change');

    expect(input.value).toBe('#000000');
  });

  it('disables every control while read-only', () => {
    const wrapper = mountForm({ readOnly: true });

    expect(
      wrapper.find('[data-testid="piece-parameters-form"]').element.closest('fieldset'),
    ).toHaveProperty('disabled', true);
  });
});
