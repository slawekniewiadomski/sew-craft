import type {
  CornerRound,
  EntityId,
  Param,
  ParamInput,
  PatternDocument,
  PointEntity,
  Vec2,
} from '@sewcraft/geometry';
import {
  cornerRoundGeometry,
  cornerRounds,
  cornerRoundsForEntity,
  resolveParam,
} from '@sewcraft/geometry';
import { computed, nextTick, ref, type ComputedRef } from 'vue';

import { curvePath } from '@/lib/canvas-render';
import {
  cornerRoundLabel,
  cornerRoundPreview,
  formatCornerRadius,
  formatCornerRadiusParam,
  parseCornerRadiusField,
  roundableCorners,
  sameCornerRadiusParam,
  tangentDragRadius,
  type CornerRoundLabel,
  type CornerRoundPicks,
} from '@/lib/corner-round';
import { insertVariableToken, variableQuery } from '@/lib/formula';
import type { EditorTool } from '@/lib/editor-tools';
import { screenToWorld, worldToScreen, type Viewport } from '@/lib/viewport';

/** A tangent handle of a selected round, positioned in screen space. */
export interface CornerRoundHandleView {
  id: EntityId;
  endIndex: 0 | 1;
  x: number;
  y: number;
}

/** The `R 12` label of a selected round, positioned in screen space. */
export interface CornerRoundLabelView extends CornerRoundLabel {
  round: CornerRound;
  screenX: number;
  screenY: number;
}

export interface CornerRoundEditOptions {
  document: () => PatternDocument;
  tool: () => EditorTool;
  constraintActive: () => boolean;
  selectedEntityIds: () => EntityId[];
  roundCornerPicks: () => CornerRoundPicks;
  roundCornerActive: () => boolean;
  cornerRoundPreviewRadius: () => number | null;
  visiblePoints: ComputedRef<PointEntity[]>;
  pointById: ComputedRef<Map<EntityId, PointEntity>>;
  viewport: () => Viewport;
  screenPoint: (event: { clientX: number; clientY: number }) => Vec2;
  beginPointerTracking: () => void;
  openVariablePicker: (field: 'corner-round', id: EntityId, text: string | null) => void;
  closeVariablePicker: () => void;
  onVariablePickerKeydown: (field: 'corner-round', id: EntityId, event: KeyboardEvent) => boolean;
  onSetRadius: (id: EntityId, radius: ParamInput) => void;
}

/**
 * Corner-round editing: the handles and `R` labels shown for selected or hovered
 * rounds, the tangent-handle drag, and the inline radius editor with its `$`
 * variable picker.
 *
 * The canvas owns pointer hits and the shared variable picker; this owns the
 * round-specific feedback and edit lifecycle.
 */
export function useCornerRoundEdit({
  document,
  tool,
  constraintActive,
  selectedEntityIds,
  roundCornerPicks,
  roundCornerActive,
  cornerRoundPreviewRadius,
  visiblePoints,
  pointById,
  viewport,
  screenPoint,
  beginPointerTracking,
  openVariablePicker,
  closeVariablePicker,
  onVariablePickerKeydown,
  onSetRadius,
}: CornerRoundEditOptions) {
  const hoveredRoundId = ref<EntityId | null>(null);
  const tangentDrag = ref<{
    id: EntityId;
    endIndex: 0 | 1;
    radius: number;
    startRadius: number;
  } | null>(null);
  const editingCornerRound = ref<{
    id: EntityId;
    value: string;
    startParam: Param;
    x: number;
    y: number;
  } | null>(null);
  const cornerRoundInput = ref<HTMLInputElement | null>(null);

  const roundPickedLineIds = computed(() => {
    const picks = [roundCornerPicks().first, roundCornerPicks().second];
    return new Set(picks.filter((id): id is EntityId => id !== null));
  });

  /**
   * The live tool preview: trimmed lines, tangent dots and a dashed arc.
   */
  const roundPreview = computed(() => {
    const radius = cornerRoundPreviewRadius();
    if (!roundCornerActive() || radius === null) return null;
    return cornerRoundPreview(document(), roundCornerPicks(), radius);
  });

  /**
   * Corners the Round corner tool can act on, drawn as small rings while it is
   * active.
   */
  const roundableCornerPoints = computed(() => {
    const ids = new Set(roundableCorners(document()));
    return visiblePoints.value.filter((point) => ids.has(point.id));
  });

  /**
   * Every round's derived feature points — the radius centre and both tangency
   * points — as always-visible construction marks.
   */
  const cornerRoundFeaturePoints = computed<PointEntity[]>(() =>
    cornerRounds(document()).flatMap((round) =>
      [round.center, round.ends[0].tangent, round.ends[1].tangent].flatMap((id) => {
        if (id === undefined) return [];
        const point = pointById.value.get(id);
        return point === undefined ? [] : [point];
      }),
    ),
  );

  /** Rounds whose handles and label are visible: selected, hovered or dragging. */
  const activeRounds = computed<CornerRound[]>(() => {
    const rounds: CornerRound[] = [];
    const add = (round: CornerRound | undefined): void => {
      if (round !== undefined && !rounds.some((candidate) => candidate.id === round.id)) {
        rounds.push(round);
      }
    };

    if (selectedEntityIds().length > 0) {
      selectedEntityIds().forEach((id) => cornerRoundsForEntity(document(), id).forEach(add));
    }
    if (hoveredRoundId.value !== null) {
      add(cornerRounds(document()).find((round) => round.id === hoveredRoundId.value));
    }
    if (tangentDrag.value !== null) {
      add(cornerRounds(document()).find((round) => round.id === tangentDrag.value!.id));
    }

    return rounds;
  });

  /** A selected round promotes its three feature dots to the primary colour. */
  function featurePointClass(point: PointEntity): string {
    const selected = activeRounds.value.some(
      (round) => round.center === point.id || round.ends.some((end) => end.tangent === point.id),
    );

    return selected ? 'fill-primary stroke-primary' : 'fill-background stroke-muted-foreground';
  }

  /** The radius a round shows: the dragged value while the handle is moving. */
  function radiusOf(round: CornerRound): number {
    const drag = tangentDrag.value;
    return drag !== null && drag.id === round.id
      ? drag.radius
      : resolveParam(document(), round.radius);
  }

  function roundGeometryOf(round: CornerRound): ReturnType<typeof cornerRoundGeometry>['geometry'] {
    return cornerRoundGeometry(
      document(),
      round.corner,
      round.ends[0].anchor,
      round.ends[1].anchor,
      radiusOf(round),
    ).geometry;
  }

  /** Tangent handles, in screen space so they stay a constant size at any zoom. */
  const roundHandles = computed<CornerRoundHandleView[]>(() =>
    activeRounds.value.flatMap((round) => {
      const geometry = roundGeometryOf(round);
      if (geometry === null) return [];
      return ([0, 1] as const).flatMap((endIndex) => {
        const screen = worldToScreen(
          viewport(),
          endIndex === 0 ? geometry.tangentA : geometry.tangentB,
        );
        return [{ id: round.id, endIndex, x: screen.x, y: screen.y }];
      });
    }),
  );

  /** `R 12` labels, offset outward from the arc's midpoint by a constant 18 px. */
  const roundLabels = computed<CornerRoundLabelView[]>(() =>
    activeRounds.value.flatMap((round) => {
      const label = cornerRoundLabel(document(), round);
      if (label === null) return [];

      const mid = worldToScreen(viewport(), { x: label.x, y: label.y });
      const radius = radiusOf(round);
      const text = formatCornerRadius(radius);

      return [
        {
          ...label,
          round,
          radius,
          text: `R ${text}`,
          accessible: `Corner radius ${text} millimetres`,
          screenX: mid.x + label.outwardX * 18,
          screenY: mid.y + label.outwardY * 18,
        },
      ];
    }),
  );

  /** Rounds keyed by their arc, so a double-click on the arc can find its radius. */
  const roundsByArc = computed(() => {
    const arcs = new Map<EntityId, CornerRound>();
    for (const round of cornerRounds(document())) arcs.set(round.arc, round);
    return arcs;
  });

  /** The dashed arc that follows a tangent-handle drag, before it is committed. */
  const tangentPreview = computed(() => {
    const drag = tangentDrag.value;
    if (drag === null) return null;

    const round = cornerRounds(document()).find((candidate) => candidate.id === drag.id);
    if (round === undefined) return null;

    const geometry = roundGeometryOf(round);
    if (geometry === null) return null;

    return {
      id: drag.id,
      arc: curvePath([geometry.tangentA, geometry.control1, geometry.control2, geometry.tangentB]),
      tangents: [geometry.tangentA, geometry.tangentB],
    };
  });

  /** Show a round's handles while its line or arc is hovered. */
  function onEntityHover(id: EntityId): void {
    hoveredRoundId.value = cornerRoundsForEntity(document(), id)[0]?.id ?? null;
  }

  function onEntityLeave(): void {
    hoveredRoundId.value = null;
  }

  function beginTangentDrag(round: CornerRound, endIndex: 0 | 1, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    tangentDrag.value = {
      id: round.id,
      endIndex,
      radius: radiusOf(round),
      startRadius: radiusOf(round),
    };
    beginPointerTracking();
  }

  function beginTangentDragHandle(handle: CornerRoundHandleView, event: PointerEvent): void {
    const round = cornerRounds(document()).find((candidate) => candidate.id === handle.id);
    if (round !== undefined) beginTangentDrag(round, handle.endIndex, event);
  }

  /** Update the live tangent drag; returns whether it consumed the move. */
  function onDragMove(screen: Vec2): boolean {
    if (tangentDrag.value === null) return false;
    const drag = tangentDrag.value;
    const round = cornerRounds(document()).find((candidate) => candidate.id === drag.id);
    if (round !== undefined) {
      const radius = tangentDragRadius(
        document(),
        round,
        drag.endIndex,
        screenToWorld(viewport(), screen),
      );
      if (radius !== null) tangentDrag.value = { ...drag, radius };
    }
    return true;
  }

  function commitDrag(): void {
    const drag = tangentDrag.value!;
    tangentDrag.value = null;
    if (drag.radius !== drag.startRadius) {
      onSetRadius(drag.id, drag.radius);
    }
  }

  function cancelDrag(): void {
    tangentDrag.value = null;
  }

  /** Open the inline radius field for a round, anchored at a screen position. */
  async function openEditor(round: CornerRound, x: number, y: number): Promise<void> {
    editingCornerRound.value = {
      id: round.id,
      value: formatCornerRadiusParam(round.radius),
      startParam: round.radius,
      x,
      y,
    };
    closeVariablePicker();
    await nextTick();
    cornerRoundInput.value!.focus();
    cornerRoundInput.value!.select();
  }

  /** Double-clicking a rounded arc opens the same radius field as the `R` label. */
  function onCurveDoubleClick(id: EntityId, event: MouseEvent): void {
    if (tool() !== 'select' || constraintActive()) return;

    const round = roundsByArc.value.get(id);
    if (round === undefined) return;

    const point = screenPoint(event);
    void openEditor(round, point.x, point.y);
  }

  function onEditInput(event: Event): void {
    const editing = editingCornerRound.value!;
    const value = (event.target as HTMLInputElement).value;
    editingCornerRound.value = { ...editing, value };
    openVariablePicker('corner-round', editing.id, variableQuery(value));
  }

  /** Arrow keys drive the `$` picker; Enter commits, Escape cancels. */
  function onEditorKeydown(event: KeyboardEvent): void {
    if (onVariablePickerKeydown('corner-round', editingCornerRound.value!.id, event)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      applyEdit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  /** Enter: apply a valid radius or formula, otherwise keep editing to fix it. */
  function applyEdit(): void {
    const editing = editingCornerRound.value!;
    const field = parseCornerRadiusField(document(), editing.value);
    if (field.kind === 'invalid') return;

    editingCornerRound.value = null;
    closeVariablePicker();
    if (!sameCornerRadiusParam(editing.startParam, field.param)) {
      onSetRadius(editing.id, field.param);
    }
  }

  /** Blur: commit a valid edit and discard an invalid one. */
  function finishEdit(): void {
    // Removing the focused input fires a final blur; there is nothing to commit.
    if (editingCornerRound.value === null) return;

    const editing = editingCornerRound.value;
    const field = parseCornerRadiusField(document(), editing.value);
    editingCornerRound.value = null;
    closeVariablePicker();
    if (field.kind === 'param' && !sameCornerRadiusParam(editing.startParam, field.param)) {
      onSetRadius(editing.id, field.param);
    }
  }

  function cancelEdit(): void {
    editingCornerRound.value = null;
    closeVariablePicker();
  }

  /** Insert a picked `$` token into the open radius field. */
  function applyVariableToken(slug: string): void {
    const editing = editingCornerRound.value!;
    editingCornerRound.value = { ...editing, value: insertVariableToken(editing.value, slug) };
  }

  function resetOnToolChange(): void {
    hoveredRoundId.value = null;
    tangentDrag.value = null;
    editingCornerRound.value = null;
  }

  function cancelOnDocumentChange(): void {
    editingCornerRound.value = null;
  }

  return {
    roundPickedLineIds,
    roundPreview,
    roundableCornerPoints,
    cornerRoundFeaturePoints,
    featurePointClass,
    roundHandles,
    roundLabels,
    tangentPreview,
    tangentDrag,
    editingCornerRound,
    cornerRoundInput,
    onEntityHover,
    onEntityLeave,
    beginTangentDragHandle,
    onDragMove,
    commitDrag,
    cancelDrag,
    onCurveDoubleClick,
    onEditInput,
    onEditorKeydown,
    finishEdit,
    cancelEdit,
    applyVariableToken,
    resetOnToolChange,
    cancelOnDocumentChange,
    openEditor,
  };
}
