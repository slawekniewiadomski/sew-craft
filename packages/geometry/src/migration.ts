import { normalizeDefaults } from './defaults.js';
import { basicPieceForLoops } from './piece.js';
import { PATTERN_SCHEMA, type EntityId, type PatternDocument, type Piece } from './types.js';

/**
 * Every document schema this build can open. A stored schema outside this list
 * (a newer build, or a hand-edited value) is never migrated or guessed at: the
 * editor offers read-only or nothing.
 */
export const KNOWN_PATTERN_SCHEMAS: readonly string[] = ['sewcraft.pattern/0.1', PATTERN_SCHEMA];

/** Whether a stored `schema` string is one this build understands. */
export function isKnownPatternSchema(schema: string): boolean {
  return KNOWN_PATTERN_SCHEMAS.includes(schema);
}

/**
 * A document written before the pieces schema bump. Its `schema` is an older
 * string and it may not carry `pieces` at all.
 */
export type LegacyPatternDocument = Omit<PatternDocument, 'schema' | 'pieces'> & {
  schema: string;
  pieces?: Piece[];
};

function pieceId(existing: ReadonlySet<EntityId>, index: number, prefix: string): string {
  let candidate = `${prefix}-${index}`;
  let suffix = index;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${prefix}-${suffix}`;
  }
  return candidate;
}

/**
 * Bring any stored document up to the current schema. A 0.1 document's closed
 * seam chains become pieces with `kind: 'seam'` allowances; seams on open chains
 * stay in the deprecated `seams` field for the legacy dashed rendering. The
 * migration is one-way and idempotent, and a 0.2 document is returned with its
 * pieces intact.
 */
export function normalizeDocument(
  document: PatternDocument | LegacyPatternDocument,
): PatternDocument {
  const existingPieces = document.pieces ?? [];
  const normalized = normalizeDefaults(document);

  if (document.schema === PATTERN_SCHEMA) {
    // Keep the caller's object identity for an already-current document; the
    // store relies on `load` not copying an unmodified document.
    if (normalized === document && document.pieces !== undefined) {
      return document as PatternDocument;
    }
    return { ...normalized, schema: PATTERN_SCHEMA, pieces: existingPieces };
  }

  const seams = document.seams ?? [];
  const working: PatternDocument = {
    ...normalized,
    schema: PATTERN_SCHEMA,
    pieces: existingPieces,
    seams,
  };
  const adopted = new Set<EntityId>();
  const created: Piece[] = [];
  const ids = new Set(existingPieces.map((piece) => piece.id));

  const loops = basicPieceForLoops(working);

  for (const loop of loops) {
    const allowances = loop.flatMap((edge) => {
      const seam = seams.find((candidate) => candidate.edge === edge);
      return seam === undefined ? [] : [{ edge, width: seam.width, kind: 'seam' as const }];
    });
    if (allowances.length !== loop.length) continue;

    const id = pieceId(ids, created.length + 1, 'piece');
    created.push({ id, edges: loop, allowances });
    ids.add(id);
    loop.forEach((edge) => adopted.add(edge));
  }

  return {
    ...working,
    pieces: [...existingPieces, ...created],
    seams: seams.filter((seam) => !adopted.has(seam.edge)),
  };
}
