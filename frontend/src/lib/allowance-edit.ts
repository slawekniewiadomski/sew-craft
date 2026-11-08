import {
  allowanceDistance,
  resolveParam,
  allowanceForEdge,
  cornerAllowanceForRound,
  cornerAllowanceState,
  cornerRounds,
  type AllowanceKind,
  type BandTarget,
  type Command,
  type EntityId,
  type PatternDocument,
  type Piece,
} from '@sewcraft/geometry';

/** One edge whose finished width is about to change, keeping its fold kind. */
export interface AllowanceEdgeWidth {
  edge: EntityId;
  kind: AllowanceKind;
}

/** One edit applied to every selected allowance region. */
export interface BulkAllowanceEdit {
  mode: 'set' | 'double' | 'inherit';
  /** Cut distance for `set`; one number means one cut width across the set. */
  cutWidth?: number;
  /** Offered only when every selected target is an edge. */
  kind?: AllowanceKind;
}

/**
 * The commands one bulk edit turns into, in target order, so the caller can
 * dispatch them as a single undo step. Targets the piece no longer owns are
 * skipped; `inherit` leaves edges alone.
 */
export function allowanceEditCommands(
  document: PatternDocument,
  piece: Piece,
  targets: readonly BandTarget[],
  edit: BulkAllowanceEdit,
  nextId: (prefix?: string) => string,
): Command[] {
  const commands: Command[] = [];
  const rounds = cornerRounds(document);

  for (const target of targets) {
    if (target.kind === 'edge') {
      if (!piece.edges.includes(target.edge)) continue;
      const current = allowanceForEdge(piece, target.edge);
      if (edit.mode === 'set') {
        // `set` always carries the number the editor shows.
        const cut = edit.cutWidth!;
        const kind = edit.kind ?? current?.kind ?? 'seam';
        commands.push({
          id: nextId('allowance'),
          type: 'set_piece_allowance',
          params: {
            piece: piece.id,
            edge: target.edge,
            // With a kind the number is the finished width; a mixed set has no
            // kind, so the number is a cut width and a double fold stores half.
            width: edit.kind === undefined && kind === 'double' ? cut / 2 : cut,
            kind,
          },
        });
      } else if (edit.mode === 'double' && current !== undefined) {
        commands.push({
          id: nextId('allowance'),
          type: 'set_piece_allowance',
          params: {
            piece: piece.id,
            edge: target.edge,
            width: resolveParam(document, current.width) * 2,
            kind: current.kind ?? 'seam',
          },
        });
      }
      continue;
    }

    const round = rounds.find((candidate) => candidate.id === target.round);
    if (round === undefined) continue;
    const own = cornerAllowanceForRound(piece, target.round);
    const before = allowanceForEdge(piece, round.ends[0].line);
    // The state owns the rule; a corner reports `inherited` only when both edges
    // exist and agree, which is exactly when a single base is well defined.
    const inherited =
      cornerAllowanceState(piece, round.id, [round.ends[0].line, round.ends[1].line]) ===
      'inherited';

    if (edit.mode === 'set') {
      commands.push({
        id: nextId('corner-allowance'),
        type: 'set_piece_corner_allowance',
        params: { piece: piece.id, round: target.round, cutWidth: edit.cutWidth! },
      });
    } else if (edit.mode === 'double' && (own !== undefined || inherited)) {
      const base = own !== undefined ? own.cutWidth : allowanceDistance(before!, document);
      commands.push({
        id: nextId('corner-allowance'),
        type: 'set_piece_corner_allowance',
        params: { piece: piece.id, round: target.round, cutWidth: base * 2 },
      });
    } else if (edit.mode === 'inherit' && own !== undefined) {
      commands.push({
        id: nextId('corner-allowance'),
        type: 'set_piece_corner_allowance',
        params: { piece: piece.id, round: target.round, remove: true },
      });
    }
  }

  return commands;
}

/**
 * The picked targets the document still offers: an edge still in the piece, or a
 * round whose two lines both are. A missing piece drops them all.
 */
export function pruneAllowanceTargets(
  document: PatternDocument,
  pieceId: string | null,
  targets: readonly BandTarget[],
): BandTarget[] {
  const piece = document.pieces.find((candidate) => candidate.id === pieceId);
  if (piece === undefined) return [];

  const rounds = cornerRounds(document);
  return targets.filter((target) =>
    target.kind === 'edge'
      ? piece.edges.includes(target.edge)
      : rounds.some(
          (round) =>
            round.id === target.round && round.ends.every((end) => piece.edges.includes(end.line)),
        ),
  );
}
