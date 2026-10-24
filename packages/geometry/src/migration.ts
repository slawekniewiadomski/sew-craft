import { normalizeDefaults } from './defaults.js';
import { UnsupportedPatternSchemaError } from './errors.js';
import { PATTERN_SCHEMA, type PatternDocument } from './types.js';

/**
 * Every document schema this build can open. The development-stage 0.3 break
 * deliberately refuses 0.2: there is no load-time migration and no partial
 * conversion, so an older project is reported instead of being rewritten into a
 * model that is still moving.
 */
export const KNOWN_PATTERN_SCHEMAS: readonly string[] = [PATTERN_SCHEMA];

/** Whether a stored `schema` string is one this build understands. */
export function isKnownPatternSchema(schema: string): boolean {
  return KNOWN_PATTERN_SCHEMAS.includes(schema);
}

/**
 * A document written by the current build, or a stored document whose schema
 * this build refuses. `pieces` is optional on the legacy shape so a stored
 * document from any older build can still be inspected without migrating.
 */
export type LegacyPatternDocument = Omit<PatternDocument, 'schema' | 'pieces'> & {
  schema: string;
  pieces?: PatternDocument['pieces'];
};

/**
 * Bring a stored document to the current schema. A current document keeps its
 * identity; anything else throws `UnsupportedPatternSchemaError` so the editor
 * can offer the unsupported-format dialog instead of silently rewriting it.
 */
export function normalizeDocument(
  document: PatternDocument | LegacyPatternDocument,
): PatternDocument {
  if (!isKnownPatternSchema(document.schema)) {
    throw new UnsupportedPatternSchemaError(document.schema);
  }

  const normalized = normalizeDefaults(document);
  if (normalized === document && document.pieces !== undefined) {
    return document as PatternDocument;
  }
  return { ...normalized, schema: PATTERN_SCHEMA, pieces: document.pieces ?? [] };
}
