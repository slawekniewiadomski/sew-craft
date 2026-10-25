import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AssemblyPanel from './AssemblyPanel.vue';

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
