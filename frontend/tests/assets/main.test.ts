import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8');

const GREEN_600 = 'oklch(0.627 0.194 149.214)';
const BLUE_600 = 'oklch(0.546 0.245 262.881)';

function rootToken(name: string): string | undefined {
  const rootBlock = stylesheet.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  return rootBlock.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('theme tokens', () => {
  it('uses green-600 for the primary color', () => {
    expect(rootToken('--primary')).toBe(GREEN_600);
  });

  it('keeps the focus ring in sync with the primary color', () => {
    expect(rootToken('--ring')).toBe(GREEN_600);
  });

  it('keeps the primary foreground near-white', () => {
    expect(rootToken('--primary-foreground')).toBe('oklch(0.985 0 0)');
  });

  it('no longer contains the blue-600 brand value', () => {
    expect(stylesheet).not.toContain(BLUE_600);
  });
});
