/** Millimetre precision for SVG output: 1e-4 mm. */
const SVG_PRECISION = 1e4;

/** Millimetre precision for a number the maker reads or edits: 1e-3 mm. */
const FIELD_PRECISION = 1e3;

/**
 * Format a millimetre value for an SVG attribute. Values are rounded to 1e-4 mm
 * so floating-point noise never leaks into the output, and negative zero is
 * normalised to `0`.
 */
export function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * SVG_PRECISION) / SVG_PRECISION;
  return rounded === 0 ? '0' : String(rounded);
}

/**
 * Round to the field precision of 1e-3 mm, so arithmetic noise never reaches a
 * field, an error message or a stored value.
 */
export function roundToThousandth(value: number): number {
  return Math.round(value * FIELD_PRECISION) / FIELD_PRECISION;
}

/**
 * A millimetre value as field text: rounded to 1e-3 mm, negative zero normalised
 * to `0`, and no trailing noise.
 */
export function formatMillimetres(value: number): string {
  const rounded = roundToThousandth(value);
  return String(rounded === 0 ? 0 : rounded);
}
