import {
  ALLOWANCE_KINDS,
  type AllowanceKind,
  type AllowancePreset,
  type PatternDefaults,
  type PieceDefaults,
} from './types.js';

/**
 * The allowance a new piece starts with when the document has no explicit
 * default: a 10 mm seam, the number the piece card already fell back to.
 */
export const DEFAULT_ALLOWANCE_PRESET: AllowancePreset = { width: 10, kind: 'seam' };

/** The preset a new piece should copy, or `null` when the project default is off. */
export function effectiveDefaultAllowance(document: {
  defaults?: PatternDefaults;
}): AllowancePreset | null {
  // Copy the built-in so a caller cannot mutate the module constant.
  return document.defaults === undefined
    ? { ...DEFAULT_ALLOWANCE_PRESET }
    : document.defaults.allowance;
}

/**
 * The preset that applies to one piece's new loop edges. A present `defaults`
 * object always wins, including `{ allowance: null }` meaning "no allowance";
 * an absent one inherits the document default.
 */
export function effectivePieceAllowance(
  document: { defaults?: PatternDefaults },
  piece: { defaults?: PieceDefaults },
): AllowancePreset | null {
  if (piece.defaults === undefined) return effectiveDefaultAllowance(document);
  return piece.defaults.allowance === null ? null : { ...piece.defaults.allowance };
}

/** Whether a stored value is a preset this build can copy onto a piece. */ function isValidPreset(
  value: unknown,
): value is AllowancePreset {
  if (typeof value !== 'object' || value === null) return false;

  const preset = value as Partial<AllowancePreset>;
  if (typeof preset.width !== 'number' || !Number.isFinite(preset.width) || preset.width <= 0) {
    return false;
  }
  return preset.kind === undefined || ALLOWANCE_KINDS.includes(preset.kind as AllowanceKind);
}

/**
 * Give a stored document a resolvable default. A missing or invalid preset
 * resolves to the built-in one, while `null` keeps meaning "no default". The
 * caller's object is returned unchanged when the stored value is already valid,
 * so `normalizeDocument` keeps its identity guarantee for current documents.
 */
export function normalizeDefaults<T extends { defaults?: PatternDefaults }>(document: T): T {
  const defaults = document.defaults;
  if (
    defaults !== undefined &&
    (defaults.allowance === null || isValidPreset(defaults.allowance))
  ) {
    return document;
  }

  return { ...document, defaults: { allowance: { ...DEFAULT_ALLOWANCE_PRESET } } };
}
