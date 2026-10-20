import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { entityProperties, type EntityProperties } from '@/lib/entity-properties';

import EntityPropertiesPanel from './EntityPropertiesPanel.vue';

const doc = (overrides: Partial<PatternDocument> = {}): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [
    { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
    { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: true },
    { id: 'c', kind: 'point', x: 100, y: 60, construction: false, fixed: false },
    { id: 'd', kind: 'point', x: 0, y: 60, construction: false, fixed: false },
    { id: 'solo', kind: 'point', x: 10, y: 20, construction: false, fixed: true },
    { id: 'l1', kind: 'line', start: 'a', end: 'b', construction: false },
    { id: 'guide', kind: 'line', start: 'a', end: 'b', construction: true },
    { id: 'c1', kind: 'curve', p0: 'a', p1: 'b', p2: 'c', p3: 'd', construction: true },
  ],
  constraints: [
    { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100, orientation: 'horizontal' },
    { id: 'horizontal', type: 'horizontal', a: 'a', b: 'b' },
  ],
  ...overrides,
});

function panel(document: PatternDocument, id: string) {
  const entity = entityProperties(document, id) as EntityProperties;
  const wrapper = mount(EntityPropertiesPanel, { props: { document, entity } });
  return { wrapper, entity };
}

describe('EntityPropertiesPanel', () => {
  it('renders a point with its coordinates, fixed flag and no seam section', () => {
    const { wrapper } = panel(doc(), 'solo');

    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Point');
    expect(wrapper.text()).toContain('10 mm');
    expect(wrapper.find('[data-testid="entity-fixed"]').text()).toBe('Yes');
    expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('No related dimensions.');
    expect(wrapper.text()).toContain('No related constraints.');
  });

  it('renders a line with endpoints, length and related rows', () => {
    const { wrapper } = panel(doc(), 'l1');

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Line');
    expect(wrapper.find('[data-testid="entity-length"]').text()).toBe('100 mm');
    expect(wrapper.text()).toContain('a');
    expect(wrapper.text()).toContain('b');

    expect(wrapper.find('[data-testid="entity-dimension-width"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-constraint-horizontal"]').text()).toContain(
      'Horizontal',
    );
  });

  it('renders a curve with all four control points', () => {
    const { wrapper } = panel(doc(), 'c1');

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Curve');
    for (const point of ['p0', 'p1', 'p2', 'p3']) {
      expect(wrapper.text()).toContain(point);
    }
    expect(wrapper.text()).toContain('Construction');
  });

  it('shows the construction badge and toggles it', async () => {
    const { wrapper } = panel(doc(), 'guide');

    expect(wrapper.text()).toContain('Construction');

    await wrapper.find('[data-testid="entity-construction"]').setValue(false);
    expect(wrapper.emitted('set-construction')).toEqual([['guide', false]]);

    await wrapper.find('[data-testid="entity-construction"]').setValue(true);
    expect(wrapper.emitted('set-construction')).toEqual([
      ['guide', false],
      ['guide', true],
    ]);
  });

  it('adds an allowance to a cut edge and explains the guide restriction', async () => {
    const cut = panel(doc(), 'l1');
    await cut.wrapper.find('[data-testid="entity-add-seam"]').trigger('click');
    expect(cut.wrapper.emitted('add-seam')).toEqual([['l1']]);

    const guide = panel(doc(), 'guide');
    expect(guide.wrapper.find('[data-testid="entity-add-seam"]').exists()).toBe(false);
    expect(cut.wrapper.find('[data-testid="entity-flip-seam"]').exists()).toBe(false);
    expect(guide.wrapper.find('[data-testid="entity-flip-seam"]').exists()).toBe(false);
    expect(guide.wrapper.find('[data-testid="entity-seam-construction"]').text()).toBe(
      'Allowances apply to cut edges only.',
    );
  });

  it('edits and removes an attached allowance', async () => {
    const { wrapper } = panel(doc({ seams: [{ id: 's1', edge: 'l1', width: 10 }] }), 'l1');
    const input = wrapper.find('[data-testid="entity-seam-width"]');

    expect((input.element as HTMLInputElement).value).toBe('10');

    await input.setValue('15');
    expect(wrapper.emitted('set-seam-width')).toEqual([['s1', 15]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('10');
    expect(wrapper.emitted('set-seam-width')).toEqual([['s1', 15]]);

    await input.setValue('10');
    expect(wrapper.emitted('set-seam-width')).toEqual([['s1', 15]]);

    const flip = wrapper.find('[data-testid="entity-flip-seam"]');
    expect(flip.attributes('aria-label')).toBe('Flip side of the seam allowance for l1');
    await flip.trigger('click');
    expect(wrapper.emitted('flip-seam')).toEqual([['s1', 'left']]);

    await wrapper.find('[data-testid="entity-remove-seam"]').trigger('click');
    expect(wrapper.emitted('remove-seam')).toEqual([['s1']]);
  });

  it('commits a valid dimension value and ignores invalid or unchanged ones', async () => {
    const { wrapper } = panel(doc(), 'l1');
    const input = wrapper.find('[data-testid="entity-dimension-value-width"]');

    expect((input.element as HTMLInputElement).value).toBe('100');

    await input.setValue('120');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', 120]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', 120]]);

    await input.setValue('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', 120]]);

    await input.setValue('');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['width', 120],
      ['width', null],
    ]);
  });

  it('shows a driven dimension, sets it explicitly and keeps an empty driven edit', async () => {
    const { wrapper } = panel(
      doc({
        constraints: [{ id: 'live', type: 'distance', a: 'a', b: 'b', orientation: 'horizontal' }],
      }),
      'l1',
    );
    const input = wrapper.find('[data-testid="entity-dimension-value-live"]');

    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.find('[data-testid="entity-dimension-state-live"]').text()).toBe('Driven');

    await input.setValue('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['live', 100]]);

    await input.setValue('');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['live', 100]]);
  });

  it('leaves an unmeasurable dimension value empty', () => {
    const { wrapper } = panel(
      doc({ constraints: [{ id: 'ghost', type: 'distance', a: 'a', b: 'gone' }] }),
      'l1',
    );
    const input = wrapper.find('[data-testid="entity-dimension-value-ghost"]');

    expect((input.element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('[data-testid="entity-dimension-state-ghost"]').text()).toBe('Driven');
  });

  it('emits the remove intent for dimensions and constraints', async () => {
    const { wrapper } = panel(doc(), 'l1');

    await wrapper.find('[data-testid="entity-remove-dimension-width"]').trigger('click');
    await wrapper.find('[data-testid="entity-remove-constraint-horizontal"]').trigger('click');

    expect(wrapper.emitted('remove-constraint')).toEqual([['width'], ['horizontal']]);
  });

  it('shows an em dash when a line endpoint is missing', () => {
    const broken: PatternDocument = {
      ...doc(),
      entities: [
        ...doc().entities,
        { id: 'broken', kind: 'line', start: 'a', end: 'gone', construction: false },
      ],
    };
    const { wrapper } = panel(broken, 'broken');

    expect(wrapper.find('[data-testid="entity-length"]').text()).toBe('—');
  });
});
