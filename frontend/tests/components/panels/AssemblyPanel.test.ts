import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AssemblyPanel from '@/components/panels/AssemblyPanel.vue';

const documentOf = (): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [],
  pieces: [
    {
      id: 'p1',
      name: 'Front',
      quantity: 2,
      edges: [],
      allowances: [],
      notes: 'Cut two',
      fabric: 'Linen',
      color: '#336699',
      defaults: { allowance: { width: 12, kind: 'single' } },
    },
  ],
  assemblies: [
    {
      id: 'a1',
      name: 'Shell',
      instances: [{ id: 'i1', piece: 'p1', x: 10, y: 20, rotation: Math.PI / 2, mirrored: true }],
    },
  ],
  tabs: [{ kind: 'assembly', id: 'a1' }],
});

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(AssemblyPanel, {
    props: {
      document: documentOf(),
      assembly: documentOf().assemblies[0]!,
      ...props,
    },
  });
}

describe('AssemblyPanel selection', () => {
  it('asks for a selection when none is made', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-testid="assembly-selection"]').text()).toContain(
      'Select an instance to inspect it.',
    );
  });

  it('shows the transform in millimetres and degrees and patches it', async () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1' });
    const x = wrapper.find('[data-testid="instance-x"]');
    const y = wrapper.find('[data-testid="instance-y"]');
    const angle = wrapper.find('[data-testid="instance-angle"]');

    expect((x.element as HTMLInputElement).value).toBe('10');
    expect((y.element as HTMLInputElement).value).toBe('20');
    expect((angle.element as HTMLInputElement).value).toBe('90');

    await x.setValue('15');
    await y.setValue('25');
    await angle.setValue('45');

    expect(wrapper.emitted('update-instance')).toEqual([
      [{ x: 15 }],
      [{ y: 25 }],
      [{ rotation: Math.PI / 4 }],
    ]);
  });

  it('ignores an invalid or unchanged coordinate', async () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1' });
    const x = wrapper.find('[data-testid="instance-x"]');

    await x.setValue('');
    await x.setValue('10');

    expect(wrapper.emitted('update-instance')).toBeUndefined();
  });

  it('toggles mirror and opens or removes the instance', async () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1' });
    const mirror = wrapper.find('[data-testid="instance-mirror"]');

    expect(mirror.text()).toBe('Mirrored');
    await mirror.trigger('click');
    await wrapper.find('[data-testid="instance-open-piece-p1"]').trigger('click');
    await wrapper.find('[data-testid="instance-remove"]').trigger('click');

    expect(wrapper.emitted('update-instance')).toEqual([[{ mirrored: false }]]);
    expect(wrapper.emitted('open-piece')).toEqual([['p1']]);
    expect(wrapper.emitted('remove-instance')).toEqual([['i1']]);
  });

  it('shows the unmirrored state', () => {
    const document = documentOf();
    document.assemblies[0]!.instances[0]!.mirrored = false;
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]!, selectedInstanceId: 'i1' },
    });

    expect(wrapper.find('[data-testid="instance-mirror"]').text()).toBe('Mirror');
  });
});

describe('AssemblyPanel piece parameters', () => {
  it('renders the selected instance piece and forwards parameter edits', async () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1' });

    expect(wrapper.find('[data-testid="assembly-piece"]').text()).toContain('Piece');
    expect(wrapper.find('[data-testid="assembly-piece-name"]').element).toHaveProperty(
      'value',
      'Front',
    );

    const fabric = wrapper.find('[data-testid="assembly-piece-fabric"]');
    await fabric.setValue('Wool');
    expect(wrapper.emitted('update-piece')).toEqual([['p1', { fabric: 'Wool' }]]);

    await wrapper.find('[data-testid="assembly-piece-default-mode"]').setValue('inherit');
    expect(wrapper.emitted('set-default')).toEqual([['p1', { mode: 'inherit' }]]);
  });

  it('ignores an angle equal to the stored rotation and the zero fallback', async () => {
    const document = documentOf();
    delete document.assemblies[0]!.instances[0]!.rotation;
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]!, selectedInstanceId: 'i1' },
    });

    await wrapper.find('[data-testid="instance-angle"]').setValue('0');

    expect(wrapper.emitted('update-instance')).toBeUndefined();
  });

  it('ignores blank, non-finite and unchanged transform values', async () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1' });
    const x = wrapper.find('[data-testid="instance-x"]');
    const input = x.element as HTMLInputElement;
    input.type = 'text';
    input.value = 'abc';
    await x.trigger('change');

    await wrapper.find('[data-testid="instance-y"]').setValue('20');
    await wrapper.find('[data-testid="instance-angle"]').setValue('');
    await wrapper.find('[data-testid="instance-angle"]').setValue('90');
    await wrapper.find('[data-testid="instance-x"]').setValue('abc');

    expect(wrapper.emitted('update-instance')).toBeUndefined();
  });

  it('hides the piece section without a selection', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-testid="assembly-piece"]').exists()).toBe(false);
  });

  it('does not forward a parameter edit when the instance piece is gone', () => {
    const document = documentOf();
    document.pieces = [];
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]!, selectedInstanceId: 'i1' },
    });

    expect(wrapper.find('[data-testid="assembly-piece"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="instance-x"]').exists()).toBe(true);
  });
});

describe('AssemblyPanel assembly details', () => {
  it('renames the assembly and reports its count and tab label', async () => {
    const wrapper = mountPanel();
    const name = wrapper.find('[data-testid="assembly-name"]');

    expect((name.element as HTMLInputElement).value).toBe('Shell');
    expect(wrapper.find('[data-testid="assembly-instance-count"]').text()).toBe('1 instance');
    expect(wrapper.find('[data-testid="assembly-tab-label"]').text()).toBe('Shell');

    await name.setValue('Outer');
    expect(wrapper.emitted('update-assembly')).toEqual([['Outer']]);

    await name.setValue('   ');
    await name.setValue('Shell');
    expect(wrapper.emitted('update-assembly')).toHaveLength(1);
  });

  it('pluralises the instance count and falls back for an unnamed assembly', () => {
    const document = documentOf();
    document.assemblies[0]!.name = '  ';
    document.assemblies[0]!.instances.push({ id: 'i2', piece: 'p1', x: 0, y: 0 });
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]!, selectedInstanceId: 'i1' },
    });

    expect(wrapper.find('[data-testid="assembly-instance-count"]').text()).toBe('2 instances');
    expect(wrapper.find('[data-testid="assembly-tab-label"]').text()).toBe('Assembly 1');
  });

  it('disables the parameter form while read-only', () => {
    const wrapper = mountPanel({ selectedInstanceId: 'i1', readOnly: true });

    expect(
      wrapper.find('[data-testid="assembly-piece-form"]').element.closest('fieldset'),
    ).toHaveProperty('disabled', true);
  });
});

describe('AssemblyPanel seams', () => {
  const point = (id: string, x: number, y: number, piece: string) => ({
    id,
    kind: 'point' as const,
    x,
    y,
    piece,
    fixed: false,
  });
  const line = (id: string, start: string, end: string, piece: string) => ({
    id,
    kind: 'line' as const,
    start,
    end,
    piece,
  });
  const rectangle = (piece: string, width: number, prefix: string) => ({
    entities: [
      point(`${prefix}a`, 0, 0, piece),
      point(`${prefix}b`, width, 0, piece),
      point(`${prefix}c`, width, 100, piece),
      point(`${prefix}d`, 0, 100, piece),
      line(`${prefix}ab`, `${prefix}a`, `${prefix}b`, piece),
      line(`${prefix}bc`, `${prefix}b`, `${prefix}c`, piece),
      line(`${prefix}cd`, `${prefix}c`, `${prefix}d`, piece),
      line(`${prefix}da`, `${prefix}d`, `${prefix}a`, piece),
    ],
    piece: {
      id: piece,
      name: piece === 'p1' ? 'Front' : 'Back',
      edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
      allowances: [],
    },
  });

  const seamDoc = (): PatternDocument => {
    const front = rectangle('p1', 100, '');
    const back = rectangle('p2', 106, 'b-');
    return {
      ...createEmptyDocument(),
      entities: [...front.entities, ...back.entities],
      pieces: [
        {
          ...front.piece,
          allowances: [{ edge: 'ab', width: 10 }],
        },
        {
          ...back.piece,
          allowances: [{ edge: 'b-ab', width: 12, kind: 'double' }],
        },
        { id: 'p3', name: '', edges: ['missing'], allowances: [] },
      ],
      assemblies: [
        {
          id: 'a1',
          name: 'Shell',
          instances: [
            { id: 'i1', piece: 'p1', x: 0, y: 0 },
            { id: 'i2', piece: 'p2', x: 200, y: 0 },
            { id: 'i3', piece: 'p1', x: 400, y: 0 },
            { id: 'i4', piece: 'p3', x: 600, y: 0 },
          ],
          seams: [
            {
              id: 's1',
              sides: [
                { instance: 'i1', edges: ['ab'] },
                { instance: 'i2', edges: ['b-ab'] },
              ],
            },
            {
              id: 'dart',
              sides: [
                { instance: 'i3', edges: ['ab'] },
                { instance: 'i3', edges: ['bc'] },
                { instance: 'i1', edges: ['cd'] },
              ],
            },
            {
              id: 'broken',
              sides: [
                { instance: 'ghost', edges: ['ab'] },
                { instance: 'i1', edges: ['da'] },
              ],
            },
            { id: 'one', sides: [{ instance: 'i1', edges: ['bc'] }] },
          ],
          finishedEdges: [{ instance: 'i1', edge: 'cd', kind: 'hem' }],
        },
      ],
      tabs: [{ kind: 'assembly', id: 'a1' }],
    };
  };

  const mountSeams = (overrides: Record<string, unknown> = {}) => {
    const document = seamDoc();
    return mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]!, ...overrides },
    });
  };

  it('reports the verdict, the issues and the footer', () => {
    const wrapper = mountSeams();

    expect(wrapper.find('[data-testid="check-verdict"]').text()).toContain('Not sewable');
    expect(wrapper.find('[data-testid="check-footer"]').text()).toContain('5 mm tolerance');
    const text = wrapper.find('[data-testid="check-issues"]').text();
    expect(text).toContain('is neither sewn nor finished');
    expect(text).toContain('is claimed twice');
    expect(text).toContain('no longer resolves');
    expect(text).toContain('Sides differ by 6.0 mm');
    expect(text).toContain('Cut allowances differ by 14.0 mm');
    expect(text).toContain('has a double-fold allowance and is sewn');
  });

  it('calls an assembly with every edge claimed sewable', () => {
    const document = seamDoc();
    const assembly = document.assemblies[0]!;
    assembly.seams = [];
    assembly.instances = assembly.instances.filter((instance) => instance.id !== 'i4');
    assembly.finishedEdges = [
      ...document.pieces[0]!.edges.map((edge) => ({ instance: 'i1', edge, kind: 'hem' as const })),
      ...document.pieces[0]!.edges.map((edge) => ({ instance: 'i3', edge, kind: 'hem' as const })),
      ...document.pieces[1]!.edges.map((edge) => ({ instance: 'i2', edge, kind: 'hem' as const })),
    ];
    const wrapper = mount(AssemblyPanel, { props: { document, assembly } });

    expect(wrapper.find('[data-testid="check-verdict"]').text()).toBe('Sewable');
    expect(wrapper.find('[data-testid="check-warnings"]').exists()).toBe(false);
  });

  it('calls a warning-only assembly sewable', () => {
    const document = seamDoc();
    const assembly = document.assemblies[0]!;
    // Finish every edge except the eased seam, which keeps its warnings.
    assembly.seams = [{ ...assembly.seams![0]!, eased: true }];
    assembly.finishedEdges = [...document.pieces.flatMap((piece) => piece.edges)]
      .filter((edge) => edge !== 'ab' && edge !== 'b-ab')
      .flatMap((edge) => [
        { instance: 'i1', edge, kind: 'hem' as const },
        { instance: 'i2', edge, kind: 'hem' as const },
        { instance: 'i3', edge, kind: 'hem' as const },
      ])
      .filter((entry) => entry.instance === 'i3' || entry.edge !== 'b-ab');
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly },
    });

    expect(wrapper.find('[data-testid="check-warnings"]').text()).toContain('warning');
  });

  it('shows the empty states', () => {
    const document = { ...createEmptyDocument(), tabs: [] };
    const assembly = { id: 'a1', name: 'Empty', instances: [] };
    const wrapper = mount(AssemblyPanel, { props: { document, assembly } });

    expect(wrapper.find('[data-testid="check-empty"]').text()).toBe('Nothing to check');
    expect(wrapper.find('[data-testid="assembly-seams"]').text()).toContain('No seams yet');
    expect(wrapper.find('[data-testid="assembly-finished"]').text()).toContain('No finished edges');
  });

  it('labels a two-instance seam and a one-instance dart', () => {
    const wrapper = mountSeams();

    expect(wrapper.find('[data-testid="seam-row-s1"]').text()).toContain('Front ↔ Back');
    expect(wrapper.find('[data-testid="seam-row-dart"]').text()).toContain('Front · 3 sides');
  });

  it('selects a seam, toggles ease and removes a broken one', async () => {
    const wrapper = mountSeams();

    await wrapper.find('[data-testid="seam-select-s1"]').trigger('click');
    expect(wrapper.emitted('select-seam')).toEqual([['s1']]);

    await wrapper.find('[data-testid="seam-eased-s1"]').setValue(true);
    expect(wrapper.emitted('toggle-eased')).toEqual([['s1', true]]);

    await wrapper.find('[data-testid="seam-remove-broken"]').trigger('click');
    expect(wrapper.emitted('remove-seam')).toEqual([['broken']]);
  });

  it('labels an eased length mismatch as a warning', () => {
    const document = seamDoc();
    document.assemblies[0]!.seams![0]!.eased = true;
    const wrapper = mount(AssemblyPanel, {
      props: { document, assembly: document.assemblies[0]! },
    });

    expect(wrapper.find('[data-testid="check-issues"]').text()).toContain(
      'Sides differ by 6.0 mm (eased)',
    );
  });

  it('labels an unnamed piece and selects a seam for an edge-less issue', async () => {
    const wrapper = mountSeams();

    expect(wrapper.find('[data-testid="check-issues"]').text()).toContain('Piece 3 · an edge');

    const edgeLess = wrapper
      .findAll('[data-testid^="check-issue-select-"]')
      .find((issue) => issue.text().includes('Piece 3'))!;
    await edgeLess.trigger('click');
    expect(wrapper.emitted('select-seam')).toContainEqual([null]);
  });

  it('selects the seam or edge an issue names', async () => {
    const wrapper = mountSeams();
    const issues = wrapper.findAll('[data-testid^="check-issue-select-"]');

    // An unmatched edge selects its instance.
    const unmatched = issues.find((issue) => issue.text().includes('neither sewn'))!;
    await unmatched.trigger('click');
    expect(wrapper.emitted('select-edge')).toHaveLength(1);

    const missing = issues.filter((issue) => issue.text().includes('no longer resolves'));
    for (const issue of missing) await issue.trigger('click');
    expect(wrapper.emitted('select-edge')).toContainEqual(['ghost', 'ab']);
    expect(wrapper.emitted('select-seam')).toContainEqual(['one']);
    expect(wrapper.emitted('select-seam')).toContainEqual([null]);
  });

  it('marks an unmatched edge finished from the issue row', async () => {
    const wrapper = mountSeams();
    const select = wrapper.find('[data-testid="mark-finished-i1-bc"]');

    await select.setValue('hem');
    expect(wrapper.emitted('set-finished')).toEqual([['i1', 'bc', 'hem']]);

    const before = wrapper.emitted('set-finished')!.length;
    await select.setValue('');
    expect(wrapper.emitted('set-finished')).toHaveLength(before);
  });

  it('changes or clears a finished edge kind', async () => {
    const wrapper = mountSeams();
    const select = wrapper.find('[data-testid="finished-kind-i1-cd"]');

    await select.setValue('opening');
    await select.setValue('');
    expect(wrapper.emitted('set-finished')).toEqual([
      ['i1', 'cd', 'opening'],
      ['i1', 'cd', null],
    ]);
  });

  it('disables the seam and finish controls while read-only', () => {
    const wrapper = mountSeams({ readOnly: true });

    expect(
      (wrapper.find('[data-testid="seam-eased-s1"]').element as HTMLInputElement).disabled,
    ).toBe(true);
    expect(wrapper.find('[data-testid="seam-remove-broken"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="finished-kind-i1-cd"]').element as HTMLSelectElement).disabled,
    ).toBe(true);
  });
});
