/** Text, notch and centre line commands. */
import { getEntity } from '../document.js';
import { CommandValidationError } from '../errors.js';
import { pointOnEdge } from '../mark.js';
import { allowanceForEdge } from '../piece.js';
import { DEFAULT_TEXT_SIZE, MAX_TEXT_LENGTH, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from '../text.js';
import { TEXT_ALIGNMENTS } from '../types.js';
import type {
  CentreLineMark,
  EntityId,
  NotchMark,
  PatternDocument,
  Piece,
  PointEntity,
  TextAlignment,
  TextEntity,
} from '../types.js';
import {
  deleteEntityCommand,
  noOp,
  requireDraftingPoint,
  requireOwnedPoint,
  requirePiece,
} from './shared.js';
import type { CommandApplication, CommandOf, CommandType } from './types.js';

/** Trim and validate one line of label text. */
function requireTextContent(commandType: CommandType, content: unknown): string {
  if (typeof content !== 'string') {
    throw new CommandValidationError(commandType, 'content must be a string');
  }
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_TEXT_LENGTH) {
    throw new CommandValidationError(
      commandType,
      `content must be 1–${MAX_TEXT_LENGTH} characters after trimming`,
    );
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new CommandValidationError(commandType, 'content must be a single line');
  }
  return trimmed;
}

function requireTextAlignment(
  commandType: CommandType,
  alignment: TextAlignment | undefined,
): TextAlignment {
  const value = alignment ?? 'left';
  if (!TEXT_ALIGNMENTS.includes(value)) {
    throw new CommandValidationError(commandType, `unknown text alignment: ${String(value)}`);
  }
  return value;
}

function requireTextSize(commandType: CommandType, fontSize: number | undefined): number {
  const value = fontSize ?? DEFAULT_TEXT_SIZE;
  if (!Number.isFinite(value) || value < MIN_TEXT_SIZE || value > MAX_TEXT_SIZE) {
    throw new CommandValidationError(
      commandType,
      `fontSize must be between ${MIN_TEXT_SIZE} and ${MAX_TEXT_SIZE} mm`,
    );
  }
  return value;
}

function requireTextRotation(commandType: CommandType, rotation: number | undefined): number {
  const value = rotation ?? 0;
  if (!Number.isFinite(value)) {
    throw new CommandValidationError(commandType, 'rotation must be a finite number');
  }
  return value;
}

/** Create one annotation label anchored to a point of its piece. */
export function applyAddText(
  document: PatternDocument,
  command: CommandOf<'add_text'>,
): CommandApplication {
  const { piece: pieceId, anchor, content, alignment, rotation, fontSize, leader } = command.params;
  requirePiece(document, pieceId, 'add_text');
  const anchorPoint = requireOwnedPoint(document, anchor, pieceId, 'add_text');
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  let leaderPoint: PointEntity | undefined;
  if (leader !== undefined) {
    if (leader === anchorPoint.id) {
      throw new CommandValidationError('add_text', 'the leader must differ from the anchor');
    }
    leaderPoint = requireOwnedPoint(document, leader, pieceId, 'add_text');
  }

  const text: TextEntity = {
    id: command.id,
    kind: 'text',
    piece: pieceId,
    anchor,
    content: requireTextContent('add_text', content),
    alignment: requireTextAlignment('add_text', alignment),
    rotation: requireTextRotation('add_text', rotation),
    fontSize: requireTextSize('add_text', fontSize),
  };
  if (leaderPoint !== undefined) text.leader = leaderPoint.id;

  return {
    document: { ...document, entities: [...document.entities, text] },
    inverse: deleteEntityCommand(command.id),
  };
}

/** Edit a label's text, anchor, presentation or leader. */
export function applyUpdateText(
  document: PatternDocument,
  command: CommandOf<'update_text'>,
): CommandApplication {
  const { id, content, anchor, alignment, rotation, fontSize, leader } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_text', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'text') {
    throw new CommandValidationError('update_text', `entity ${id} is not text`);
  }
  if (
    content === undefined &&
    anchor === undefined &&
    alignment === undefined &&
    rotation === undefined &&
    fontSize === undefined &&
    leader === undefined
  ) {
    throw new CommandValidationError('update_text', 'provide content, anchor or presentation');
  }

  const piece = entity.piece;
  if (piece === undefined) {
    throw new CommandValidationError('update_text', 'text is not owned by a piece');
  }
  const nextAnchor =
    anchor === undefined
      ? entity.anchor
      : requireOwnedPoint(document, anchor, piece, 'update_text').id;
  let nextLeader = entity.leader;
  if (leader === null) {
    nextLeader = undefined;
  } else if (leader !== undefined) {
    if (leader === nextAnchor) {
      throw new CommandValidationError('update_text', 'the leader must differ from the anchor');
    }
    nextLeader = requireOwnedPoint(document, leader, piece, 'update_text').id;
  }

  const next: TextEntity = {
    ...entity,
    anchor: nextAnchor,
    content: content === undefined ? entity.content : requireTextContent('update_text', content),
    alignment:
      alignment === undefined
        ? (entity.alignment ?? 'left')
        : requireTextAlignment('update_text', alignment),
    rotation:
      rotation === undefined
        ? (entity.rotation ?? 0)
        : requireTextRotation('update_text', rotation),
    fontSize:
      fontSize === undefined
        ? (entity.fontSize ?? DEFAULT_TEXT_SIZE)
        : requireTextSize('update_text', fontSize),
  };
  delete next.leader;
  if (nextLeader !== undefined) next.leader = nextLeader;

  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));

  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_text',
      params: {
        id,
        content: entity.content,
        anchor: entity.anchor,
        alignment: entity.alignment ?? 'left',
        rotation: entity.rotation ?? 0,
        fontSize: entity.fontSize ?? DEFAULT_TEXT_SIZE,
        leader: entity.leader ?? null,
      },
    },
  };
}

/** A drafting point of this piece a mark may attach to. */
function requireMarkPoint(
  document: PatternDocument,
  id: EntityId,
  piece: EntityId,
  type: CommandType,
): PointEntity {
  const point = requireDraftingPoint(document, id, type);
  if (point.piece !== undefined && point.piece !== piece) {
    throw new CommandValidationError(type, `point ${id} belongs to another piece`);
  }
  return point;
}

/** Reject an edge that is not a cut line, curve or arc of this piece's loop. */
function requireMarkEdge(
  document: PatternDocument,
  piece: Piece,
  edge: EntityId,
  type: CommandType,
): void {
  if (!piece.edges.includes(edge)) {
    throw new CommandValidationError(type, `edge ${edge} is not in piece ${piece.id}`);
  }
  const entity = getEntity(document, edge);
  if (
    entity === undefined ||
    (entity.kind !== 'line' && entity.kind !== 'curve' && entity.kind !== 'arc')
  ) {
    throw new CommandValidationError(type, `edge ${edge} is not a line, curve or arc`);
  }
}

/** A finite depth share; out-of-range values are clamped on read, not rejected. */
function requireNotchDepth(type: CommandType, depth: number): number {
  if (typeof depth !== 'number' || !Number.isFinite(depth)) {
    throw new CommandValidationError(type, 'depth must be a finite number');
  }
  return depth;
}

export function applyAddNotch(
  document: PatternDocument,
  command: CommandOf<'add_notch'>,
): CommandApplication {
  const { piece: pieceId, edge, point, depth } = command.params;
  const piece = requirePiece(document, pieceId, 'add_notch');
  requireMarkEdge(document, piece, edge, 'add_notch');
  const anchor = requireMarkPoint(document, point, pieceId, 'add_notch');
  if (allowanceForEdge(piece, edge) === undefined) {
    throw new CommandValidationError('add_notch', 'This edge has no seam allowance');
  }
  if (!pointOnEdge(document, edge, anchor.id)) {
    throw new CommandValidationError('add_notch', `point ${point} does not lie on edge ${edge}`);
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const notch: NotchMark = {
    id: command.id,
    kind: 'mark',
    type: 'notch',
    piece: pieceId,
    edge,
    point: anchor.id,
  };
  if (depth !== undefined) notch.depth = requireNotchDepth('add_notch', depth);

  return {
    document: { ...document, entities: [...document.entities, notch] },
    inverse: deleteEntityCommand(command.id),
  };
}

export function applyUpdateNotch(
  document: PatternDocument,
  command: CommandOf<'update_notch'>,
): CommandApplication {
  const { id, depth } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_notch', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'mark' || entity.type !== 'notch') {
    throw new CommandValidationError('update_notch', `entity ${id} is not a notch`);
  }
  if (depth === undefined) {
    throw new CommandValidationError('update_notch', 'provide a depth or null');
  }

  const next: NotchMark = { ...entity };
  if (depth === null) {
    delete next.depth;
  } else {
    next.depth = requireNotchDepth('update_notch', depth);
  }
  if (next.depth === entity.depth) {
    return noOp(document);
  }

  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));
  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_notch',
      params: { id, depth: entity.depth ?? null },
    },
  };
}

export function applyAddCentreLine(
  document: PatternDocument,
  command: CommandOf<'add_centre_line'>,
): CommandApplication {
  const { piece: pieceId, start, end } = command.params;
  requirePiece(document, pieceId, 'add_centre_line');
  const first = requireMarkPoint(document, start, pieceId, 'add_centre_line');
  const second = requireMarkPoint(document, end, pieceId, 'add_centre_line');
  if (first.id === second.id) {
    throw new CommandValidationError('add_centre_line', 'the endpoints must differ');
  }
  if (getEntity(document, command.id) !== undefined) {
    return noOp(document);
  }

  const line: CentreLineMark = {
    id: command.id,
    kind: 'mark',
    type: 'centre_line',
    piece: pieceId,
    start: first.id,
    end: second.id,
  };
  return {
    document: { ...document, entities: [...document.entities, line] },
    inverse: deleteEntityCommand(command.id),
  };
}

export function applyUpdateCentreLine(
  document: PatternDocument,
  command: CommandOf<'update_centre_line'>,
): CommandApplication {
  const { id, start, end } = command.params;
  const entity = getEntity(document, id);
  if (entity === undefined) {
    throw new CommandValidationError('update_centre_line', `unknown entity: ${id}`);
  }
  if (entity.kind !== 'mark' || entity.type !== 'centre_line') {
    throw new CommandValidationError('update_centre_line', `entity ${id} is not a centre line`);
  }
  if (start === undefined && end === undefined) {
    throw new CommandValidationError('update_centre_line', 'provide start or end');
  }

  const piece = entity.piece;
  if (piece === undefined) {
    throw new CommandValidationError('update_centre_line', 'the mark is not owned by a piece');
  }
  const nextStart =
    start === undefined
      ? entity.start
      : requireMarkPoint(document, start, piece, 'update_centre_line').id;
  const nextEnd =
    end === undefined
      ? entity.end
      : requireMarkPoint(document, end, piece, 'update_centre_line').id;
  if (nextStart === nextEnd) {
    throw new CommandValidationError('update_centre_line', 'the endpoints must differ');
  }
  if (nextStart === entity.start && nextEnd === entity.end) {
    return noOp(document);
  }

  const next: CentreLineMark = { ...entity, start: nextStart, end: nextEnd };
  const entities = document.entities.map((candidate) => (candidate.id === id ? next : candidate));
  return {
    document: { ...document, entities },
    inverse: {
      id: command.id,
      type: 'update_centre_line',
      params: { id, start: entity.start, end: entity.end },
    },
  };
}
