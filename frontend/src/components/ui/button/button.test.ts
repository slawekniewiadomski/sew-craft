import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { Button } from './index';
import { buttonVariants } from './variants';

describe('buttonVariants', () => {
  it('builds a class string for a variant and size', () => {
    expect(buttonVariants({ variant: 'secondary', size: 'lg' })).toContain('bg-secondary');
    expect(buttonVariants({ variant: 'secondary', size: 'lg' })).toContain('h-10');
  });

  it('applies defaults when called with no arguments', () => {
    expect(buttonVariants()).toContain('bg-primary');
    expect(buttonVariants()).toContain('h-9');
  });
});

describe('Button', () => {
  it('renders a slot inside a button with default styling', () => {
    const wrapper = mount(Button, { slots: { default: 'Save' } });

    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.attributes('disabled')).toBeUndefined();
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.text()).toBe('Save');
  });

  it('forwards variant, size, type and disabled', () => {
    const wrapper = mount(Button, {
      props: { variant: 'destructive', size: 'icon', type: 'submit', disabled: true },
      slots: { default: 'X' },
    });

    expect(wrapper.attributes('type')).toBe('submit');
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('bg-destructive');
    expect(wrapper.classes()).toContain('h-9');
    expect(wrapper.classes()).toContain('w-9');
  });
});
