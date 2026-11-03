import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadSvgFile } from '@/lib/download';

describe('downloadSvgFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:sewcraft');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    click.mockRestore();
  });

  it('serialises the SVG to a blob and clicks a download link', () => {
    downloadSvgFile('pattern-1.svg', '<svg />');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/svg+xml');

    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe('pattern-1.svg');
    expect(link.href).toBe('blob:sewcraft');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sewcraft');
  });
});
