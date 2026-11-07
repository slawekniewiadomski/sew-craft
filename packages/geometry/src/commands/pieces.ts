/** Piece lifecycle: create, place, update, delete, loop and role. */
import { cornerRoundsForEntity } from '../corner-round.js';
import {
  constraintEntityIds,
  cornerRounds,
  documentSeams,
  getEntity,
  nextPiecePlacement,
} from '../document.js';
import { CommandValidationError } from '../errors.js';
import { pieceById, validatePiece } from '../piece.js';
import { roleOf } from '../roles.js';
import type { CutAnchorIssueReason } from '../dimension.js';
import type {
  CutAnchor,
  Entity,
  EntityId,
  PatternDocument,
  Piece,
  PieceDefaults,
} from '../types.js';
import { requireAllowancePreset, resolveCreateAllowance } from './allowances.js';
import {
  noOp,
  replacePiece,
  requireOptionalText,
  requirePiece,
  requirePieceColor,
  requirePieceName,
  requireQuantity,
  withTab,
  withoutKeys,
  withoutTab,
} from './shared.js';
import { captureMeasuredValues } from './variables.js';
import type { Command, CommandApplication, CommandOf, CommandType } from './types.js';

/** The longest free-text note a piece stores. */
export const MAX_PIECE_NOTES_LENGTH = 500;

/** The longest fabric name a piece stores. */
export const MAX_PIECE_FABRIC_LENGTH = 120;

/** Reject an anchor that does not address a vertex or whole edge of this piece. */
export function requireCutAnchor(commandType: CommandType, piece: Piece, anchor: CutAnchor): void {
  if (!piece.edges.includes(anchor.edge)) {
    throw new CommandValidationError(
      commandType,
      `edge ${anchor.edge} is not in piece ${piece.id}`,
    );
  }
  if (anchor.at !== 'start' && anchor.at !== 'end' && anchor.at !== 'edge') {
    throw new CommandValidationError(
      commandType,
      `anchor ${String(anchor.at)} must be 'start', 'end' or 'edge'`,
    );
  }
  if (anchor.loop !== undefined && anchor.loop !== 'stitch' && anchor.loop !== 'cut') {
    throw new CommandValidationError(
      commandType,
      `anchor loop ${String(anchor.loop)} must be 'stitch' or 'cut'`,
    );
  }
  // A stitch edge anchor would duplicate a cut edge and has no stitch equivalent.
  if (anchor.loop === 'stitch' && anchor.at === 'edge') {
    throw new CommandValidationError(
      commandType,
      "a stitch anchor must be 'start' or 'end', not 'edge'",
    );
  }
}

/** The command error for each shared cut-anchor rejection. */
export const CUT_ANCHOR_MESSAGES: Record<CutAnchorIssueReason, string> = {
  missing: 'the piece cut loop cannot resolve these anchors',
  'not-straight': 'an edge anchor must be a straight line edge',
  'different-piece': 'both anchors must belong to the same piece',
  'same-anchor': 'the two anchors must be different',
  'not-parallel': 'two edge anchors must be parallel',
  'zero-span': 'the two anchors must not resolve to the same point',
};

/** Validate a per-piece defaults object, copying its preset. */
function requirePieceDefaults(
  document: PatternDocument,
  commandType: CommandType,
  defaults: PieceDefaults | undefined,
): PieceDefaults | undefined {
  if (defaults === undefined) return undefined;
  if (defaults.allowance === null) return { allowance: null };
  return { allowance: requireAllowancePreset(document, commandType, defaults.allowance) };
}

/** The defaults a piece override represents, turned into a restoring command. */
function restorePieceDefaults(piece: EntityId, defaults: PieceDefaults | undefined): Command {
  if (defaults === undefined) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'inherit' },
    };
  }
  if (defaults.allowance === null) {
    return {
      id: `${piece}:default-allowance`,
      type: 'set_piece_default_allowance',
      params: { piece, mode: 'none' },
    };
  }
  return {
    id: `${piece}:default-allowance`,
    type: 'set_piece_default_allowance',
    params: {
      piece,
      mode: 'preset',
      width: defaults.allowance.width,
      ...(defaults.allowance.kind === undefined ? {} : { kind: defaults.allowance.kind }),
    },
  };
}

/** Create an empty piece; its loop is captured later with `set_piece_loop`. */
export function applyCreatePiece(
  document: PatternDocument,
  command: CommandOf<'create_piece'>,
): CommandApplication {
  const { name, quantity, color, defaults } = command.params;
  if (pieceById(document, command.id) !== undefined) {
    return noOp(document);
  }

  requireQuantity('create_piece', quantity);
  requirePieceName('create_piece', name);
  const nextColor = requirePieceColor('create_piece', color);
  const nextDefaults = requirePieceDefaults(document, 'create_piece', defaults);

  const piece: Piece = {
    id: command.id,
    edges: [],
    allowances: [],
    placement: nextPiecePlacement(document),
  };
  if (name !== undefined) piece.name = name.trim();
  if (quantity !== undefined) piece.quantity = quantity;
  if (nextColor !== undefined) piece.color = nextColor;
  if (nextDefaults !== undefined) piece.defaults = nextDefaults;

  return {
    document: {
      ...document,
      pieces: [...document.pieces, piece],
      tabs: withTab(document, { kind: 'piece', id: command.id }),
    },
    inverse: { id: command.id, type: 'delete_piece', params: { id: command.id } },
  };
}

/** Move a piece in the shared sketch space without touching its geometry. */
export function applyPlacePiece(
  document: PatternDocument,
  command: CommandOf<'place_piece'>,
): CommandApplication {
  const { id, x, y } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    throw new CommandValidationError('place_piece', `unknown piece: ${id}`);
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CommandValidationError('place_piece', 'x and y must be finite numbers');
  }

  const previous = piece.placement ?? { x: 0, y: 0 };
  if (previous.x === x && previous.y === y) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, { ...piece, placement: { x, y } }),
    inverse: {
      id: command.id,
      type: 'place_piece',
      params: { id, x: previous.x, y: previous.y },
    },
  };
}

/** Change a piece's parameters; `null` or empty text clears a field. */
export function applyUpdatePiece(
  document: PatternDocument,
  command: CommandOf<'update_piece'>,
): CommandApplication {
  const { id, name, quantity, notes, fabric, color } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    throw new CommandValidationError('update_piece', `unknown piece: ${id}`);
  }
  if (
    name === undefined &&
    quantity === undefined &&
    notes === undefined &&
    fabric === undefined &&
    color === undefined
  ) {
    throw new CommandValidationError(
      'update_piece',
      'provide name, quantity, notes, fabric or color',
    );
  }

  requirePieceName('update_piece', name);
  requireQuantity('update_piece', quantity);
  const nextNotes = requireOptionalText('update_piece', notes, MAX_PIECE_NOTES_LENGTH, 'notes');
  const nextFabric = requireOptionalText('update_piece', fabric, MAX_PIECE_FABRIC_LENGTH, 'fabric');
  const nextColor = requirePieceColor('update_piece', color);

  const next: Piece = { ...piece };
  if (name !== undefined) {
    if (name === null) delete next.name;
    else next.name = name.trim();
  }
  if (quantity !== undefined) {
    if (quantity === null) delete next.quantity;
    else next.quantity = quantity;
  }
  if (notes !== undefined) {
    if (nextNotes === undefined) delete next.notes;
    else next.notes = nextNotes;
  }
  if (fabric !== undefined) {
    if (nextFabric === undefined) delete next.fabric;
    else next.fabric = nextFabric;
  }
  if (color !== undefined) {
    if (nextColor === undefined) delete next.color;
    else next.color = nextColor;
  }

  if (
    next.name === piece.name &&
    next.quantity === piece.quantity &&
    next.notes === piece.notes &&
    next.fabric === piece.fabric &&
    next.color === piece.color
  ) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, next),
    inverse: {
      id: command.id,
      type: 'update_piece',
      params: {
        id,
        name: piece.name ?? null,
        quantity: piece.quantity ?? null,
        notes: piece.notes ?? null,
        fabric: piece.fabric ?? null,
        color: piece.color ?? null,
      },
    },
  };
}

/**
 * Delete a piece and everything it owns: its geometry, constraints, texts,
 * corner rounds and cut dimensions. Other pieces are untouched, and undo uses
 * the journal snapshot because a cascade is not one command.
 */
export function applyDeletePiece(
  document: PatternDocument,
  command: CommandOf<'delete_piece'>,
): CommandApplication {
  const { id } = command.params;
  const piece = pieceById(document, id);
  if (piece === undefined) {
    return noOp(document);
  }

  // A piece takes its entities with it, which may break a measured chain.
  document = captureMeasuredValues(document);

  const removed = new Set<EntityId>([
    ...piece.edges,
    ...document.entities.filter((entity) => entity.piece === id).map((entity) => entity.id),
  ]);
  const removedRounds = cornerRounds(document).filter((round) =>
    [
      round.corner,
      round.arc,
      ...round.controls,
      ...(round.center === undefined ? [] : [round.center]),
      ...round.ends.flatMap((end) => [end.line, end.anchor, end.tangent]),
    ].some((entityId) => removed.has(entityId)),
  );
  for (const round of removedRounds) {
    removed.add(round.corner);
    removed.add(round.arc);
    for (const control of round.controls) removed.add(control);
    if (round.center !== undefined) removed.add(round.center);
    for (const end of round.ends) {
      removed.add(end.line);
      removed.add(end.anchor);
      removed.add(end.tangent);
    }
  }
  const entities = document.entities.filter(
    (entity) =>
      !removed.has(entity.id) &&
      !(
        entity.kind === 'text' &&
        (removed.has(entity.anchor) || (entity.leader !== undefined && removed.has(entity.leader)))
      ),
  );
  const constraints = document.constraints.filter(
    (constraint) =>
      constraint.piece !== id &&
      !constraintEntityIds(constraint).some((entityId) => removed.has(entityId)),
  );
  const rounds = cornerRounds(document).filter((round) => !removedRounds.includes(round));

  return {
    document: {
      ...document,
      entities,
      constraints,
      pieces: document.pieces.filter((candidate) => candidate.id !== id),
      assemblies: document.assemblies.map((assembly) =>
        assembly.instances.some((instance) => instance.piece === id)
          ? {
              ...assembly,
              instances: assembly.instances.filter((instance) => instance.piece !== id),
            }
          : assembly,
      ),
      tabs: withoutTab(document, { kind: 'piece', id }),
      ...(document.cornerRounds === undefined ? {} : { cornerRounds: rounds }),
      ...(document.seams === undefined
        ? {}
        : { seams: documentSeams(document).filter((seam) => !removed.has(seam.edge)) }),
    },
    // Restoring a piece together with its cascade is not a single command.
    inverse: null,
  };
}

/** Set, change or clear the allowance copied onto newly created pieces. */
/**
 * Store an ordered cut loop on a piece, or clear it. The loop is validated as one
 * closed chain of the piece's own cut edges; the allowance preset fills edges
 * that do not have an allowance yet, so re-setting a loop keeps its widths.
 */
export function applySetPieceLoop(
  document: PatternDocument,
  command: CommandOf<'set_piece_loop'>,
): CommandApplication {
  const { piece: pieceId, edges } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_loop');

  const cornerAllowances = piece.cornerAllowances ?? [];

  if (edges.length === 0) {
    if (
      piece.edges.length === 0 &&
      piece.allowances.length === 0 &&
      cornerAllowances.length === 0
    ) {
      return noOp(document);
    }
    return {
      document: replacePiece(document, {
        ...piece,
        edges: [],
        allowances: [],
        ...(piece.cornerAllowances === undefined ? {} : { cornerAllowances: [] }),
      }),
      inverse: null,
    };
  }

  const validation = validatePiece(document, edges, { piece: pieceId });
  if (!validation.ok) {
    throw new CommandValidationError('set_piece_loop', validation.message);
  }

  const preset = resolveCreateAllowance(
    document,
    command.params.allowance ?? 'default',
    'set_piece_loop',
    piece,
  );
  const existing = new Map(piece.allowances.map((allowance) => [allowance.edge, allowance]));
  const allowances = edges.flatMap((edge) => {
    const current = existing.get(edge);
    if (current !== undefined) return [current];
    return preset === null
      ? []
      : [{ edge, width: preset.width, kind: preset.kind ?? ('seam' as const) }];
  });

  // The loop is the first point at which an older fixture's edges can be adopted;
  // new documents already carry the owner from their create command.
  const entities = document.entities.map((entity) =>
    edges.includes(entity.id) && entity.piece === undefined
      ? { ...entity, piece: pieceId }
      : entity,
  );

  const keptCorners = cornerAllowances.filter((allowance) => {
    const round = cornerRounds(document).find((candidate) => candidate.id === allowance.round);
    return round !== undefined && round.ends.every((end) => edges.includes(end.line));
  });

  return {
    document: {
      ...replacePiece(document, {
        ...piece,
        edges: [...edges],
        allowances,
        ...(piece.cornerAllowances === undefined ? {} : { cornerAllowances: keptCorners }),
      }),
      entities,
    },
    inverse: null,
  };
}

/** Change one entity's role, refusing to demote a rounded cut line. */
export function applySetRole(
  document: PatternDocument,
  command: CommandOf<'set_role'>,
): CommandApplication {
  const { id, role } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('set_role', `unknown entity: ${id}`);
  }
  if (entity.kind === 'text') {
    throw new CommandValidationError('set_role', 'text is always annotation geometry');
  }
  if (role !== 'cut' && role !== 'construction' && role !== 'annotation') {
    throw new CommandValidationError('set_role', `unknown role: ${String(role)}`);
  }

  const current = roleOf(entity);
  if (current === role) return noOp(document);

  if (
    current === 'cut' &&
    role !== 'cut' &&
    entity.kind === 'line' &&
    cornerRoundsForEntity(document, id).some((round) => round.ends.some((end) => end.line === id))
  ) {
    throw new CommandValidationError('set_role', 'Remove the corner round first.');
  }

  const rest = withoutKeys(entity, ['role', 'construction']);
  const next = (role === 'cut' ? rest : { ...rest, role }) as Entity;
  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));

  return {
    document: { ...document, entities },
    inverse: { id: command.id, type: 'set_role', params: { id, role: current } },
  };
}

/** Store or clear a piece's allowance override. */
export function applySetPieceDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_default_allowance'>,
): CommandApplication {
  const { piece: pieceId, mode } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_default_allowance');

  let defaults: PieceDefaults | undefined;
  if (mode === 'inherit') {
    defaults = undefined;
  } else if (mode === 'none') {
    defaults = { allowance: null };
  } else if (mode === 'preset') {
    defaults = {
      allowance: requireAllowancePreset(document, 'set_piece_default_allowance', {
        width: command.params.width ?? Number.NaN,
        ...(command.params.kind === undefined ? {} : { kind: command.params.kind }),
      }),
    };
  } else {
    throw new CommandValidationError(
      'set_piece_default_allowance',
      `unknown mode: ${String(mode)}`,
    );
  }

  const next: Piece = { ...piece };
  if (defaults === undefined) delete next.defaults;
  else next.defaults = defaults;

  if (JSON.stringify(next.defaults) === JSON.stringify(piece.defaults)) {
    return noOp(document);
  }

  return {
    document: replacePiece(document, next),
    inverse: restorePieceDefaults(pieceId, piece.defaults),
  };
}

/** Create an empty assembly and append its tab. */
