import {
  createEmptyDocument,
  type Entity,
  type PatternDocument,
  type Variable,
} from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import VariablesPanel from '@/components/VariablesPanel.vue';

/** A written variable; measured ones are built explicitly where a test needs one. */
type ValueVariable = Extract<Variable, { kind?: 'value' }>;

const variable = (overrides: Partial<ValueVariable> = {}): ValueVariable => ({
  slug: 'bust',
  name: 'Bust (cm)',
  unit: 'cm',
  value: 88,
  ...overrides,
});

function documentOf(variables: Variable[]): PatternDocument {
  return { ...createEmptyDocument(), variables };
}

function mountPanel(document: PatternDocument, props: Record<string, unknown> = {}) {
  return mount(VariablesPanel, { props: { document, ...props } });
}

const chainEntities: Entity[] = [
  { id: 'a', kind: 'point', x: 0, y: 0, fixed: false },
  { id: 'b', kind: 'point', x: 100, y: 0, fixed: false },
  { id: 'ab', kind: 'line', start: 'a', end: 'b' },
  { id: 'bc', kind: 'line', start: 'b', end: 'c' },
  { id: 'c', kind: 'point', x: 100, y: 50, fixed: false },
];

const measuredDocument = (overrides: Record<string, unknown> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  entities: chainEntities,
  variables: [
    {
      slug: 'neck',
      name: 'Neckline',
      unit: 'mm',
      kind: 'measurement',
      sources: ['ab', 'bc'],
      ...overrides,
    },
  ],
});

describe('VariablesPanel', () => {
  it('renders one row per variable with its type and resolved value', () => {
    const wrapper = mountPanel(
      documentOf([
        variable(),
        variable({
          slug: 'ease',
          name: 'Ease',
          unit: 'mm',
          value: { expr: '$bust/10', lastKnown: 8 },
        }),
      ]),
    );

    expect(wrapper.find('[data-testid="variable-name-bust"]').element).toHaveProperty(
      'value',
      'Bust (cm)',
    );
    expect(wrapper.find('[data-testid="variable-value-ease"]').element).toHaveProperty(
      'value',
      '$bust/10',
    );
    expect(wrapper.find('[data-testid="variable-value-ease"]').attributes('title')).toBe('88 mm');
    expect(wrapper.find('[data-testid="variable-type-bust"]').text()).toBe('Number');
    expect(wrapper.find('[data-testid="variable-type-ease"]').text()).toBe('Formula');
  });

  it('shows an empty state with an example', () => {
    const wrapper = mountPanel(createEmptyDocument());
    expect(wrapper.text()).toContain('No variables yet.');
    expect(wrapper.text()).toContain('$bust_cm/4');
  });

  it('creates a written variable from the add menu', async () => {
    const wrapper = mountPanel(createEmptyDocument());
    await wrapper.find('[data-testid="variables-add"]').trigger('click');
    await wrapper.find('[data-testid="add-variable"]').trigger('click');

    expect(wrapper.emitted('create')).toHaveLength(1);
    expect(wrapper.find('[data-testid="variables-add-menu"]').exists()).toBe(false);
  });

  it('emits a rename and snaps an empty name back', async () => {
    const wrapper = mountPanel(documentOf([variable()]));
    const input = wrapper.find('[data-testid="variable-name-bust"]');

    await input.setValue('Full bust');
    expect(wrapper.emitted('rename')?.[0]).toEqual(['bust', 'Full bust']);

    await input.setValue('   ');
    expect((input.element as HTMLInputElement).value).toBe('Bust (cm)');
    expect(wrapper.emitted('rename')).toHaveLength(1);
  });

  it('emits a parsed value and snaps invalid text back', async () => {
    const wrapper = mountPanel(documentOf([variable()]));
    const input = wrapper.find('[data-testid="variable-value-bust"]');

    await input.setValue('$bust/2');
    expect(wrapper.emitted('set-value')?.[0]).toEqual(['bust', { expr: '$bust/2' }]);

    await input.setValue('   ');
    expect((input.element as HTMLInputElement).value).toBe('88');
    expect(wrapper.emitted('set-value')).toHaveLength(1);
  });

  it('emits a unit change, a comment and a remove', async () => {
    const wrapper = mountPanel(documentOf([variable()]));

    await wrapper.find('[data-testid="variable-unit-bust"]').trigger('click');
    expect(wrapper.emitted('set-unit')?.[0]).toEqual(['bust', 'mm']);

    const comment = wrapper.find('[data-testid="variable-comment-bust"]');
    await comment.setValue('  over bust ');
    expect(wrapper.emitted('set-comment')?.[0]).toEqual(['bust', 'over bust']);

    await comment.setValue('');
    expect(wrapper.emitted('set-comment')?.[1]).toEqual(['bust', null]);

    await wrapper.find('[data-testid="variable-remove-bust"]').trigger('click');
    expect(wrapper.emitted('remove')?.[0]).toEqual(['bust']);
  });

  it('switches a millimetre variable to centimetres', async () => {
    const wrapper = mountPanel(documentOf([variable({ slug: 'ease', unit: 'mm', value: 8 })]));
    await wrapper.find('[data-testid="variable-unit-ease"]').trigger('click');
    expect(wrapper.emitted('set-unit')?.[0]).toEqual(['ease', 'cm']);
  });

  it('renders a measured row as a read-only length with its source count', async () => {
    const wrapper = mountPanel(measuredDocument());

    const value = wrapper.find('[data-testid="variable-value-neck"]');
    expect(value.element.tagName).toBe('DIV');
    expect(value.text()).toBe('150');
    expect(value.attributes('title')).toBe('150 mm');
    expect(wrapper.find('[data-testid="variable-type-neck"]').text()).toBe('Measured · 2');
    expect(wrapper.find('[data-testid="variable-highlight-neck"]').exists()).toBe(true);

    await wrapper.find('[data-testid="variable-highlight-neck"]').trigger('click');
    expect(wrapper.emitted('highlight')?.[0]).toEqual(['neck']);

    await wrapper.setProps({ activeSlug: 'neck' });
    await wrapper.find('[data-testid="variable-highlight-neck"]').trigger('click');
    expect(wrapper.emitted('highlight')?.[1]).toEqual([null]);
  });

  it('marks a measured row broken when a source disappeared', () => {
    const wrapper = mountPanel(measuredDocument({ sources: ['gone'], lastKnown: 42 }));
    expect(wrapper.find('[data-testid="variable-type-neck"]').text()).toBe('Broken');
    expect(wrapper.find('[data-testid="variable-value-neck"]').text()).toBe('42');
  });

  it('enables the measured entry only with a connected chain', async () => {
    const wrapper = mountPanel(createEmptyDocument());
    await wrapper.find('[data-testid="variables-add"]').trigger('click');

    const action = wrapper.find('[data-testid="add-measured-variable"]');
    expect(action.text()).toContain('New measured variable');
    expect(action.attributes('disabled')).toBeDefined();
    expect(action.attributes('title')).toBe('Select one or more connected edges first');

    await wrapper.setProps({ canMeasure: true });
    const enabled = wrapper.find('[data-testid="add-measured-variable"]');
    expect(enabled.attributes('disabled')).toBeUndefined();
    expect(enabled.attributes('title')).toBe('Measure the connected edges you have selected');
    await enabled.trigger('click');
    expect(wrapper.emitted('create-measured')).toHaveLength(1);
  });

  it('flags a broken formula and hides mutation controls when read-only', () => {
    const wrapper = mountPanel(
      documentOf([variable({ value: { expr: '$missing', lastKnown: 42 } })]),
      { readOnly: true },
    );

    expect(wrapper.find('[data-testid="variable-type-bust"]').text()).toBe('Broken');
    expect(wrapper.find('[data-testid="variable-remove-bust"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="variables-add"]').attributes('disabled')).toBeDefined();
  });

  it('closes the add menu on an outside pointer or Escape and keeps it on an inside click', async () => {
    const wrapper = mount(VariablesPanel, {
      props: { document: createEmptyDocument() },
      attachTo: document.body,
    });

    await wrapper.find('[data-testid="variables-add"]').trigger('click');
    wrapper
      .find('[data-testid="variables-panel"]')
      .element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(wrapper.find('[data-testid="variables-add-menu"]').exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="variables-add-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="variables-add"]').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('[data-testid="variables-add-menu"]').exists()).toBe(false);

    // A pointer event while the menu is closed does nothing.
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(wrapper.find('[data-testid="variables-add-menu"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('sorts by a header and cycles ascending, descending, then document order', async () => {
    const wrapper = mountPanel(
      documentOf([
        variable({ slug: 'b', name: 'Beta', value: 2 }),
        variable({ slug: 'a', name: 'Alpha', value: 10 }),
        variable({ slug: 'c', name: 'Gamma', value: 3 }),
      ]),
    );
    const order = () =>
      wrapper
        .findAll('tbody tr[data-testid^="variable-"]')
        .map((row) => row.attributes('data-testid'));

    expect(order()).toEqual(['variable-b', 'variable-a', 'variable-c']);

    await wrapper.find('[data-testid="variable-sort-name"]').trigger('click');
    expect(order()).toEqual(['variable-a', 'variable-b', 'variable-c']);
    expect(wrapper.find('th[aria-sort="ascending"]').exists()).toBe(true);

    await wrapper.find('[data-testid="variable-sort-name"]').trigger('click');
    expect(order()).toEqual(['variable-c', 'variable-b', 'variable-a']);
    expect(wrapper.find('th[aria-sort="descending"]').exists()).toBe(true);

    await wrapper.find('[data-testid="variable-sort-name"]').trigger('click');
    expect(order()).toEqual(['variable-b', 'variable-a', 'variable-c']);
    expect(wrapper.find('th[aria-sort="none"]').exists()).toBe(true);
  });

  it('sorts values numerically and keeps unresolved rows last in both directions', async () => {
    const wrapper = mountPanel(
      documentOf([
        variable({ slug: 'b', name: 'Beta', value: 2 }),
        variable({ slug: 'a', name: 'Alpha', value: 10 }),
        variable({ slug: 'z', name: 'Zeta', value: { expr: '$missing', lastKnown: 1 } }),
      ]),
    );
    const order = () =>
      wrapper
        .findAll('tbody tr[data-testid^="variable-"]')
        .map((row) => row.attributes('data-testid'));

    await wrapper.find('[data-testid="variable-sort-value"]').trigger('click');
    expect(order()).toEqual(['variable-b', 'variable-a', 'variable-z']);

    await wrapper.find('[data-testid="variable-sort-value"]').trigger('click');
    expect(order()).toEqual(['variable-a', 'variable-b', 'variable-z']);
  });

  it('sorts by unit, type and comment', async () => {
    const wrapper = mountPanel(
      documentOf([
        variable({ slug: 'one', name: 'One', unit: 'cm', comment: 'b' }),
        variable({ slug: 'two', name: 'Two', unit: 'mm', comment: 'a' }),
        variable({ slug: 'three', name: 'Three', unit: 'cm', value: { expr: '2', lastKnown: 2 } }),
      ]),
    );
    const order = () =>
      wrapper
        .findAll('tbody tr[data-testid^="variable-"]')
        .map((row) => row.attributes('data-testid'));

    await wrapper.find('[data-testid="variable-sort-unit"]').trigger('click');
    expect(order()).toEqual(['variable-one', 'variable-three', 'variable-two']);

    await wrapper.find('[data-testid="variable-sort-type"]').trigger('click');
    expect(order()).toEqual(['variable-one', 'variable-two', 'variable-three']);

    await wrapper.find('[data-testid="variable-sort-comment"]').trigger('click');
    expect(order()).toEqual(['variable-two', 'variable-one', 'variable-three']);
  });

  it('offers the edit action on measured rows only and emits it', async () => {
    const wrapper = mountPanel(measuredDocument());

    expect(wrapper.find('[data-testid="variable-edit-bust"]').exists()).toBe(false);
    await wrapper.find('[data-testid="variable-edit-neck"]').trigger('click');
    expect(wrapper.emitted('edit-measured')?.[0]).toEqual(['neck']);

    await wrapper.setProps({ editingSlug: 'neck' });
    expect(wrapper.find('[data-testid="variable-edit-neck"]').attributes('aria-pressed')).toBe(
      'true',
    );
  });

  it('hides the comment column in compact mode and opens it from the note action', async () => {
    const document = measuredDocument({
      comment: 'over bust',
      slug: 'neck',
    });
    const compactDoc: PatternDocument = {
      ...document,
      variables: [...(document.variables ?? []), variable({ comment: 'over bust' })],
    };
    const wrapper = mountPanel(compactDoc, { compact: true });

    expect(wrapper.find('[data-testid="variable-comment-bust"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="variable-sort-comment"]').exists()).toBe(false);

    await wrapper.find('[data-testid="variable-note-bust"]').trigger('click');
    const comment = wrapper.find('[data-testid="variable-comment-bust"]');
    expect(comment.exists()).toBe(true);
    expect((comment.element as HTMLInputElement).value).toBe('over bust');

    await comment.setValue('drafted');
    expect(wrapper.emitted('set-comment')?.[0]).toEqual(['bust', 'drafted']);

    await wrapper.find('[data-testid="variable-note-bust"]').trigger('click');
    expect(wrapper.find('[data-testid="variable-comment-bust"]').exists()).toBe(false);

    await wrapper.find('[data-testid="variable-unit-bust"]').trigger('click');
    expect(wrapper.emitted('set-unit')?.[0]).toEqual(['bust', 'mm']);

    await wrapper.find('[data-testid="variable-unit-neck"]').trigger('click');
    expect(wrapper.emitted('set-unit')?.[1]).toEqual(['neck', 'cm']);
  });
});
