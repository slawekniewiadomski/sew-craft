import type {
  AssignableRole,
  Constraint,
  Entity,
  EntityId,
  EntityRole,
  PatternDocument,
} from './types.js';

/** The fields every role predicate reads; text counts as annotation by kind. */
export interface RoleSource {
  kind?: Entity['kind'];
  role?: EntityRole;
  /** Deprecated 0.2 alias for `role: 'construction'`. */
  construction?: boolean;
}

/**
 * The single role predicate. `annotation` wins over `construction`, and an
 * absent role on an ordinary entity means `cut`.
 */
export function roleOf(entity: RoleSource): AssignableRole {
  if (entity.kind === 'text' || entity.role === 'annotation') return 'annotation';
  if (entity.role === 'construction' || entity.construction === true) return 'construction';
  return 'cut';
}

/** A guide that is never a cut edge, dashed and muted on canvas. */
export function isConstruction(entity: RoleSource): boolean {
  return roleOf(entity) === 'construction';
}

/** A sewing mark: visible, but never a cut edge and never exported. */
export function isAnnotation(entity: RoleSource): boolean {
  return roleOf(entity) === 'annotation';
}

/** A cut edge: boundary-eligible geometry. */
export function isCut(entity: RoleSource): boolean {
  return roleOf(entity) === 'cut';
}

/** Every entity owned by a piece, in document order. */
export function pieceEntities(document: PatternDocument, piece: EntityId): Entity[] {
  return document.entities.filter((entity) => entity.piece === piece);
}

/** Every constraint owned by a piece, in document order. */
export function pieceConstraints(document: PatternDocument, piece: EntityId): Constraint[] {
  return document.constraints.filter((constraint) => constraint.piece === piece);
}
