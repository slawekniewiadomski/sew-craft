import { createEmptyDocument, executeCommand, type PatternDocument } from '@sewcraft/geometry';
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

function withCircle(overrides: Partial<PatternDocument> = {}): PatternDocument {
  return doc({
    entities: [
      ...doc().entities,
      { id: 'k1', kind: 'circle', center: 'a', rim: 'b', construction: false },
    ],
    ...overrides,
  });
}

describe('EntityPropertiesPanel', () => {
  it('renders a point with its coordinates, fixed flag and no seam section', () => {
    const { wrapper } = panel(doc(), 'solo');

    expect(wrapper.find('[data-testid="entity-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Point');
    expect(wrapper.text()).toContain('10 mm');
    expect(wrapper.find('[data-testid="entity-fixed"]').text()).toBe('Yes');
    expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-scope-hint"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('No dimensions on this point.');
    expect(wrapper.text()).toContain('No constraints on this point.');
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
    expect(wrapper.find('[data-testid="entity-scope-hint"]').text()).toBe(
      'Showing what acts on this line. Select a point to see its constraints.',
    );
  });

  it('renders a curve with all four control points', () => {
    const { wrapper } = panel(doc(), 'c1');

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Curve');
    for (const point of ['p0', 'p1', 'p2', 'p3']) {
      expect(wrapper.text()).toContain(point);
    }
    expect(wrapper.text()).toContain('Construction');
    expect(wrapper.find('[data-testid="entity-scope-hint"]').text()).toBe(
      'Showing what acts on this curve. Select a point to see its constraints.',
    );
  });

  it('renders an arc with its read-only derived measurements', () => {
    const document = doc({
      entities: [
        { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
        { id: 'p', kind: 'point', x: 50, y: 50, construction: false, fixed: false },
        { id: 'arc', kind: 'arc', start: 'a', end: 'b', through: 'p', construction: false },
      ],
      constraints: [],
    });
    const { wrapper } = panel(document, 'arc');

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Arc');
    expect(wrapper.find('[data-testid="entity-arc-radius"]').text()).toContain('50 mm');
    expect(wrapper.find('[data-testid="entity-arc-angle"]').text()).toContain('180°');
    expect(wrapper.find('[data-testid="entity-arc-length"]').text()).toContain('157.08 mm');
    expect(wrapper.find('[data-testid="entity-arc-invalid"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-scope-hint"]').text()).toBe(
      'Showing what acts on this arc. Select a point to see its constraints.',
    );
  });

  it('reports an arc whose three points became collinear as invalid', () => {
    const document = doc({
      entities: [
        { id: 'a', kind: 'point', x: 0, y: 0, construction: false, fixed: false },
        { id: 'b', kind: 'point', x: 100, y: 0, construction: false, fixed: false },
        { id: 'mid', kind: 'point', x: 50, y: 0, construction: false, fixed: false },
        { id: 'flat', kind: 'arc', start: 'a', end: 'b', through: 'mid', construction: false },
      ],
      constraints: [],
    });
    const { wrapper } = panel(document, 'flat');

    expect(wrapper.find('[data-testid="entity-arc-radius"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-arc-invalid"]').text()).toBe(
      'Invalid: the three points are collinear.',
    );
  });

  it('names the entity in the empty states', () => {
    const document = doc({ constraints: [] });

    const line = panel(document, 'l1').wrapper;
    expect(line.text()).toContain('No dimensions on this line.');
    expect(line.text()).toContain('No constraints on this line.');

    const curve = panel(document, 'c1').wrapper;
    expect(curve.text()).toContain('No dimensions on this curve.');
    expect(curve.text()).toContain('No constraints on this curve.');

    const circle = panel(withCircle({ constraints: [] }), 'k1').wrapper;
    expect(circle.text()).toContain('No dimensions on this circle.');
    expect(circle.text()).toContain('No constraints on this circle.');
  });

  it('renders a circle with its centre, rim, radius and no seam section', () => {
    const { wrapper } = panel(withCircle(), 'k1');

    expect(wrapper.find('[data-testid="entity-kind"]').text()).toBe('Circle');
    expect(wrapper.find('[data-testid="entity-circle-center"]').text()).toBe('a');
    expect(wrapper.find('[data-testid="entity-circle-rim"]').text()).toBe('b');
    expect(
      (wrapper.find('[data-testid="entity-circle-radius"]').element as HTMLInputElement).value,
    ).toBe('100');
    expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-scope-hint"]').text()).toBe(
      'Showing what acts on this circle. Select a point to see its constraints.',
    );
  });

  it('emits a new circle radius and snaps back an invalid or unchanged one', async () => {
    const { wrapper } = panel(withCircle(), 'k1');
    const input = wrapper.find('[data-testid="entity-circle-radius"]');

    await input.setValue('25');
    expect(wrapper.emitted('set-circle-radius')).toEqual([['k1', 25]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('set-circle-radius')).toEqual([['k1', 25]]);

    await input.setValue('100');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('set-circle-radius')).toEqual([['k1', 25]]);
  });

  it('shows a zero radius field for a collapsed circle', async () => {
    const { wrapper } = panel(
      doc({
        entities: [
          ...doc().entities,
          { id: 'zero', kind: 'circle', center: 'a', rim: 'a', construction: false },
        ],
      }),
      'zero',
    );

    const input = wrapper.find('[data-testid="entity-circle-radius"]');
    expect((input.element as HTMLInputElement).value).toBe('0');

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('0');
    expect(wrapper.emitted('set-circle-radius')).toBeUndefined();
  });

  it('shows an empty radius field for a circle whose point is missing', async () => {
    const { wrapper } = panel(
      doc({
        entities: [
          ...doc().entities,
          { id: 'lost', kind: 'circle', center: 'a', rim: 'gone', construction: false },
        ],
      }),
      'lost',
    );

    const input = wrapper.find('[data-testid="entity-circle-radius"]');
    expect((input.element as HTMLInputElement).value).toBe('');

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(wrapper.emitted('set-circle-radius')).toBeUndefined();
  });

  it('shows the construction badge and assigns a role', async () => {
    const { wrapper } = panel(doc(), 'guide');

    expect(wrapper.text()).toContain('Construction');
    const select = wrapper.find('[data-testid="entity-role"]');
    expect((select.element as HTMLSelectElement).value).toBe('construction');

    await select.setValue('cut');
    expect(wrapper.emitted('set-role')).toEqual([['guide', 'cut']]);

    await select.setValue('annotation');
    expect(wrapper.emitted('set-role')).toEqual([
      ['guide', 'cut'],
      ['guide', 'annotation'],
    ]);
  });

  it('offers no legacy seam controls for any edge', () => {
    for (const id of ['l1', 'guide']) {
      const { wrapper } = panel(doc({ seams: [{ id: 's1', edge: id, width: 10 }] }), id);

      expect(wrapper.find('[data-testid="entity-seam"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-add-seam"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-seam-width"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-flip-seam"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-remove-seam"]').exists()).toBe(false);
    }
  });

  it('commits a valid dimension value and ignores invalid or unchanged ones', async () => {
    const { wrapper } = panel(doc(), 'l1');
    const input = wrapper.find('[data-testid="entity-dimension-value-width"]');

    expect((input.element as HTMLInputElement).value).toBe('100');

    await input.setValue('120');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', { value: 120 }]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', { value: 120 }]]);

    await input.setValue('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['width', { value: 120 }]]);

    await input.setValue('');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['width', { value: 120 }],
      ['width', { value: null }],
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
    expect(wrapper.emitted('update-dimension')).toEqual([['live', { value: 100 }]]);

    await input.setValue('');
    expect((input.element as HTMLInputElement).value).toBe('100');
    expect(wrapper.emitted('update-dimension')).toEqual([['live', { value: 100 }]]);
  });

  it('leaves an unmeasurable dimension value empty', () => {
    const document = doc({
      entities: [
        ...doc().entities,
        { id: 'broken', kind: 'line', start: 'a', end: 'gone', construction: false },
      ],
      constraints: [{ id: 'ghost', type: 'distance', a: 'a', b: 'gone' }],
    });
    const { wrapper } = panel(document, 'broken');
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

  it('shows a corner round section for a rounded line and its arc', () => {
    const document = roundedDoc();

    const line = panel(document, 'l1').wrapper;
    expect(line.find('[data-testid="entity-corner-rounds"]').exists()).toBe(true);
    expect(line.find('[data-testid="entity-corner-round-r1"]').text()).toContain(
      'corner b · anchors a, c',
    );
    expect(
      (line.find('[data-testid="entity-corner-radius-r1"]').element as HTMLInputElement).value,
    ).toBe('10');

    const arc = panel(document, 'r1:arc').wrapper;
    expect(arc.find('[data-testid="entity-corner-round-r1"]').exists()).toBe(true);

    const corner = panel(document, 'b').wrapper;
    expect(corner.find('[data-testid="entity-corner-rounds"]').exists()).toBe(false);

    const guide = panel(document, 'guide').wrapper;
    expect(guide.find('[data-testid="entity-corner-rounds"]').exists()).toBe(false);
  });

  it('edits and removes a corner round', async () => {
    const { wrapper } = panel(roundedDoc(), 'l1');
    const input = wrapper.find('[data-testid="entity-corner-radius-r1"]');

    await input.setValue('20');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 20]]);

    await input.setValue('0');
    expect((input.element as HTMLInputElement).value).toBe('10');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 20]]);

    await input.setValue('10');
    expect(wrapper.emitted('set-corner-round-radius')).toEqual([['r1', 20]]);

    await wrapper.find('[data-testid="entity-remove-corner-round-r1"]').trigger('click');
    expect(wrapper.emitted('remove-corner-round')).toEqual([['r1']]);
  });

  it('links a dimension from the inspector picker with the keyboard or pointer', async () => {
    const { wrapper } = panel(
      doc({
        constraints: [
          { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100 },
          { id: 'height', type: 'distance', a: 'b', b: 'c', value: 60 },
          { id: 'depth', type: 'distance', a: 'c', b: 'd', value: 80 },
        ],
      }),
      'b',
    );
    const input = wrapper.find('[data-testid="entity-dimension-value-width"]');

    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);

    (input.element as HTMLInputElement).value = '#';
    await input.trigger('input');

    const picker = wrapper.find('[data-testid="dimension-reference-picker"]');
    expect(picker.exists()).toBe(true);
    expect(picker.find('[data-testid="dimension-reference-option-height"]').text()).toBe(
      'height · 60 mm · b → c · Aligned',
    );
    expect(input.attributes('aria-expanded')).toBe('true');
    expect(input.attributes('aria-activedescendant')).toBe(
      'entity-dimension-reference-list-width-height',
    );

    const heightInput = wrapper.find('[data-testid="entity-dimension-value-height"]');
    await heightInput.trigger('keydown', { key: 'ArrowDown' });
    await heightInput.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(true);
    expect(input.attributes('aria-activedescendant')).toBe(
      'entity-dimension-reference-list-width-height',
    );

    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(input.attributes('aria-activedescendant')).toBe(
      'entity-dimension-reference-list-width-depth',
    );
    await input.trigger('keydown', { key: 'ArrowUp' });
    expect(input.attributes('aria-activedescendant')).toBe(
      'entity-dimension-reference-list-width-height',
    );

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update-dimension')).toEqual([['width', { reference: 'height' }]]);
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);

    await wrapper.find('[data-testid="entity-dimension-reference-width"]').trigger('click');
    await wrapper.find('[data-testid="dimension-reference-option-depth"]').trigger('click');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['width', { reference: 'height' }],
      ['width', { reference: 'depth' }],
    ]);
  });

  it('filters the inspector picker and closes it with Escape', async () => {
    const { wrapper } = panel(
      doc({
        constraints: [
          { id: 'width', type: 'distance', a: 'a', b: 'b', value: 100 },
          { id: 'height', type: 'distance', a: 'b', b: 'c', value: 60 },
        ],
      }),
      'l1',
    );
    const input = wrapper.find('[data-testid="entity-dimension-value-width"]');

    (input.element as HTMLInputElement).value = '#zzz';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-empty"]').text()).toBe(
      'No other dimensions can be referenced.',
    );

    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'ArrowUp' });
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);
    expect(input.attributes('aria-expanded')).toBe('false');

    (input.element as HTMLInputElement).value = '#';
    await input.trigger('input');
    (input.element as HTMLInputElement).value = '120';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-picker"]').exists()).toBe(false);
  });

  it('renders referenced and broken rows with source actions', async () => {
    const document = doc({
      constraints: [
        { id: 'A', type: 'distance', a: 'a', b: 'b', value: 100 },
        { id: 'R', type: 'distance', a: 'b', b: 'c', reference: 'A' },
        { id: 'B', type: 'distance', a: 'c', b: 'd', reference: 'gone', lastKnownValue: 75 },
      ],
    });
    const { wrapper } = panel(document, 'c');

    const referenced = wrapper.find('[data-testid="entity-dimension-value-R"]');
    expect((referenced.element as HTMLInputElement).value).toBe('#A');
    expect(wrapper.find('[data-testid="entity-dimension-state-R"]').text()).toBe('Referenced');
    expect(wrapper.find('[data-testid="entity-dimension-source-R"]').text()).toContain('Source: A');

    await wrapper.find('[data-testid="entity-dimension-unlink-R"]').trigger('click');
    expect(wrapper.emitted('update-dimension')).toEqual([['R', { reference: null }]]);

    const broken = wrapper.find('[data-testid="entity-dimension-value-B"]');
    expect((broken.element as HTMLInputElement).value).toBe('75');
    expect(wrapper.find('[data-testid="entity-dimension-state-B"]').text()).toBe('Broken');
    expect(wrapper.find('[data-testid="entity-dimension-broken-B"]').text()).toBe(
      'Source gone is missing. Type a value or press # to re-link.',
    );
    expect(wrapper.find('[data-testid="entity-dimension-reference-B"]').text()).toBe('Re-link');

    await wrapper.find('[data-testid="entity-dimension-reference-B"]').trigger('click');
    await wrapper.find('[data-testid="dimension-reference-option-A"]').trigger('click');
    expect(wrapper.emitted('update-dimension')).toEqual([
      ['R', { reference: null }],
      ['B', { reference: 'A' }],
    ]);
  });

  it('falls back for a stale dimension row after the constraint is gone', async () => {
    const document = doc();
    const entity = entityProperties(document, 'l1')!;
    entity.dimensions = [
      {
        id: 'stale',
        entities: ['a', 'b'],
        value: 120,
        state: 'set',
        sourceId: null,
        orientation: 'aligned',
      },
      {
        id: 'stale-null',
        entities: ['a', 'b'],
        value: null,
        state: 'driven',
        sourceId: null,
        orientation: 'aligned',
      },
    ];
    const wrapper = mount(EntityPropertiesPanel, { props: { document, entity } });
    const input = wrapper.find('[data-testid="entity-dimension-value-stale"]');

    expect((input.element as HTMLInputElement).value).toBe('120');
    expect(
      (
        wrapper.find('[data-testid="entity-dimension-value-stale-null"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('');

    (input.element as HTMLInputElement).value = '#width';
    await input.trigger('input');
    expect(wrapper.find('[data-testid="dimension-reference-empty"]').exists()).toBe(true);

    (input.element as HTMLInputElement).value = '#width';
    await input.trigger('change');
    expect((input.element as HTMLInputElement).value).toBe('120');
    expect(wrapper.emitted('update-dimension')).toBeUndefined();
  });
});

/** A 100 × 60 rectangle whose four lines form piece `p1`. */
function pieceDoc(overrides: Partial<PatternDocument> = {}): PatternDocument {
  return doc({
    entities: [
      ...doc().entities.filter((entity) => entity.kind === 'point'),
      { id: 'ab', kind: 'line', start: 'a', end: 'b', construction: false },
      { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
      { id: 'cd', kind: 'line', start: 'c', end: 'd', construction: false },
      { id: 'da', kind: 'line', start: 'd', end: 'a', construction: false },
    ],
    pieces: [
      {
        id: 'p1',
        name: 'Front',
        quantity: 2,
        edges: ['ab', 'bc', 'cd', 'da'],
        allowances: [{ edge: 'ab', width: 10, kind: 'double' }],
      },
    ],
    ...overrides,
  });
}

describe('EntityPropertiesPanel piece card', () => {
  it('renders the piece metrics and one allowance row per loop edge', () => {
    const { wrapper } = panel(pieceDoc(), 'ab');

    expect(wrapper.find('[data-testid="entity-piece"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-piece-id"]').text()).toBe('p1');
    expect((wrapper.find('[data-testid="entity-name"]').element as HTMLInputElement).value).toBe(
      'Front',
    );
    expect(
      (wrapper.find('[data-testid="entity-quantity"]').element as HTMLInputElement).value,
    ).toBe('2');
    expect(wrapper.find('[data-testid="entity-piece-finished"]').text()).toBe('100 × 60 mm');
    expect(wrapper.find('[data-testid="entity-piece-cut"]').text()).not.toBe('—');
    expect(wrapper.find('[data-testid="entity-piece-cut-area"]').text()).toContain('mm²');
    expect(wrapper.find('[data-testid="entity-piece-allowance-area"]').text()).toContain('cm²');

    expect(wrapper.find('[data-testid="entity-piece-allowance-ab"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="entity-piece-kind-ab"]').element as HTMLSelectElement).value,
    ).toBe('double');
    expect(
      (wrapper.find('[data-testid="entity-piece-width-ab"]').element as HTMLInputElement).value,
    ).toBe('10');

    const missing = wrapper.find('[data-testid="entity-piece-allowance-cd"]');
    expect((missing.find('select').element as HTMLSelectElement).value).toBe('none');
    expect((missing.find('input').element as HTMLInputElement).disabled).toBe(true);
    expect((missing.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('shows em dashes when the piece loop cannot be measured', () => {
    const document = doc({
      pieces: [{ id: 'p1', edges: ['l1', 'missing', 'other'], allowances: [] }],
    });
    const { wrapper } = panel(document, 'l1');

    for (const field of ['finished', 'cut', 'cut-area', 'allowance-area']) {
      expect(wrapper.find(`[data-testid="entity-piece-${field}"]`).text()).toBe('—');
    }
  });

  it('renames a piece, clears the name and ignores an unchanged one', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');
    const name = wrapper.find('[data-testid="entity-name"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await name.setValue('Back');
    await name.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { name: 'Back' }]);

    const count = emitted().length;
    await name.setValue('Front');
    await name.trigger('change');
    expect(emitted()).toHaveLength(count);

    await name.setValue('   ');
    await name.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { name: null }]);
  });

  it('names an unnamed piece', async () => {
    const { wrapper } = panel(
      pieceDoc({
        pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
      }),
      'ab',
    );

    const name = wrapper.find('[data-testid="entity-name"]');
    expect((name.element as HTMLInputElement).value).toBe('');

    await name.setValue('Front');
    await name.trigger('change');
    expect(wrapper.emitted('update-piece')?.at(-1)).toEqual(['p1', { name: 'Front' }]);
  });

  it('updates the quantity and snaps invalid or unchanged values back', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');
    const quantity = wrapper.find('[data-testid="entity-quantity"]');
    const emitted = () => wrapper.emitted('update-piece') ?? [];

    await quantity.setValue('4');
    await quantity.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', { quantity: 4 }]);

    const count = emitted().length;
    await quantity.setValue('2');
    await quantity.trigger('change');
    expect(emitted()).toHaveLength(count);

    await quantity.setValue('0');
    await quantity.trigger('change');
    expect((quantity.element as HTMLInputElement).value).toBe('2');
    expect(emitted()).toHaveLength(count);

    await quantity.setValue('1.5');
    await quantity.trigger('change');
    expect((quantity.element as HTMLInputElement).value).toBe('2');
    expect(emitted()).toHaveLength(count);
  });

  it('sets, changes and removes an allowance from the piece card', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');
    const emitted = () => wrapper.emitted('set-piece-allowance') ?? [];

    const kind = wrapper.find('[data-testid="entity-piece-kind-ab"]');
    await kind.setValue('single');
    await kind.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', 'ab', { kind: 'single', width: 10 }]);

    const emptyKind = wrapper.find('[data-testid="entity-piece-kind-cd"]');
    await emptyKind.setValue('seam');
    await emptyKind.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', 'cd', { kind: 'seam', width: 10 }]);

    await emptyKind.setValue('none');
    await emptyKind.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', 'cd', null]);
  });

  it('edits an allowance width and snaps invalid, unchanged or absent widths back', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');
    const emitted = () => wrapper.emitted('set-piece-allowance') ?? [];

    const width = wrapper.find('[data-testid="entity-piece-width-ab"]');
    await width.setValue('14');
    await width.trigger('change');
    expect(emitted().at(-1)).toEqual(['p1', 'ab', { kind: 'double', width: 14 }]);

    const count = emitted().length;
    await width.setValue('10');
    await width.trigger('change');
    expect(emitted()).toHaveLength(count);

    await width.setValue('nope');
    await width.trigger('change');
    expect((width.element as HTMLInputElement).value).toBe('10');
    expect(emitted()).toHaveLength(count);

    const absent = wrapper.find('[data-testid="entity-piece-width-cd"]');
    (absent.element as HTMLInputElement).disabled = false;
    (absent.element as HTMLInputElement).value = '5';
    await absent.trigger('change');
    expect((absent.element as HTMLInputElement).value).toBe('');
    expect(emitted()).toHaveLength(count);
  });

  it('emits remove-piece from the piece card', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');

    await wrapper.find('[data-testid="entity-remove-piece-p1"]').trigger('click');

    expect(wrapper.emitted('remove-piece')).toEqual([['p1']]);
  });

  it('lists cut dimensions with their value or a dash and removes them', async () => {
    const { wrapper } = panel(
      pieceDoc({
        constraints: [
          {
            id: 'cut',
            type: 'derived_distance',
            piece: 'p1',
            a: { edge: 'ab', at: 'start' },
            b: { edge: 'bc', at: 'end' },
            orientation: 'horizontal',
          },
          {
            id: 'stale',
            type: 'derived_distance',
            piece: 'p1',
            a: { edge: 'ab', at: 'start' },
            b: { edge: 'missing', at: 'end' },
          },
        ],
      }),
      'ab',
    );

    expect(wrapper.find('[data-testid="entity-cut-dimension-cut"]').exists()).toBe(true);
    const value = wrapper.find('[data-testid="entity-cut-dimension-value-cut"]');
    expect((value.element as HTMLInputElement).value).toContain(' mm');
    expect(
      (wrapper.find('[data-testid="entity-cut-dimension-value-stale"]').element as HTMLInputElement)
        .value,
    ).toBe('—');

    await wrapper.find('[data-testid="entity-remove-cut-dimension-cut"]').trigger('click');
    expect(wrapper.emitted('remove-constraint')).toEqual([['cut']]);
  });

  it('prints an edge anchor as edge in the cut row', async () => {
    const { wrapper } = panel(
      pieceDoc({
        constraints: [
          {
            id: 'edge-cut',
            type: 'derived_distance',
            piece: 'p1',
            a: { edge: 'ab', at: 'edge' },
            b: { edge: 'cd', at: 'edge' },
          },
        ],
      }),
      'ab',
    );

    expect(wrapper.find('[data-testid="entity-cut-dimension-edge-cut"]').text()).toContain(
      'ab:edge → cd:edge',
    );
  });
});

/** The base document plus line `bc` and a 10 mm round at corner `b`. */
function roundedDoc(): PatternDocument {
  const source = doc({
    entities: [
      ...doc().entities,
      { id: 'bc', kind: 'line', start: 'b', end: 'c', construction: false },
    ],
  });

  return executeCommand(source, {
    id: 'r1',
    type: 'add_corner_round',
    params: { first: 'l1', second: 'bc', radius: 10 },
  }).document;
}

describe('EntityPropertiesPanel piece card all edges', () => {
  it('forwards an All edges apply from the card', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');

    await wrapper.find('[data-testid="entity-piece-all-apply"]').trigger('click');

    expect(wrapper.emitted('set-all-allowances')?.at(-1)).toEqual([
      'p1',
      { kind: 'seam', width: 10 },
    ]);
  });
});

describe('annotation text editor', () => {
  const textDoc = (): PatternDocument =>
    doc({
      entities: [
        ...doc().entities,
        {
          id: 't1',
          kind: 'text',
          piece: 'p1',
          anchor: 'a',
          content: 'velcro',
          alignment: 'center',
          rotation: 0.5,
          fontSize: 8,
          leader: 'b',
        },
      ],
      pieces: [{ id: 'p1', edges: [], allowances: [] }],
    });

  it('shows the label fields and hides the role select', () => {
    const { wrapper } = panel(textDoc(), 't1');

    expect(wrapper.find('[data-testid="entity-role"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="text-content"]').element as HTMLInputElement).value).toBe(
      'velcro',
    );
    expect(
      (wrapper.find('[data-testid="text-alignment"]').element as HTMLSelectElement).value,
    ).toBe('center');
    expect((wrapper.find('[data-testid="text-rotation"]').element as HTMLInputElement).value).toBe(
      '0.5',
    );
    expect((wrapper.find('[data-testid="text-size"]').element as HTMLInputElement).value).toBe('8');
    expect(wrapper.find('[data-testid="text-leader"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="text-leader-pick"]').exists()).toBe(false);
  });

  it('emits each text edit', async () => {
    const { wrapper } = panel(textDoc(), 't1');

    await wrapper.find('[data-testid="text-content"]').setValue('snap');
    await wrapper.find('[data-testid="text-alignment"]').setValue('right');
    await wrapper.find('[data-testid="text-rotation"]').setValue('1.5');
    await wrapper.find('[data-testid="text-size"]').setValue('12');

    expect(wrapper.emitted('update-text')).toEqual([
      ['t1', { content: 'snap' }],
      ['t1', { alignment: 'right' }],
      ['t1', { rotation: 1.5 }],
      ['t1', { fontSize: 12 }],
    ]);
  });

  it('snaps an invalid rotation back to the stored value', async () => {
    const { wrapper } = panel(textDoc(), 't1');
    const rotation = wrapper.find('[data-testid="text-rotation"]');

    await rotation.setValue('');
    expect((rotation.element as HTMLInputElement).value).toBe('0.5');

    const size = wrapper.find('[data-testid="text-size"]');
    await size.setValue('');
    expect((size.element as HTMLInputElement).value).toBe('8');
    expect(wrapper.emitted('update-text')).toBeUndefined();
  });

  it('forwards a per-piece allowance override from the card', async () => {
    const { wrapper } = panel(pieceDoc(), 'ab');

    await wrapper.find('[data-testid="entity-default-mode"]').setValue('none');

    expect(wrapper.emitted('set-piece-default')).toEqual([['p1', { mode: 'none' }]]);
  });
});
