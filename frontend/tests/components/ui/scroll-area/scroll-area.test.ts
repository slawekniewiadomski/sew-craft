import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollAreaRoot } from 'reka-ui';

import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue';
import ScrollBar from '@/components/ui/scroll-area/ScrollBar.vue';

enableAutoUnmount(afterEach);

const Host = {
  components: { ScrollAreaRoot, ScrollArea, ScrollBar },
  template: `
    <div>
      <ScrollArea type="always"><p>Content</p></ScrollArea>
      <ScrollAreaRoot type="always" style="width: 100px; height: 100px">
        <ScrollBar orientation="horizontal" />
      </ScrollAreaRoot>
    </div>
  `,
};

describe('ScrollArea', () => {
  it('renders its slot inside a viewport with a vertical bar', () => {
    const wrapper = mount(ScrollArea, {
      props: { type: 'always' },
      slots: { default: '<p>Content</p>' },
    });

    expect(wrapper.text()).toContain('Content');
    expect(wrapper.find('[data-reka-scroll-area-viewport]').exists()).toBe(true);
    expect(wrapper.find('[data-orientation="vertical"]').classes()).toContain('w-2.5');
  });

  it('merges a custom class onto the root', () => {
    const wrapper = mount(ScrollArea, { props: { class: 'min-h-0' } });

    expect(wrapper.classes()).toContain('min-h-0');
  });
});

describe('ScrollBar', () => {
  it('styles vertical and horizontal bars', () => {
    const wrapper = mount(Host);

    expect(wrapper.find('[data-orientation="vertical"]').classes()).toContain('w-2.5');
    expect(wrapper.find('[data-orientation="horizontal"]').classes()).toContain('h-2.5');
  });
});
