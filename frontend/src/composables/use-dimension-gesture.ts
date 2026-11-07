import type {
  CutAnchor,
  DerivedDistanceConstraint,
  DimensionOrientation,
  DistanceConstraint,
  EntityId,
  PatternDocument,
  Piece,
  Vec2,
} from '@sewcraft/geometry';
import {
  constraintOffset,
  constraintOrientation,
  cutAnchorIssue,
  DEFAULT_DIMENSION_OFFSET,
  dimensionOffsetForPointer,
  dimensionOffsetFromSpan,
  distanceAnchorIssue,
  inferDimensionOrientation,
  inferOrientationFromSpan,
  resolveCutSpan,
  usesCutEdgeAnchor,
} from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import type { CutDimensionPlacement, DimensionPatch, DimensionPlacement } from '@/lib/dimensions';
import {
  cutAnchorPreviewPosition,
  cutEdgeCandidateFor,
  cutGhostFor,
  cutLoopCandidateFor,
  cutPointCandidateFor,
  dimensionCandidateFor,
  dimensionGhostFor,
  dimensionPickFor,
  pickPreviewPosition,
  pickPreviewTick,
  type CutPick,
  type DimensionPick,
  type FeedbackHit,
} from '@/lib/dimension-feedback';
import { anchorForEdge, anchorForPoint, pieceOwningEdge, piecesAtPoint } from '@/lib/pieces';
import { applySelection, selectionModeFrom, toggleSelection } from '@/lib/selection';
import { screenToWorld, type Viewport } from '@/lib/viewport';
import type { EditorTool } from '@/lib/editor-tools';

/** One derived loop corner the armed cut tool offers as a pick target. */
export interface LoopHandle {
  key: string;
  piece: Piece;
  anchor: CutAnchor;
  point: Vec2;
}

interface CanvasHit {
  id: EntityId;
  kind: string;
}

export interface DimensionGestureOptions {
  document: () => PatternDocument;
  tool: () => EditorTool;
  readOnly: () => boolean;
  constraintActive: () => boolean;
  selectedDimensionIds: () => EntityId[];
  viewport: () => Viewport;
  beginPointerTracking: () => void;
  onAddDimension: (placement: DimensionPlacement) => void;
  onAddCutDimension: (placement: CutDimensionPlacement) => void;
  onUpdateDimension: (id: EntityId, patch: DimensionPatch) => void;
  onSelectDimensions: (ids: EntityId[]) => void;
  onSelectEntities: (ids: EntityId[]) => void;
}

/** The hint shown for each shared pick-time anchor rejection. */
const DIMENSION_ANCHOR_HINTS: Record<string, string> = {
  missing: 'Pick a point or a straight line.',
  'not-a-line': 'Pick a point or a straight line.',
  'not-parallel': 'Pick two parallel lines — use Angle for a corner.',
  'point-on-line': 'The point lies on the line.',
  coincident: 'The lines are coincident.',
  'zero-length': 'Pick a point or a straight line.',
};

/** The hint shown for each shared cut-anchor rejection. */
const CUT_ANCHOR_HINTS: Record<string, string> = {
  missing: 'Pick a seamline or cut corner, or a straight edge, of a piece.',
  'not-straight': 'Pick a straight edge.',
  'different-piece': 'Both anchors must belong to the same piece.',
  'same-anchor': 'The anchors must be different.',
  'not-parallel': 'Pick two parallel edges.',
  'zero-span': 'The anchors must be different.',
};

/** Whether a rejection resets the first pick instead of keeping it pending. */
const CUT_ANCHOR_CLEARS_PENDING: Record<string, boolean> = {
  missing: true,
  'not-straight': true,
  'different-piece': true,
  'same-anchor': false,
  'not-parallel': false,
  'zero-span': false,
};

/**
 * The Dimension and Cut dimension gestures: two-anchor picking, live placement,
 * and dragging an already placed dimension line. Picking, placement and drag
 * state live here; the canvas only decides which pointer event is a pick and
 * which is a drag.
 */
export function useDimensionGesture({
  document,
  tool,
  readOnly,
  constraintActive,
  selectedDimensionIds,
  viewport,
  beginPointerTracking,
  onAddDimension,
  onAddCutDimension,
  onUpdateDimension,
  onSelectDimensions,
  onSelectEntities,
}: DimensionGestureOptions) {
  const dimensionPending = ref<DimensionPick[]>([]);
  const dimensionHint = ref<string | null>(null);
  const dimensionPlacement = ref<DimensionPlacement | null>(null);
  const cutDimensionPending = ref<CutPick | null>(null);
  const cutDimensionPlacement = ref<CutDimensionPlacement | null>(null);
  const cutDimensionHint = ref<string | null>(null);
  const hoveredPick = ref<FeedbackHit | null>(null);
  const hoveredLoopHandle = ref<LoopHandle | null>(null);
  const pointerWorld = ref<Vec2 | null>(null);
  const dimensionDrag = ref<{
    id: EntityId;
    a: EntityId;
    b: EntityId;
    orientation: DimensionOrientation;
    startOffset: number;
    offset: number;
  } | null>(null);
  const derivedDrag = ref<{
    id: EntityId;
    orientation: DimensionOrientation;
    startOffset: number;
    offset: number;
    span: { a: Vec2; b: Vec2 };
  } | null>(null);

  /** The cut tool's status message: a rejection, a next-pick prompt, or the idle cue. */
  const cutDimensionHintText = computed<string | null>(() => {
    if (cutDimensionHint.value !== null) return cutDimensionHint.value;
    if (tool() !== 'cut_dimension' || cutDimensionPlacement.value !== null) return null;
    if (cutDimensionPending.value !== null) return 'Pick the second anchor on the same piece.';
    return 'Pick a seamline or cut corner, or a straight edge, of one piece.';
  });

  /** The Dimension tool's status message: a rejection, or the next pick prompt. */
  const dimensionHintText = computed<string | null>(() => {
    if (dimensionHint.value !== null) return dimensionHint.value;
    if (dimensionPlacement.value !== null) return null;
    if (dimensionPending.value.length > 0) return 'Pick the second anchor.';
    return tool() === 'dimension' ? 'Pick a point or a line.' : null;
  });

  /** Whether a dimension tool owns the pointer feedback. */
  const dimensionToolArmed = computed(() => tool() === 'dimension' || tool() === 'cut_dimension');

  /** The first anchor of the gesture, pending or already being placed. */
  const dimensionFirstPick = computed<DimensionPick | null>(() => {
    const pendingPick = dimensionPending.value[0];
    if (pendingPick !== undefined) return pendingPick;
    const placement = dimensionPlacement.value;
    return placement === null ? null : dimensionPickFor(document(), { id: placement.a, kind: '' });
  });

  /** The second anchor of a dimension already being placed. */
  const dimensionSecondPick = computed<DimensionPick | null>(() => {
    const placement = dimensionPlacement.value;
    return placement === null ? null : dimensionPickFor(document(), { id: placement.b, kind: '' });
  });

  /** The eligible anchor under the pointer, validated against a pending first pick. */
  const dimensionCandidate = computed<DimensionPick | null>(() => {
    if (tool() !== 'dimension' || readOnly() || dimensionPlacement.value !== null) return null;
    return dimensionCandidateFor(document(), hoveredPick.value, dimensionFirstPick.value);
  });

  /** The cut corner under the pointer, same-piece only after the first corner. */
  const cutPointCandidate = computed(() => {
    if (tool() !== 'cut_dimension' || readOnly() || cutDimensionPlacement.value !== null) {
      return null;
    }
    const loopHandle = hoveredLoopHandle.value;
    if (loopHandle !== null) {
      return cutLoopCandidateFor(document(), loopHandle, cutDimensionPending.value);
    }
    return cutPointCandidateFor(document(), hoveredPick.value, cutDimensionPending.value);
  });

  /** A whole piece edge under the pointer; it skips the ghost stage. */
  const cutEdgeCandidate = computed(() => {
    if (
      tool() !== 'cut_dimension' ||
      readOnly() ||
      cutDimensionPending.value !== null ||
      cutDimensionPlacement.value !== null ||
      hoveredLoopHandle.value !== null
    ) {
      return null;
    }
    return cutEdgeCandidateFor(document(), hoveredPick.value);
  });

  /** The dashed guide from the first Dimension pick, snapped when a candidate is valid. */
  const dimensionGhost = computed(() => {
    if (tool() !== 'dimension' || readOnly() || dimensionPlacement.value !== null) return null;
    return dimensionGhostFor(
      document(),
      dimensionPending.value[0] ?? null,
      dimensionCandidate.value,
      pointerWorld.value,
    );
  });

  /** The dashed guide from the first cut corner to the pointer or a same-piece corner. */
  const cutDimensionGhost = computed(() => {
    if (tool() !== 'cut_dimension' || readOnly() || cutDimensionPlacement.value !== null) {
      return null;
    }
    return cutGhostFor(
      document(),
      cutDimensionPending.value,
      cutPointCandidate.value,
      pointerWorld.value,
    );
  });

  function idSet(id: EntityId | null): Set<EntityId> {
    return new Set(id === null ? [] : [id]);
  }

  const dimensionFirstPickPointIds = computed(() => {
    const pick = dimensionFirstPick.value;
    return idSet(pick !== null && pick.kind === 'point' ? pick.id : null);
  });

  const dimensionFirstPickLineIds = computed(() => {
    const pick = dimensionFirstPick.value;
    return idSet(pick !== null && pick.kind === 'line' ? pick.id : null);
  });

  const dimensionSecondPickPointIds = computed(() => {
    const pick = dimensionSecondPick.value;
    return idSet(pick !== null && pick.kind === 'point' ? pick.id : null);
  });

  const dimensionSecondPickLineIds = computed(() => {
    const pick = dimensionSecondPick.value;
    return idSet(pick !== null && pick.kind === 'line' ? pick.id : null);
  });

  const dimensionPickPointIds = computed(() => {
    const ids = new Set(dimensionFirstPickPointIds.value);
    for (const id of dimensionSecondPickPointIds.value) ids.add(id);
    return ids;
  });

  const dimensionPickLineIds = computed(() => {
    const ids = new Set(dimensionFirstPickLineIds.value);
    for (const id of dimensionSecondPickLineIds.value) ids.add(id);
    return ids;
  });

  const dimensionCandidatePointIds = computed(() => {
    const pick = dimensionCandidate.value;
    return idSet(pick !== null && pick.kind === 'point' ? pick.id : null);
  });

  const dimensionCandidateLineIds = computed(() => {
    const pick = dimensionCandidate.value;
    return idSet(pick !== null && pick.kind === 'line' ? pick.id : null);
  });

  const cutCandidatePointIds = computed(() => idSet(cutPointCandidate.value?.pointId ?? null));
  const cutEdgeCandidateIds = computed(() => idSet(cutEdgeCandidate.value?.edge ?? null));
  const cutCandidateKeys = computed(() => {
    const key = cutPointCandidate.value?.key;
    return new Set(key === undefined ? [] : [key]);
  });

  const dimensionFirstPickPoint = computed<Vec2 | null>(() => {
    const pick = dimensionFirstPick.value;
    return pick !== null && pick.kind === 'point' ? pickPreviewPosition(document(), pick) : null;
  });

  const dimensionFirstPickTick = computed(() => {
    const pick = dimensionFirstPick.value;
    return pick !== null && pick.kind === 'line' ? pickPreviewTick(document(), pick) : null;
  });

  const dimensionSecondPickPoint = computed<Vec2 | null>(() => {
    const pick = dimensionSecondPick.value;
    return pick !== null && pick.kind === 'point' ? pickPreviewPosition(document(), pick) : null;
  });

  const dimensionSecondPickTick = computed(() => {
    const pick = dimensionSecondPick.value;
    return pick !== null && pick.kind === 'line' ? pickPreviewTick(document(), pick) : null;
  });

  const dimensionCandidatePoint = computed<Vec2 | null>(() => {
    const pick = dimensionCandidate.value;
    return pick !== null && pick.kind === 'point' ? pickPreviewPosition(document(), pick) : null;
  });

  const cutPlacementPiece = computed<Piece | null>(() => {
    const placement = cutDimensionPlacement.value;
    // The document watcher clears a placement whose piece disappears.
    return placement === null
      ? null
      : document().pieces.find((piece) => piece.id === placement.piece)!;
  });

  const cutFirstPickPosition = computed<Vec2 | null>(() => {
    const pendingPick = cutDimensionPending.value;
    if (pendingPick !== null) {
      return cutAnchorPreviewPosition(document(), pendingPick.piece, pendingPick.anchor);
    }
    const placement = cutDimensionPlacement.value;
    const piece = cutPlacementPiece.value;
    return placement === null || piece === null
      ? null
      : cutAnchorPreviewPosition(document(), piece, placement.a);
  });

  const cutSecondPickPosition = computed<Vec2 | null>(() => {
    const placement = cutDimensionPlacement.value;
    const piece = cutPlacementPiece.value;
    return placement === null || piece === null
      ? null
      : cutAnchorPreviewPosition(document(), piece, placement.b);
  });

  /** Committed dimensions can be dragged only with the tools that own a placed line. */
  const dragEnabled = computed(
    () =>
      !constraintActive() &&
      (tool() === 'select' || tool() === 'dimension' || tool() === 'cut_dimension'),
  );

  const dragging = computed(() => dimensionDrag.value !== null || derivedDrag.value !== null);

  /** Dimension placement: every dimension picks two anchors, then drops the line. */
  function onDimensionPointer(hit: CanvasHit | null): void {
    if (dimensionPlacement.value !== null) {
      commitDimensionPlacement();
      return;
    }

    if (hit === null) {
      dimensionPending.value = [];
      dimensionHint.value = null;
      return;
    }

    if (hit.kind !== 'point' && hit.kind !== 'line') {
      dimensionHint.value = 'Pick a point or a straight line.';
      return;
    }

    const pick: DimensionPick = { id: hit.id, kind: hit.kind };
    const pending = dimensionPending.value;
    if (pending.length === 0) {
      dimensionPending.value = [pick];
      dimensionHint.value = null;
      return;
    }

    // Clicking the same anchor twice is a no-op, not a zero-length dimension.
    if (pending[0]!.id === pick.id) return;

    const issue = distanceAnchorIssue(document(), pending[0]!.id, pick.id);
    if (issue.reason !== null) {
      dimensionHint.value = DIMENSION_ANCHOR_HINTS[issue.reason]!;
      return;
    }

    dimensionPending.value = [];
    dimensionHint.value = null;
    startDimensionPlacement(pending[0]!.id, pick.id);
  }

  function startDimensionPlacement(a: EntityId, b: EntityId): void {
    dimensionPlacement.value = {
      a,
      b,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    };
  }

  function commitDimensionPlacement(): void {
    const placement = dimensionPlacement.value!;
    dimensionPlacement.value = null;
    onAddDimension(placement);
  }

  function startCutDimensionPlacement(piece: EntityId, a: CutAnchor, b: CutAnchor): void {
    cutDimensionPlacement.value = {
      piece,
      a,
      b,
      orientation: 'aligned',
      offset: DEFAULT_DIMENSION_OFFSET,
    };
  }

  function commitCutDimensionPlacement(): void {
    const placement = cutDimensionPlacement.value!;
    cutDimensionPlacement.value = null;
    cutDimensionHint.value = null;
    onAddCutDimension(placement);
  }

  /** Drop the cut tool's pending pick, placement and message. */
  function clearCutDimensionGesture(): void {
    cutDimensionPending.value = null;
    cutDimensionPlacement.value = null;
    cutDimensionHint.value = null;
  }

  /**
   * The cut tool's pick rules: two anchors of one piece, where each anchor is a
   * piece corner or a whole straight edge. A derived loop corner picked near the
   * pointer wins over the entity under it. A rejected pick leaves a hint instead
   * of emitting a command; the shared `cutAnchorIssue` decides.
   */
  function onCutDimensionPointer(hit: CanvasHit | null, loopHandle: LoopHandle | null): void {
    if (cutDimensionPlacement.value !== null) {
      commitCutDimensionPlacement();
      return;
    }

    const pending = cutDimensionPending.value;

    if (hit === null && loopHandle === null) {
      cutDimensionPending.value = null;
      cutDimensionHint.value = null;
      return;
    }

    const candidate =
      loopHandle === null
        ? cutAnchorCandidate(hit!, pending?.piece ?? null)
        : { piece: loopHandle.piece, anchor: loopHandle.anchor };

    if (candidate === null) {
      cutDimensionPending.value = null;
      cutDimensionHint.value =
        hit !== null && (hit.kind === 'curve' || hit.kind === 'arc')
          ? 'Pick a straight edge.'
          : 'Pick a seamline or cut corner, or a straight edge, of a piece.';
      return;
    }

    if (pending === null) {
      cutDimensionHint.value = null;
      cutDimensionPending.value = candidate;
      return;
    }

    const issue = cutAnchorIssue(document(), pending.piece, pending.anchor, candidate.anchor);
    if (issue.reason !== null) {
      if (CUT_ANCHOR_CLEARS_PENDING[issue.reason]) cutDimensionPending.value = null;
      cutDimensionHint.value = CUT_ANCHOR_HINTS[issue.reason]!;
      return;
    }

    cutDimensionPending.value = null;
    cutDimensionHint.value = null;
    startCutDimensionPlacement(pending.piece.id, pending.anchor, candidate.anchor);
  }

  /**
   * The cut anchor a pointer hit addresses: a corner or a whole straight edge of
   * a piece. A corner shared by several pieces prefers the pending piece.
   */
  function cutAnchorCandidate(
    hit: CanvasHit,
    pendingPiece: Piece | null,
  ): { piece: Piece; anchor: CutAnchor } | null {
    if (hit.kind === 'point') {
      const pieces = piecesAtPoint(document(), hit.id);
      const preferred =
        pendingPiece === null
          ? undefined
          : pieces.find((candidate) => candidate.id === pendingPiece.id);
      const piece = preferred ?? pieces[0];
      if (piece === undefined) return null;
      return { piece, anchor: anchorForPoint(document(), piece, hit.id)! };
    }

    if (hit.kind !== 'line') return null;
    const piece = pieceOwningEdge(document(), hit.id);
    const anchor = piece === null ? null : anchorForEdge(document(), piece, hit.id);
    return piece === null || anchor === null ? null : { piece, anchor };
  }

  /** Follow the pointer while placing a cut dimension, over the piece's cut span. */
  function updateCutDimensionPlacement(screen: Vec2): void {
    const placement = cutDimensionPlacement.value!;
    const constraint = {
      id: placement.piece,
      type: 'derived_distance' as const,
      piece: placement.piece,
      a: placement.a,
      b: placement.b,
    };
    const span = resolveCutSpan(document(), constraint);
    if (span === null) return;

    const world = screenToWorld(viewport(), screen);
    // An edge anchor has no single axis definition, so its dimension is aligned.
    const orientation = usesCutEdgeAnchor(constraint)
      ? 'aligned'
      : inferOrientationFromSpan(span, world);
    cutDimensionPlacement.value = {
      ...placement,
      orientation,
      offset: dimensionOffsetFromSpan(span, orientation, world),
    };
  }

  /** Follow the pointer while placing, choosing the axis and offset live. */
  function updateDimensionPlacement(screen: Vec2): void {
    const placement = dimensionPlacement.value!;

    const world = screenToWorld(viewport(), screen);
    const orientation = inferDimensionOrientation(document(), placement.a, placement.b, world);
    dimensionPlacement.value = {
      ...placement,
      orientation,
      offset: dimensionOffsetForPointer(document(), placement.a, placement.b, orientation, world),
    };
  }

  /**
   * Selection comes first: with the Select tool a press selects, adds or
   * subtracts the dimension; only a plain press then starts the existing drag.
   * The Dimension and Cut dimension tools keep their drag-only behaviour.
   */
  function beginDrag(
    constraint: DistanceConstraint | DerivedDistanceConstraint,
    event: PointerEvent,
  ): void {
    if (readOnly()) return;

    if (tool() === 'select') {
      const mode = selectionModeFrom(event);
      if (mode === 'replace') {
        onSelectDimensions([constraint.id]);
      } else {
        onSelectDimensions(
          mode === 'add'
            ? toggleSelection(selectedDimensionIds(), constraint.id)
            : applySelection(selectedDimensionIds(), [constraint.id], 'subtract'),
        );
        // A modified press selects only; it never starts a drag.
        event.stopPropagation();
        event.preventDefault();
        onSelectEntities([]);
        return;
      }
      // Clicks are exclusive: a dimension click clears the entity selection.
      onSelectEntities([]);
    }

    if (constraint.type === 'distance') {
      beginDimensionDrag(constraint, event);
    } else {
      beginDerivedDimensionDrag(constraint, event);
    }
  }

  function beginDimensionDrag(constraint: DistanceConstraint, event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const offset = constraintOffset(constraint);
    dimensionDrag.value = {
      id: constraint.id,
      a: constraint.a,
      b: constraint.b,
      orientation: constraintOrientation(constraint),
      startOffset: offset,
      offset,
    };
    beginPointerTracking();
  }

  /** Start dragging a cut dimension line; its span comes from the cut loop. */
  function beginDerivedDimensionDrag(
    constraint: DerivedDistanceConstraint,
    event: PointerEvent,
  ): void {
    event.stopPropagation();
    event.preventDefault();
    // The drag strip only renders for a drawing whose span already resolved.
    const span = resolveCutSpan(document(), constraint)!;
    const offset = constraintOffset(constraint);
    derivedDrag.value = {
      id: constraint.id,
      orientation: constraintOrientation(constraint),
      startOffset: offset,
      offset,
      span,
    };
    beginPointerTracking();
  }

  /** Update hover feedback; the pointer move calls this while a picker is armed. */
  function updateHover(
    hit: FeedbackHit | null,
    loopHandle: LoopHandle | null,
    world: Vec2 | null,
  ): void {
    if (!dimensionToolArmed.value || readOnly()) {
      clearHover();
      return;
    }
    hoveredPick.value = hit;
    hoveredLoopHandle.value = tool() === 'cut_dimension' ? loopHandle : null;
    pointerWorld.value = world;
  }

  function clearHover(): void {
    hoveredPick.value = null;
    hoveredLoopHandle.value = null;
    pointerWorld.value = null;
  }

  /** Dispatch a pointer press to the active dimension tool. */
  function onPick(hit: CanvasHit | null, loopHandle: LoopHandle | null): void {
    if (tool() === 'dimension') {
      onDimensionPointer(hit);
      return;
    }
    if (tool() === 'cut_dimension') {
      onCutDimensionPointer(hit, loopHandle);
    }
  }

  /** Follow the pointer while a placement is active. */
  function updatePlacements(screen: Vec2): void {
    if (dimensionPlacement.value !== null && dimensionDrag.value === null) {
      updateDimensionPlacement(screen);
    }
    if (cutDimensionPlacement.value !== null) {
      updateCutDimensionPlacement(screen);
    }
  }

  /** Update a live dimension-line drag; returns whether it consumed the move. */
  function onDragMove(screen: Vec2): boolean {
    if (dimensionDrag.value !== null) {
      const drag = dimensionDrag.value;
      dimensionDrag.value = {
        ...drag,
        offset: dimensionOffsetForPointer(
          document(),
          drag.a,
          drag.b,
          drag.orientation,
          screenToWorld(viewport(), screen),
        ),
      };
      return true;
    }

    if (derivedDrag.value !== null) {
      const drag = derivedDrag.value;
      derivedDrag.value = {
        ...drag,
        offset: dimensionOffsetFromSpan(
          drag.span,
          drag.orientation,
          screenToWorld(viewport(), screen),
        ),
      };
      return true;
    }

    return false;
  }

  /** Commit a live drag on pointer up, if its offset changed. */
  function commitDrag(): void {
    if (dimensionDrag.value !== null) {
      const { id, offset, startOffset } = dimensionDrag.value;
      dimensionDrag.value = null;
      if (offset !== startOffset) onUpdateDimension(id, { offset });
    }

    if (derivedDrag.value !== null) {
      const { id, offset, startOffset } = derivedDrag.value;
      derivedDrag.value = null;
      if (offset !== startOffset) onUpdateDimension(id, { offset });
    }
  }

  function cancelDrag(): void {
    dimensionDrag.value = null;
    derivedDrag.value = null;
  }

  /** Escape clears whichever dimension gesture is pending; returns whether it did. */
  function clearOnEscape(): boolean {
    if (
      dimensionPending.value.length > 0 ||
      dimensionPlacement.value !== null ||
      dimensionHint.value !== null
    ) {
      dimensionPending.value = [];
      dimensionPlacement.value = null;
      dimensionHint.value = null;
      return true;
    }

    if (
      cutDimensionPending.value !== null ||
      cutDimensionPlacement.value !== null ||
      cutDimensionHint.value !== null
    ) {
      clearCutDimensionGesture();
      return true;
    }

    return false;
  }

  /** A tool switch drops every pending pick, placement, hover and drag. */
  function resetOnToolChange(): void {
    dimensionPending.value = [];
    dimensionPlacement.value = null;
    dimensionHint.value = null;
    hoveredPick.value = null;
    hoveredLoopHandle.value = null;
    pointerWorld.value = null;
    clearCutDimensionGesture();
    cancelDrag();
  }

  /** A document edit drops a cut placement whose piece disappeared. */
  function pruneOnDocumentChange(): void {
    const cutPiece = cutDimensionPending.value?.piece.id ?? cutDimensionPlacement.value?.piece;
    if (cutPiece !== undefined && !document().pieces.some((piece) => piece.id === cutPiece)) {
      clearCutDimensionGesture();
      cutDimensionHint.value = 'Piece no longer exists';
    }
  }

  return {
    dimensionPending,
    dimensionPlacement,
    cutDimensionPlacement,
    dimensionDrag,
    derivedDrag,
    cutDimensionHintText,
    dimensionHintText,
    dimensionToolArmed,
    dimensionFirstPick,
    dimensionSecondPick,
    dimensionCandidate,
    cutPointCandidate,
    cutEdgeCandidate,
    dimensionGhost,
    cutDimensionGhost,
    dimensionFirstPickPointIds,
    dimensionFirstPickLineIds,
    dimensionPickPointIds,
    dimensionPickLineIds,
    dimensionCandidatePointIds,
    dimensionCandidateLineIds,
    cutCandidatePointIds,
    cutEdgeCandidateIds,
    cutCandidateKeys,
    dimensionFirstPickPoint,
    dimensionFirstPickTick,
    dimensionSecondPickPoint,
    dimensionSecondPickTick,
    dimensionCandidatePoint,
    cutFirstPickPosition,
    cutSecondPickPosition,
    dragEnabled,
    dragging,
    beginDrag,
    updateHover,
    clearHover,
    onPick,
    updatePlacements,
    onDragMove,
    commitDrag,
    cancelDrag,
    clearOnEscape,
    resetOnToolChange,
    pruneOnDocumentChange,
  };
}
