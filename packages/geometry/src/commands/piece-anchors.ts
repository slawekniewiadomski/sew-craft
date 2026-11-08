import { CommandValidationError } from '../errors.js';
import type { CutAnchorIssueReason } from '../dimension.js';
import type { CutAnchor, Piece } from '../types.js';
import type { CommandType } from './types.js';

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
