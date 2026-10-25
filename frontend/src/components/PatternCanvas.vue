<script setup lang="ts">
import {
  allPoints,
  arcThroughPoints,
  type ArcEntity,
  bounds,
  constraintOffset,
  constraintOrientation,
  cornerRoundGeometry,
  cornerRounds,
  cornerRoundsForEntity,
  type CircleEntity,
  type CornerRound,
  type CurveEntity,
  type CutAnchor,
  cutAnchorIssue,
  type CutAnchorIssueReason,
  DEFAULT_DIMENSION_OFFSET,
  type DerivedDistanceConstraint,
  type DimensionOrientation,
  derivedDimensionGeometry,
  derivedDimensionState,
  derivedDimensionValue,
  dimensionGeometry,
  dimensionOffsetForPointer,
  dimensionOffsetFromSpan,
  distanceAnchorIssue,
  type DistanceAnchorReason,
  type DimensionLayout,
  dimensionState,
  dimensionValue,
  type DimensionState,
  dimensionsInRect,
  type DistanceConstraint,
  entitiesInRect,
  type EntityId,
  inferDimensionOrientation,
  inferOrientationFromSpan,
  getEntity,
  isAnnotation,
  isConstruction,
  isCornerRoundDerived,
  lineEndpoints,
  type LineEntity,
  type LeaderGeometry,
  measureDistanceDimension,
  measureLinearDimension,
  MIN_RADIUS,
  type PatternDocument,
  type Piece,
  pieceCutLoop,
  pieceCutVertex,
  pieceMetrics,
  pieceFoldLines,
  pieceLoop,
  pieceLoopVertex,
  type PointEntity,
  projectPointOnLine,
  type Rect,
  resolveCutSpan,
  type TextLayout,
  textLayout,
  textLeaderGeometry,
  DEFAULT_TEXT_SIZE,
  seamAllowancePaths,
  svgArcCommand,
  usesCutEdgeAnchor,
  type Vec2,
} from '@sewcraft/geometry';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { arcFromEndpoints } from '@/lib/arc-tool';
import { curvePath, polylinePath } from '@/lib/canvas-render';
import { resolveCircleEndpoint, sameCircleEndpoint, type CircleEndpoint } from '@/lib/circle-tool';
import type { ConstraintPick } from '@/lib/constraint-tools';
import { CONSTRAINT_ICONS, constraintMarkers, type ConstraintMarker } from '@/lib/constraint-view';
import {
  cornerRoundLabel,
  cornerRoundPreview,
  formatCornerRadius,
  parseCornerRadius,
  roundableCorners,
  tangentDragRadius,
  type CornerRoundLabel,
  type CornerRoundPicks,
} from '@/lib/corner-round';
import {
  dimensionAccessibleName,
  dimensionLabelWidth,
  dimensionPatchForEdit,
  dimensionSegments,
  filterReferenceOptions,
  formatDimensionField,
  formatDimensionLabel,
  formatDimensionValue,
  isReferenceEditText,
  parseDimensionEdit,
  referenceOptions,
  referenceSearchText,
  type DimensionPatch,
  type DimensionPlacement,
  type DimensionReferenceOption,
  type DimensionSegment,
  type CutDimensionPlacement,
} from '@/lib/dimensions';
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
import {
  endpointMissing,
  endpointPosition,
  resolveDraftingEndpoint,
  sameDraftingEndpoint,
  type DraftingEndpoint,
} from '@/lib/drafting';
import type { EditorTool } from '@/lib/editor-tools';
import {
  anchorForEdge,
  anchorForPoint,
  canEditEntity,
  edgeEndpoints,
  nearestLoopHandle,
  pieceForEntity,
  pieceOwningEdge,
  piecesAtPoint,
} from '@/lib/pieces';
import {
  newRectangleCorners,
  RECTANGLE_CLICKS,
  rectangleCorners,
  type RectangleMode,
} from '@/lib/rectangle-tool';
import {
  applySelection,
  rectMode,
  selectionModeFrom,
  toggleSelection,
  type SelectionMode,
} from '@/lib/selection';
import { nearestPoint, POINT_SNAP_TOLERANCE, snapPoint, snapToGrid } from '@/lib/snap';
import {
  fitToBounds,
  niceStep,
  panBy,
  screenToWorld,
  ticksAlong,
  viewportTransform,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Size,
  type Viewport,
} from '@/lib/viewport';

import DimensionReferencePicker from './DimensionReferencePicker.vue';

interface LineView {
  line: LineEntity;
  start: PointEntity;
  end: PointEntity;
}

interface CurveView {
  curve: CurveEntity;
  d: string;
}

interface ArcView {
  arc: ArcEntity;
  d: string;
}

interface CircleView {
  circle: CircleEntity;
  cx: number;
  cy: number;
  r: number;
}

interface Hit {
  id: EntityId;
  kind: string;
}

/** A bare-canvas drag that may become a rectangular selection. */
interface MarqueeState {
  start: Vec2;
  current: Vec2;
  mode: SelectionMode;
  latched: boolean;
}

/** Screen pixels the pointer must travel before a click becomes a marquee. */
const MARQUEE_THRESHOLD = 4;

interface SeamView {
  edge: EntityId;
  d: string;
  selfIntersects: boolean;
}

/** A piece's derived loops, ready to draw. */
interface PieceView {
  id: EntityId;
  edges: EntityId[];
  cut: string;
  stitch: string;
  folds: string[];
  /** Cut and stitch loops as one even-odd path, for the allowance band fill. */
  band: string | null;
  selfIntersects: boolean;
  selected: boolean;
}

/** A fully resolved dimension, ready to render in world and screen space. */
interface DimensionDrawing {
  id: EntityId;
  constraint: DistanceConstraint;
  layout: DimensionLayout;
  segments: DimensionSegment[];
  /** Label text: `120`, `(120)` or `[120]`, by state. */
  value: string;
  /** The effective number without decoration, for accessible names. */
  measured: string;
  state: Exclude<DimensionState, 'derived'>;
  /** The linked source, when the dimension records one. */
  sourceId?: EntityId;
  /** The label's full accessible name, including the state and source. */
  accessibleName: string;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  editable: boolean;
  dragging: boolean;
}

/** A dimension value positioned and oriented in screen space. */
interface DimensionLabelView {
  id: EntityId;
  constraint: DistanceConstraint;
  value: string;
  measured: string;
  state: Exclude<DimensionState, 'derived'>;
  sourceId?: EntityId;
  accessibleName: string;
  width: number;
  x: number;
  y: number;
  angle: number;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  editable: boolean;
}

/** A read-only cut dimension, resolved from a piece's cut loop. */
interface DerivedDimensionDrawing {
  id: EntityId;
  constraint: DerivedDistanceConstraint;
  layout: DimensionLayout;
  segments: DimensionSegment[];
  value: string;
  state: Extract<DimensionState, 'derived' | 'broken'>;
  accessibleName: string;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
}

/** A cut dimension label positioned and oriented in screen space. */
interface DerivedDimensionLabelView {
  id: EntityId;
  value: string;
  state: Extract<DimensionState, 'derived' | 'broken'>;
  accessibleName: string;
  width: number;
  x: number;
  y: number;
  angle: number;
  preview: boolean;
  selected: boolean;
  draggable: boolean;
}

/** A tangent handle of a selected round, positioned in screen space. */
interface CornerRoundHandleView {
  id: EntityId;
  endIndex: 0 | 1;
  x: number;
  y: number;
}

/** The `R 12` label of a selected round, positioned in screen space. */
interface CornerRoundLabelView extends CornerRoundLabel {
  round: CornerRound;
  screenX: number;
  screenY: number;
}

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    tool: EditorTool;
    selectedEntityIds?: EntityId[];
    /** Ordered dimension selection, kept apart from the entity selection. */
    selectedDimensionIds?: EntityId[];
    fitToken?: number;
    showAllowances?: boolean;
    /** The piece whose card is open; its band reads as selected. */
    selectedPieceId?: EntityId | null;
    showConstraints?: boolean;
    showDimensions?: boolean;
    constraintActive?: boolean;
    constraintPicks?: ConstraintPick[];
    roundCornerActive?: boolean;
    roundCornerPicks?: CornerRoundPicks;
    cornerRoundPreviewRadius?: number | null;
    /** A read-only document refuses every pointer gesture. */
    readOnly?: boolean;
    /** The piece every new entity belongs to, and the move target. */
    activePieceId?: EntityId | null;
    /** True while the piece card's Move toggle arms the gesture. */
    moveMode?: boolean;
  }>(),
  {
    selectedEntityIds: () => [],
    selectedDimensionIds: () => [],
    fitToken: 0,
    showAllowances: true,
    selectedPieceId: null,
    showConstraints: false,
    showDimensions: true,
    constraintActive: false,
    constraintPicks: () => [],
    roundCornerActive: false,
    roundCornerPicks: () => ({ first: null, second: null }),
    cornerRoundPreviewRadius: null,
    readOnly: false,
    activePieceId: null,
    moveMode: false,
  },
);

const emit = defineEmits<{
  'update:selectedEntityIds': [ids: EntityId[]];
  'update:selectedDimensionIds': [ids: EntityId[]];
  'marquee-change': [active: boolean];
  'move-point': [id: EntityId, x: number, y: number];
  'add-point': [x: number, y: number];
  'add-point-on-line': [lineId: EntityId, x: number, y: number];
  'add-line': [start: DraftingEndpoint, end: DraftingEndpoint];
  'add-arc': [start: DraftingEndpoint, end: DraftingEndpoint, through: DraftingEndpoint];
  'add-curve': [points: [EntityId, EntityId, EntityId, EntityId]];
  'add-circle': [center: CircleEndpoint, rim: CircleEndpoint];
  'add-rectangle': [mode: RectangleMode, clicks: DraftingEndpoint[]];
  'constraint-pick': [pick: ConstraintPick];
  'add-dimension': [placement: DimensionPlacement];
  'add-cut-dimension': [placement: CutDimensionPlacement];
  'update-dimension': [id: EntityId, patch: DimensionPatch];
  'round-corner-pick': [id: EntityId];
  'set-corner-round-radius': [id: EntityId, radius: number];
  'move-piece': [dx: number, dy: number];
  'activate-piece': [id: EntityId];
  'cross-piece': [id: EntityId];
  'add-text': [anchor: DraftingEndpoint];
}>();

const svg = ref<SVGSVGElement | null>(null);
const viewport = ref<Viewport>({ x: -40, y: -40, scale: 1 });
const size = ref<Size>({ width: 800, height: 600 });
let resizeObserver: ResizeObserver | null = null;
const dragState = ref<{ id: EntityId; x: number; y: number; origin: Vec2 } | null>(null);
/** A move gesture: its start in world space and the live translation. */
const moveDrag = ref<{ start: Vec2; dx: number; dy: number } | null>(null);
const panState = ref<{ start: Vec2; origin: Viewport } | null>(null);
const marqueeState = ref<MarqueeState | null>(null);
const pending = ref<EntityId[]>([]);
/** The line gesture's first endpoint; `null` until the first click. */
const lineStart = ref<DraftingEndpoint | null>(null);
/** The snapped pointer position while a line gesture is pending. */
const linePreview = ref<Vec2 | null>(null);
/** The arc gesture's start and end clicks; `null` until each click lands. */
const arcStart = ref<DraftingEndpoint | null>(null);
const arcEnd = ref<DraftingEndpoint | null>(null);
/** The snapped pointer while the arc gesture is pending; the preview's through point. */
const arcPointer = ref<Vec2 | null>(null);
/** True after a rejected third click, until the pointer leaves the chord. */
const arcHint = ref(false);
/** The circle gesture's pending centre; `null` until the first click. */
const circleCenter = ref<CircleEndpoint | null>(null);
/** The snapped pointer position while a circle gesture is pending. */
const circlePreview = ref<Vec2 | null>(null);
/** The rectangle gesture's clicks so far; empty when no gesture is pending. */
const rectangleClicks = ref<DraftingEndpoint[]>([]);
/** The snapped pointer while a rectangle gesture is pending; its next click. */
const rectanglePointer = ref<Vec2 | null>(null);
const spaceHeld = ref(false);

/** Anchors picked for a dimension that has not yet been placed. */
const dimensionPending = ref<DimensionPick[]>([]);
/** Why the last dimension pick was rejected; cleared by a valid pick. */
const dimensionHint = ref<string | null>(null);
/** The dimension being placed; its orientation/offset follow the pointer. */
const dimensionPlacement = ref<DimensionPlacement | null>(null);
/** The first corner picked for a cut dimension, with its owning piece. */
const cutDimensionPending = ref<CutPick | null>(null);
/** The cut dimension being placed; it always measures the piece's cut loop. */
const cutDimensionPlacement = ref<CutDimensionPlacement | null>(null);
/** Why the last cut-dimension pick was rejected; cleared by a valid pick. */
const cutDimensionHint = ref<string | null>(null);
/** The entity under the pointer while a dimension tool is armed. */
const hoveredPick = ref<FeedbackHit | null>(null);
/** The derived loop corner nearest the pointer while the cut tool is armed. */
const hoveredLoopHandle = ref<LoopHandle | null>(null);
/** The pointer in world space, for the ghost's unsnapped end. */
const pointerWorld = ref<Vec2 | null>(null);
/** Live drag of an existing dimension line, in world space. */
const dimensionDrag = ref<{
  id: EntityId;
  a: EntityId;
  b: EntityId;
  orientation: DimensionOrientation;
  startOffset: number;
  offset: number;
} | null>(null);
/** Live drag of a cut dimension; its span comes from the piece's cut loop. */
const derivedDrag = ref<{
  id: EntityId;
  orientation: DimensionOrientation;
  startOffset: number;
  offset: number;
  span: { a: Vec2; b: Vec2 };
} | null>(null);
/** The inline value editor, keyed to the dimension being edited. */
const editingDimension = ref<{ id: EntityId; value: string } | null>(null);
const dimensionInput = ref<HTMLInputElement | null>(null);
/** The round whose tangent handles and label are shown because it is hovered. */
const hoveredRoundId = ref<EntityId | null>(null);
/**
 * The straight line the Point tool would constrain a click to, with the raw
 * pointer and the projection that click would use.
 */
const pointOnLineHover = ref<{ lineId: EntityId; pointer: Vec2; point: Vec2 } | null>(null);
/** Live tangent-handle drag; the radius changes on release. */
const tangentDrag = ref<{
  id: EntityId;
  endIndex: 0 | 1;
  radius: number;
  startRadius: number;
} | null>(null);
/** The inline `R` label editor, anchored at the label in screen space. */
const editingCornerRound = ref<{
  id: EntityId;
  value: string;
  startRadius: number;
  x: number;
  y: number;
} | null>(null);
const cornerRoundInput = ref<HTMLInputElement | null>(null);

const points = computed(() =>
  allPoints(props.document).map((point) =>
    dragState.value && dragState.value.id === point.id
      ? { ...point, x: dragState.value.x, y: dragState.value.y }
      : point,
  ),
);

const pointById = computed(() => new Map(points.value.map((point) => [point.id, point])));

/**
 * Derived tangent and control points stay in `points` so lines and arcs resolve,
 * but they are not drafting handles: only the explicit tangent handles render.
 */
const visiblePoints = computed(() =>
  points.value.filter((point) => !isCornerRoundDerived(props.document, point.id)),
);

/** One derived loop corner the armed cut tool offers as a pick target. */
interface LoopHandle {
  key: string;
  piece: Piece;
  anchor: CutAnchor;
  point: Vec2;
}

/** Screen pixels within which a derived loop point wins a pick. */
const LOOP_PICK_RADIUS = 8;
/** Loop points closer than this are the same corner. */
const LOOP_POINT_EPSILON = 1e-6;

function sameLoopPoint(a: Vec2, b: Vec2): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= LOOP_POINT_EPSILON;
}

/**
 * Derived loop corners of every piece, highlighted while the Cut dimension tool
 * is active. A stitch corner stands alone where an edge carries no allowance, so
 * one corner never offers two anchors that measure the identical span.
 */
const loopHandles = computed<LoopHandle[]>(() => {
  const stitch: LoopHandle[] = [];
  const cut: LoopHandle[] = [];

  for (const piece of props.document.pieces) {
    for (const edge of piece.edges) {
      for (const at of ['start', 'end'] as const) {
        const point = pieceLoopVertex(props.document, piece, { edge, at });
        if (point === null) continue;
        stitch.push({
          key: `stitch-${piece.id}-${edge}-${at}`,
          piece,
          anchor: { edge, at, loop: 'stitch' },
          point,
        });

        // The stitch loop resolved, so the cut loop resolves from it as well.
        cut.push({
          key: `cut-${piece.id}-${edge}-${at}`,
          piece,
          anchor: { edge, at },
          point: pieceCutVertex(props.document, piece, { edge, at })!,
        });
      }
    }
  }

  // Two edges meet at one corner, so keep the first handle in edge order.
  const unique = (handles: LoopHandle[]): LoopHandle[] => {
    const kept: LoopHandle[] = [];
    for (const handle of handles) {
      const duplicate = kept.some(
        (other) => other.piece.id === handle.piece.id && sameLoopPoint(other.point, handle.point),
      );
      if (!duplicate) kept.push(handle);
    }
    return kept;
  };

  const stitchHandles = unique(stitch);
  const cutHandles = unique(cut).filter(
    (handle) =>
      !stitchHandles.some(
        (other) => other.piece.id === handle.piece.id && sameLoopPoint(other.point, handle.point),
      ),
  );
  return [...stitchHandles, ...cutHandles];
});

/** The derived loop corner under the pointer, if any. */
function pickLoopHandle(screen: Vec2): LoopHandle | null {
  const candidates = loopHandles.value.map((handle) => ({
    handle,
    point: worldToScreen(viewport.value, handle.point),
  }));
  return nearestLoopHandle(candidates, screen, LOOP_PICK_RADIUS)?.handle ?? null;
}

/**
 * Straight piece edges, highlighted while the Cut dimension tool is active so a
 * whole edge is visibly eligible alongside the corner rings.
 */
const cutEdgeHandles = computed<LineView[]>(() => {
  const ids = new Set<EntityId>();
  for (const piece of props.document.pieces) {
    for (const edge of piece.edges) {
      if (anchorForEdge(props.document, piece, edge) !== null) ids.add(edge);
    }
  }
  return lines.value.filter((entry) => ids.has(entry.line.id));
});

/** The cut tool's status message: a rejection, a next-pick prompt, or the idle cue. */
const cutDimensionHintText = computed<string | null>(() => {
  if (cutDimensionHint.value !== null) return cutDimensionHint.value;
  if (props.tool !== 'cut_dimension' || cutDimensionPlacement.value !== null) return null;
  if (cutDimensionPending.value !== null) return 'Pick the second anchor on the same piece.';
  return 'Pick a seamline or cut corner, or a straight edge, of one piece.';
});

/** The Dimension tool's status message: a rejection, or the next pick prompt. */
const dimensionHintText = computed<string | null>(() => {
  if (dimensionHint.value !== null) return dimensionHint.value;
  if (dimensionPlacement.value !== null) return null;
  if (dimensionPending.value.length > 0) return 'Pick the second anchor.';
  return props.tool === 'dimension' ? 'Pick a point or a line.' : null;
});

/** Whether a dimension tool owns the pointer feedback. */
const dimensionToolArmed = computed(
  () => props.tool === 'dimension' || props.tool === 'cut_dimension',
);

/** The first anchor of the gesture, pending or already being placed. */
const dimensionFirstPick = computed<DimensionPick | null>(() => {
  const pendingPick = dimensionPending.value[0];
  if (pendingPick !== undefined) return pendingPick;
  const placement = dimensionPlacement.value;
  return placement === null
    ? null
    : dimensionPickFor(props.document, { id: placement.a, kind: '' });
});

/** The second anchor of a dimension already being placed. */
const dimensionSecondPick = computed<DimensionPick | null>(() => {
  const placement = dimensionPlacement.value;
  return placement === null
    ? null
    : dimensionPickFor(props.document, { id: placement.b, kind: '' });
});

/** The eligible anchor under the pointer, validated against a pending first pick. */
const dimensionCandidate = computed<DimensionPick | null>(() => {
  if (props.tool !== 'dimension' || props.readOnly || dimensionPlacement.value !== null)
    return null;
  return dimensionCandidateFor(props.document, hoveredPick.value, dimensionFirstPick.value);
});

/** The cut corner under the pointer, same-piece only after the first corner. */
const cutPointCandidate = computed(() => {
  if (props.tool !== 'cut_dimension' || props.readOnly || cutDimensionPlacement.value !== null) {
    return null;
  }
  const loopHandle = hoveredLoopHandle.value;
  if (loopHandle !== null) {
    return cutLoopCandidateFor(props.document, loopHandle, cutDimensionPending.value);
  }
  return cutPointCandidateFor(props.document, hoveredPick.value, cutDimensionPending.value);
});

/** A whole piece edge under the pointer; it skips the ghost stage. */
const cutEdgeCandidate = computed(() => {
  if (
    props.tool !== 'cut_dimension' ||
    props.readOnly ||
    cutDimensionPending.value !== null ||
    cutDimensionPlacement.value !== null ||
    hoveredLoopHandle.value !== null
  ) {
    return null;
  }
  return cutEdgeCandidateFor(props.document, hoveredPick.value);
});

/** The dashed guide from the first Dimension pick, snapped when a candidate is valid. */
const dimensionGhost = computed(() => {
  if (props.tool !== 'dimension' || props.readOnly || dimensionPlacement.value !== null)
    return null;
  return dimensionGhostFor(
    props.document,
    dimensionPending.value[0] ?? null,
    dimensionCandidate.value,
    pointerWorld.value,
  );
});

/** The dashed guide from the first cut corner to the pointer or a same-piece corner. */
const cutDimensionGhost = computed(() => {
  if (props.tool !== 'cut_dimension' || props.readOnly || cutDimensionPlacement.value !== null) {
    return null;
  }
  return cutGhostFor(
    props.document,
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
  return pick !== null && pick.kind === 'point' ? pickPreviewPosition(props.document, pick) : null;
});

const dimensionFirstPickTick = computed(() => {
  const pick = dimensionFirstPick.value;
  return pick !== null && pick.kind === 'line' ? pickPreviewTick(props.document, pick) : null;
});

const dimensionSecondPickPoint = computed<Vec2 | null>(() => {
  const pick = dimensionSecondPick.value;
  return pick !== null && pick.kind === 'point' ? pickPreviewPosition(props.document, pick) : null;
});

const dimensionSecondPickTick = computed(() => {
  const pick = dimensionSecondPick.value;
  return pick !== null && pick.kind === 'line' ? pickPreviewTick(props.document, pick) : null;
});

const dimensionCandidatePoint = computed<Vec2 | null>(() => {
  const pick = dimensionCandidate.value;
  return pick !== null && pick.kind === 'point' ? pickPreviewPosition(props.document, pick) : null;
});

const cutPlacementPiece = computed<Piece | null>(() => {
  const placement = cutDimensionPlacement.value;
  // The document watcher clears a placement whose piece disappears.
  return placement === null
    ? null
    : props.document.pieces.find((piece) => piece.id === placement.piece)!;
});

const cutFirstPickPosition = computed<Vec2 | null>(() => {
  const pendingPick = cutDimensionPending.value;
  if (pendingPick !== null) {
    return cutAnchorPreviewPosition(props.document, pendingPick.piece, pendingPick.anchor);
  }
  const placement = cutDimensionPlacement.value;
  const piece = cutPlacementPiece.value;
  return placement === null || piece === null
    ? null
    : cutAnchorPreviewPosition(props.document, piece, placement.a);
});

const cutSecondPickPosition = computed<Vec2 | null>(() => {
  const placement = cutDimensionPlacement.value;
  const piece = cutPlacementPiece.value;
  return placement === null || piece === null
    ? null
    : cutAnchorPreviewPosition(props.document, piece, placement.b);
});

const roundPickedLineIds = computed(() => {
  const picks = [props.roundCornerPicks.first, props.roundCornerPicks.second];
  return new Set(picks.filter((id): id is EntityId => id !== null));
});

/**
 * The live tool preview: trimmed lines, tangent dots and a dashed arc. It is
 * aria-hidden and never written to the document until Apply.
 */
const roundPreview = computed(() => {
  const radius = props.cornerRoundPreviewRadius;
  if (!props.roundCornerActive || radius === null) return null;
  return cornerRoundPreview(props.document, props.roundCornerPicks, radius);
});

/**
 * Corners the Round corner tool can act on, drawn as small rings while it is
 * active. The prompt and live region carry the meaning; the rings are decorative.
 */
const roundableCornerPoints = computed(() => {
  const ids = new Set(roundableCorners(props.document));
  return visiblePoints.value.filter((point) => ids.has(point.id));
});

/**
 * Every round's derived feature points — the radius centre and both tangency
 * points — as always-visible construction marks. They are ordinary point
 * entities, so hit testing, selection, snapping and dimension picks apply.
 */
const cornerRoundFeaturePoints = computed<PointEntity[]>(() =>
  cornerRounds(props.document).flatMap((round) =>
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

  if (props.selectedEntityIds.length > 0) {
    props.selectedEntityIds.forEach((id) => cornerRoundsForEntity(props.document, id).forEach(add));
  }
  if (hoveredRoundId.value !== null) {
    add(cornerRounds(props.document).find((round) => round.id === hoveredRoundId.value));
  }
  if (tangentDrag.value !== null) {
    add(cornerRounds(props.document).find((round) => round.id === tangentDrag.value!.id));
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
  return drag !== null && drag.id === round.id ? drag.radius : round.radius;
}

function roundGeometryOf(round: CornerRound): ReturnType<typeof cornerRoundGeometry>['geometry'] {
  return cornerRoundGeometry(
    props.document,
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
        viewport.value,
        endIndex === 0 ? geometry.tangentA : geometry.tangentB,
      );
      return [{ id: round.id, endIndex, x: screen.x, y: screen.y }];
    });
  }),
);

/** `R 12` labels, offset outward from the arc's midpoint by a constant 18 px. */
const roundLabels = computed<CornerRoundLabelView[]>(() =>
  activeRounds.value.flatMap((round) => {
    const label = cornerRoundLabel(props.document, round);
    if (label === null) return [];

    const mid = worldToScreen(viewport.value, { x: label.x, y: label.y });
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
  for (const round of cornerRounds(props.document)) arcs.set(round.arc, round);
  return arcs;
});

/** The dashed arc that follows a tangent-handle drag, before it is committed. */
const tangentPreview = computed(() => {
  const drag = tangentDrag.value;
  if (drag === null) return null;

  const round = cornerRounds(props.document).find((candidate) => candidate.id === drag.id);
  if (round === undefined) return null;

  const geometry = roundGeometryOf(round);
  if (geometry === null) return null;

  return {
    id: drag.id,
    arc: curvePath([geometry.tangentA, geometry.control1, geometry.control2, geometry.tangentB]),
    tangents: [geometry.tangentA, geometry.tangentB],
  };
});

/** Membership test for every selected entity's highlight. */
const selectedIds = computed(() => new Set(props.selectedEntityIds));

/** The dimension selection as a set, so a render never scans per segment. */
const selectedDimensionIds = computed(() => new Set(props.selectedDimensionIds));

/** The marquee's screen-space rectangle, live while the pointer moves. */
const marqueeRect = computed(() => {
  const state = marqueeState.value;
  if (state === null) return null;
  return {
    x: Math.min(state.start.x, state.current.x),
    y: Math.min(state.start.y, state.current.y),
    width: Math.abs(state.current.x - state.start.x),
    height: Math.abs(state.current.y - state.start.y),
  };
});

/** The marquee in world coordinates, used for hit-testing and preview. */
const marqueeWorldRect = computed<Rect | null>(() => {
  const state = marqueeState.value;
  if (state === null) return null;
  const start = screenToWorld(viewport.value, state.start);
  const end = screenToWorld(viewport.value, state.current);
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
});

/** Entities the latched marquee would select with the captured mode. */
const marqueeCandidates = computed(() => {
  const state = marqueeState.value;
  const rect = marqueeWorldRect.value;
  if (state === null || rect === null || !state.latched) return new Set<EntityId>();
  return new Set(entitiesInRect(props.document, rect, rectMode(state.start.x, state.current.x)));
});

/**
 * Dimensions the latched marquee would select, using the same predicate as the
 * commit. Hidden dimensions are never offered, since they are not rendered.
 */
const marqueeDimensionCandidates = computed(() => {
  const state = marqueeState.value;
  const rect = marqueeWorldRect.value;
  if (state === null || rect === null || !state.latched || !props.showDimensions) {
    return new Set<EntityId>();
  }
  return new Set(dimensionsInRect(props.document, rect, rectMode(state.start.x, state.current.x)));
});

const lines = computed(() =>
  props.document.entities
    .filter((entity): entity is LineEntity => entity.kind === 'line')
    .flatMap((line): LineView[] => {
      const start = pointById.value.get(line.start);
      const end = pointById.value.get(line.end);
      if (!start || !end) return [];
      return [{ line, start, end }];
    }),
);

const curves = computed(() =>
  props.document.entities
    .filter((entity): entity is CurveEntity => entity.kind === 'curve')
    .flatMap((curve): CurveView[] => {
      const resolved = [curve.p0, curve.p1, curve.p2, curve.p3]
        .map((id) => pointById.value.get(id))
        .filter((point): point is PointEntity => point !== undefined);
      if (resolved.length !== 4) return [];
      const [p0, p1, p2, p3] = resolved;
      return [{ curve, d: curvePath([p0!, p1!, p2!, p3!]) }];
    }),
);

/**
 * Committed arcs, each drawn as one `A` command. An arc whose three points no
 * longer define a circle is skipped rather than thrown, so an arc invalidated by
 * a constraint solve simply disappears from the canvas.
 */
const arcs = computed(() =>
  props.document.entities
    .filter((entity): entity is ArcEntity => entity.kind === 'arc')
    .flatMap((arc): ArcView[] => {
      const resolved = [arc.start, arc.end, arc.through]
        .map((id) => pointById.value.get(id))
        .filter((point): point is PointEntity => point !== undefined);
      if (resolved.length !== 3) return [];

      const start = resolved[0]!;
      const end = resolved[1]!;
      const through = resolved[2]!;
      const geometry = arcThroughPoints(start, end, through);
      if (geometry === null) return [];

      return [{ arc, d: svgArcCommand(geometry, start, end) }];
    }),
);

/**
 * Committed circles whose centre and rim both resolve to points and whose radius
 * is renderable. A degenerate or dangling circle is skipped, exactly as the
 * export layer skips it. Reading the drag-aware `pointById` keeps the circle
 * following a live point drag.
 */
const circles = computed(() =>
  props.document.entities
    .filter((entity): entity is CircleEntity => entity.kind === 'circle')
    .flatMap((circle): CircleView[] => {
      const center = pointById.value.get(circle.center);
      const rim = pointById.value.get(circle.rim);
      if (center === undefined || rim === undefined) return [];
      const r = Math.hypot(rim.x - center.x, rim.y - center.y);
      if (r < MIN_RADIUS) return [];
      return [{ circle, cx: center.x, cy: center.y, r }];
    }),
);

/**
 * Seam allowances are a render-only offset layer: hidden entirely when the
 * presentation toggle is off, and never part of the document the UI mutates.
 */
const seams = computed<SeamView[]>(() => {
  if (!props.showAllowances) return [];
  return seamAllowancePaths(props.document).map((allowance) => ({
    edge: allowance.edge,
    d: polylinePath(allowance.path),
    selfIntersects: allowance.selfIntersections.length > 0,
  }));
});

/** A closed SVG path for a derived loop; every caller passes a resolved loop. */
function closedLoopPath(points: readonly Vec2[]): string {
  return `${polylinePath([...points])} Z`;
}

/**
 * Every piece's derived geometry. Loops are recomputed from the document on
 * each read; nothing here is stored or fed back into the document.
 */
const pieceViews = computed<PieceView[]>(() =>
  props.document.pieces.flatMap((piece: Piece): PieceView[] => {
    const cut = pieceCutLoop(props.document, piece);
    if (cut === null) return [];
    const stitch = pieceLoop(props.document, piece)!;

    const cutPath = closedLoopPath(cut.points);
    const stitchPath = closedLoopPath(stitch.points);
    return [
      {
        id: piece.id,
        edges: piece.edges,
        cut: cutPath,
        stitch: stitchPath,
        folds: pieceFoldLines(props.document, piece).map((fold) => closedLoopPath(fold)),
        band:
          props.showAllowances && cutPath !== '' && stitchPath !== ''
            ? `${cutPath} ${stitchPath}`
            : null,
        selfIntersects: cut.selfIntersections.length > 0,
        selected:
          piece.id === props.selectedPieceId ||
          piece.edges.some((edge) => props.selectedEntityIds.includes(edge)),
      },
    ];
  }),
);

/** Screen-space diameter of a constraint icon, in pixels. */
const CONSTRAINT_ICON_SIZE = 18;
/** Distance between stacked icons when several constraints share an anchor. */
const CONSTRAINT_ICON_STEP = 20;

/**
 * Constraint icons are a render-only overlay, like the seam layer: driven by
 * the presentation toggle and never part of the document the UI mutates.
 *
 * Markers are laid out in screen space so they stay the same small size at any
 * zoom, and constraints that share a midpoint are staggered instead of drawn
 * on top of each other.
 */
const constraintLayer = computed<ConstraintMarker[]>(() => {
  if (!props.showConstraints) return [];

  const stacks = new Map<string, number>();
  return constraintMarkers(props.document).map((marker) => {
    const screen = worldToScreen(viewport.value, marker);
    // Group by the shared world anchor, not screen proximity, so icons do not
    // jump between stacks as the viewport pans or zooms.
    const anchor = `${Math.round(marker.x * 1000)}:${Math.round(marker.y * 1000)}`;
    const index = stacks.get(anchor) ?? 0;
    stacks.set(anchor, index + 1);

    return {
      ...marker,
      x: screen.x + CONSTRAINT_ICON_SIZE / 2 + index * CONSTRAINT_ICON_STEP,
      y: screen.y - CONSTRAINT_ICON_SIZE / 2,
    };
  });
});

const pendingIds = computed(() => new Set(pending.value));
/** The document point reused as the line start, highlighted while pending. */
const pendingLineStartId = computed(() =>
  lineStart.value?.kind === 'point' ? lineStart.value.id : null,
);
/**
 * World position of the pending start. An id is always current because the
 * document watcher clears a start whose point disappeared.
 */
const pendingLineStart = computed<Vec2 | null>(() => {
  const start = lineStart.value;
  if (start === null) return null;
  if (start.kind === 'new') return { x: start.x, y: start.y };

  const point = pointById.value.get(start.id)!;
  return { x: point.x, y: point.y };
});
/**
 * World position of the pending arc start. An id is always current because the
 * document watcher clears a gesture whose point disappeared.
 */
const arcStartPosition = computed<Vec2 | null>(() =>
  arcStart.value === null ? null : endpointPosition(props.document, arcStart.value),
);
/** The dashed chord shown between the start click and the end click. */
const arcChord = computed(() => {
  if (arcEnd.value !== null) return null;
  const start = arcStartPosition.value;
  const pointer = arcPointer.value;
  if (start === null || pointer === null) return null;
  return { start, end: pointer };
});
/**
 * The dashed arc that follows the pointer after the second click. It is built by
 * the same `arcFromEndpoints` guard the commit uses, so what is previewed is
 * exactly what a third click would store.
 */
const arcPreview = computed(() => {
  const start = arcStart.value;
  const end = arcEnd.value;
  const pointer = arcPointer.value;
  if (start === null || end === null || pointer === null) return null;

  const geometry = arcFromEndpoints(props.document, start, end, {
    kind: 'new',
    x: pointer.x,
    y: pointer.y,
  });
  if (geometry === null) return null;

  // A non-null geometry means both endpoints resolved to points, so both positions exist.
  const startPosition = endpointPosition(props.document, start)!;
  const endPosition = endpointPosition(props.document, end)!;
  return { d: svgArcCommand(geometry, startPosition, endPosition) };
});

/** Marker for a start click that created a new point rather than reusing one. */
const arcPendingStart = computed<Vec2 | null>(() => {
  const start = arcStart.value;
  return start !== null && start.kind === 'new' ? { x: start.x, y: start.y } : null;
});
/** Marker for an end click that created a new point rather than reusing one. */
const arcPendingEnd = computed<Vec2 | null>(() => {
  const end = arcEnd.value;
  return end !== null && end.kind === 'new' ? { x: end.x, y: end.y } : null;
});

/** The document point reused as the circle centre, highlighted while pending. */
const pendingCircleCenterId = computed(() =>
  circleCenter.value?.kind === 'point' ? circleCenter.value.id : null,
);
/**
 * World position of the pending circle centre. An id is always current because
 * the document watcher clears a centre whose point disappeared.
 */
const pendingCircleCenter = computed<Vec2 | null>(() => {
  const center = circleCenter.value;
  if (center === null) return null;
  if (center.kind === 'new') return { x: center.x, y: center.y };

  const point = pointById.value.get(center.id)!;
  return { x: point.x, y: point.y };
});
/** The dashed preview radius: pending centre to the snapped pointer. Read only
 * while both the pending centre and the preview position exist. */
const circlePreviewRadius = computed<number>(() => {
  const center = pendingCircleCenter.value!;
  const rim = circlePreview.value!;
  return Math.hypot(rim.x - center.x, rim.y - center.y);
});
/** The rectangle mode the active tool draws, or `null` for every other tool. */
const rectangleMode = computed<RectangleMode | null>(() => {
  switch (props.tool) {
    case 'add_rectangle':
      return 'diagonal';
    case 'add_center_rectangle':
      return 'center';
    case 'add_3point_rectangle':
      return 'three_point';
    default:
      return null;
  }
});
/** The test id each mode's dashed preview carries. */
const RECTANGLE_PREVIEW_TEST_IDS: Record<RectangleMode, string> = {
  diagonal: 'rectangle-preview',
  center: 'center-rectangle-preview',
  three_point: 'three-point-rectangle-preview',
};
/**
 * The clicks a commit would carry right now: the pending clicks plus the snapped
 * pointer as the last one. Read only once the gesture is one click short.
 */
const rectanglePreviewClicks = computed<DraftingEndpoint[] | null>(() => {
  const mode = rectangleMode.value;
  const pointer = rectanglePointer.value;
  if (
    mode === null ||
    pointer === null ||
    rectangleClicks.value.length !== RECTANGLE_CLICKS[mode] - 1
  ) {
    return null;
  }
  return [...rectangleClicks.value, { kind: 'new', x: pointer.x, y: pointer.y }];
});
/**
 * The dashed rectangle that follows the pointer, built by the same
 * `rectangleCorners` guard the commit uses, so what is previewed is exactly what
 * the next click stores.
 */
const rectanglePreview = computed<{
  corners: Vec2[];
  path: string;
  testId: string;
} | null>(() => {
  const mode = rectangleMode.value;
  const clicks = rectanglePreviewClicks.value;
  if (mode === null || clicks === null) return null;

  const corners = rectangleCorners(props.document, mode, clicks);
  if (corners === null) return null;

  return {
    corners,
    path: polylinePath([...corners, corners[0]!]),
    testId: RECTANGLE_PREVIEW_TEST_IDS[mode],
  };
});
/**
 * Corners the gesture will turn into new points: the derived ones once the
 * preview exists, otherwise the clicks that already landed on bare canvas.
 */
const rectanglePendingCorners = computed<Vec2[]>(() => {
  const preview = rectanglePreview.value;
  if (preview !== null) return newRectangleCorners(props.document, preview.corners);

  return rectangleClicks.value.flatMap((click) =>
    click.kind === 'new' ? [{ x: click.x, y: click.y }] : [],
  );
});
const gridStep = computed(() => niceStep(viewport.value.scale));
const gridPath = computed(() => `M ${gridStep.value} 0 L 0 0 0 ${gridStep.value}`);
const transform = computed(() => viewportTransform(viewport.value));
const visible = computed(() => visibleWorldRect(viewport.value, size.value));
const xTicks = computed(() => ticksAlong(visible.value, 'x', gridStep.value));
const yTicks = computed(() => ticksAlong(visible.value, 'y', gridStep.value));
const cursorClass = computed(() =>
  props.constraintActive || props.roundCornerActive || props.tool !== 'select'
    ? 'cursor-crosshair'
    : 'cursor-default',
);
const pickedPointIds = computed(
  () =>
    new Set(props.constraintPicks.filter((pick) => pick.kind === 'point').map((pick) => pick.id)),
);
const pickedLineIds = computed(
  () =>
    new Set(props.constraintPicks.filter((pick) => pick.kind === 'line').map((pick) => pick.id)),
);

const distanceConstraints = computed(() =>
  props.document.constraints.filter(
    (constraint): constraint is DistanceConstraint => constraint.type === 'distance',
  ),
);

/** Committed dimensions can be dragged only with the tools that own a placed line. */
const dimensionDragEnabled = computed(
  () =>
    !props.constraintActive &&
    (props.tool === 'select' || props.tool === 'dimension' || props.tool === 'cut_dimension'),
);

function drawingFor(constraint: DistanceConstraint, preview: boolean): DimensionDrawing | null {
  const drag = dimensionDrag.value;
  const placed =
    drag !== null && drag.id === constraint.id
      ? { ...constraint, offset: drag.offset }
      : constraint;
  const layout = dimensionGeometry(props.document, placed);
  if (layout === null) return null;

  // `layout` resolves the same points, so the effective value is always present.
  const value = dimensionValue(props.document, placed)!;
  const state = dimensionState(props.document, placed) as Exclude<DimensionState, 'derived'>;

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, state),
    measured: formatDimensionValue(value),
    state,
    ...(constraint.reference === undefined ? {} : { sourceId: constraint.reference }),
    accessibleName: dimensionAccessibleName(value, state, constraint.reference),
    preview,
    selected: !preview && selectedDimensionIds.value.has(constraint.id),
    draggable: !preview && dimensionDragEnabled.value,
    editable: !preview && !props.constraintActive,
    dragging: drag !== null && drag.id === constraint.id,
  };
}

/** The dimension currently being placed, or `null` when no placement is active. */
const dimensionPreviewConstraint = computed<DistanceConstraint | null>(() => {
  const placement = dimensionPlacement.value;
  if (placement === null) return null;

  const measured = measureDistanceDimension(props.document, {
    id: 'dimension-preview',
    type: 'distance',
    a: placement.a,
    b: placement.b,
    orientation: placement.orientation,
  });
  if (measured === null || measured <= 0) return null;

  // A dimension being placed is a driven preview: it measures without a value.
  return {
    id: 'dimension-preview',
    type: 'distance',
    a: placement.a,
    b: placement.b,
    orientation: placement.orientation,
    offset: placement.offset,
  };
});

/**
 * Every dimension stroke, plus the in-progress placement. Dimensions are a
 * render-only view of distance constraints: hiding them never changes the
 * document, and the preview only appears while the dimension tool is placing.
 */
const dimensionDrawings = computed<DimensionDrawing[]>(() => {
  const committed = props.showDimensions
    ? distanceConstraints.value.flatMap((constraint) => {
        const drawing = drawingFor(constraint, false);
        return drawing === null ? [] : [drawing];
      })
    : [];

  const previewConstraint = dimensionPreviewConstraint.value;
  const preview = previewConstraint === null ? null : drawingFor(previewConstraint, true);
  return preview === null ? committed : [...committed, preview];
});

const dimensionLabels = computed<DimensionLabelView[]>(() =>
  dimensionDrawings.value.map((drawing) => {
    const screen = worldToScreen(viewport.value, drawing.layout.label.position);
    return {
      id: drawing.id,
      constraint: drawing.constraint,
      value: drawing.value,
      measured: drawing.measured,
      state: drawing.state,
      ...(drawing.sourceId === undefined ? {} : { sourceId: drawing.sourceId }),
      accessibleName: drawing.accessibleName,
      width: dimensionLabelWidth(drawing.value),
      x: screen.x,
      y: screen.y,
      angle: drawing.layout.label.angleDegrees,
      preview: drawing.preview,
      selected: drawing.selected,
      draggable: drawing.draggable,
      editable: drawing.editable,
    };
  }),
);

/** Cut dimensions are read-only derived measurements of a piece's cut loop. */
const derivedConstraints = computed(() =>
  props.document.constraints.filter(
    (constraint): constraint is DerivedDistanceConstraint => constraint.type === 'derived_distance',
  ),
);

/** The cut dimension currently being placed, or `null` when none is active. */
const cutDimensionPreviewConstraint = computed<DerivedDistanceConstraint | null>(() => {
  const placement = cutDimensionPlacement.value;
  if (placement === null) return null;
  return {
    id: 'cut-dimension-preview',
    type: 'derived_distance',
    piece: placement.piece,
    a: placement.a,
    b: placement.b,
    orientation: placement.orientation,
    offset: placement.offset,
  };
});

function derivedDrawingFor(
  constraint: DerivedDistanceConstraint,
  preview: boolean,
): DerivedDimensionDrawing | null {
  const drag = derivedDrag.value;
  const placed =
    !preview && drag !== null && drag.id === constraint.id
      ? { ...constraint, offset: drag.offset }
      : constraint;
  const layout = derivedDimensionGeometry(props.document, placed);
  if (layout === null) return null;

  // A resolved layout always has a resolved span, so the measurement exists.
  const value = derivedDimensionValue(props.document, constraint)!;
  const state = derivedDimensionState(props.document, constraint);

  return {
    id: constraint.id,
    constraint,
    layout,
    segments: dimensionSegments(layout),
    value: formatDimensionLabel(value, state),
    state,
    accessibleName: dimensionAccessibleName(value, state),
    preview,
    selected: !preview && selectedDimensionIds.value.has(constraint.id),
    draggable: !preview && dimensionDragEnabled.value,
    dragging: !preview && drag !== null && drag.id === constraint.id,
  };
}

const derivedDimensionDrawings = computed<DerivedDimensionDrawing[]>(() => {
  if (!props.showDimensions) return [];

  const committed = derivedConstraints.value.flatMap((constraint): DerivedDimensionDrawing[] => {
    const drawing = derivedDrawingFor(constraint, false);
    return drawing === null ? [] : [drawing];
  });

  const preview = cutDimensionPreviewConstraint.value;
  if (preview === null) return committed;

  const previewDrawing = derivedDrawingFor(preview, true);
  return previewDrawing === null ? committed : [...committed, previewDrawing];
});

const derivedDimensionLabels = computed<DerivedDimensionLabelView[]>(() =>
  derivedDimensionDrawings.value.map((drawing) => {
    const screen = worldToScreen(viewport.value, drawing.layout.label.position);
    return {
      id: drawing.id,
      value: drawing.value,
      state: drawing.state,
      accessibleName: drawing.accessibleName,
      width: dimensionLabelWidth(drawing.value),
      x: screen.x,
      y: screen.y,
      angle: drawing.layout.label.angleDegrees,
      preview: drawing.preview,
      selected: drawing.selected,
      draggable: drawing.draggable,
    };
  }),
);

/** The cut dimension behind a label, which only renders when it resolves. */
function derivedConstraint(id: EntityId): DerivedDistanceConstraint {
  return derivedConstraints.value.find((constraint) => constraint.id === id)!;
}

/** Where the inline editor sits, in canvas pixels. */
const dimensionEditor = computed(() => {
  const editing = editingDimension.value;
  if (editing === null) return null;

  const label = dimensionLabels.value.find((entry) => entry.id === editing.id)!;
  return {
    id: editing.id,
    value: editing.value,
    x: label.x,
    y: label.y,
  };
});

/** The `#` picker's transient state; `null` while the field is not linking. */
const dimensionPicker = ref<{ text: string; activeIndex: number } | null>(null);

/** The dimension the inline editor is editing, used to resolve link targets. */
const editingConstraint = computed<DistanceConstraint>(() => {
  const editing = editingDimension.value!;
  return distanceConstraints.value.find((constraint) => constraint.id === editing.id)!;
});

/** Every row the open picker offers for the edited dimension. */
const dimensionPickerOptions = computed<DimensionReferenceOption[]>(() => {
  const constraint = editingConstraint.value;
  return filterReferenceOptions(
    referenceOptions(props.document, constraint),
    dimensionPicker.value!.text,
  );
});

/** The row Enter would pick, or `null` when the list is empty. */
const activePickerOption = computed<DimensionReferenceOption | null>(() => {
  const picker = dimensionPicker.value;
  if (picker === null || dimensionPickerOptions.value.length === 0) return null;
  return dimensionPickerOptions.value[
    Math.min(picker.activeIndex, dimensionPickerOptions.value.length - 1)
  ]!;
});

/** The `aria-activedescendant` target while the picker is open. */
const pickerActiveDescendant = computed<string | undefined>(() =>
  activePickerOption.value === null
    ? undefined
    : `dimension-reference-list-${activePickerOption.value.id}`,
);

/** The row the picker highlights, clamped to the filtered list. */
const pickerActiveIndex = computed<number>(() =>
  activePickerOption.value === null
    ? -1
    : dimensionPickerOptions.value.findIndex(
        (option) => option.id === activePickerOption.value!.id,
      ),
);

function optionsFor(id: EntityId): DimensionReferenceOption[] {
  const constraint = distanceConstraints.value.find((entry) => entry.id === id)!;
  return referenceOptions(props.document, constraint);
}

function movePicker(step: number): void {
  const picker = dimensionPicker.value!;
  const count = dimensionPickerOptions.value.length;
  if (count === 0) return;
  dimensionPicker.value = {
    text: picker.text,
    activeIndex: (picker.activeIndex + step + count) % count,
  };
}

function xTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: value, y: 0 }).x;
}

function yTickPosition(value: number): number {
  return worldToScreen(viewport.value, { x: 0, y: value }).y;
}

function pointClass(point: PointEntity): string {
  if (
    dimensionPickPointIds.value.has(point.id) ||
    dimensionCandidatePointIds.value.has(point.id) ||
    cutCandidatePointIds.value.has(point.id)
  ) {
    return 'fill-primary stroke-primary-foreground';
  }
  if (pickedPointIds.value.has(point.id)) return 'fill-primary stroke-primary-foreground';
  if (selectedIds.value.has(point.id)) return 'fill-primary stroke-primary-foreground';
  if (marqueeCandidates.value.has(point.id)) {
    return 'fill-primary stroke-primary-foreground opacity-60';
  }
  if (
    pendingIds.value.has(point.id) ||
    point.id === pendingLineStartId.value ||
    point.id === pendingCircleCenterId.value
  ) {
    return 'fill-accent stroke-accent-foreground';
  }
  if (isAnnotation(point)) return 'fill-background stroke-annotation';
  return isConstruction(point) ? 'fill-muted-foreground' : 'fill-foreground';
}

/** Role-driven dash: guides and sewing marks are dashed, cut geometry is solid. */
function entityDash(entity: {
  construction?: boolean;
  role?: 'construction' | 'annotation';
}): string | undefined {
  return isAnnotation(entity) || isConstruction(entity) ? '4 4' : undefined;
}

function entityClass(entity: {
  id: EntityId;
  construction?: boolean;
  role?: 'construction' | 'annotation';
}): string {
  if (pointOnLineHover.value?.lineId === entity.id) return 'text-primary';
  if (
    dimensionPickLineIds.value.has(entity.id) ||
    dimensionCandidateLineIds.value.has(entity.id) ||
    cutEdgeCandidateIds.value.has(entity.id)
  ) {
    return 'text-primary';
  }
  if (
    pickedLineIds.value.has(entity.id) ||
    roundPickedLineIds.value.has(entity.id) ||
    selectedIds.value.has(entity.id)
  ) {
    return 'text-primary';
  }
  if (marqueeCandidates.value.has(entity.id)) return 'text-primary opacity-60';
  if (isAnnotation(entity)) return 'text-annotation';
  return isConstruction(entity) ? 'text-muted-foreground' : 'text-foreground';
}

/** The active-piece badge's text: its label and loop state. */
const activePieceLabel = computed(() => {
  const piece = props.document.pieces.find((candidate) => candidate.id === props.activePieceId);
  if (piece === undefined) return '';
  const index = props.document.pieces.indexOf(piece);
  const name = piece.name ?? `Piece ${index + 1}`;
  const loop =
    piece.edges.length === 0
      ? 'no cut loop'
      : pieceMetrics(props.document, piece) === null
        ? 'cut loop broken'
        : 'cut loop';
  return `${name} · ${loop}`;
});

interface TextView {
  id: EntityId;
  content: string;
  anchor: Vec2;
  rotation: number;
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  leader: LeaderGeometry | null;
  /** The rotated selection box; also the label's click target. */
  layout: TextLayout;
}

/** Annotation labels, resolved against their anchor and leader points. */
const textViews = computed<TextView[]>(() =>
  props.document.entities.flatMap((entity): TextView[] => {
    if (entity.kind !== 'text') return [];
    const anchor = getEntity(props.document, entity.anchor);
    if (anchor?.kind !== 'point') return [];
    const layout = textLayout(entity, { x: anchor.x, y: anchor.y })!;
    const leaderPoint =
      entity.leader === undefined ? undefined : getEntity(props.document, entity.leader);
    return [
      {
        id: entity.id,
        content: entity.content,
        anchor: { x: anchor.x, y: anchor.y },
        rotation: entity.rotation ?? 0,
        fontSize: entity.fontSize ?? DEFAULT_TEXT_SIZE,
        alignment: entity.alignment ?? 'left',
        layout,
        leader:
          leaderPoint?.kind === 'point'
            ? textLeaderGeometry(
                entity,
                { x: anchor.x, y: anchor.y },
                { x: leaderPoint.x, y: leaderPoint.y },
              )
            : null,
      },
    ];
  }),
);

function lineWidth(id: EntityId): number {
  return pointOnLineHover.value?.lineId === id ||
    dimensionPickLineIds.value.has(id) ||
    dimensionCandidateLineIds.value.has(id) ||
    cutEdgeCandidateIds.value.has(id) ||
    pickedLineIds.value.has(id) ||
    roundPickedLineIds.value.has(id) ||
    selectedIds.value.has(id) ||
    marqueeCandidates.value.has(id)
    ? 3
    : 2;
}

function svgRect(): DOMRect {
  return svg.value!.getBoundingClientRect();
}

function updateSize(): void {
  const rect = svgRect();
  size.value = { width: rect.width, height: rect.height };
}

function screenPoint(event: { clientX: number; clientY: number }): Vec2 {
  const rect = svgRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitEntity(event: Event): Hit | null {
  const element = (event.target as Element).closest('[data-entity-id]');
  if (!element) return null;
  return {
    id: element.getAttribute('data-entity-id')!,
    kind: element.getAttribute('data-kind')!,
  };
}

function snappedPoint(world: Vec2): Vec2 {
  const candidates = points.value.map((point) => ({ x: point.x, y: point.y }));
  return snapPoint(world, candidates);
}

/**
 * Dimension placement: every dimension picks two anchors, each a point or a
 * whole straight line; the next click after the second pick drops the line.
 */
function onDimensionPointer(hit: Hit | null): void {
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

  const issue = distanceAnchorIssue(props.document, pending[0]!.id, pick.id);
  if (issue.reason !== null) {
    dimensionHint.value = DIMENSION_ANCHOR_HINTS[issue.reason];
    return;
  }

  dimensionPending.value = [];
  dimensionHint.value = null;
  startDimensionPlacement(pending[0]!.id, pick.id);
}

/** The canvas hint for each shared pick-time anchor rejection. */
const DIMENSION_ANCHOR_HINTS: Record<DistanceAnchorReason, string> = {
  missing: 'Pick a point or a straight line.',
  'not-a-line': 'Pick a point or a straight line.',
  'not-parallel': 'Pick two parallel lines — use Angle for a corner.',
  'point-on-line': 'The point lies on the line.',
  coincident: 'The lines are coincident.',
  'zero-length': 'Pick a point or a straight line.',
};

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
  emit('add-dimension', placement);
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
  emit('add-cut-dimension', placement);
}

/** Drop the cut tool's pending pick, placement and message. */
function clearCutDimensionGesture(): void {
  cutDimensionPending.value = null;
  cutDimensionPlacement.value = null;
  cutDimensionHint.value = null;
}

/**
 * The cut tool's pick rules: two anchors of one piece, where each anchor is a
 * piece corner (seamline or cut) or a whole straight edge. A derived loop corner
 * picked near the pointer wins over the entity under it, so a corner with an
 * allowance offers both its stitch and its cut anchor. A rejected pick leaves a
 * hint instead of emitting a command; the shared `cutAnchorIssue` decides.
 */
function onCutDimensionPointer(hit: Hit | null, loopHandle: LoopHandle | null): void {
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

  const issue = cutAnchorIssue(props.document, pending.piece, pending.anchor, candidate.anchor);
  if (issue.reason !== null) {
    if (CUT_ANCHOR_CLEARS_PENDING[issue.reason]) cutDimensionPending.value = null;
    cutDimensionHint.value = CUT_ANCHOR_HINTS[issue.reason];
    return;
  }

  cutDimensionPending.value = null;
  cutDimensionHint.value = null;
  startCutDimensionPlacement(pending.piece.id, pending.anchor, candidate.anchor);
}

/** The hint shown for each shared cut-anchor rejection. */
const CUT_ANCHOR_HINTS: Record<CutAnchorIssueReason, string> = {
  missing: 'Pick a seamline or cut corner, or a straight edge, of a piece.',
  'not-straight': 'Pick a straight edge.',
  'different-piece': 'Both anchors must belong to the same piece.',
  'same-anchor': 'The anchors must be different.',
  'not-parallel': 'Pick two parallel edges.',
  'zero-span': 'The anchors must be different.',
};

/** Whether a rejection resets the first pick instead of keeping it pending. */
const CUT_ANCHOR_CLEARS_PENDING: Record<CutAnchorIssueReason, boolean> = {
  missing: true,
  'not-straight': true,
  'different-piece': true,
  'same-anchor': false,
  'not-parallel': false,
  'zero-span': false,
};

/**
 * The cut anchor a pointer hit addresses: a corner or a whole straight edge of
 * a piece. A corner shared by several pieces prefers the pending piece.
 */
function cutAnchorCandidate(
  hit: Hit,
  pendingPiece: Piece | null,
): { piece: Piece; anchor: CutAnchor } | null {
  if (hit.kind === 'point') {
    const pieces = piecesAtPoint(props.document, hit.id);
    const preferred =
      pendingPiece === null
        ? undefined
        : pieces.find((candidate) => candidate.id === pendingPiece.id);
    const piece = preferred ?? pieces[0];
    if (piece === undefined) return null;
    return { piece, anchor: anchorForPoint(props.document, piece, hit.id)! };
  }

  if (hit.kind !== 'line') return null;
  const piece = pieceOwningEdge(props.document, hit.id);
  const anchor = piece === null ? null : anchorForEdge(props.document, piece, hit.id);
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
  const span = resolveCutSpan(props.document, constraint);
  if (span === null) return;

  const world = screenToWorld(viewport.value, screen);
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

  const world = screenToWorld(viewport.value, screen);
  const orientation = inferDimensionOrientation(props.document, placement.a, placement.b, world);
  dimensionPlacement.value = {
    ...placement,
    orientation,
    offset: dimensionOffsetForPointer(props.document, placement.a, placement.b, orientation, world),
  };
}

/**
 * Selection comes first: with the Select tool a press selects, adds or
 * subtracts the dimension; only a plain press then starts the existing drag.
 * The Dimension and Cut dimension tools keep their drag-only behaviour.
 */
function onDimensionPointerDown(
  constraint: DistanceConstraint | DerivedDistanceConstraint,
  event: PointerEvent,
): void {
  if (props.readOnly) return;

  if (props.tool === 'select') {
    const mode = selectionModeFrom(event);
    if (mode === 'replace') {
      emit('update:selectedDimensionIds', [constraint.id]);
    } else {
      emit(
        'update:selectedDimensionIds',
        mode === 'add'
          ? toggleSelection(props.selectedDimensionIds, constraint.id)
          : applySelection(props.selectedDimensionIds, [constraint.id], 'subtract'),
      );
      // A modified press selects only; it never starts a drag.
      event.stopPropagation();
      event.preventDefault();
      emit('update:selectedEntityIds', []);
      return;
    }
    // Clicks are exclusive: a dimension click clears the entity selection.
    emit('update:selectedEntityIds', []);
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
  addPointerListeners();
}

/** Start dragging a cut dimension line; its span comes from the cut loop. */
function beginDerivedDimensionDrag(
  constraint: DerivedDistanceConstraint,
  event: PointerEvent,
): void {
  event.stopPropagation();
  event.preventDefault();
  // The drag strip only renders for a drawing whose span already resolved.
  const span = resolveCutSpan(props.document, constraint)!;
  const offset = constraintOffset(constraint);
  derivedDrag.value = {
    id: constraint.id,
    orientation: constraintOrientation(constraint),
    startOffset: offset,
    offset,
    span,
  };
  addPointerListeners();
}

function labelClass(label: DimensionLabelView): string {
  switch (label.state) {
    case 'referenced':
      return 'fill-dimension-reference';
    case 'broken':
      return 'fill-destructive';
    case 'driven':
      return 'fill-muted-foreground';
    case 'set':
      return 'fill-foreground';
  }
}

function onDimensionDoubleClick(label: DimensionLabelView): void {
  if (props.readOnly || !label.editable) return;
  void beginDimensionEdit(label.constraint);
}

async function beginDimensionEdit(constraint: DistanceConstraint): Promise<void> {
  // The label only renders for a resolvable span, so an effective value exists.
  const value = dimensionValue(props.document, constraint)!;
  const state = dimensionState(props.document, constraint);
  editingDimension.value = {
    id: constraint.id,
    value: formatDimensionField(constraint, value, state),
  };
  dimensionPicker.value = null;
  await nextTick();
  dimensionInput.value!.focus();
  dimensionInput.value!.select();
}

function onDimensionEditInput(event: Event): void {
  const editing = editingDimension.value!;
  const value = (event.target as HTMLInputElement).value;
  editingDimension.value = { id: editing.id, value };
  dimensionPicker.value = isReferenceEditText(value)
    ? { text: referenceSearchText(value), activeIndex: 0 }
    : null;
}

/** Arrow keys move the picker, Enter links or commits, Escape closes or cancels. */
function onDimensionEditorKeydown(event: KeyboardEvent): void {
  if (dimensionPicker.value !== null) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      movePicker(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      movePicker(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dimensionPicker.value = null;
      return;
    }
    if (event.key === 'Enter' && activePickerOption.value !== null) {
      event.preventDefault();
      selectReference(activePickerOption.value.id);
      return;
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    applyDimensionEdit();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelDimensionEdit();
  }
}

/** Pick a row: link the edited dimension and close the field. */
function selectReference(id: EntityId): void {
  const editing = editingDimension.value!;
  editingDimension.value = null;
  dimensionPicker.value = null;
  emit('update-dimension', editing.id, { reference: id });
}

/** Enter: apply a set, driven, unlink or reference edit; keep a typo editable. */
function applyDimensionEdit(): void {
  const editing = editingDimension.value!;
  const edit = parseDimensionEdit(editing.value);
  if (edit.kind === 'invalid') return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch === null) return;

  editingDimension.value = null;
  dimensionPicker.value = null;
  emit('update-dimension', editing.id, patch);
}

/** Blur: commit an applicable edit and discard an invalid or unresolved one. */
function finishDimensionEdit(): void {
  const editing = editingDimension.value;
  dimensionPicker.value = null;
  if (editing === null) return;

  const edit = parseDimensionEdit(editing.value);
  editingDimension.value = null;
  if (edit.kind === 'invalid') return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch !== null) emit('update-dimension', editing.id, patch);
}

function cancelDimensionEdit(): void {
  editingDimension.value = null;
  dimensionPicker.value = null;
}

/** Show a round's handles while its line or arc is hovered. */
function onEntityHover(id: EntityId): void {
  hoveredRoundId.value = cornerRoundsForEntity(props.document, id)[0]?.id ?? null;
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
    radius: round.radius,
    startRadius: round.radius,
  };
  addPointerListeners();
}

function beginTangentDragHandle(handle: CornerRoundHandleView, event: PointerEvent): void {
  const round = cornerRounds(props.document).find((candidate) => candidate.id === handle.id);
  if (round !== undefined) beginTangentDrag(round, handle.endIndex, event);
}

function commitTangentDrag(): void {
  const drag = tangentDrag.value!;
  tangentDrag.value = null;
  if (drag.radius !== drag.startRadius) {
    emit('set-corner-round-radius', drag.id, drag.radius);
  }
}

/** Open the inline radius field for a round, anchored at a screen position. */
async function openCornerRoundEditor(round: CornerRound, x: number, y: number): Promise<void> {
  editingCornerRound.value = {
    id: round.id,
    value: formatCornerRadius(round.radius),
    startRadius: round.radius,
    x,
    y,
  };
  await nextTick();
  cornerRoundInput.value!.focus();
  cornerRoundInput.value!.select();
}

/** Double-clicking a rounded arc opens the same radius field as the `R` label. */
function onCurveDoubleClick(id: EntityId, event: MouseEvent): void {
  if (props.tool !== 'select' || props.constraintActive) return;

  const round = roundsByArc.value.get(id);
  if (round === undefined) return;

  const point = screenPoint(event);
  void openCornerRoundEditor(round, point.x, point.y);
}

function onCornerRoundEditInput(event: Event): void {
  const editing = editingCornerRound.value!;
  editingCornerRound.value = {
    ...editing,
    value: (event.target as HTMLInputElement).value,
  };
}

/** Enter: apply a valid radius, otherwise keep editing to fix the typo. */
function applyCornerRoundEdit(): void {
  const editing = editingCornerRound.value!;
  const radius = parseCornerRadius(editing.value);
  if (radius === null) return;

  editingCornerRound.value = null;
  if (radius !== editing.startRadius) {
    emit('set-corner-round-radius', editing.id, radius);
  }
}

/** Blur: commit a valid edit and discard an invalid one. */
function finishCornerRoundEdit(): void {
  // Removing the focused input fires a final blur; there is nothing to commit.
  if (editingCornerRound.value === null) return;

  const editing = editingCornerRound.value;
  const radius = parseCornerRadius(editing.value);
  editingCornerRound.value = null;
  if (radius !== null && radius !== editing.startRadius) {
    emit('set-corner-round-radius', editing.id, radius);
  }
}

function cancelCornerRoundEdit(): void {
  editingCornerRound.value = null;
}

/** Whether a tool drafts new geometry inside the active piece. */
const DRAFTING_TOOLS = new Set<EditorTool>([
  'add_point',
  'add_line',
  'add_curve',
  'add_arc',
  'add_circle',
  'add_rectangle',
  'add_center_rectangle',
  'add_3point_rectangle',
  'add_text',
]);

/** The translation the active piece's cut loop previews during a move. */
function movePreview(pieceId: EntityId): string | undefined {
  if (moveDrag.value === null || pieceId !== props.activePieceId) return undefined;
  return `translate(${moveDrag.value.dx} ${moveDrag.value.dy})`;
}

function onPointerDown(event: PointerEvent): void {
  if (props.readOnly) return;

  updateSize();
  const screen = screenPoint(event);

  if (event.button === 1 || spaceHeld.value) {
    beginPan(screen);
    return;
  }
  if (event.button !== 0) return;

  if (props.moveMode && props.activePieceId !== null) {
    moveDrag.value = { start: screenToWorld(viewport.value, screen), dx: 0, dy: 0 };
    addPointerListeners();
    return;
  }

  const hit = hitEntity(event);

  if (
    hit !== null &&
    props.activePieceId !== null &&
    DRAFTING_TOOLS.has(props.tool) &&
    !canEditEntity(props.document, hit.id, props.activePieceId)
  ) {
    emit('cross-piece', pieceForEntity(props.document, hit.id)!.id);
    return;
  }

  if (hit !== null && props.tool === 'select') {
    const owner = pieceForEntity(props.document, hit.id);
    if (owner !== null && owner.id !== props.activePieceId) emit('activate-piece', owner.id);
  }
  if (props.constraintActive) {
    if (hit !== null) {
      emit('constraint-pick', { id: hit.id, kind: hit.kind as ConstraintPick['kind'] });
    }
    return;
  }

  if (props.roundCornerActive) {
    if (hit !== null) emit('round-corner-pick', hit.id);
    return;
  }

  switch (props.tool) {
    case 'select': {
      const mode = selectionModeFrom(event);
      if (hit === null) {
        // Touch keeps its single tap/pan; a mouse or pen drag is a marquee.
        if (event.pointerType === 'touch') {
          if (mode === 'replace') {
            emit('update:selectedEntityIds', []);
            emit('update:selectedDimensionIds', []);
          }
          beginPan(screen);
        } else {
          startMarquee(screen, mode);
        }
        break;
      }

      selectEntity(hit.id, mode);
      // Clicks are exclusive: an entity click clears the dimension selection.
      emit('update:selectedDimensionIds', []);
      if (mode !== 'replace') break;
      if (hit.kind === 'point' && !isCornerRoundDerived(props.document, hit.id)) {
        beginDrag(hit.id, pointById.value.get(hit.id)!);
      } else if (hit.kind !== 'point') {
        beginPan(screen);
      }
      break;
    }
    case 'add_point':
      onAddPointPointer(hit, screen);
      break;
    case 'add_line':
      onLinePointer(hit, screen);
      break;
    case 'add_circle':
      onCirclePointer(hit, screen);
      break;
    case 'add_rectangle':
    case 'add_center_rectangle':
    case 'add_3point_rectangle':
      onRectanglePointer(hit, screen);
      break;
    case 'add_curve':
      selectPendingPoint(hit, 4);
      break;
    case 'add_arc':
      onArcPointer(hit, screen);
      break;
    case 'dimension':
      onDimensionPointer(hit);
      break;
    case 'cut_dimension':
      onCutDimensionPointer(hit, pickLoopHandle(screen));
      break;
    case 'add_text':
      emit(
        'add-text',
        resolveDraftingEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
        ),
      );
      break;
  }
}

function onPointerMove(event: PointerEvent): void {
  const screen = screenPoint(event);

  if (moveDrag.value) {
    const world = screenToWorld(viewport.value, screen);
    moveDrag.value = {
      ...moveDrag.value,
      dx: world.x - moveDrag.value.start.x,
      dy: world.y - moveDrag.value.start.y,
    };
  } else if (tangentDrag.value) {
    const drag = tangentDrag.value;
    const round = cornerRounds(props.document).find((candidate) => candidate.id === drag.id);
    if (round !== undefined) {
      const radius = tangentDragRadius(
        props.document,
        round,
        drag.endIndex,
        screenToWorld(viewport.value, screen),
      );
      if (radius !== null) tangentDrag.value = { ...drag, radius };
    }
  } else if (marqueeState.value) {
    updateMarquee(screen);
  } else if (dimensionDrag.value) {
    const drag = dimensionDrag.value;
    dimensionDrag.value = {
      ...drag,
      offset: dimensionOffsetForPointer(
        props.document,
        drag.a,
        drag.b,
        drag.orientation,
        screenToWorld(viewport.value, screen),
      ),
    };
  } else if (derivedDrag.value) {
    const drag = derivedDrag.value;
    derivedDrag.value = {
      ...drag,
      offset: dimensionOffsetFromSpan(
        drag.span,
        drag.orientation,
        screenToWorld(viewport.value, screen),
      ),
    };
  } else if (panState.value) {
    const dx = screen.x - panState.value.start.x;
    const dy = screen.y - panState.value.start.y;
    viewport.value = panBy(panState.value.origin, dx, dy);
  } else if (dragState.value) {
    const world = snapToGrid(screenToWorld(viewport.value, screen));
    dragState.value = { ...dragState.value, x: world.x, y: world.y };
  }
}

/** Live dimension preview while placing; the canvas-level pointer move. */
function onCanvasPointerMove(event: PointerEvent): void {
  const screen = screenPoint(event);

  if (dimensionToolArmed.value && !props.readOnly) {
    hoveredPick.value = hitEntity(event);
    hoveredLoopHandle.value = props.tool === 'cut_dimension' ? pickLoopHandle(screen) : null;
    pointerWorld.value = screenToWorld(viewport.value, screen);
  }

  if (dimensionPlacement.value !== null && dimensionDrag.value === null) {
    updateDimensionPlacement(screen);
  }

  if (cutDimensionPlacement.value !== null) {
    updateCutDimensionPlacement(screen);
  }

  if (props.tool === 'add_line' && lineStart.value !== null) {
    linePreview.value = snappedPoint(screenToWorld(viewport.value, screen));
  }

  if (props.tool === 'add_arc' && arcStart.value !== null) {
    const world = snappedPoint(screenToWorld(viewport.value, screen));
    arcPointer.value = world;

    // The hint clears as soon as the pointer leaves the chord into a valid bulge.
    if (
      arcEnd.value !== null &&
      arcFromEndpoints(props.document, arcStart.value, arcEnd.value, {
        kind: 'new',
        x: world.x,
        y: world.y,
      }) !== null
    ) {
      arcHint.value = false;
    }
  }

  if (props.tool === 'add_point' && !props.readOnly) {
    updatePointOnLineHover(event, screen);
  }

  if (props.tool === 'add_circle' && circleCenter.value !== null) {
    circlePreview.value = snappedPoint(screenToWorld(viewport.value, screen));
  }

  if (rectangleMode.value !== null && rectangleClicks.value.length > 0) {
    rectanglePointer.value = snappedPoint(screenToWorld(viewport.value, screen));
  }
}

/** The pointer left the canvas: end the hover and ghost, keep a pending pick. */
function onCanvasPointerLeave(): void {
  hoveredPick.value = null;
  hoveredLoopHandle.value = null;
  pointerWorld.value = null;
  pointOnLineHover.value = null;
}

/** Drop every in-flight pointer interaction without emitting a command. */
function cancelPointerInteraction(): void {
  cancelMarquee();
  dimensionDrag.value = null;
  derivedDrag.value = null;
  dragState.value = null;
  moveDrag.value = null;
  panState.value = null;
  tangentDrag.value = null;
  removePointerListeners();
}

function onPointerCancel(): void {
  cancelPointerInteraction();
}

function onPointerUp(): void {
  if (moveDrag.value) {
    const { dx, dy } = moveDrag.value;
    moveDrag.value = null;
    if (dx !== 0 || dy !== 0) emit('move-piece', dx, dy);
  }

  if (tangentDrag.value) {
    commitTangentDrag();
  }

  if (marqueeState.value) {
    finishMarquee();
    removePointerListeners();
    return;
  }

  if (dimensionDrag.value) {
    const { id, offset, startOffset } = dimensionDrag.value;
    dimensionDrag.value = null;
    if (offset !== startOffset) {
      emit('update-dimension', id, { offset });
    }
  }

  if (derivedDrag.value) {
    const { id, offset, startOffset } = derivedDrag.value;
    derivedDrag.value = null;
    if (offset !== startOffset) {
      emit('update-dimension', id, { offset });
    }
  }

  if (dragState.value) {
    const { id, x, y, origin } = dragState.value;
    dragState.value = null;
    if (x !== origin.x || y !== origin.y) {
      emit('move-point', id, x, y);
    }
  }

  panState.value = null;
  removePointerListeners();
}

function onWheel(event: WheelEvent): void {
  // The rectangle must not change scale under the pointer mid-gesture.
  if (marqueeState.value !== null) return;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewport.value = zoomAt(viewport.value, screenPoint(event), factor);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && marqueeState.value !== null) {
    event.preventDefault();
    cancelPointerInteraction();
    return;
  }

  if (event.key === 'Escape' && rectangleClicks.value.length > 0) {
    event.preventDefault();
    clearRectangleGesture();
    return;
  }

  if (event.key === 'Escape' && pointOnLineHover.value !== null) {
    event.preventDefault();
    pointOnLineHover.value = null;
    return;
  }

  if (
    event.key === 'Escape' &&
    (dimensionPending.value.length > 0 ||
      dimensionPlacement.value !== null ||
      dimensionHint.value !== null)
  ) {
    event.preventDefault();
    dimensionPending.value = [];
    dimensionPlacement.value = null;
    dimensionHint.value = null;
    return;
  }

  if (
    event.key === 'Escape' &&
    (cutDimensionPending.value !== null ||
      cutDimensionPlacement.value !== null ||
      cutDimensionHint.value !== null)
  ) {
    event.preventDefault();
    clearCutDimensionGesture();
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld.value = true;
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') {
    spaceHeld.value = false;
  }
}

function emitAddPoint(screen: Vec2): void {
  const world = snappedPoint(screenToWorld(viewport.value, screen));
  emit('add-point', world.x, world.y);
}

/**
 * Where a Point-tool click on `lineId` would land, or `null` when the click is
 * not a line inference: a point within the snap tolerance wins, and only a
 * resolvable, non-degenerate straight line projects.
 */
function pointOnLineTarget(lineId: EntityId, world: Vec2): Vec2 | null {
  if (nearestPoint(world, points.value, POINT_SNAP_TOLERANCE) !== null) return null;
  const segment = lineEndpoints(props.document, lineId);
  return segment === null ? null : projectPointOnLine(world, segment);
}

/** Track the line the Point tool would infer, so the click is never a surprise. */
function updatePointOnLineHover(event: Event, screen: Vec2): void {
  const hit = hitEntity(event);
  if (hit === null || hit.kind !== 'line') {
    pointOnLineHover.value = null;
    return;
  }

  const pointer = screenToWorld(viewport.value, screen);
  const point = pointOnLineTarget(hit.id, pointer);
  pointOnLineHover.value = point === null ? null : { lineId: hit.id, pointer, point };
}

/**
 * The Point tool: a click on a straight line creates a point constrained to it,
 * as one undoable gesture; every other click keeps today's free-point behaviour.
 */
function onAddPointPointer(hit: Hit | null, screen: Vec2): void {
  if (hit !== null && hit.kind === 'line') {
    const world = screenToWorld(viewport.value, screen);
    if (pointOnLineTarget(hit.id, world) !== null) {
      pointOnLineHover.value = null;
      emit('add-point-on-line', hit.id, world.x, world.y);
      return;
    }
  }

  emitAddPoint(screen);
}

function selectPendingPoint(hit: Hit | null, required: number): void {
  if (!hit || hit.kind !== 'point') {
    pending.value = [];
    return;
  }

  const ids = pending.value.includes(hit.id) ? pending.value : [...pending.value, hit.id];
  if (ids.length === required) {
    commitPending(ids);
  } else {
    pending.value = ids;
  }
}

function commitPending(ids: EntityId[]): void {
  pending.value = [];
  emit('add-curve', [ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
}

/**
 * The line gesture: a point hit is reused by id, a bare canvas resolves to the
 * snapped position (which may coincide with an existing point). The first click
 * only stores a provisional start; the second emits both endpoints so the
 * editor can commit the points and the line as one undoable gesture.
 */
function onLinePointer(hit: Hit | null, screen: Vec2): void {
  const endpoint: DraftingEndpoint =
    hit !== null && hit.kind === 'point'
      ? { kind: 'point', id: hit.id }
      : resolveDraftingEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
        );

  const start = lineStart.value;
  if (start === null) {
    lineStart.value = endpoint;
    linePreview.value = null;
    return;
  }

  if (sameDraftingEndpoint(start, endpoint)) return;

  lineStart.value = null;
  linePreview.value = null;
  emit('add-line', start, endpoint);
}

/** Drop the pending arc gesture without emitting a command. */
function clearArcGesture(): void {
  arcStart.value = null;
  arcEnd.value = null;
  arcPointer.value = null;
  arcHint.value = false;
}

/**
 * The arc gesture: click 1 is the start, click 2 the end, click 3 a point on the
 * arc between them. Each click resolves like the Line tool. A repeated endpoint
 * is ignored silently; a third click on the chord would give an infinite radius,
 * so it is ignored and the hint asks for a point off the line, leaving the
 * pending start and end in place so the user can try again.
 */
function onArcPointer(hit: Hit | null, screen: Vec2): void {
  const endpoint: DraftingEndpoint =
    hit !== null && hit.kind === 'point'
      ? { kind: 'point', id: hit.id }
      : resolveDraftingEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
        );

  const start = arcStart.value;
  if (start === null) {
    clearArcGesture();
    arcStart.value = endpoint;
    return;
  }

  if (sameDraftingEndpoint(start, endpoint)) return;

  const end = arcEnd.value;
  if (end === null) {
    arcEnd.value = endpoint;
    arcPointer.value = null;
    return;
  }

  if (sameDraftingEndpoint(end, endpoint)) return;

  if (arcFromEndpoints(props.document, start, end, endpoint) === null) {
    arcHint.value = true;
    return;
  }

  clearArcGesture();
  emit('add-arc', start, end, endpoint);
}

/**
 * The circle gesture mirrors the line gesture: a point hit is reused by id, a
 * bare canvas resolves to the snapped position. The first click stores a
 * provisional centre; the second emits both endpoints so the editor can commit
 * the points and the circle as one undoable gesture.
 */
function onCirclePointer(hit: Hit | null, screen: Vec2): void {
  const endpoint: CircleEndpoint =
    hit !== null && hit.kind === 'point'
      ? { kind: 'point', id: hit.id }
      : resolveCircleEndpoint(props.document, screenToWorld(viewport.value, screen));

  const center = circleCenter.value;
  if (center === null) {
    circleCenter.value = endpoint;
    circlePreview.value = null;
    return;
  }

  if (sameCircleEndpoint(center, endpoint)) return;

  circleCenter.value = null;
  circlePreview.value = null;
  emit('add-circle', center, endpoint);
}

/** Drop the pending rectangle gesture without emitting a command. */
function clearRectangleGesture(): void {
  rectangleClicks.value = [];
  rectanglePointer.value = null;
}

/**
 * The rectangle gesture: each click resolves like the Line tool, a click on a
 * corner the gesture already holds is ignored, and the click that completes the
 * mode emits every click so the editor can commit the points, the four sides and
 * their constraints as one undoable gesture. A click that cannot complete a
 * rectangle leaves the pending clicks in place so the user can try again.
 */
function onRectanglePointer(hit: Hit | null, screen: Vec2): void {
  // Only the three rectangle tool cases below call this, so a mode always exists.
  const mode = rectangleMode.value!;

  const endpoint: DraftingEndpoint =
    hit !== null && hit.kind === 'point'
      ? { kind: 'point', id: hit.id }
      : resolveDraftingEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
        );

  if (rectangleClicks.value.some((click) => sameDraftingEndpoint(click, endpoint))) return;

  const clicks = [...rectangleClicks.value, endpoint];
  if (clicks.length < RECTANGLE_CLICKS[mode]) {
    rectangleClicks.value = clicks;
    rectanglePointer.value = null;
    return;
  }

  if (rectangleCorners(props.document, mode, clicks) === null) return;

  clearRectangleGesture();
  emit('add-rectangle', mode, clicks);
}

/** Combine one clicked entity with the current selection under `mode`. */
function selectEntity(id: EntityId, mode: SelectionMode): void {
  const current = props.selectedEntityIds;
  if (mode === 'replace') {
    emit('update:selectedEntityIds', [id]);
  } else if (mode === 'add') {
    emit('update:selectedEntityIds', toggleSelection(current, id));
  } else {
    emit('update:selectedEntityIds', applySelection(current, [id], 'subtract'));
  }
}

function startMarquee(screen: Vec2, mode: SelectionMode): void {
  marqueeState.value = { start: screen, current: screen, mode, latched: false };
  emit('marquee-change', true);
  addPointerListeners();
}

/** Move the rectangle and latch it once the pointer has travelled far enough. */
function updateMarquee(screen: Vec2): void {
  const state = marqueeState.value!;
  const distance = Math.hypot(screen.x - state.start.x, screen.y - state.start.y);
  marqueeState.value = {
    ...state,
    current: screen,
    latched: state.latched || distance >= MARQUEE_THRESHOLD,
  };
}

/** Commit a latched rectangle, or treat a sub-threshold drag as a click. */
function finishMarquee(): void {
  const state = marqueeState.value!;
  const rect = marqueeWorldRect.value!;
  const mode = rectMode(state.start.x, state.current.x);
  const hits = state.latched ? entitiesInRect(props.document, rect, mode) : [];
  const dimensionHits =
    state.latched && props.showDimensions ? dimensionsInRect(props.document, rect, mode) : [];
  marqueeState.value = null;
  emit('marquee-change', false);

  if (!state.latched) {
    // A bare-canvas click clears both selections; modified clicks keep theirs.
    if (state.mode === 'replace') {
      emit('update:selectedEntityIds', []);
      emit('update:selectedDimensionIds', []);
    }
    return;
  }

  // The marquee is the one gesture that may leave both selections non-empty:
  // replace with no hits clears its kind, additive/subtractive with no hits keeps it.
  emit('update:selectedEntityIds', applySelection(props.selectedEntityIds, hits, state.mode));
  emit(
    'update:selectedDimensionIds',
    applySelection(props.selectedDimensionIds, dimensionHits, state.mode),
  );
}

/** Discard the rectangle and leave the previous selection untouched. */
function cancelMarquee(): void {
  if (marqueeState.value === null) return;
  marqueeState.value = null;
  emit('marquee-change', false);
}

function beginPan(screen: Vec2): void {
  panState.value = { start: screen, origin: viewport.value };
  addPointerListeners();
}

function beginDrag(id: EntityId, origin: Vec2): void {
  dragState.value = { id, x: origin.x, y: origin.y, origin };
  addPointerListeners();
}

function addPointerListeners(): void {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}

function removePointerListeners(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
}

function fit(): void {
  const documentBounds = bounds(props.document);
  if (documentBounds) {
    updateSize();
    viewport.value = fitToBounds(documentBounds, size.value);
  }
}

function onWindowBlur(): void {
  cancelPointerInteraction();
}

onMounted(() => {
  updateSize();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('resize', updateSize);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(svg.value!);
  }
  fit();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('resize', updateSize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  removePointerListeners();
});

watch(
  () => props.fitToken,
  () => fit(),
);

watch(
  () => props.tool,
  () => {
    pending.value = [];
    lineStart.value = null;
    linePreview.value = null;
    clearArcGesture();
    circleCenter.value = null;
    circlePreview.value = null;
    clearRectangleGesture();
    dimensionPending.value = [];
    dimensionPlacement.value = null;
    dimensionHint.value = null;
    hoveredPick.value = null;
    hoveredLoopHandle.value = null;
    pointerWorld.value = null;
    clearCutDimensionGesture();
    editingDimension.value = null;
    cancelPointerInteraction();
    dimensionDrag.value = null;
    hoveredRoundId.value = null;
    editingCornerRound.value = null;
    pointOnLineHover.value = null;
  },
);

// Any document edit invalidates the inline editor: the constraint may have
// moved, been removed, or been undone underneath it. A pending line start or
// circle centre that referenced a point also disappears when that point does.
watch(
  () => props.document,
  () => {
    editingDimension.value = null;
    editingCornerRound.value = null;

    // Recompute the Point tool's inferred line against the new document so a
    // removed or degenerate line clears the hover signal.
    const pointOnLine = pointOnLineHover.value;
    if (pointOnLine !== null) {
      const point = pointOnLineTarget(pointOnLine.lineId, pointOnLine.pointer);
      pointOnLineHover.value = point === null ? null : { ...pointOnLine, point };
    }
    if (pendingLineStartId.value !== null && !pointById.value.has(pendingLineStartId.value)) {
      lineStart.value = null;
      linePreview.value = null;
    }
    const arcPointMissing = [arcStart.value, arcEnd.value].some((endpoint) =>
      endpointMissing(props.document, endpoint),
    );
    if (arcPointMissing) clearArcGesture();

    if (pendingCircleCenterId.value !== null && !pointById.value.has(pendingCircleCenterId.value)) {
      circleCenter.value = null;
      circlePreview.value = null;
    }

    if (rectangleClicks.value.some((endpoint) => endpointMissing(props.document, endpoint))) {
      clearRectangleGesture();
    }

    const cutPiece = cutDimensionPending.value?.piece.id ?? cutDimensionPlacement.value?.piece;
    if (cutPiece !== undefined && !props.document.pieces.some((piece) => piece.id === cutPiece)) {
      clearCutDimensionGesture();
      cutDimensionHint.value = 'Piece no longer exists';
    }
  },
);

watch(
  () => props.showDimensions,
  (visible) => {
    if (!visible) editingDimension.value = null;
    if (!visible && dimensionDrag.value) cancelPointerInteraction();
  },
);
</script>

<template>
  <div
    class="relative h-full min-h-0 w-full overflow-hidden rounded-md border bg-muted/30"
    :class="cursorClass"
    :aria-readonly="readOnly ? 'true' : undefined"
  >
    <svg
      ref="svg"
      class="block h-full w-full touch-none select-none"
      role="img"
      aria-label="Pattern canvas"
      @pointerdown="onPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerleave="onCanvasPointerLeave"
      @wheel.prevent="onWheel"
    >
      <defs>
        <pattern
          id="sewcraft-grid"
          patternUnits="userSpaceOnUse"
          :width="gridStep"
          :height="gridStep"
        >
          <path
            :d="gridPath"
            fill="none"
            class="stroke-border"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </pattern>
      </defs>

      <g :transform="transform">
        <rect
          x="-100000"
          y="-100000"
          width="200000"
          height="200000"
          fill="url(#sewcraft-grid)"
          data-testid="grid"
        />

        <g class="pointer-events-none" data-testid="piece-band-layer">
          <path
            v-for="piece in pieceViews"
            v-show="piece.band !== null"
            :key="`band-${piece.id}`"
            :d="piece.band ?? ''"
            fill-rule="evenodd"
            stroke="none"
            :class="piece.selected ? 'fill-primary/25' : 'fill-primary/10'"
            :data-piece-band="piece.id"
          />
        </g>

        <g class="pointer-events-none" data-testid="seam-layer">
          <path
            v-for="seam in seams"
            :key="seam.edge"
            :d="seam.d"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="6 3"
            vector-effect="non-scaling-stroke"
            :class="seam.selfIntersects ? 'text-destructive' : 'text-muted-foreground'"
            :data-seam-edge="seam.edge"
          />
        </g>

        <g>
          <template v-for="entry in lines" :key="entry.line.id">
            <line
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              :class="entityClass(entry.line)"
              :stroke-dasharray="entityDash(entry.line)"
              :stroke-width="lineWidth(entry.line.id)"
              stroke="currentColor"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.line.id"
              data-kind="line"
              :data-dimension-candidate="
                dimensionCandidateLineIds.has(entry.line.id) ? 'true' : undefined
              "
              :data-cut-dimension-candidate="
                cutEdgeCandidateIds.has(entry.line.id) ? 'true' : undefined
              "
              :data-dimension-first-pick="
                dimensionFirstPick?.kind === 'line' && dimensionFirstPick.id === entry.line.id
                  ? 'true'
                  : undefined
              "
              @pointerenter="onEntityHover(entry.line.id)"
              @pointerleave="onEntityLeave"
            />
            <line
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              stroke="transparent"
              stroke-width="12"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.line.id"
              data-kind="line"
              @pointerenter="onEntityHover(entry.line.id)"
              @pointerleave="onEntityLeave"
            />
          </template>

          <path
            v-for="entry in curves"
            :key="entry.curve.id"
            :d="entry.d"
            fill="none"
            :class="entityClass(entry.curve)"
            :stroke-dasharray="entityDash(entry.curve)"
            :stroke-width="lineWidth(entry.curve.id)"
            stroke="currentColor"
            vector-effect="non-scaling-stroke"
            :data-entity-id="entry.curve.id"
            data-kind="curve"
            :data-cut-dimension-candidate="
              cutEdgeCandidateIds.has(entry.curve.id) ? 'true' : undefined
            "
            @pointerenter="onEntityHover(entry.curve.id)"
            @pointerleave="onEntityLeave"
            @dblclick.stop.prevent="onCurveDoubleClick(entry.curve.id, $event)"
          />

          <path
            v-for="entry in arcs"
            :key="entry.arc.id"
            :d="entry.d"
            fill="none"
            :class="entityClass(entry.arc)"
            :stroke-dasharray="entityDash(entry.arc)"
            :stroke-width="lineWidth(entry.arc.id)"
            stroke="currentColor"
            vector-effect="non-scaling-stroke"
            :data-entity-id="entry.arc.id"
            data-kind="arc"
            :data-cut-dimension-candidate="
              cutEdgeCandidateIds.has(entry.arc.id) ? 'true' : undefined
            "
            @pointerenter="onEntityHover(entry.arc.id)"
            @pointerleave="onEntityLeave"
          />

          <template v-for="entry in circles" :key="entry.circle.id">
            <circle
              :cx="entry.cx"
              :cy="entry.cy"
              :r="entry.r"
              fill="none"
              :class="entityClass(entry.circle)"
              :stroke-dasharray="entityDash(entry.circle)"
              :stroke-width="lineWidth(entry.circle.id)"
              stroke="currentColor"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.circle.id"
              data-kind="circle"
            />
            <circle
              :cx="entry.cx"
              :cy="entry.cy"
              :r="entry.r"
              fill="none"
              stroke="transparent"
              stroke-width="12"
              vector-effect="non-scaling-stroke"
              :data-entity-id="entry.circle.id"
              data-kind="circle"
            />
          </template>
        </g>

        <g data-testid="annotation-layer">
          <template v-for="entry in textViews" :key="entry.id">
            <g v-if="entry.leader" class="pointer-events-none">
              <line
                :x1="entry.leader.underline.start.x"
                :y1="entry.leader.underline.start.y"
                :x2="entry.leader.underline.end.x"
                :y2="entry.leader.underline.end.y"
                class="stroke-annotation"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
                :data-testid="`text-underline-${entry.id}`"
              />
              <line
                v-if="entry.leader.shaft"
                :x1="entry.leader.shaft.start.x"
                :y1="entry.leader.shaft.start.y"
                :x2="entry.leader.shaft.end.x"
                :y2="entry.leader.shaft.end.y"
                class="stroke-annotation"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
                :data-testid="`text-leader-${entry.id}`"
              />
              <polygon
                :points="entry.leader.head.map((point) => `${point.x},${point.y}`).join(' ')"
                class="fill-annotation"
                :data-testid="`text-arrow-${entry.id}`"
              />
            </g>
            <polygon
              :points="entry.layout.corners.map((point) => `${point.x},${point.y}`).join(' ')"
              fill="none"
              pointer-events="all"
              :class="props.tool === 'select' ? 'cursor-move' : 'cursor-pointer'"
              :data-entity-id="entry.id"
              data-kind="text"
              :data-testid="`text-hit-${entry.id}`"
            />
            <text
              :transform="`translate(${entry.anchor.x} ${entry.anchor.y}) rotate(${(entry.rotation * 180) / Math.PI})`"
              :font-size="entry.fontSize"
              :text-anchor="
                entry.alignment === 'left'
                  ? 'start'
                  : entry.alignment === 'center'
                    ? 'middle'
                    : 'end'
              "
              class="pointer-events-none fill-annotation font-annotation italic"
              aria-hidden="true"
              :data-entity-id="entry.id"
              data-kind="text"
              :data-testid="`text-${entry.id}`"
            >
              {{ entry.content }}
            </text>
          </template>
        </g>

        <g class="pointer-events-none" data-testid="piece-cut-layer">
          <path
            v-for="piece in pieceViews"
            :key="`cut-${piece.id}`"
            :d="piece.cut"
            fill="none"
            :stroke-width="1.5"
            :class="piece.selfIntersects ? 'stroke-destructive' : 'stroke-foreground'"
            vector-effect="non-scaling-stroke"
            :data-piece-cut="piece.id"
            :transform="movePreview(piece.id)"
          />
        </g>

        <g class="pointer-events-none" data-testid="piece-stitch-layer">
          <path
            v-for="piece in pieceViews"
            :key="`stitch-${piece.id}`"
            :d="piece.stitch"
            fill="none"
            stroke-width="0.75"
            class="stroke-muted-foreground"
            vector-effect="non-scaling-stroke"
            :data-piece-stitch="piece.id"
          />
        </g>

        <g class="pointer-events-none" data-testid="piece-fold-layer">
          <template v-for="piece in pieceViews" :key="`fold-${piece.id}`">
            <path
              v-for="(fold, index) in piece.folds"
              :key="`fold-${piece.id}-${index}`"
              :d="fold"
              fill="none"
              stroke-width="1"
              stroke-dasharray="6 3"
              class="stroke-muted-foreground"
              vector-effect="non-scaling-stroke"
              :data-piece-fold="piece.id"
            />
          </template>
        </g>

        <g
          v-if="roundPreview"
          class="pointer-events-none"
          data-testid="corner-round-preview"
          aria-hidden="true"
        >
          <line
            v-for="(entry, index) in roundPreview.lines"
            :key="entry.id"
            :x1="entry.from.x"
            :y1="entry.from.y"
            :x2="entry.to.x"
            :y2="entry.to.y"
            class="stroke-primary"
            stroke-width="1.5"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
            :data-testid="`corner-round-preview-line-${index}`"
          />
          <path
            :d="roundPreview.arc"
            fill="none"
            class="stroke-primary"
            stroke-width="1.5"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
            data-testid="corner-round-preview-arc"
          />
          <circle
            v-for="(tangent, index) in roundPreview.tangents"
            :key="`preview-${index}`"
            :cx="tangent.x"
            :cy="tangent.y"
            r="2.5"
            class="fill-primary"
          />
        </g>

        <g
          v-if="tangentPreview"
          class="pointer-events-none"
          data-testid="corner-round-drag-preview"
          aria-hidden="true"
        >
          <path
            :d="tangentPreview.arc"
            fill="none"
            class="stroke-primary"
            stroke-width="1.5"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
          <circle
            v-for="(tangent, index) in tangentPreview.tangents"
            :key="`drag-${index}`"
            :cx="tangent.x"
            :cy="tangent.y"
            r="2.5"
            class="fill-primary"
          />
        </g>

        <g v-if="pointOnLineHover !== null" class="pointer-events-none" aria-hidden="true">
          <circle
            :cx="pointOnLineHover.point.x"
            :cy="pointOnLineHover.point.y"
            r="4"
            class="fill-primary stroke-primary-foreground"
            stroke-width="1"
            data-testid="point-on-line-ghost"
          />
        </g>

        <g v-if="pendingLineStart !== null" class="pointer-events-none" aria-hidden="true">
          <line
            v-if="linePreview !== null"
            :x1="pendingLineStart.x"
            :y1="pendingLineStart.y"
            :x2="linePreview.x"
            :y2="linePreview.y"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            data-testid="line-preview"
          />
          <circle
            v-if="lineStart?.kind === 'new'"
            :cx="pendingLineStart.x"
            :cy="pendingLineStart.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            data-testid="line-pending-point"
          />
        </g>

        <g v-if="arcStartPosition !== null" class="pointer-events-none" aria-hidden="true">
          <line
            v-if="arcChord !== null"
            :x1="arcChord.start.x"
            :y1="arcChord.start.y"
            :x2="arcChord.end.x"
            :y2="arcChord.end.y"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            data-testid="arc-chord"
          />
          <path
            v-if="arcPreview !== null"
            :d="arcPreview.d"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            data-testid="arc-preview"
          />
          <circle
            v-if="arcPendingStart !== null"
            :cx="arcPendingStart.x"
            :cy="arcPendingStart.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            data-testid="arc-pending-start"
          />
          <circle
            v-if="arcPendingEnd !== null"
            :cx="arcPendingEnd.x"
            :cy="arcPendingEnd.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            data-testid="arc-pending-end"
          />
        </g>

        <g v-if="pendingCircleCenter !== null" class="pointer-events-none" aria-hidden="true">
          <circle
            v-if="circlePreview !== null"
            :cx="pendingCircleCenter.x"
            :cy="pendingCircleCenter.y"
            :r="circlePreviewRadius"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            data-testid="circle-preview"
          />
          <circle
            v-if="circleCenter?.kind === 'new'"
            :cx="pendingCircleCenter.x"
            :cy="pendingCircleCenter.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            data-testid="circle-pending-center"
          />
        </g>

        <g
          v-if="props.roundCornerActive"
          class="pointer-events-none"
          aria-hidden="true"
          data-testid="roundable-corner-layer"
        >
          <circle
            v-for="corner in roundableCornerPoints"
            :key="`roundable-${corner.id}`"
            :cx="corner.x"
            :cy="corner.y"
            r="2"
            class="roundable-corner fill-primary/60"
            data-testid="roundable-corner"
            :data-roundable-corner="corner.id"
          />
        </g>

        <g v-if="rectanglePreview !== null" class="pointer-events-none" aria-hidden="true">
          <path
            :d="rectanglePreview.path"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
            class="text-muted-foreground"
            :data-testid="rectanglePreview.testId"
          />
        </g>

        <g v-if="rectanglePendingCorners.length > 0" class="pointer-events-none" aria-hidden="true">
          <circle
            v-for="(corner, index) in rectanglePendingCorners"
            :key="`rectangle-corner-${index}`"
            :cx="corner.x"
            :cy="corner.y"
            r="4"
            class="fill-accent stroke-accent-foreground"
            stroke-width="1"
            :data-testid="`rectangle-pending-corner-${index}`"
          />
        </g>

        <g data-testid="corner-round-feature-layer" aria-hidden="true">
          <circle
            v-for="point in cornerRoundFeaturePoints"
            :key="`feature-${point.id}`"
            :cx="point.x"
            :cy="point.y"
            r="3"
            stroke-width="1"
            :class="featurePointClass(point)"
            :data-entity-id="point.id"
            data-kind="point"
            :data-testid="`corner-round-feature-${point.id}`"
          />
        </g>

        <g v-for="point in visiblePoints" :key="point.id">
          <circle
            :cx="point.x"
            :cy="point.y"
            r="4"
            stroke-width="1"
            :class="pointClass(point)"
            :data-entity-id="point.id"
            data-kind="point"
            :data-dimension-candidate="
              dimensionCandidatePointIds.has(point.id) ? 'true' : undefined
            "
            :data-cut-dimension-candidate="cutCandidatePointIds.has(point.id) ? 'true' : undefined"
            :data-dimension-first-pick="
              dimensionFirstPick?.kind === 'point' && dimensionFirstPick.id === point.id
                ? 'true'
                : undefined
            "
          />
          <circle
            v-if="dimensionToolArmed"
            :cx="point.x"
            :cy="point.y"
            :r="6 / viewport.scale"
            fill="transparent"
            :data-entity-id="point.id"
            data-kind="point"
            data-testid="dimension-hit-target"
          />
          <circle
            v-if="props.roundCornerActive"
            :cx="point.x"
            :cy="point.y"
            r="6"
            fill="transparent"
            :data-entity-id="point.id"
            data-kind="point"
            data-testid="round-corner-point-target"
          />
          <circle
            v-if="selectedIds.has(point.id)"
            :cx="point.x"
            :cy="point.y"
            r="7"
            class="fill-none stroke-primary"
            stroke-width="1.5"
            data-testid="selection-handle"
          />
        </g>

        <g v-if="props.tool === 'cut_dimension'" class="pointer-events-none">
          <line
            v-for="entry in cutEdgeHandles"
            :key="`cut-edge-${entry.line.id}`"
            :x1="entry.start.x"
            :y1="entry.start.y"
            :x2="entry.end.x"
            :y2="entry.end.y"
            class="cut-edge-handle stroke-primary"
            stroke-width="6"
            stroke-opacity="0.25"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
            data-testid="cut-edge-handle"
            :data-cut-edge="entry.line.id"
          />
          <circle
            v-for="handle in loopHandles"
            :key="handle.key"
            :cx="handle.point.x"
            :cy="handle.point.y"
            :r="handle.anchor.loop === 'stitch' ? 6 : 7"
            :stroke-width="
              cutCandidateKeys.has(handle.key) ? 2 : handle.anchor.loop === 'stitch' ? 1 : 1.5
            "
            :stroke-dasharray="handle.anchor.loop === 'stitch' ? '2 2' : undefined"
            :class="
              handle.anchor.loop === 'stitch'
                ? 'seamline-point-handle fill-none stroke-primary'
                : 'cut-vertex-handle fill-none stroke-primary'
            "
            data-testid="loop-point-handle"
            :data-loop="handle.anchor.loop ?? 'cut'"
            :data-loop-piece="handle.piece.id"
            :data-loop-edge="handle.anchor.edge"
            :data-loop-at="handle.anchor.at"
            :data-cut-dimension-candidate="cutCandidateKeys.has(handle.key) ? 'true' : undefined"
          />
        </g>

        <g v-if="!readOnly" class="pointer-events-none" aria-hidden="true">
          <template v-if="dimensionFirstPickPoint !== null">
            <circle
              :cx="dimensionFirstPickPoint.x"
              :cy="dimensionFirstPickPoint.y"
              r="9"
              class="fill-primary/15"
            />
            <circle
              :cx="dimensionFirstPickPoint.x"
              :cy="dimensionFirstPickPoint.y"
              r="7"
              fill="none"
              class="stroke-primary"
              stroke-width="2.5"
              data-testid="dimension-pick-first"
            />
          </template>
          <line
            v-if="dimensionFirstPickTick !== null"
            :x1="dimensionFirstPickTick.start.x"
            :y1="dimensionFirstPickTick.start.y"
            :x2="dimensionFirstPickTick.end.x"
            :y2="dimensionFirstPickTick.end.y"
            class="stroke-primary"
            stroke-width="3"
            stroke-linecap="round"
            data-testid="dimension-pick-first"
          />
          <template v-if="dimensionSecondPickPoint !== null">
            <circle
              :cx="dimensionSecondPickPoint.x"
              :cy="dimensionSecondPickPoint.y"
              r="6"
              fill="none"
              class="stroke-primary"
              stroke-width="2"
              data-testid="dimension-pick-second"
            />
          </template>
          <line
            v-if="dimensionSecondPickTick !== null"
            :x1="dimensionSecondPickTick.start.x"
            :y1="dimensionSecondPickTick.start.y"
            :x2="dimensionSecondPickTick.end.x"
            :y2="dimensionSecondPickTick.end.y"
            class="stroke-primary"
            stroke-width="3"
            stroke-linecap="round"
            data-testid="dimension-pick-second"
          />
          <circle
            v-if="dimensionCandidatePoint !== null"
            :cx="dimensionCandidatePoint.x"
            :cy="dimensionCandidatePoint.y"
            r="6"
            fill="none"
            class="stroke-primary"
            stroke-width="1.5"
            data-testid="dimension-candidate-ring"
          />
          <template v-if="dimensionGhost !== null">
            <line
              :x1="dimensionGhost.from.x"
              :y1="dimensionGhost.from.y"
              :x2="dimensionGhost.to.x"
              :y2="dimensionGhost.to.y"
              class="stroke-primary"
              stroke-width="1"
              stroke-dasharray="4 3"
              vector-effect="non-scaling-stroke"
              data-testid="dimension-rubber-band"
            />
            <circle
              :cx="dimensionGhost.to.x"
              :cy="dimensionGhost.to.y"
              r="3"
              class="fill-background stroke-primary"
              stroke-width="1.5"
              data-testid="dimension-rubber-band-end"
            />
          </template>
        </g>

        <g v-if="!readOnly" class="pointer-events-none" aria-hidden="true">
          <template v-if="cutFirstPickPosition !== null">
            <circle
              :cx="cutFirstPickPosition.x"
              :cy="cutFirstPickPosition.y"
              r="10"
              class="fill-primary/15"
            />
            <circle
              :cx="cutFirstPickPosition.x"
              :cy="cutFirstPickPosition.y"
              r="8"
              fill="none"
              class="stroke-primary"
              stroke-width="2.5"
              data-testid="cut-dimension-pick-first"
            />
          </template>
          <circle
            v-if="cutSecondPickPosition !== null"
            :cx="cutSecondPickPosition.x"
            :cy="cutSecondPickPosition.y"
            r="6"
            fill="none"
            class="stroke-primary"
            stroke-width="2"
            data-testid="cut-dimension-pick-second"
          />
          <template v-if="cutDimensionGhost !== null">
            <line
              :x1="cutDimensionGhost.from.x"
              :y1="cutDimensionGhost.from.y"
              :x2="cutDimensionGhost.to.x"
              :y2="cutDimensionGhost.to.y"
              class="stroke-primary"
              stroke-width="1"
              stroke-dasharray="4 3"
              vector-effect="non-scaling-stroke"
              data-testid="cut-dimension-rubber-band"
            />
            <circle
              :cx="cutDimensionGhost.to.x"
              :cy="cutDimensionGhost.to.y"
              r="3"
              class="fill-background stroke-primary"
              stroke-width="1.5"
              data-testid="cut-dimension-rubber-band-end"
            />
          </template>
        </g>

        <g
          v-for="drawing in dimensionDrawings"
          :key="drawing.id"
          class="pointer-events-none"
          :data-testid="`dimension-lines-${drawing.id}`"
          :data-dimension-id="drawing.id"
          :data-selected="drawing.selected ? 'true' : 'false'"
        >
          <template v-for="segment in drawing.segments" :key="segment.key">
            <line
              v-if="
                segment.main && (drawing.selected || marqueeDimensionCandidates.has(drawing.id))
              "
              :x1="segment.x1"
              :y1="segment.y1"
              :x2="segment.x2"
              :y2="segment.y2"
              :class="drawing.selected ? 'stroke-primary opacity-30' : 'stroke-primary opacity-20'"
              stroke-width="4"
              vector-effect="non-scaling-stroke"
              :data-testid="
                drawing.selected ? 'dimension-selection-halo' : 'dimension-marquee-preview'
              "
            />
            <line
              :x1="segment.x1"
              :y1="segment.y1"
              :x2="segment.x2"
              :y2="segment.y2"
              :class="
                drawing.preview
                  ? 'stroke-primary'
                  : segment.main
                    ? 'stroke-foreground'
                    : 'stroke-muted-foreground'
              "
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          </template>
          <line
            v-if="drawing.draggable"
            :x1="drawing.layout.dimensionStart.x"
            :y1="drawing.layout.dimensionStart.y"
            :x2="drawing.layout.dimensionEnd.x"
            :y2="drawing.layout.dimensionEnd.y"
            stroke="transparent"
            stroke-width="24"
            vector-effect="non-scaling-stroke"
            class="pointer-events-auto cursor-move"
            :data-testid="`dimension-drag-${drawing.id}`"
            @pointerdown.stop="onDimensionPointerDown(drawing.constraint, $event)"
          />
        </g>

        <g
          v-for="drawing in derivedDimensionDrawings"
          :key="`derived-${drawing.id}`"
          class="pointer-events-none"
          :data-testid="`dimension-lines-${drawing.id}`"
          :data-dimension-id="drawing.id"
          :data-dimension-derived="drawing.id"
          :data-selected="drawing.selected ? 'true' : 'false'"
        >
          <template v-for="segment in drawing.segments" :key="segment.key">
            <line
              v-if="
                segment.main && (drawing.selected || marqueeDimensionCandidates.has(drawing.id))
              "
              :x1="segment.x1"
              :y1="segment.y1"
              :x2="segment.x2"
              :y2="segment.y2"
              :class="drawing.selected ? 'stroke-primary opacity-30' : 'stroke-primary opacity-20'"
              stroke-width="4"
              vector-effect="non-scaling-stroke"
              :data-testid="
                drawing.selected ? 'dimension-selection-halo' : 'dimension-marquee-preview'
              "
            />
            <line
              :x1="segment.x1"
              :y1="segment.y1"
              :x2="segment.x2"
              :y2="segment.y2"
              :class="
                drawing.preview && segment.main
                  ? 'stroke-primary'
                  : segment.main
                    ? 'stroke-dimension-derived'
                    : 'stroke-muted-foreground'
              "
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          </template>
          <line
            v-if="drawing.draggable"
            :x1="drawing.layout.dimensionStart.x"
            :y1="drawing.layout.dimensionStart.y"
            :x2="drawing.layout.dimensionEnd.x"
            :y2="drawing.layout.dimensionEnd.y"
            stroke="transparent"
            stroke-width="24"
            vector-effect="non-scaling-stroke"
            class="pointer-events-auto cursor-move"
            :data-testid="`dimension-drag-${drawing.id}`"
            @pointerdown.stop="onDimensionPointerDown(drawing.constraint, $event)"
          />
        </g>
      </g>

      <g class="pointer-events-none" data-testid="dimension-labels-layer">
        <g
          v-for="label in dimensionLabels"
          :key="label.id"
          :class="
            label.draggable
              ? 'pointer-events-auto cursor-move'
              : label.editable
                ? 'pointer-events-auto cursor-text'
                : 'pointer-events-none'
          "
          :data-dimension-id="label.id"
          :data-testid="`dimension-label-${label.id}`"
          :data-selected="label.selected ? 'true' : 'false'"
          :transform="`translate(${label.x} ${label.y}) rotate(${label.angle})`"
          role="img"
          :aria-label="label.accessibleName"
          @pointerdown.stop="
            label.draggable ? onDimensionPointerDown(label.constraint, $event) : undefined
          "
          @dblclick.stop.prevent="onDimensionDoubleClick(label)"
        >
          <title>
            {{
              label.draggable
                ? 'Click to select, drag to reposition, double-click to edit'
                : label.editable
                  ? 'Double-click to edit'
                  : 'Dimension preview'
            }}
          </title>
          <rect
            :x="-label.width / 2"
            y="-8"
            :width="label.width"
            height="16"
            rx="2"
            :class="label.selected ? 'fill-background stroke-primary' : 'fill-background'"
            :stroke-width="label.selected ? 2 : 0"
          />
          <text
            v-if="label.state === 'broken'"
            :x="-label.width / 2 - 6"
            y="1"
            text-anchor="end"
            dominant-baseline="middle"
            class="fill-destructive text-[11px]"
            data-testid="dimension-broken-glyph"
            aria-hidden="true"
          >
            ⚠
          </text>
          <text
            text-anchor="middle"
            dominant-baseline="middle"
            :class="[labelClass(label), 'text-[11px]']"
            :data-dimension-state="label.state"
          >
            {{ label.value }}
          </text>
        </g>

        <g
          v-for="label in derivedDimensionLabels"
          :key="`derived-${label.id}`"
          :class="label.draggable ? 'pointer-events-auto cursor-move' : 'pointer-events-none'"
          :data-dimension-id="label.id"
          :data-dimension-derived="label.id"
          :data-testid="`dimension-label-${label.id}`"
          :data-selected="label.selected ? 'true' : 'false'"
          :transform="`translate(${label.x} ${label.y}) rotate(${label.angle})`"
          role="img"
          :aria-label="label.accessibleName"
          @pointerdown.stop="
            label.draggable
              ? onDimensionPointerDown(derivedConstraint(label.id), $event)
              : undefined
          "
        >
          <title>
            {{
              label.draggable ? 'Click to select, drag to reposition' : 'Cut dimension (read-only)'
            }}
          </title>
          <rect
            :x="-label.width / 2"
            y="-8"
            :width="label.width"
            height="16"
            rx="2"
            :class="label.selected ? 'fill-background stroke-primary' : 'fill-background'"
            :stroke-width="label.selected ? 2 : 0"
          />
          <text
            text-anchor="middle"
            dominant-baseline="middle"
            class="fill-dimension-derived text-[11px]"
            :data-dimension-state="label.state"
          >
            {{ label.value }}
          </text>
        </g>
      </g>

      <g class="pointer-events-none" data-testid="corner-round-layer">
        <g
          v-for="handle in roundHandles"
          :key="`handle-${handle.id}-${handle.endIndex}`"
          class="pointer-events-auto cursor-move"
          :data-testid="`corner-round-handle-${handle.id}-${handle.endIndex}`"
          :transform="`translate(${handle.x} ${handle.y})`"
          role="img"
          :aria-label="`Tangent handle for corner round ${handle.id}`"
        >
          <title>Drag to change the corner radius</title>
          <rect
            x="-5"
            y="-5"
            width="10"
            height="10"
            class="fill-primary stroke-background"
            stroke-width="1.5"
            @pointerdown.stop="beginTangentDragHandle(handle, $event)"
          />
        </g>

        <g
          v-for="label in roundLabels"
          :key="`label-${label.id}`"
          class="pointer-events-auto cursor-text"
          :data-testid="`corner-round-label-${label.id}`"
          :transform="`translate(${label.screenX} ${label.screenY})`"
          role="img"
          :aria-label="label.accessible"
          @pointerdown.stop.prevent
          @dblclick.stop.prevent="openCornerRoundEditor(label.round, label.screenX, label.screenY)"
        >
          <title>Double-click to edit the radius</title>
          <rect x="-18" y="-8" width="36" height="16" rx="2" class="fill-background" />
          <text text-anchor="middle" dominant-baseline="middle" class="fill-foreground text-[11px]">
            {{ label.text }}
          </text>
        </g>
      </g>

      <g class="pointer-events-none" data-testid="constraints-layer">
        <g
          v-for="marker in constraintLayer"
          :key="marker.id"
          class="pointer-events-auto"
          :data-constraint-id="marker.id"
          :data-constraint-type="marker.type"
          :transform="`translate(${marker.x} ${marker.y})`"
          role="img"
          :aria-label="marker.label"
        >
          <title>{{ marker.label }}</title>
          <circle r="9" class="fill-background stroke-muted-foreground" stroke-width="1" />
          <g transform="translate(-6 -6)">
            <path
              v-for="(d, index) in CONSTRAINT_ICONS[marker.type].paths"
              :key="index"
              :d="d"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-foreground"
            />
            <circle
              v-for="(dot, index) in CONSTRAINT_ICONS[marker.type].dots"
              :key="`dot-${index}`"
              :cx="dot.cx"
              :cy="dot.cy"
              :r="dot.r"
              class="fill-foreground"
            />
          </g>
        </g>
      </g>

      <g class="pointer-events-none">
        <rect
          x="0"
          y="0"
          :width="size.width"
          height="16"
          class="fill-background/90"
          data-testid="ruler-x"
        />
        <rect
          x="0"
          y="0"
          width="16"
          :height="size.height"
          class="fill-background/90"
          data-testid="ruler-y"
        />

        <g v-for="tick in xTicks" :key="`x-${tick}`">
          <line
            :x1="xTickPosition(tick)"
            :x2="xTickPosition(tick)"
            y1="12"
            y2="16"
            class="stroke-border"
            vector-effect="non-scaling-stroke"
          />
          <text :x="xTickPosition(tick) + 3" y="11" class="fill-muted-foreground text-[8px]">
            {{ tick }}
          </text>
        </g>

        <g v-for="tick in yTicks" :key="`y-${tick}`">
          <line
            x1="12"
            x2="16"
            :y1="yTickPosition(tick)"
            :y2="yTickPosition(tick)"
            class="stroke-border"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>

      <g v-if="marqueeRect !== null" class="pointer-events-none" data-testid="selection-marquee">
        <rect
          :x="marqueeRect.x"
          :y="marqueeRect.y"
          :width="marqueeRect.width"
          :height="marqueeRect.height"
          fill="currentColor"
          fill-opacity="0.1"
          stroke="currentColor"
          stroke-width="1"
          stroke-dasharray="4 4"
          vector-effect="non-scaling-stroke"
          class="text-primary"
        />
      </g>
    </svg>

    <div
      v-if="props.activePieceId !== null"
      class="pointer-events-none absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-1 text-2xs shadow-sm"
      data-testid="active-piece-badge"
      role="status"
      aria-live="polite"
    >
      {{ activePieceLabel }}
    </div>

    <p
      v-if="arcHint"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="arc-hint"
    >
      pick a point off the line
    </p>

    <p
      v-if="pointOnLineHover !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="point-on-line-hint"
    >
      Click to create a point constrained to this line.
    </p>

    <p
      v-if="dimensionHintText !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="dimension-hint"
    >
      {{ dimensionHintText }}
    </p>

    <p
      v-if="cutDimensionHintText !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="cut-dimension-hint"
    >
      {{ cutDimensionHintText }}
    </p>

    <input
      v-if="dimensionEditor !== null"
      ref="dimensionInput"
      :value="dimensionEditor.value"
      type="text"
      inputmode="decimal"
      class="absolute z-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-1 py-0.5 text-center text-xs shadow-sm"
      :style="{ left: `${dimensionEditor.x}px`, top: `${dimensionEditor.y}px` }"
      data-testid="dimension-editor"
      :aria-label="`Dimension ${dimensionEditor.id} value`"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="dimensionPicker !== null"
      :aria-controls="dimensionPicker === null ? undefined : 'dimension-reference-list'"
      :aria-activedescendant="pickerActiveDescendant"
      @input="onDimensionEditInput"
      @keydown="onDimensionEditorKeydown"
      @blur="finishDimensionEdit"
    />

    <input
      v-if="editingCornerRound !== null"
      ref="cornerRoundInput"
      :value="editingCornerRound.value"
      type="text"
      inputmode="decimal"
      class="absolute z-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-1 py-0.5 text-center text-xs shadow-sm"
      :style="{ left: `${editingCornerRound.x}px`, top: `${editingCornerRound.y}px` }"
      data-testid="corner-round-editor"
      :aria-label="`Corner round ${editingCornerRound.id} radius in millimetres`"
      @input="onCornerRoundEditInput"
      @keydown.enter.prevent.stop="applyCornerRoundEdit"
      @keydown.esc.prevent.stop="cancelCornerRoundEdit"
      @blur="finishCornerRoundEdit"
    />

    <DimensionReferencePicker
      v-if="dimensionPicker !== null && dimensionEditor !== null"
      list-id="dimension-reference-list"
      class="left-0 top-0"
      :style="{ left: `${dimensionEditor.x}px`, top: `${dimensionEditor.y + 18}px` }"
      :options="dimensionPickerOptions"
      :active-index="pickerActiveIndex"
      @select="selectReference"
    />
  </div>
</template>
