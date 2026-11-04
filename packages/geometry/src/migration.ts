import { normalizeDefaults } from './defaults.js';
import { UnsupportedPatternSchemaError } from './errors.js';
import { PATTERN_SCHEMA, type PatternDocument, type TabRef } from './types.js';

/**
 * Every document schema this build can open. The development-stage 0.4 break
 * deliberately refuses 0.3: there is no load-time migration and no partial
 * conversion, so an older project is reported instead of being rewritten into a
 * model that is still moving.
 */
export const KNOWN_PATTERN_SCHEMAS: readonly string[] = [
  PATTERN_SCHEMA,
  // 0.6 only added marks (notches and centre lines), so a 0.5 document is a
  // strict subset and needs no conversion.
  'sewcraft.pattern/0.5',
  // 0.5 only added optional variables and widened parameter fields to formulas,
  // so a 0.4 document is a strict subset and needs no conversion.
  'sewcraft.pattern/0.4',
];

/** Whether a stored `schema` string is one this build understands. */
export function isKnownPatternSchema(schema: string): boolean {
  return KNOWN_PATTERN_SCHEMAS.includes(schema);
}

/**
 * A document written by the current build, or a stored document whose schema
 * this build refuses. The newer collections stay optional so a hand-edited or
 * older document can still be inspected without migrating.
 */
export type LegacyPatternDocument = Omit<
  PatternDocument,
  'schema' | 'pieces' | 'assemblies' | 'tabs'
> & {
  schema: string;
  pieces?: PatternDocument['pieces'];
  assemblies?: PatternDocument['assemblies'];
  tabs?: PatternDocument['tabs'];
};

/** A stable key for one tab reference, used for duplicate detection. */
export function tabKey(tab: TabRef): string {
  return `${tab.kind}:${tab.id}`;
}

/**
 * The authoritative tab order for a document: stored refs that still point at a
 * piece or assembly, de-duplicated, then every object missing from the order
 * appended in pieces-then-assemblies order. Idempotent, and returns the stored
 * array untouched when it is already valid so a current document keeps identity.
 */
export function reconcileTabs(
  objects: { pieces: readonly { id: string }[]; assemblies: readonly { id: string }[] },
  stored?: readonly TabRef[],
): TabRef[] {
  const known = new Map<string, TabRef>([
    ...objects.pieces.map((piece): [string, TabRef] => [
      tabKey({ kind: 'piece', id: piece.id }),
      { kind: 'piece', id: piece.id },
    ]),
    ...objects.assemblies.map((assembly): [string, TabRef] => [
      tabKey({ kind: 'assembly', id: assembly.id }),
      { kind: 'assembly', id: assembly.id },
    ]),
  ]);

  const order: TabRef[] = [];
  const seen = new Set<string>();
  for (const tab of stored ?? []) {
    const key = tabKey(tab);
    if (seen.has(key) || !known.has(key)) continue;
    seen.add(key);
    order.push({ kind: tab.kind, id: tab.id });
  }
  for (const piece of objects.pieces) {
    const key = tabKey({ kind: 'piece', id: piece.id });
    if (seen.has(key)) continue;
    seen.add(key);
    order.push({ kind: 'piece', id: piece.id });
  }
  for (const assembly of objects.assemblies) {
    const key = tabKey({ kind: 'assembly', id: assembly.id });
    if (seen.has(key)) continue;
    seen.add(key);
    order.push({ kind: 'assembly', id: assembly.id });
  }

  if (
    stored !== undefined &&
    stored.length === order.length &&
    order.every((tab, index) => tabKey(stored[index]!) === tabKey(tab))
  ) {
    return stored as TabRef[];
  }
  return order;
}

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
  const pieces = document.pieces ?? [];
  const assemblies = document.assemblies ?? [];
  const tabs = reconcileTabs({ pieces, assemblies }, document.tabs);

  if (
    normalized === document &&
    document.pieces !== undefined &&
    document.assemblies !== undefined &&
    document.tabs === tabs
  ) {
    return document as PatternDocument;
  }
  return { ...normalized, schema: PATTERN_SCHEMA, pieces, assemblies, tabs };
}
