import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RibbonIcon from '@/components/base/RibbonIcon.vue';

describe('RibbonIcon', () => {
  it('draws one stroked path per segment at the default size', () => {
    const wrapper = mount(RibbonIcon, {
      props: { icon: { paths: ['M0 0 H12', 'M0 6 H12'] } },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('width')).toBe('16');
    expect(svg.attributes('height')).toBe('16');
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(wrapper.findAll('path').map((path) => path.attributes('d'))).toEqual([
      'M0 0 H12',
      'M0 6 H12',
    ]);
    expect(wrapper.findAll('circle')).toHaveLength(0);
  });

  it('draws filled dots at a caller-set size', () => {
    const wrapper = mount(RibbonIcon, {
      props: {
        icon: {
          paths: [],
          dots: [
            { cx: 6, cy: 4, r: 1.5 },
            { cx: 6, cy: 8, r: 1.5 },
          ],
        },
        size: 20,
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.attributes('width')).toBe('20');
    expect(svg.attributes('height')).toBe('20');
    expect(wrapper.findAll('path')).toHaveLength(0);

    const dots = wrapper.findAll('circle');
    expect(dots).toHaveLength(2);
    expect(dots[0]!.attributes()).toMatchObject({
      cx: '6',
      cy: '4',
      r: '1.5',
      fill: 'currentColor',
      stroke: 'none',
    });
  });
});
