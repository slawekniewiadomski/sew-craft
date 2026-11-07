import { createEmptyDocument, type PatternDocument } from '@sewcraft/geometry';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SeamPromptBar from '@/components/bars/SeamPromptBar.vue';
import { emptySeamDraft, newSeamSide, addSeamPick, type SeamDraft } from '@/lib/seam-picks';

const rectangle = (piece: string, width: number, prefix: string) => ({
  entities: [
    { id: `${prefix}a`, kind: 'point' as const, x: 0, y: 0, piece, fixed: false },
    { id: `${prefix}b`, kind: 'point' as const, x: width, y: 0, piece, fixed: false },
    { id: `${prefix}c`, kind: 'point' as const, x: width, y: 100, piece, fixed: false },
    { id: `${prefix}d`, kind: 'point' as const, x: 0, y: 100, piece, fixed: false },
    { id: `${prefix}ab`, kind: 'line' as const, start: `${prefix}a`, end: `${prefix}b`, piece },
    { id: `${prefix}bc`, kind: 'line' as const, start: `${prefix}b`, end: `${prefix}c`, piece },
    { id: `${prefix}cd`, kind: 'line' as const, start: `${prefix}c`, end: `${prefix}d`, piece },
    { id: `${prefix}da`, kind: 'line' as const, start: `${prefix}d`, end: `${prefix}a`, piece },
  ],
  piece: {
    id: piece,
    name: piece === 'p1' ? 'Front' : 'Back',
    edges: [`${prefix}ab`, `${prefix}bc`, `${prefix}cd`, `${prefix}da`],
    allowances: [],
  },
});

const documentOf = (): PatternDocument => {
  const front = rectangle('p1', 100, '');
  const back = rectangle('p2', 106, 'b-');
  return {
    ...createEmptyDocument(),
    entities: [...front.entities, ...back.entities],
    pieces: [front.piece, back.piece],
    assemblies: [
      {
        id: 'a1',
        name: 'Shell',
        instances: [
          { id: 'i1', piece: 'p1', x: 0, y: 0 },
          { id: 'i2', piece: 'p2', x: 200, y: 0 },
        ],
      },
    ],
  };
};

const order = new Map([
  ['i1', ['ab', 'bc', 'cd', 'da']],
  ['i2', ['b-ab', 'b-bc', 'b-cd', 'b-da']],
]);

const draftOf = (instance: string, edge: string): SeamDraft =>
  addSeamPick(emptySeamDraft(), { instance, edge }, order);

const twoSides = (): SeamDraft =>
  addSeamPick(newSeamSide(draftOf('i1', 'ab')), { instance: 'i2', edge: 'b-ab' }, order);

const mountBar = (draft: SeamDraft, overrides: Record<string, unknown> = {}) => {
  const document = documentOf();
  return mount(SeamPromptBar, {
    props: {
      document,
      assembly: document.assemblies[0]!,
      draft,
      eased: false,
      ...overrides,
    },
  });
};

describe('SeamPromptBar', () => {
  it('starts empty with Sew disabled', () => {
    const wrapper = mountBar(emptySeamDraft());

    expect(wrapper.text()).toContain('Pick a stitch edge to start');
    expect(wrapper.find('[data-testid="seam-commit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="seam-new-side"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="seam-flip"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="seam-eased"]').attributes('disabled')).toBeDefined();
  });

  it('shows one side and its length but keeps Sew disabled', () => {
    const wrapper = mountBar(draftOf('i1', 'ab'));

    expect(wrapper.find('[data-testid="seam-side-0"]').text()).toContain('Side 1');
    expect(wrapper.find('[data-testid="seam-side-0"]').text()).toContain('Front');
    expect(wrapper.find('[data-testid="seam-side-0"]').text()).toContain('100.0 mm');
    expect(wrapper.find('[data-testid="seam-commit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="seam-delta"]').exists()).toBe(false);
  });

  it('enables Sew at two sides and shows the running delta', () => {
    const wrapper = mountBar(twoSides());

    expect(wrapper.find('[data-testid="seam-commit"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="seam-eased"]').attributes('disabled')).toBeUndefined();
  });

  it('keeps an equal-length delta muted', () => {
    const draft: SeamDraft = {
      sealed: [{ instance: 'i1', edges: ['ab'], reversed: false }],
      current: { instance: 'i1', edges: ['ab'], reversed: false },
    };
    const wrapper = mountBar(draft);

    expect(wrapper.find('[data-testid="seam-delta"]').text()).toContain('Δ 0.0 mm');
    expect(wrapper.find('[data-testid="seam-delta"]').classes()).toContain('text-muted-foreground');
  });

  it('marks a length difference past the tolerance as destructive', () => {
    const draft: SeamDraft = {
      sealed: [{ instance: 'i1', edges: ['ab'], reversed: false }],
      current: { instance: 'i2', edges: ['b-ab'], reversed: false },
    };
    const wrapper = mountBar(draft);

    expect(wrapper.find('[data-testid="seam-delta"]').text()).toContain('Δ 6.0 mm');
    expect(wrapper.find('[data-testid="seam-delta"]').classes()).toContain('text-destructive');
  });

  it('shows the reversed and unknown-instance labels', () => {
    const draft: SeamDraft = {
      sealed: [{ instance: 'i1', edges: ['ab'], reversed: true }],
      current: { instance: 'ghost', edges: ['x'], reversed: false },
    };
    const wrapper = mountBar(draft);

    expect(wrapper.find('[data-testid="seam-side-0"]').text()).toContain('reversed');
    expect(wrapper.find('[data-testid="seam-side-1"]').text()).toContain('Piece');
    expect(wrapper.find('[data-testid="seam-side-1"]').text()).toContain('—');
  });

  it('labels an unnamed piece by its palette position', () => {
    const document = documentOf();
    document.pieces[0] = { ...document.pieces[0]!, name: '' };
    const wrapper = mount(SeamPromptBar, {
      props: {
        document,
        assembly: document.assemblies[0]!,
        draft: draftOf('i1', 'ab'),
        eased: false,
      },
    });

    expect(wrapper.find('[data-testid="seam-side-0"]').text()).toContain('Piece 1');
  });

  it('emits every gesture control', async () => {
    const draft = twoSides();
    const wrapper = mountBar(draft);

    await wrapper.find('[data-testid="seam-new-side"]').trigger('click');
    await wrapper.find('[data-testid="seam-flip"]').trigger('click');
    await wrapper.find('[data-testid="seam-eased"]').setValue(true);
    await wrapper.find('[data-testid="seam-commit"]').trigger('click');
    await wrapper.find('[data-testid="seam-cancel"]').trigger('click');
    await wrapper.find('[data-testid="seam-pick-i1-ab"]').trigger('click');

    expect(wrapper.emitted('new-side')).toHaveLength(1);
    expect(wrapper.emitted('flip')).toHaveLength(1);
    expect(wrapper.emitted('update:eased')).toEqual([[true]]);
    expect(wrapper.emitted('commit')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('remove-pick')).toEqual([['i1', 'ab']]);
  });

  it('announces the picks and the delta', () => {
    const wrapper = mountBar(twoSides());

    expect(wrapper.find('[data-testid="seam-announcement"]').text()).toBe(
      '2 edges picked, 2 sides, 6.0 mm apart',
    );
  });

  it('disables Sew while read-only', () => {
    const wrapper = mountBar(twoSides(), { readOnly: true });

    expect(wrapper.find('[data-testid="seam-commit"]').attributes('disabled')).toBeDefined();
  });
});
