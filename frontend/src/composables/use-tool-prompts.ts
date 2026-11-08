import type {
  AddConstraintParams,
  Command,
  ConstraintType,
  EntityId,
  ParamInput,
  PatternDocument,
} from '@sewcraft/geometry';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { EditorTool } from '@/lib/editor-tools';
import { nextCommandId } from '@/lib/command-ids';
import {
  applyConstraintPick,
  constraintInitialValue,
  constraintPrompt,
  constraintRejection,
  constraintValueSpec,
  prunePicks,
  type ConstraintPick,
} from '@/lib/constraint-tools';
import {
  applyCornerRoundPick,
  cornerRoundPrompt,
  cornerRoundRejection,
  defaultCornerRadius,
  emptyCornerRoundPicks,
  formatCornerRadius,
  maxCornerRadiusForLines,
  type CornerRoundPicks,
} from '@/lib/corner-round';

export interface ToolPromptsOptions {
  pattern: () => PatternDocument;
  activeTool: Ref<EditorTool>;
  selectedEntityIds: Ref<EntityId[]>;
  activePieceId: ComputedRef<EntityId | null>;
  /** The view's command wrapper; it reports failures through its error strip. */
  run: (action: () => void) => boolean;
  dispatch: (command: Command) => void;
}

/**
 * The two modal pickers above the canvas: a constraint mode and the
 * corner-round tool. Each collects picks, rejects an impossible pair with a
 * reason and either applies the command directly or arms a value prompt.
 *
 * The active tool and the selection stay with the view; this owns the picks,
 * the prompt text and the apply/exit paths.
 */
export function useToolPrompts({
  pattern,
  activeTool,
  selectedEntityIds,
  activePieceId,
  run,
  dispatch,
}: ToolPromptsOptions) {
  const activeConstraint = ref<ConstraintType | null>(null);
  const constraintPicks = ref<ConstraintPick[]>([]);
  const pendingConstraint = ref<AddConstraintParams | null>(null);
  const constraintRejectionMessage = ref<string | null>(null);
  const cornerRoundPicks = ref<CornerRoundPicks>(emptyCornerRoundPicks());
  const cornerRoundRejectionMessage = ref<string | null>(null);
  const cornerRoundPreviewRadius = ref<number | null>(null);

  const constraintPromptText = computed(() =>
    activeConstraint.value === null
      ? ''
      : constraintPrompt(activeConstraint.value, constraintPicks.value),
  );
  const constraintValueReady = computed(
    () => activeConstraint.value !== null && pendingConstraint.value !== null,
  );
  const constraintInitial = computed(() =>
    activeConstraint.value === null || pendingConstraint.value === null
      ? ''
      : constraintInitialValue(activeConstraint.value, constraintPicks.value, pattern()),
  );

  const cornerRoundActive = computed(() => activeTool.value === 'round_corner');
  const cornerRoundMax = computed(() => {
    const { first, second } = cornerRoundPicks.value;
    if (first === null || second === null) return null;
    return maxCornerRadiusForLines(pattern(), first, second);
  });
  const cornerRoundReady = computed(
    () => cornerRoundMax.value !== null && cornerRoundMax.value >= 0.001,
  );
  const cornerRoundPromptText = computed(() => cornerRoundPrompt(cornerRoundPicks.value));
  const cornerRoundInitial = computed(() =>
    cornerRoundMax.value === null
      ? ''
      : formatCornerRadius(defaultCornerRadius(cornerRoundMax.value)),
  );

  function exitConstraint(): void {
    activeConstraint.value = null;
    constraintPicks.value = [];
    pendingConstraint.value = null;
    constraintRejectionMessage.value = null;
  }

  function exitCornerRound(): void {
    cornerRoundPicks.value = emptyCornerRoundPicks();
    cornerRoundRejectionMessage.value = null;
    cornerRoundPreviewRadius.value = null;
  }

  function selectConstraint(type: ConstraintType): void {
    if (activeConstraint.value === type) {
      exitConstraint();
      return;
    }

    exitCornerRound();
    activeConstraint.value = type;
    activeTool.value = 'select';
    selectedEntityIds.value = [];
    constraintPicks.value = [];
    pendingConstraint.value = null;
    constraintRejectionMessage.value = null;
  }

  function dispatchConstraint(params: AddConstraintParams): boolean {
    return run(() =>
      dispatch({
        id: nextCommandId('constraint'),
        type: 'add_constraint',
        params: {
          ...params,
          /* v8 ignore next -- the canvas only exists inside a piece tab */
          ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
        },
      }),
    );
  }

  function onConstraintPick(pick: ConstraintPick): void {
    const type = activeConstraint.value!;
    if (pendingConstraint.value !== null) return;

    const result = applyConstraintPick({ type, picks: constraintPicks.value }, pick, pattern());
    if (result.status === 'rejected') {
      constraintRejectionMessage.value = constraintRejection(result.reason);
      return;
    }

    constraintRejectionMessage.value = null;
    constraintPicks.value = result.picks;

    if (result.status === 'picking') return;

    if (constraintValueSpec(type) !== null) {
      pendingConstraint.value = result.params;
      return;
    }

    if (dispatchConstraint(result.params)) {
      constraintPicks.value = [];
    }
  }

  function applyConstraintValue(value: ParamInput): void {
    const params = pendingConstraint.value!;

    if (dispatchConstraint({ ...params, value })) {
      pendingConstraint.value = null;
      constraintPicks.value = [];
      constraintRejectionMessage.value = null;
    }
  }

  /** One line pick: fill a slot or reject the pair with a concrete reason. */
  function onRoundCornerPick(id: EntityId): void {
    const result = applyCornerRoundPick(cornerRoundPicks.value, id, pattern());
    if (result.status === 'rejected') {
      cornerRoundRejectionMessage.value = cornerRoundRejection(result.reason);
      return;
    }

    cornerRoundRejectionMessage.value = null;
    cornerRoundPicks.value = result.picks;
    if (result.status === 'picking') cornerRoundPreviewRadius.value = null;
  }

  /** Apply keeps the tool armed for the next corner, like the other tools. */
  function applyCornerRound(radius: ParamInput): void {
    const { first, second } = cornerRoundPicks.value;
    if (first === null || second === null) return;

    const applied = run(() =>
      dispatch({
        id: nextCommandId('corner-round'),
        type: 'add_corner_round',
        params: { first, second, radius },
      }),
    );
    if (applied) exitCornerRound();
  }

  // Undo, redo or a load can remove a picked entity while a mode is armed.
  watch(pattern, (next) => {
    if (activeConstraint.value !== null) {
      const pruned = prunePicks(constraintPicks.value, next);
      if (pruned.length !== constraintPicks.value.length) {
        constraintPicks.value = pruned;
        pendingConstraint.value = null;
        constraintRejectionMessage.value = null;
      }
    }

    const picks = cornerRoundPicks.value;
    if (picks.first === null && picks.second === null) return;

    const exists = (id: EntityId | null): boolean =>
      id === null || next.entities.some((entity) => entity.id === id);
    if (!exists(picks.first) || !exists(picks.second)) exitCornerRound();
  });

  return {
    activeConstraint,
    constraintPicks,
    constraintRejectionMessage,
    cornerRoundPicks,
    cornerRoundRejectionMessage,
    cornerRoundPreviewRadius,
    constraintPromptText,
    constraintValueReady,
    constraintInitial,
    cornerRoundActive,
    cornerRoundMax,
    cornerRoundReady,
    cornerRoundPromptText,
    cornerRoundInitial,
    exitConstraint,
    exitCornerRound,
    selectConstraint,
    onConstraintPick,
    applyConstraintValue,
    onRoundCornerPick,
    applyCornerRound,
  };
}
