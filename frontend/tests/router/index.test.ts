import { describe, expect, it } from 'vitest';

import { router } from '@/router/index';

describe('router', () => {
  it('defines the projects and editor routes', () => {
    const names = router.getRoutes().map((route) => route.name);

    expect(names).toContain('projects');
    expect(names).toContain('editor');
  });

  it('redirects the root path to projects', () => {
    const resolved = router.resolve('/');

    expect(resolved.matched[0]?.redirect).toBe('/projects');
  });

  it('resolves the editor route with its id param', () => {
    const resolved = router.resolve('/projects/7/edit');

    expect(resolved.name).toBe('editor');
    expect(resolved.params.id).toBe('7');
  });
});
