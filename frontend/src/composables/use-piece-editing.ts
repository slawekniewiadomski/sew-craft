import type {
  AllowanceKind,
  BandTarget,
  Command,
  EntityId,
  ParamInput,
  PatternDocument,
  Piece,
  TabRef,
} from '@sewcraft/geometry';
import { pieceById } from '@sewcraft/geometry';
import type { ComputedRef, Ref } from 'vue';

import {
  allowanceEditCommands,
  type AllowanceEdgeWidth,
  type BulkAllowanceEdit,
} from '@/lib/allowance-edit';
import type { AllowanceChoice } from '@/lib/allowance-defaults';
import { nextCommandId } from '@/lib/command-ids';
import { pieceCreationFromSelection } from '@/lib/pieces';
import { pieceTab } from '@/lib/tabs';
import { textContentError } from '@/lib/text-tool';

export interface PieceEditingOptions {
  pattern: () => PatternDocument;
  defaultAllowance: ComputedRef<AllowanceChoice>;
  activePiece: ComputedRef<Piece | null>;
  selectedAllowanceTargets: Ref<BandTarget[]>;
  selectedEntityIds: Ref<EntityId[]>;
  selectedInstanceId: Ref<EntityId | null>;
  setActiveTab: (tab: TabRef | null) => void;
  /** The view's command wrapper; it reports failures through its error strip. */
  run: (action: () => void) => boolean;
  dispatch: (command: Command) => void;
  dispatchGroup: (commands: Command[]) => void;
  /** The view's error strip, for a gesture that has nowhere to place its result. */
  error: Ref<string | null>;
}

/**
 * Piece editing: metadata, the cut loop, per-edge and per-corner allowances,
 * the bulk allowance edit, the piece default, deletion and the project default
 * allowance. Text updates ride along because they share the error-handling
 * shape of the other inspector edits.
 *
 * The document, the selection and the active piece stay with the view; this
 * turns a panel edit into the same commands an agent would emit.
 */
export function usePieceEditing({
  pattern,
  defaultAllowance,
  activePiece,
  selectedAllowanceTargets,
  selectedEntityIds,
  selectedInstanceId,
  setActiveTab,
  run,
  dispatch,
  dispatchGroup,
  error,
}: PieceEditingOptions) {
  /** Apply one default allowance choice as a single undoable command. */
  function applyDefaultAllowance(choice: AllowanceChoice): void {
    const current = defaultAllowance.value;
    const kind = choice.kind;
    if (kind === 'none') {
      if (current.kind === 'none') return;
      run(() =>
        dispatch({
          id: nextCommandId('default-allowance'),
          type: 'set_default_allowance',
          params: { remove: true },
        }),
      );
      return;
    }

    const width = choice.width;
    if (kind === current.kind && width === current.width) return;
    run(() =>
      dispatch({
        id: nextCommandId('default-allowance'),
        type: 'set_default_allowance',
        params: { width, kind },
      }),
    );
  }

  /** Apply one allowance to every edge of a piece as a single journal entry. */
  function onSetAllAllowances(
    pieceId: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ): void {
    const piece = pattern().pieces.find((candidate) => candidate.id === pieceId);
    /* v8 ignore next -- the card emits only for a piece in the current document */
    if (piece === undefined) return;

    const commands: Command[] = piece.edges.map((edge) => ({
      id: nextCommandId('allowance'),
      type: 'set_piece_allowance',
      params:
        value === null
          ? { piece: pieceId, edge, remove: true }
          : { piece: pieceId, edge, width: value.width, kind: value.kind },
    }));
    run(() => dispatchGroup(commands));
  }

  function onSetRole(id: EntityId, role: 'cut' | 'construction' | 'annotation'): void {
    run(() => dispatch({ id: nextCommandId('role'), type: 'set_role', params: { id, role } }));
  }

  function onUpdateText(id: EntityId, patch: Record<string, unknown>): void {
    if (typeof patch.content === 'string') {
      const issue = textContentError(patch.content);
      if (issue !== null) {
        error.value = issue;
        return;
      }
    }
    run(() =>
      dispatch({
        id: nextCommandId('text'),
        type: 'update_text',
        params: { id, ...patch } as { id: EntityId },
      }),
    );
  }

  /** Capture the selected closed chain as this piece's loop. */
  function setCutLoop(pieceId: EntityId): void {
    const result = pieceCreationFromSelection(pattern(), selectedEntityIds.value, pieceId);
    if (!result.ok) {
      error.value = result.message;
      return;
    }
    if (
      run(() =>
        dispatch({
          id: nextCommandId('loop'),
          type: 'set_piece_loop',
          params: { piece: pieceId, edges: result.edges, allowance: 'default' },
        }),
      )
    ) {
      setActiveTab(pieceTab(pieceId));
    }
  }

  function clearCutLoop(pieceId: EntityId): void {
    run(() =>
      dispatch({
        id: nextCommandId('loop'),
        type: 'set_piece_loop',
        params: { piece: pieceId, edges: [] },
      }),
    );
  }

  /** Rename, re-quantify or clear fields on a piece. */
  function onUpdatePiece(
    id: EntityId,
    patch: {
      name?: string | null;
      quantity?: number | null;
      notes?: string | null;
      fabric?: string | null;
      color?: string | null;
    },
  ): void {
    run(() =>
      dispatch({
        id: nextCommandId('piece'),
        type: 'update_piece',
        params: { id, ...patch },
      }),
    );
  }

  /** Set or remove one edge's allowance; `null` removes the strip. */
  function onSetPieceAllowance(
    piece: EntityId,
    edge: EntityId,
    value: { kind: AllowanceKind; width: number } | null,
  ): void {
    run(() =>
      dispatch({
        id: nextCommandId('allowance'),
        type: 'set_piece_allowance',
        params:
          value === null
            ? { piece, edge, remove: true }
            : { piece, edge, width: value.width, kind: value.kind },
      }),
    );
  }

  /** Set or remove one rounded corner's own cut width. */
  function onSetPieceCornerAllowance(
    piece: EntityId,
    round: EntityId,
    value: { cutWidth: number } | null,
  ): void {
    if (value === null) {
      run(() =>
        dispatch({
          id: nextCommandId('corner-allowance'),
          type: 'set_piece_corner_allowance',
          params: { piece, round, remove: true },
        }),
      );
      return;
    }

    run(() =>
      dispatch({
        id: nextCommandId('corner-allowance'),
        type: 'set_piece_corner_allowance',
        params: { piece, round, cutWidth: value.cutWidth },
      }),
    );
  }

  /** Set one finished width on every selected edge, keeping each fold kind. */
  function onSetAllowanceWidths(changes: AllowanceEdgeWidth[], width: number): void {
    const piece = activePiece.value;
    /* v8 ignore next -- the card renders only for the active piece */
    if (piece === null) return;

    run(() =>
      dispatchGroup(
        changes.map((change) => ({
          id: nextCommandId('allowance'),
          type: 'set_piece_allowance',
          params: { piece: piece.id, edge: change.edge, width, kind: change.kind },
        })),
      ),
    );
  }

  /** Remove the allowance strip from every selected edge as one undo step. */
  function onRemoveAllowanceEdges(edges: EntityId[]): void {
    const piece = activePiece.value;
    /* v8 ignore next -- the card renders only for the active piece */
    if (piece === null) return;

    run(() =>
      dispatchGroup(
        edges.map((edge) => ({
          id: nextCommandId('allowance'),
          type: 'set_piece_allowance',
          params: { piece: piece.id, edge, remove: true },
        })),
      ),
    );
  }

  /** Give every selected corner the same own cut width as one undo step. */
  function onSetCornerAllowanceWidths(rounds: EntityId[], cutWidth: number): void {
    const piece = activePiece.value;
    /* v8 ignore next -- the card renders only for the active piece */
    if (piece === null) return;

    run(() =>
      dispatchGroup(
        rounds.map((round) => ({
          id: nextCommandId('corner-allowance'),
          type: 'set_piece_corner_allowance',
          params: { piece: piece.id, round, cutWidth },
        })),
      ),
    );
  }

  /** Drop every selected corner's own width back to its edges, as one undo step. */
  function onClearCornerAllowanceWidths(rounds: EntityId[]): void {
    const piece = activePiece.value;
    /* v8 ignore next -- the card renders only for the active piece */
    if (piece === null) return;

    run(() =>
      dispatchGroup(
        rounds.map((round) => ({
          id: nextCommandId('corner-allowance'),
          type: 'set_piece_corner_allowance',
          params: { piece: piece.id, round, remove: true },
        })),
      ),
    );
  }

  /** One command per selected region, dispatched as one undo step. */
  function onApplyAllowances(edit: BulkAllowanceEdit): void {
    const piece = activePiece.value;
    /* v8 ignore next -- the card emits only for the active piece */
    if (piece === null) return;

    const commands = allowanceEditCommands(
      pattern(),
      piece,
      selectedAllowanceTargets.value,
      edit,
      nextCommandId,
    );
    if (commands.length === 0) return;
    run(() => dispatchGroup(commands));
  }

  /** Set, clear or inherit a piece's allowance default. */
  function onSetPieceDefault(
    piece: EntityId,
    value:
      | { mode: 'inherit' }
      | { mode: 'none' }
      | { mode: 'preset'; width: ParamInput; kind: AllowanceKind },
  ): void {
    run(() =>
      dispatch({
        id: nextCommandId('piece-default'),
        type: 'set_piece_default_allowance',
        params: { piece, ...value },
      }),
    );
  }

  /** The deletion warning for a placed piece: how often and where it is placed. */
  function placedPieceWarning(piece: Piece): string | null {
    const placements = pattern().assemblies.flatMap((assembly) =>
      assembly.instances.filter((instance) => instance.piece === piece.id),
    );
    if (placements.length === 0) return null;
    const assemblies = pattern().assemblies.filter((assembly) =>
      assembly.instances.some((instance) => instance.piece === piece.id),
    ).length;
    const name = piece.name?.trim() || `Piece ${piece.id}`;
    return `${name} is placed ${placements.length} time${
      placements.length === 1 ? '' : 's'
    } in ${assemblies} assembl${assemblies === 1 ? 'y' : 'ies'}. Remove it and its instances?`;
  }

  function onRemovePiece(id: EntityId): void {
    const piece = pieceById(pattern(), id);
    /* v8 ignore next -- the card renders only for an existing piece */
    const warning = piece === undefined ? null : placedPieceWarning(piece);
    if (warning !== null && !window.confirm(warning)) return;
    if (run(() => dispatch({ id: nextCommandId('piece'), type: 'delete_piece', params: { id } }))) {
      selectedEntityIds.value = [];
      selectedInstanceId.value = null;
    }
  }

  return {
    applyDefaultAllowance,
    onSetAllAllowances,
    onSetRole,
    onUpdateText,
    setCutLoop,
    clearCutLoop,
    onUpdatePiece,
    onSetPieceAllowance,
    onSetPieceCornerAllowance,
    onSetAllowanceWidths,
    onRemoveAllowanceEdges,
    onSetCornerAllowanceWidths,
    onClearCornerAllowanceWidths,
    onApplyAllowances,
    onSetPieceDefault,
    onRemovePiece,
  };
}
