/** Seam allowance and corner round commands. */
import {
  cornerRoundGeometry,
  lineEndpointAnchor,
  maxCornerRadius,
  regenerateCornerRounds,
} from '../corner-round.js';
import { effectiveDefaultAllowance, effectivePieceAllowance } from '../defaults.js';
import {
  constraintEntityIds,
  cornerRounds,
  documentSeams,
  getEntity,
  seamForEdge,
  sharedCorner,
} from '../document.js';
import { CommandValidationError } from '../errors.js';
import { resolveParam, sameParam } from '../expression.js';

import { regenerateMidpoints } from '../midpoint.js';
import { formatMillimetres } from '../number.js';
import { allowanceForEdge, cornerAllowanceForRound, pieceById, pieceCutLoop } from '../piece.js';
import { isAnnotation, isConstruction, roleOf } from '../roles.js';
import { ALLOWANCE_KINDS } from '../types.js';
import type {
  Allowance,
  AllowanceKind,
  AllowancePreset,
  CornerAllowance,
  CornerRound,
  Entity,
  EntityId,
  PatternDocument,
  Piece,
} from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { noOp, replacePiece, requireLine, requirePiece, requirePoint } from './shared.js';
import type { Command, CommandApplication, CommandOf, CommandType, ParamInput } from './types.js';

/**
 * Round a corner between two lines. The selected lines are trimmed to their
 * tangent points, the arc and its control points are derived, and the sharp
 * corner stays as a construction point so existing dimensions keep driving it.
 */
export function applyAddCornerRound(
  document: PatternDocument,
  command: CommandOf<'add_corner_round'>,
): CommandApplication {
  const { first, second } = command.params;
  const radius = requireLengthParam(document, 'add_corner_round', command.params.radius, 'radius');
  const radiusValue = resolveParam(document, radius);
  if (cornerRounds(document).some((round) => round.id === command.id)) {
    return noOp(document);
  }

  const lineA = requireLine(document, first, 'add_corner_round');
  const lineB = requireLine(document, second, 'add_corner_round');
  if (first === second) {
    throw new CommandValidationError('add_corner_round', 'Pick two different lines.');
  }

  // A committed round trims both lines away from the shared corner, so the
  // corner id is no longer an endpoint. The round itself is the evidence.
  const sharedRound = cornerRounds(document).find(
    (round) =>
      round.ends.some((end) => end.line === first) && round.ends.some((end) => end.line === second),
  );
  if (sharedRound !== undefined) {
    throw new CommandValidationError('add_corner_round', 'This corner is already rounded.');
  }

  const corner = sharedCorner(lineA, lineB);
  if (corner === null) {
    const shared = [lineA.start, lineA.end].filter((id) => id === lineB.start || id === lineB.end);
    throw new CommandValidationError(
      'add_corner_round',
      shared.length === 0 ? 'The lines must meet at a corner.' : 'Pick two different lines.',
    );
  }
  if (cornerRounds(document).some((round) => round.corner === corner)) {
    throw new CommandValidationError('add_corner_round', 'This corner is already rounded.');
  }
  if (isAnnotation(lineA) || isAnnotation(lineB)) {
    throw new CommandValidationError('add_corner_round', 'Annotation geometry cannot be rounded.');
  }
  if (roleOf(lineA) !== roleOf(lineB)) {
    throw new CommandValidationError('add_corner_round', 'Both lines must share a role.');
  }
  if (seamForEdge(document, first) !== undefined || seamForEdge(document, second) !== undefined) {
    throw new CommandValidationError('add_corner_round', 'Remove the seam allowance first.');
  }

  const meeting = document.entities.filter(
    (entity) =>
      entity.kind === 'line' &&
      isConstruction(entity) === isConstruction(lineA) &&
      (entity.start === corner || entity.end === corner),
  );
  if (meeting.length > 2) {
    throw new CommandValidationError(
      'add_corner_round',
      'The corner is shared by more than two edges of this kind.',
    );
  }

  const anchorA = lineEndpointAnchor(
    document,
    first,
    lineA.start === corner ? lineA.end : lineA.start,
  );
  const anchorB = lineEndpointAnchor(
    document,
    second,
    lineB.start === corner ? lineB.end : lineB.start,
  );
  const geometry = cornerRoundGeometry(document, corner, anchorA, anchorB, radiusValue);
  if (geometry.geometry === null) {
    throw new CommandValidationError('add_corner_round', geometry.error);
  }

  const tentative: CornerRound = {
    id: command.id,
    corner,
    ends: [
      { line: first, anchor: anchorA, tangent: `${command.id}:a` },
      { line: second, anchor: anchorB, tangent: `${command.id}:b` },
    ],
    radius,
    arc: `${command.id}:arc`,
    controls: [`${command.id}:c1`, `${command.id}:c2`],
    center: `${command.id}:center`,
    cornerConstruction: false,
  };
  const maximum = maxCornerRadius(document, tentative);
  if (maximum === null) {
    throw new CommandValidationError('add_corner_round', 'The corner cannot be rounded.');
  }
  if (radiusValue > maximum + 1e-9) {
    throw new CommandValidationError(
      'add_corner_round',
      `Radius ${formatMillimetres(radiusValue)} mm is too large for these lines; the maximum is ${formatMillimetres(maximum)} mm.`,
    );
  }

  const derivedIds = [
    tentative.ends[0].tangent,
    tentative.ends[1].tangent,
    tentative.controls[0],
    tentative.controls[1],
    tentative.arc,
    tentative.center!,
  ];
  for (const id of derivedIds) {
    if (getEntity(document, id) !== undefined) {
      throw new CommandValidationError('add_corner_round', `Derived entity id "${id}" is in use.`);
    }
  }

  const cornerEntity = requirePoint(document, corner, 'add_corner_round');
  const construction = isConstruction(lineA);
  // The derived geometry belongs to the same piece as the selected lines; an
  // unowned legacy document stays unowned rather than inventing a piece.
  const owner = lineA.piece ?? lineB.piece;
  const ownership = owner === undefined ? {} : { piece: owner };
  const entities: Entity[] = document.entities.map((entity) => {
    if (entity.kind === 'line' && entity.id === first) {
      return entity.start === corner
        ? { ...entity, start: tentative.ends[0].tangent }
        : { ...entity, end: tentative.ends[0].tangent };
    }
    if (entity.kind === 'line' && entity.id === second) {
      return entity.start === corner
        ? { ...entity, start: tentative.ends[1].tangent }
        : { ...entity, end: tentative.ends[1].tangent };
    }
    if (entity.id === corner) {
      return { ...cornerEntity, construction: true };
    }
    return entity;
  });

  entities.push(
    {
      id: tentative.center!,
      kind: 'point',
      x: geometry.geometry.center.x,
      y: geometry.geometry.center.y,
      ...ownership,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.ends[0].tangent,
      kind: 'point',
      x: geometry.geometry.tangentA.x,
      y: geometry.geometry.tangentA.y,
      ...ownership,
      construction,
      fixed: true,
    },
    {
      id: tentative.ends[1].tangent,
      kind: 'point',
      x: geometry.geometry.tangentB.x,
      y: geometry.geometry.tangentB.y,
      ...ownership,
      construction,
      fixed: true,
    },
    {
      id: tentative.controls[0],
      kind: 'point',
      x: geometry.geometry.control1.x,
      y: geometry.geometry.control1.y,
      ...ownership,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.controls[1],
      kind: 'point',
      x: geometry.geometry.control2.x,
      y: geometry.geometry.control2.y,
      ...ownership,
      construction: true,
      fixed: true,
    },
    {
      id: tentative.arc,
      kind: 'curve',
      p0: tentative.ends[0].tangent,
      p1: tentative.controls[0],
      p2: tentative.controls[1],
      p3: tentative.ends[1].tangent,
      ...ownership,
      construction,
    },
  );

  const round: CornerRound = { ...tentative, cornerConstruction: isConstruction(cornerEntity) };
  const next: PatternDocument = {
    ...document,
    entities,
    cornerRounds: [...cornerRounds(document), round],
  };

  // A radius that folds a piece's cut line is not a usable round: compare the
  // affected loops so an unrelated pre-existing fold does not block the edit.
  const pieces = document.pieces.filter(
    (piece) => piece.edges.includes(first) && piece.edges.includes(second),
  );
  for (const piece of pieces) {
    const before = pieceCutLoop(document, piece)?.selfIntersections.length ?? 0;
    const after = pieceCutLoop(next, piece)?.selfIntersections.length ?? 0;
    if (after > before) {
      throw new CommandValidationError(
        'add_corner_round',
        'This radius with the current allowance folds the cut line.',
      );
    }
  }

  return {
    document: next,
    inverse: {
      id: `${command.id}:remove`,
      type: 'remove_corner_round',
      params: { id: command.id },
    },
  };
}

/** Change the radius of an existing round and regenerate its derived geometry. */
export function applySetCornerRoundRadius(
  document: PatternDocument,
  command: CommandOf<'set_corner_round_radius'>,
): CommandApplication {
  const { id } = command.params;
  const radius = requireLengthParam(
    document,
    'set_corner_round_radius',
    command.params.radius,
    'radius',
  );
  const radiusValue = resolveParam(document, radius);
  const round = cornerRounds(document).find((candidate) => candidate.id === id);
  if (round === undefined) {
    throw new CommandValidationError('set_corner_round_radius', `unknown corner round: ${id}`);
  }
  if (radiusValue < 0.001) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'Radius must be a finite number of at least 0.001 mm.',
    );
  }
  if (sameParam(round.radius, radius)) {
    return noOp(document);
  }

  const maximum = maxCornerRadius(document, round);
  if (maximum === null) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      'The corner can no longer be rounded.',
    );
  }
  if (radiusValue > maximum + 1e-9) {
    throw new CommandValidationError(
      'set_corner_round_radius',
      `Radius ${formatMillimetres(radiusValue)} mm is too large for these lines; the maximum is ${formatMillimetres(maximum)} mm.`,
    );
  }

  const updated: CornerRound = { ...round, radius };
  const documentWithRadius: PatternDocument = {
    ...document,
    cornerRounds: cornerRounds(document).map((candidate) =>
      candidate.id === id ? updated : candidate,
    ),
  };

  return {
    document: regenerateMidpoints(regenerateCornerRounds(documentWithRadius)),
    inverse: {
      id: `${command.id}:restore`,
      type: 'set_corner_round_radius',
      params: { id, radius: round.radius },
    },
  };
}

/** Restore the sharp corner, delete the derived geometry and drop the feature. */
export function applyRemoveCornerRound(
  document: PatternDocument,
  command: CommandOf<'remove_corner_round'>,
): CommandApplication {
  const { id } = command.params;
  const round = cornerRounds(document).find((candidate) => candidate.id === id);
  if (round === undefined) {
    return noOp(document);
  }

  const removed = new Set<EntityId>([
    round.arc,
    ...round.controls,
    ...round.ends.map((end) => end.tangent),
  ]);
  if (round.center !== undefined) removed.add(round.center);

  const entities = document.entities
    .filter((entity) => !removed.has(entity.id))
    .map((entity): Entity => {
      if (entity.kind === 'line') {
        const end = round.ends.find((candidate) => candidate.line === entity.id);
        if (end !== undefined) {
          if (entity.start === end.tangent) return { ...entity, start: round.corner };
          if (entity.end === end.tangent) return { ...entity, end: round.corner };
        }
      }
      if (entity.kind === 'point' && entity.id === round.corner) {
        return { ...entity, construction: round.cornerConstruction };
      }
      return entity;
    });

  const constraints = document.constraints.filter(
    (constraint) => !constraintEntityIds(constraint).some((entityId) => removed.has(entityId)),
  );
  const seams = documentSeams(document).filter((seam) => !removed.has(seam.edge));
  const removedPieceIds = new Set(
    document.pieces
      .filter((piece) => piece.edges.some((edge) => removed.has(edge)))
      .map((piece) => piece.id),
  );

  return {
    document: {
      ...document,
      entities,
      constraints: constraints.filter(
        (constraint) =>
          !(constraint.type === 'derived_distance' && removedPieceIds.has(constraint.piece)),
      ),
      seams,
      pieces: document.pieces
        .filter((piece) => !removedPieceIds.has(piece.id))
        .map((piece) =>
          cornerAllowanceForRound(piece, id) === undefined
            ? piece
            : {
                ...piece,
                // The entry was found, so the array exists.
                cornerAllowances: piece.cornerAllowances!.filter((entry) => entry.round !== id),
              },
        ),
      cornerRounds: cornerRounds(document).filter((candidate) => candidate.id !== id),
    },
    inverse: {
      id: round.id,
      type: 'add_corner_round',
      params: {
        first: round.ends[0].line,
        second: round.ends[1].line,
        radius: round.radius,
      },
    },
  };
}

/** The kind an allowance effectively has; an omitted kind means `seam`. */
function effectiveKind(allowance: Allowance): AllowanceKind {
  return allowance.kind ?? 'seam';
}

/** The preset `create_piece`/`set_piece_loop` copies onto new loop edges, or `null`. */
export function resolveCreateAllowance(
  document: PatternDocument,
  allowance: 'default' | 'none' | AllowancePreset | undefined,
  type: CommandType,
  piece: Piece,
): AllowancePreset | null {
  if (allowance === 'none') return null;
  if (allowance === undefined || allowance === 'default') {
    return effectivePieceAllowance(document, piece);
  }

  return requireAllowancePreset(document, type, allowance);
}

/** Validate and copy one allowance preset, recording a formula's current value. */
export function requireAllowancePreset(
  document: PatternDocument,
  commandType: CommandType,
  preset: { width: ParamInput; kind?: AllowanceKind },
): AllowancePreset {
  if (typeof preset !== 'object' || preset === null) {
    throw new CommandValidationError(
      commandType,
      'allowance must be "default", "none" or a preset',
    );
  }
  const width = requireLengthParam(document, commandType, preset.width, 'allowance width');
  if (preset.kind !== undefined && !ALLOWANCE_KINDS.includes(preset.kind)) {
    throw new CommandValidationError(commandType, `unknown allowance kind: ${String(preset.kind)}`);
  }

  return {
    width,
    ...(preset.kind === undefined ? {} : { kind: preset.kind }),
  };
}

/** A command that restores an allowance to its previous width and kind. */
function restoreAllowance(id: EntityId, piece: EntityId, allowance: Allowance): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_allowance',
    params: {
      piece,
      edge: allowance.edge,
      width: allowance.width,
      ...(allowance.kind === undefined ? {} : { kind: allowance.kind }),
    },
  };
}

export function applySetDefaultAllowance(
  document: PatternDocument,
  command: CommandOf<'set_default_allowance'>,
): CommandApplication {
  const { width, kind, remove } = command.params;
  const current = effectiveDefaultAllowance(document);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_default_allowance', 'remove takes no width or kind');
    }
    if (current === null) {
      return noOp(document);
    }

    return {
      document: { ...document, defaults: { allowance: null } },
      inverse: restoreDefaultAllowance(command.id, current),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_default_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_default_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_default_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const nextKind = kind ?? 'seam';
  if (
    current !== null &&
    sameParam(current.width, nextWidth) &&
    (current.kind ?? 'seam') === nextKind
  ) {
    return noOp(document);
  }

  return {
    document: { ...document, defaults: { allowance: { width: nextWidth, kind: nextKind } } },
    inverse:
      current === null
        ? {
            id: `${command.id}:remove`,
            type: 'set_default_allowance',
            params: { remove: true },
          }
        : restoreDefaultAllowance(command.id, current),
  };
}

/** A command that restores the document's previous default allowance preset. */
function restoreDefaultAllowance(id: EntityId, preset: AllowancePreset): Command {
  return {
    id: `${id}:restore`,
    type: 'set_default_allowance',
    params: {
      width: preset.width,
      ...(preset.kind === undefined ? {} : { kind: preset.kind }),
    },
  };
}

/** Set, change or remove the allowance of one loop edge. */
export function applySetPieceAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_allowance'>,
): CommandApplication {
  const { piece: pieceId, edge, width, kind, remove } = command.params;
  const piece = pieceById(document, pieceId);
  if (piece === undefined) {
    throw new CommandValidationError('set_piece_allowance', `unknown piece: ${pieceId}`);
  }
  if (!piece.edges.includes(edge)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `edge ${edge} is not in piece ${pieceId}`,
    );
  }

  const existing = allowanceForEdge(piece, edge);

  if (remove === true) {
    if (width !== undefined || kind !== undefined) {
      throw new CommandValidationError('set_piece_allowance', 'remove takes no width or kind');
    }
    if (existing === undefined) {
      return noOp(document);
    }
    return {
      document: replacePiece(document, {
        ...piece,
        allowances: piece.allowances.filter((allowance) => allowance.edge !== edge),
      }),
      inverse: restoreAllowance(command.id, pieceId, existing),
    };
  }

  if (width === undefined) {
    throw new CommandValidationError(
      'set_piece_allowance',
      'width must be a finite number greater than 0',
    );
  }
  const nextWidth = requireLengthParam(document, 'set_piece_allowance', width, 'width');
  if (kind !== undefined && !ALLOWANCE_KINDS.includes(kind)) {
    throw new CommandValidationError(
      'set_piece_allowance',
      `unknown allowance kind: ${String(kind)}`,
    );
  }

  const next: Allowance = { edge, width: nextWidth, ...(kind === undefined ? {} : { kind }) };
  if (
    existing !== undefined &&
    sameParam(existing.width, nextWidth) &&
    effectiveKind(existing) === effectiveKind(next)
  ) {
    return noOp(document);
  }

  const allowances =
    existing === undefined
      ? [...piece.allowances, next]
      : piece.allowances.map((allowance) => (allowance.edge === edge ? next : allowance));

  return {
    document: replacePiece(document, { ...piece, allowances }),
    inverse:
      existing === undefined
        ? {
            id: `${command.id}:restore`,
            type: 'set_piece_allowance',
            params: { piece: pieceId, edge, remove: true },
          }
        : restoreAllowance(command.id, pieceId, existing),
  };
}

/** A command that restores a corner round's own cut width. */
function restoreCornerAllowance(
  id: EntityId,
  piece: EntityId,
  allowance: CornerAllowance,
): Command {
  return {
    id: `${id}:restore`,
    type: 'set_piece_corner_allowance',
    params: { piece, round: allowance.round, cutWidth: allowance.cutWidth },
  };
}

/** Set, change or remove one rounded corner's own allowance width. */
export function applySetPieceCornerAllowance(
  document: PatternDocument,
  command: CommandOf<'set_piece_corner_allowance'>,
): CommandApplication {
  const { piece: pieceId, round: roundId, cutWidth, remove } = command.params;
  const piece = requirePiece(document, pieceId, 'set_piece_corner_allowance');

  const round = cornerRounds(document).find((candidate) => candidate.id === roundId);
  if (round === undefined) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `unknown corner round: ${roundId}`,
    );
  }
  if (!round.ends.every((end) => piece.edges.includes(end.line))) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      `corner round ${roundId} is not a corner of piece ${pieceId}`,
    );
  }

  const existing = cornerAllowanceForRound(piece, roundId);

  if (remove === true) {
    if (cutWidth !== undefined) {
      throw new CommandValidationError('set_piece_corner_allowance', 'remove takes no cutWidth');
    }
    if (existing === undefined) return noOp(document);
    return {
      document: replacePiece(document, {
        ...piece,
        // `existing` was found, so the array exists.
        cornerAllowances: piece.cornerAllowances!.filter((entry) => entry.round !== roundId),
      }),
      inverse: restoreCornerAllowance(command.id, pieceId, existing),
    };
  }

  if (cutWidth === undefined || !Number.isFinite(cutWidth) || cutWidth <= 0) {
    throw new CommandValidationError(
      'set_piece_corner_allowance',
      'cutWidth must be a finite number greater than 0',
    );
  }
  if (existing !== undefined && existing.cutWidth === cutWidth) return noOp(document);

  const next: CornerAllowance = { round: roundId, cutWidth };
  const cornerAllowances =
    existing === undefined
      ? [...(piece.cornerAllowances ?? []), next]
      : // `existing` was found, so the array exists.
        piece.cornerAllowances!.map((allowance) =>
          allowance.round === roundId ? next : allowance,
        );

  return {
    document: replacePiece(document, { ...piece, cornerAllowances }),
    inverse:
      existing === undefined
        ? {
            id: `${command.id}:restore`,
            type: 'set_piece_corner_allowance',
            params: { piece: pieceId, round: roundId, remove: true },
          }
        : restoreCornerAllowance(command.id, pieceId, existing),
  };
}
