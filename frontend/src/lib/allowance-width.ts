/** An allowance width is a finite number of millimetres greater than zero. */
export function isValidAllowanceWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Parse a raw input string into an allowance width. Returns `null` for anything
 * that is not a positive finite number, so callers can show a validation message.
 */
export function parseAllowanceWidth(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const value = Number(trimmed);
  return isValidAllowanceWidth(value) ? value : null;
}
