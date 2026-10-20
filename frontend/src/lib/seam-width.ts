/** A seam width is a finite number of millimetres greater than zero. */
export function isValidSeamWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Parse a raw input string into a seam width. Returns `null` for anything that
 * is not a positive finite number, so callers can show a validation message.
 */
export function parseSeamWidth(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const value = Number(trimmed);
  return isValidSeamWidth(value) ? value : null;
}
