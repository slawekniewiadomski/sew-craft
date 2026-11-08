import {
  cornerRoundGeometry,
  lineEndpointAnchor,
  maxCornerRadius,
  regenerateCornerRounds,
} from '../corner-round.js';
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
import { cornerAllowanceForRound, pieceCutLoop } from '../piece.js';
import { isAnnotation, isConstruction, roleOf } from '../roles.js';
import type { CornerRound, Entity, EntityId, PatternDocument } from '../types.js';
import { requireLengthParam } from './constraint-validation.js';
import { noOp, requireLine, requirePoint } from './shared.js';
import type { CommandApplication, CommandOf } from './types.js';

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
