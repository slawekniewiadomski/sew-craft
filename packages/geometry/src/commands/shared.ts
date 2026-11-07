/** Validation and document helpers shared by more than one command family. */
import { isCornerRoundDerived } from '../corner-round.js';
import { getEntity } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { pieceById } from '../piece.js';
import type {
  Assembly,
  EntityId,
  EntityRole,
  LineEntity,
  PatternDocument,
  Piece,
  PointEntity,
  TabRef,
} from '../types.js';
import type { Command, CommandApplication, CommandType } from './types.js';

export function noOp(document: PatternDocument): CommandApplication {
  return { document, inverse: null };
}

export function deleteEntityCommand(id: EntityId): Command {
  return { id, type: 'delete_entity', params: { id } };
}

export function requirePoint(
  document: PatternDocument,
  id: EntityId,
  type: CommandType,
): PointEntity {
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError(type, `unknown entity: ${id}`);
  }
  if (entity.kind !== 'point') {
    throw new CommandValidationError(type, `entity ${id} is a ${entity.kind}, expected a point`);
  }
  return entity;
}

/** A point the user may attach new geometry to; derived points are read-only. */
export function requireDraftingPoint(
  document: PatternDocument,
  id: EntityId,
  type: CommandType,
): PointEntity {
  const point = requirePoint(document, id, type);
  if (isCornerRoundDerived(document, id)) {
    throw new CommandValidationError(
      type,
      'This point is derived by a corner round; edit the radius.',
    );
  }
  return point;
}

export function requireLine(
  document: PatternDocument,
  id: EntityId,
  type: CommandType,
): LineEntity {
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError(type, `unknown entity: ${id}`);
  }
  if (entity.kind !== 'line') {
    throw new CommandValidationError(type, `entity ${id} is a ${entity.kind}, expected a line`);
  }
  return entity;
}

/** Resolve a command's `role`/legacy `construction` pair to the stored role. */
export function roleFromParams(
  role: EntityRole | undefined,
  construction: boolean | undefined,
): EntityRole | undefined {
  if (role === 'construction' || role === 'annotation') return role;
  return construction === true ? 'construction' : undefined;
}

/** Copy an object without the named keys, without leaving unused bindings behind. */
export function withoutKeys<T extends object>(value: T, keys: readonly string[]): T {
  const copy = { ...value };
  for (const key of keys) delete (copy as Record<string, unknown>)[key];
  return copy;
}

/** Reject a piece that does not exist; ownership validation needs it. */
export function requirePiece(document: PatternDocument, piece: EntityId, type: CommandType): Piece {
  const found = pieceById(document, piece);
  if (found === undefined) {
    throw new CommandValidationError(type, `unknown piece: ${piece}`);
  }
  return found;
}

/**
 * A point a label may anchor on: it must be a point, belong to the same piece and
 * not be derived by a corner round (labels attach to authored geometry).
 */
export function requireOwnedPoint(
  document: PatternDocument,
  id: EntityId,
  piece: EntityId,
  type: CommandType,
): PointEntity {
  const point = requirePoint(document, id, type);
  if (point.piece !== undefined && point.piece !== piece) {
    throw new CommandValidationError(type, `point ${id} belongs to another piece`);
  }
  if (isCornerRoundDerived(document, id)) {
    throw new CommandValidationError(type, 'a label cannot anchor on a derived corner point');
  }
  return point;
}

/** Reject a quantity that is not a positive integer. */
export function requireQuantity(
  commandType: CommandType,
  quantity: number | null | undefined,
): void {
  if (quantity === undefined || quantity === null) return;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CommandValidationError(commandType, 'quantity must be an integer of at least 1');
  }
}

/** Reject an empty or blank piece name; `null` means "clear" and is handled by the caller. */
export function requirePieceName(commandType: CommandType, name: string | null | undefined): void {
  if (name === undefined || name === null) return;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new CommandValidationError(commandType, 'name must be a non-empty string');
  }
}

/** Replace one piece in the document, preserving piece order. */
export function replacePiece(document: PatternDocument, piece: Piece): PatternDocument {
  return {
    ...document,
    pieces: document.pieces.map((candidate) => (candidate.id === piece.id ? piece : candidate)),
  };
}

/** Reject a non-finite coordinate or rotation. */
export function requireFinite(commandType: CommandType, value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new CommandValidationError(commandType, `${label} must be a finite number`);
  }
  return value;
}

/** Trim optional free text; an empty string clears the field. */
export function requireOptionalText(
  commandType: CommandType,
  value: string | null | undefined,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new CommandValidationError(commandType, `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    throw new CommandValidationError(commandType, `${label} must be at most ${max} characters`);
  }
  return trimmed;
}

/** Reject anything that is not exactly `#` plus six lowercase hex digits. */
export function requirePieceColor(
  commandType: CommandType,
  value: string | null | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new CommandValidationError(
      commandType,
      'color must be #rrggbb with lowercase hex digits',
    );
  }
  return value;
}

/** Replace one assembly in the document, preserving assembly order. */
export function replaceAssembly(document: PatternDocument, assembly: Assembly): PatternDocument {
  return {
    ...document,
    assemblies: document.assemblies.map((candidate) =>
      candidate.id === assembly.id ? assembly : candidate,
    ),
  };
}

/** Append a tab unless the object already has one. */
export function withTab(document: PatternDocument, tab: TabRef): TabRef[] {
  return document.tabs.some((candidate) => candidate.kind === tab.kind && candidate.id === tab.id)
    ? document.tabs
    : [...document.tabs, tab];
}

/** Drop one object's tab from the order. */
export function withoutTab(document: PatternDocument, tab: TabRef): TabRef[] {
  return document.tabs.filter(
    (candidate) => candidate.kind !== tab.kind || candidate.id !== tab.id,
  );
}
