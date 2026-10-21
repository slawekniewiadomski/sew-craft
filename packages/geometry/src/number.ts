/** Millimetre precision for SVG output: 1e-4 mm. */
const SVG_PRECISION = 1e4;

/**
 * Format a millimetre value for an SVG attribute. Values are rounded to 1e-4 mm
 * so floating-point noise never leaks into the output, and negative zero is
 * normalised to `0`.
 */
export function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * SVG_PRECISION) / SVG_PRECISION;
  return rounded === 0 ? '0' : String(rounded);
}
