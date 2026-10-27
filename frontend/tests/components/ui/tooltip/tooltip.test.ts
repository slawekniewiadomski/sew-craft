import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip/index';

enableAutoUnmount(afterEach);

beforeEach(() => {
  document.body.innerHTML = '';
});

const Host = {
  components: { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger },
  props: { open: { type: Boolean, default: false } },
  template: `
    <TooltipProvider :delay-duration="0">
      <Tooltip :default-open="open">
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Tooltip body</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  `,
};

async function mountHost(open: boolean) {
  const wrapper = mount(Host, { props: { open }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe('Tooltip', () => {
  it('renders the trigger inside the provider', async () => {
    const wrapper = await mountHost(false);

    expect(wrapper.text()).toContain('Hover me');
  });

  it('renders portalled content when open', async () => {
    await mountHost(true);

    expect(document.body.textContent).toContain('Tooltip body');
  });

  it('does not render content while closed', async () => {
    await mountHost(false);

    expect(document.body.textContent).not.toContain('Tooltip body');
  });
});
