import { createEmptyDocument, type Assembly, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import PreviewDialog from '@/components/dialogs/PreviewDialog.vue';

const point = (id: string, x: number, y: number) => ({
  id,
  kind: 'point' as const,
  x,
  y,
  piece: 'p1',
  fixed: false,
});
const line = (id: string, start: string, end: string) => ({
  id,
  kind: 'line' as const,
  start,
  end,
  piece: 'p1',
});

const rectangle = (size = 30): PatternDocument => ({
  ...createEmptyDocument(),
  entities: [
    point('a', 0, 0),
    point('b', size, 0),
    point('c', size, size),
    point('d', 0, size),
    line('ab', 'a', 'b'),
    line('bc', 'b', 'c'),
    line('cd', 'c', 'd'),
    line('da', 'd', 'a'),
  ],
  pieces: [{ id: 'p1', edges: ['ab', 'bc', 'cd', 'da'], allowances: [] }],
});

const assemblyOf = (seamed: boolean, instances = 2): Assembly => ({
  id: 'a1',
  name: 'Shell',
  instances: Array.from({ length: instances }, (_, index) => ({
    id: `i${index + 1}`,
    piece: 'p1',
    x: index * 100,
    y: 0,
  })),
  ...(seamed
    ? {
        seams: [
          {
            id: 's1',
            sides: [
              { instance: 'i1', edges: ['ab'] },
              { instance: 'i2', edges: ['ab'] },
            ],
          },
        ],
      }
    : {}),
});

const withTwoSeams = (): Assembly => {
  const assembly = assemblyOf(true);
  return {
    ...assembly,
    seams: [
      ...(assembly.seams ?? []),
      {
        id: 's2',
        sides: [
          { instance: 'i1', edges: ['bc'] },
          { instance: 'i2', edges: ['bc'] },
        ],
      },
    ],
  };
};

const mountDialog = (document = rectangle(), assembly = assemblyOf(true)) =>
  mount(PreviewDialog, { props: { document, assembly } });

async function mountSewn(document = rectangle(), assembly = assemblyOf(true)) {
  const wrapper = mountDialog(document, assembly);
  await wrapper.find('[data-testid="preview-mode-sewn"]').trigger('click');
  return wrapper;
}

describe('PreviewDialog', () => {
  it('opens on the exploded parts with seam links and labels', () => {
    const wrapper = mountDialog();

    expect(wrapper.find('[data-testid="preview-dialog"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-svg"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="exploded-panel-"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="exploded-seam-"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="exploded-link-"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="exploded-label"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="preview-face-"]')).toHaveLength(0);
  });

  it('lists the seams and lets the list isolate one', async () => {
    const wrapper = mountDialog(rectangle(), withTwoSeams());
    const rows = wrapper.findAll('[data-testid="preview-seam-row"]');
    const sides = wrapper.findAll('[data-testid^="exploded-seam-"]');

    expect(wrapper.find('[data-testid="exploded-seams"]').exists()).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('a → b');
    expect(sides[2]!.attributes('opacity')).toBe('1');

    await rows[0]!.trigger('pointerenter');
    expect(sides[2]!.attributes('opacity')).toBe('0.12');
    await rows[0]!.trigger('pointerleave');
    expect(sides[2]!.attributes('opacity')).toBe('1');

    await rows[0]!.trigger('focus');
    expect(sides[2]!.attributes('opacity')).toBe('0.12');
    await rows[0]!.trigger('blur');
    expect(sides[2]!.attributes('opacity')).toBe('1');
  });

  it('keeps a complex assembly in Exploded instead of the sewn dummy', async () => {
    const wrapper = mountDialog(rectangle(), assemblyOf(true, 3));
    await wrapper.find('[data-testid="preview-mode-sewn"]').trigger('click');

    expect(wrapper.find('[data-testid="preview-sewn-unsupported"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-svg"]').exists()).toBe(false);

    await wrapper.find('[data-testid="preview-use-exploded"]').trigger('click');
    expect(wrapper.findAll('[data-testid^="exploded-panel-"]')).toHaveLength(3);
  });

  it('isolates the hovered seam from the rest of the web', async () => {
    const wrapper = mountDialog(rectangle(), withTwoSeams());
    const hits = wrapper.findAll('[data-testid^="seam-focus-side-"]');
    const sides = wrapper.findAll('[data-testid^="exploded-seam-"]');

    expect(hits).toHaveLength(4);
    expect(sides[2]!.attributes('opacity')).toBe('1');

    await hits[0]!.trigger('pointerenter');
    expect(sides[0]!.attributes('opacity')).toBe('1');
    expect(sides[2]!.attributes('opacity')).toBe('0.12');

    await hits[0]!.trigger('pointerleave');
    expect(sides[2]!.attributes('opacity')).toBe('1');

    const links = wrapper.findAll('[data-testid^="seam-focus-link-"]');
    await links[0]!.trigger('pointerenter');
    expect(sides[2]!.attributes('opacity')).toBe('0.12');
    await links[0]!.trigger('pointerleave');
    expect(sides[2]!.attributes('opacity')).toBe('1');
  });

  it('switches to the sewn view with its controls', async () => {
    const wrapper = await mountSewn();

    expect(wrapper.findAll('[data-testid^="preview-face-"]').length).toBeGreaterThan(2);
    expect(wrapper.find('[data-testid="preview-inflate"]').attributes('value')).toBe('100');
    expect(wrapper.find('[data-testid="preview-inflate-value"]').text()).toBe('100%');

    await wrapper.find('[data-testid="preview-mode-exploded"]').trigger('click');
    expect(wrapper.findAll('[data-testid^="exploded-panel-"]')).toHaveLength(2);
  });

  it('shows the empty state in both modes when nothing resolves', async () => {
    const wrapper = mountDialog(
      { ...createEmptyDocument() },
      { id: 'a1', name: 'Empty', instances: [] },
    );

    expect(wrapper.find('[data-testid="preview-empty"]').text()).toBe('Nothing to preview.');
    expect(wrapper.find('[data-testid="preview-svg"]').exists()).toBe(false);

    await wrapper.find('[data-testid="preview-mode-sewn"]').trigger('click');
    expect(wrapper.find('[data-testid="preview-empty"]').text()).toBe('Nothing to preview.');
  });

  it('updates the inflate label and clamps out-of-range values', async () => {
    const wrapper = await mountSewn();
    const slider = wrapper.find('[data-testid="preview-inflate"]');

    await slider.setValue('100');
    expect(wrapper.find('[data-testid="preview-inflate-value"]').text()).toBe('100%');

    (slider.element as HTMLInputElement).value = '150';
    await slider.trigger('input');
    expect(wrapper.find('[data-testid="preview-inflate-value"]').text()).toBe('100%');

    (slider.element as HTMLInputElement).value = '-5';
    await slider.trigger('input');
    expect(wrapper.find('[data-testid="preview-inflate-value"]').text()).toBe('0%');
  });

  it('switches to wireframe', async () => {
    const wrapper = await mountSewn();
    const face = () => wrapper.findAll('[data-testid^="preview-face-"]')[0]!;

    expect(face().attributes('fill')).not.toBe('none');
    await wrapper.find('[data-testid="preview-wireframe"]').setValue(true);
    expect(face().attributes('fill')).toBe('none');
    expect(face().attributes('stroke')).not.toBe('none');
  });

  it('orbits on a left drag and resets the view', async () => {
    const wrapper = await mountSewn();
    const svg = wrapper.find('[data-testid="preview-svg"]');
    const before = wrapper.findAll('[data-testid^="preview-face-"]')[0]!.attributes('points');

    await svg.trigger('pointerdown', { button: 2, clientX: 0, clientY: 0 });
    await svg.trigger('pointermove', { clientX: 40, clientY: 20 });
    expect(wrapper.findAll('[data-testid^="preview-face-"]')[0]!.attributes('points')).toBe(before);

    await svg.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 });
    await svg.trigger('pointermove', { clientX: 40, clientY: 20 });
    const dragged = wrapper.findAll('[data-testid^="preview-face-"]')[0]!.attributes('points');
    expect(dragged).not.toBe(before);

    await svg.trigger('pointerup');
    await wrapper.find('[data-testid="preview-reset"]').trigger('click');
    expect(wrapper.findAll('[data-testid^="preview-face-"]')[0]!.attributes('points')).toBe(before);
  });

  it('closes from the button and Escape only', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-testid="preview-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('notes a non-sewable assembly and a simplified mesh in the sewn view', async () => {
    const unsewn = await mountSewn(rectangle(), assemblyOf(false));
    expect(unsewn.find('[data-testid="preview-approximate"]').exists()).toBe(true);

    const large = await mountSewn(rectangle(1000), assemblyOf(false, 1));
    expect(large.find('[data-testid="preview-simplified"]').exists()).toBe(true);
  });

  it('hides the approximating note for a sewable assembly', async () => {
    const document = rectangle();
    const assembly: Assembly = {
      ...assemblyOf(false, 1),
      finishedEdges: document.pieces[0]!.edges.map((edge) => ({
        instance: 'i1',
        edge,
        kind: 'hem' as const,
      })),
    };
    const wrapper = await mountSewn(document, assembly);

    expect(wrapper.find('[data-testid="preview-approximate"]').exists()).toBe(false);
  });

  it('captures the pointer when the browser supports it', async () => {
    const wrapper = await mountSewn();
    const svg = wrapper.find('[data-testid="preview-svg"]');
    const capture = vi.fn();
    Object.defineProperty(svg.element, 'setPointerCapture', { configurable: true, value: capture });

    await svg.trigger('pointerdown', { button: 0, clientX: 0, clientY: 0 });

    expect(capture).toHaveBeenCalled();
  });
});
