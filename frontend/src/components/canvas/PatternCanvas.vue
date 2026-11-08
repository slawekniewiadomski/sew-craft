<script setup lang="ts">
import {
  allPoints,
  type ArcEntity,
  type CircleEntity,
  type CurveEntity,
  type CutAnchor,
  type DerivedDistanceConstraint,
  derivedDimensionGeometry,
  derivedDimensionState,
  derivedDimensionValue,
  dimensionGeometry,
  type DimensionLayout,
  dimensionState,
  dimensionValue,
  type DimensionState,
  dimensionsInRect,
  type DistanceConstraint,
  entitiesInRect,
  type EntityId,
  getEntity,
  isAnnotation,
  isConstruction,
  isCornerRoundDerived,
  centreLineGeometry,
  notchGeometry,
  pieceMarks,
  type LineEntity,
  type LeaderGeometry,
  measureDistanceDimension,
  measureLinearDimension,
  MIN_RADIUS,
  type ParamInput,
  type PatternDocument,
  type Piece,
  pieceCutLoop,
  pieceCutVertex,
  pieceMetrics,
  pieceFoldLines,
  pieceLoop,
  pieceLoopVertex,
  type PointEntity,
  type Rect,
  type TextLayout,
  type TextEntity,
  textLayout,
  textLeaderGeometry,
  DEFAULT_TEXT_SIZE,
  bandTargetKey,
  pieceBandRegions,
  seamAllowancePaths,
  type BandRegion,
  type BandTarget,
  type Vec2,
} from '@sewcraft/geometry';
import { cutLoopContains, regionAt } from '@/lib/allowance-regions';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { arcFromEndpoints } from '@/lib/arc-tool';
import { resolveCircleEndpoint, sameCircleEndpoint, type CircleEndpoint } from '@/lib/circle-tool';
import type { ConstraintPick } from '@/lib/constraint-tools';
import { CONSTRAINT_ICONS, constraintMarkers, type ConstraintMarker } from '@/lib/constraint-view';
import { type CornerRoundPicks } from '@/lib/corner-round';
import {
  formulaIssue,
  insertVariableToken,
  variableOptions,
  variableQuery,
  variableQueryIsComplete,
} from '@/lib/formula';
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

import { isEditableTarget } from '@/lib/dom';
import { type DraftingEndpoint } from '@/lib/drafting';
import type { EditorTool } from '@/lib/editor-tools';
import {
  anchorForEdge,
  canEditEntity,
  edgeEndpoints,
  nearestLoopHandle,
  pieceForEntity,
} from '@/lib/pieces';
import { type RectangleMode } from '@/lib/rectangle-tool';
import {
  applySelection,
  rectMode,
  selectionModeFrom,
  toggleSelection,
  type SelectionMode,
} from '@/lib/selection';
import { nearestLineMidpoint } from '@/lib/midpoint';
import { notchTargetAt } from '@/lib/marks';
import { splitCandidate, type SplitCandidate } from '@/lib/split-line';
import { snapToGrid } from '@/lib/snap';
import { DEFAULT_TEXT_CONTENT, leaderTargetIssue } from '@/lib/text-tool';
import { panBy, screenToWorld, worldToScreen, type Viewport } from '@/lib/viewport';

import {
  derivedDimensionDrawing,
  derivedDimensionLabelViews,
  dimensionDrawing,
  dimensionLabelViews,
  type DerivedDimensionDrawing,
  type DerivedDimensionLabelView,
  type DimensionDrawing,
  type DimensionDrawingOptions,
  type DimensionLabelView,
} from '@/lib/pattern-canvas-dimensions';
import { useCanvasViewport, type CanvasHit as Hit } from '@/composables/use-canvas-viewport';
import { useCornerRoundEdit } from '@/composables/use-corner-round-edit';
import { useDimensionGesture } from '@/composables/use-dimension-gesture';
import { useDraftingGestures } from '@/composables/use-drafting-gestures';
import { useReferencePicker } from '@/composables/use-reference-picker';
import { useVariablePicker } from '@/composables/use-variable-picker';
import {
  arcViews,
  bandCutLoopOf,
  bandPieceOf,
  bandRegionsOf,
  circleViews,
  curveViews,
  lineViews,
  pieceViewsOf,
  regionClass as regionClassFor,
  regionViewsOf,
  seamViews,
  type LineView,
  type PieceView,
  type RegionView,
} from '@/lib/pattern-canvas-views';
import CanvasOverlayLayers from '@/components/canvas/CanvasOverlayLayers.vue';
import CanvasAnnotationLayers, {
  type MarkView,
  type TextView,
} from '@/components/canvas/CanvasAnnotationLayers.vue';
import CanvasPieceBandLayers from '@/components/canvas/CanvasPieceBandLayers.vue';
import CanvasPieceCutLayers from '@/components/canvas/CanvasPieceCutLayers.vue';
import CanvasDimensionDrawings from '@/components/canvas/CanvasDimensionDrawings.vue';
import CanvasDimensionLabels from '@/components/canvas/CanvasDimensionLabels.vue';
import CanvasEntityLayers from '@/components/canvas/CanvasEntityLayers.vue';
import CanvasMarquee from '@/components/canvas/CanvasMarquee.vue';
import CanvasPreviews from '@/components/canvas/CanvasPreviews.vue';
import CanvasRuler from '@/components/canvas/CanvasRuler.vue';
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';

/** A bare-canvas drag that may become a rectangular selection. */
interface MarqueeState {
  start: Vec2;
  current: Vec2;
  mode: SelectionMode;
  latched: boolean;
  /** The allowance region the press started on, so a click can pick it. */
  region: BandTarget | null;
}

/** Screen pixels the pointer must travel before a click becomes a marquee. */
const MARQUEE_THRESHOLD = 4;

const props = withDefaults(
  defineProps<{
    document: PatternDocument;
    tool: EditorTool;
    selectedEntityIds?: EntityId[];
    /** Ordered dimension selection, kept apart from the entity selection. */
    selectedDimensionIds?: EntityId[];
    /** Allowance regions selected on the band. */
    selectedAllowanceTargets?: BandTarget[];
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
    /** True while a measured variable's edges are being picked on the canvas. */
    measureActive?: boolean;
    /** Edges a measured variable reads; painted above the normal geometry. */
    highlightedEntityIds?: EntityId[];
  }>(),
  {
    selectedEntityIds: () => [],
    selectedDimensionIds: () => [],
    selectedAllowanceTargets: () => [],
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
    measureActive: false,
    highlightedEntityIds: () => [],
  },
);

const emit = defineEmits<{
  'update:selectedEntityIds': [ids: EntityId[]];
  'update:selectedDimensionIds': [ids: EntityId[]];
  'update:selectedAllowanceTargets': [targets: BandTarget[]];
  'marquee-change': [active: boolean];
  'move-point': [id: EntityId, x: number, y: number];
  'add-point': [x: number, y: number];
  'add-point-on-line': [lineId: EntityId, x: number, y: number];
  'add-point-midpoint': [lineId: EntityId];
  'split-line': [lineId: EntityId, x: number, y: number];
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
  'set-corner-round-radius': [id: EntityId, radius: ParamInput];
  'move-piece': [dx: number, dy: number];
  'measure-pick': [id: EntityId];
  'activate-piece': [id: EntityId];
  'cross-piece': [id: EntityId];
  'add-text': [anchor: DraftingEndpoint, leader?: DraftingEndpoint];
  'add-notch': [point: EntityId, edge: EntityId];
  'add-centre-line': [start: EntityId, end: EntityId];
}>();

const {
  svg,
  viewport,
  size,
  gridStep,
  gridPath,
  transform,
  xTicks,
  yTicks,
  updateSize,
  screenPoint,
  hitEntity,
  onWheel,
  fit,
} = useCanvasViewport({
  document: () => props.document,
  canZoom: () => marqueeState.value === null,
});

const dragState = ref<{ id: EntityId; x: number; y: number; origin: Vec2 } | null>(null);
/** A move gesture: its start in world space and the live translation. */
const moveDrag = ref<{ start: Vec2; dx: number; dy: number } | null>(null);
const panState = ref<{ start: Vec2; origin: Viewport } | null>(null);
const marqueeState = ref<MarqueeState | null>(null);
const {
  pendingIds,
  pendingLineStartId,
  pendingLineStart,
  lineStart,
  linePreview,
  arcStartPosition,
  arcChord,
  arcPreview,
  arcPendingStart,
  arcPendingEnd,
  arcHint,
  pendingCircleCenterId,
  pendingCircleCenter,
  circleCenter,
  circlePreview,
  circlePreviewRadius,
  rectangleMode,
  rectanglePreview,
  rectanglePendingCorners,
  textPreview,
  textLeaderHint,
  pointOnLineHover,
  splitLineHover,
  midpointHover,
  onPointerDown: onDraftingPointerDown,
  onPointerMove: onDraftingPointerMove,
  onPointerLeave: onDraftingPointerLeave,
  clearTextOnEscape,
  clearGestureOnEscape,
  resetOnToolChange: resetDraftingOnToolChange,
  pruneOnDocumentChange: pruneDraftingOnDocumentChange,
} = useDraftingGestures({
  document: () => props.document,
  tool: () => props.tool,
  activePieceId: () => props.activePieceId,
  readOnly: () => props.readOnly,
  points: () => points.value,
  viewport: () => viewport.value,
  onAddPoint: (x, y) => emit('add-point', x, y),
  onAddPointOnLine: (lineId, x, y) => emit('add-point-on-line', lineId, x, y),
  onAddPointMidpoint: (lineId) => emit('add-point-midpoint', lineId),
  onSplitLine: (lineId, x, y) => emit('split-line', lineId, x, y),
  onAddLine: (start, end) => emit('add-line', start, end),
  onAddArc: (start, end, through) => emit('add-arc', start, end, through),
  onAddCircle: (center, rim) => emit('add-circle', center, rim),
  onAddRectangle: (mode, clicks) => emit('add-rectangle', mode, clicks),
  onAddText: (anchor, leader) => emit('add-text', anchor, leader),
  onAddNotch: (point, edge) => emit('add-notch', point, edge),
  onAddCentreLine: (start, end) => emit('add-centre-line', start, end),
  onAddCurve: (points) => emit('add-curve', points),
});
const spaceHeld = ref(false);

const {
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
  dragEnabled: dimensionDragEnabled,
  beginDrag: onDimensionPointerDown,
  updateHover: updateDimensionHover,
  clearHover: clearDimensionHover,
  onPick: onDimensionPick,
  updatePlacements: updateDimensionPlacements,
  onDragMove: onDimensionDragMove,
  commitDrag: commitDimensionDrag,
  cancelDrag: cancelDimensionDrag,
  clearOnEscape: clearDimensionOnEscape,
  resetOnToolChange: resetDimensionOnToolChange,
  pruneOnDocumentChange: pruneDimensionOnDocumentChange,
} = useDimensionGesture({
  document: () => props.document,
  tool: () => props.tool,
  readOnly: () => props.readOnly,
  constraintActive: () => props.constraintActive,
  selectedDimensionIds: () => props.selectedDimensionIds,
  viewport: () => viewport.value,
  beginPointerTracking: addPointerListeners,
  onAddDimension: (placement) => emit('add-dimension', placement),
  onAddCutDimension: (placement) => emit('add-cut-dimension', placement),
  onUpdateDimension: (id, patch) => emit('update-dimension', id, patch),
  onSelectDimensions: (ids) => emit('update:selectedDimensionIds', ids),
  onSelectEntities: (ids) => emit('update:selectedEntityIds', ids),
});
/** The inline value editor, keyed to the dimension being edited. */
const editingDimension = ref<{ id: EntityId; value: string } | null>(null);
const dimensionInput = ref<HTMLInputElement | null>(null);
const hoveredRoundId = ref<EntityId | null>(null);

/** The allowance region under the pointer, and whether the pointer is inside its piece. */
const hoveredRegion = ref<BandTarget | null>(null);
const bandHovered = ref(false);

/** A touch that pressed on a region: a tap picks it, a drag still pans. */
const touchRegion = ref<{ target: BandTarget; start: Vec2 } | null>(null);
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

const selectedIds = computed(() => new Set(props.selectedEntityIds));

/** The edges a measured variable reads, for the highlight layer. */
const highlightedIds = computed(() => new Set(props.highlightedEntityIds));

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

const lines = computed(() => lineViews(props.document, pointById.value));

const curves = computed(() => curveViews(props.document, pointById.value));

const arcs = computed(() => arcViews(props.document, pointById.value));

const circles = computed(() => circleViews(props.document, pointById.value));

/**
 * Seam allowances are a render-only offset layer: hidden entirely when the
 * presentation toggle is off, and never part of the document the UI mutates.
 */
const seams = computed(() => seamViews(props.document, props.showAllowances));

/** The one piece the canvas shows: the active one, or the document's only piece. */
const bandPiece = computed<Piece | null>(() => bandPieceOf(props.document, props.activePieceId));

/** The allowance band parted into selectable regions. */
const bandRegions = computed<BandRegion[]>(() => bandRegionsOf(props.document, bandPiece.value));

/** The piece's cut loop, for the hover that reveals the region boundaries. */
const bandCutLoop = computed(() => bandCutLoopOf(props.document, bandPiece.value));

const regionViews = computed<RegionView[]>(() =>
  regionViewsOf(bandRegions.value, {
    showAllowances: props.showAllowances,
    selectedTargets: props.selectedAllowanceTargets,
    hovered: hoveredRegion.value,
    bandHovered: bandHovered.value,
    keyOf: bandTargetKey,
  }),
);

/** A region draws its boundary while the piece is hovered, and fills once picked. */
function regionClass(region: RegionView): string {
  return regionClassFor(region, bandHovered.value);
}

/** Every piece's derived geometry, ready to draw. */
const pieceViews = computed<PieceView[]>(() =>
  pieceViewsOf(props.document, {
    showAllowances: props.showAllowances,
    selectedPieceId: props.selectedPieceId,
    selectedEntityIds: props.selectedEntityIds,
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

const cursorClass = computed(() =>
  props.constraintActive ||
  props.roundCornerActive ||
  props.measureActive ||
  props.tool !== 'select'
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

/** The document, selection and drag every dimension drawing reads. */
const dimensionDrawingOptions = computed<DimensionDrawingOptions>(() => ({
  document: props.document,
  selectedIds: selectedDimensionIds.value,
  drag: dimensionDrag.value,
  dragEnabled: dimensionDragEnabled.value,
  constraintActive: props.constraintActive,
}));

function drawingFor(constraint: DistanceConstraint, preview: boolean): DimensionDrawing | null {
  return dimensionDrawing(constraint, preview, dimensionDrawingOptions.value);
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
  dimensionLabelViews(dimensionDrawings.value, (point) => worldToScreen(viewport.value, point)),
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
  return derivedDimensionDrawing(constraint, preview, {
    ...dimensionDrawingOptions.value,
    drag: derivedDrag.value,
  });
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
  derivedDimensionLabelViews(derivedDimensionDrawings.value, (point) =>
    worldToScreen(viewport.value, point),
  ),
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

/** Insert a picked variable token into whichever inline editor is open. */
function applyVariableToken(target: 'dimension' | 'corner-round', slug: string): void {
  if (target === 'dimension') {
    const editing = editingDimension.value!;
    editingDimension.value = { id: editing.id, value: insertVariableToken(editing.value, slug) };
    return;
  }
  applyCornerRoundVariableToken(slug);
}

/** The `$` picker both inline editors share. */
const {
  options: variablePickerOptions,
  isOpen: variablePickerOpen,
  pick: pickVariable,
  open: openVariablePicker,
  close: closeVariablePicker,
  onKeydown: onVariablePickerKeydown,
} = useVariablePicker<'dimension' | 'corner-round'>(
  () => props.document,
  (target, _id, slug) => applyVariableToken(target, slug),
);

const {
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
  onDragMove: onCornerRoundDragMove,
  commitDrag: commitTangentDrag,
  cancelDrag: cancelTangentDrag,
  onCurveDoubleClick,
  onEditInput: onCornerRoundEditInput,
  onEditorKeydown: onCornerRoundEditorKeydown,
  finishEdit: finishCornerRoundEdit,
  applyVariableToken: applyCornerRoundVariableToken,
  resetOnToolChange: resetCornerRoundOnToolChange,
  cancelOnDocumentChange: cancelCornerRoundOnDocumentChange,
  openEditor: openCornerRoundEditor,
} = useCornerRoundEdit({
  document: () => props.document,
  tool: () => props.tool,
  constraintActive: () => props.constraintActive,
  selectedEntityIds: () => props.selectedEntityIds,
  roundCornerPicks: () => props.roundCornerPicks,
  roundCornerActive: () => props.roundCornerActive,
  cornerRoundPreviewRadius: () => props.cornerRoundPreviewRadius,
  visiblePoints,
  pointById,
  viewport: () => viewport.value,
  screenPoint,
  beginPointerTracking: addPointerListeners,
  openVariablePicker: (field, id, text) => openVariablePicker(field, id, text),
  closeVariablePicker,
  onVariablePickerKeydown: (field, id, event) => onVariablePickerKeydown(field, id, event),
  onSetRadius: (id, radius) => emit('set-corner-round-radius', id, radius),
});

/** The `#` picker the dimension editor opens while a `#` token is typed. */
const {
  picker: dimensionPicker,
  options: dimensionPickerOptions,
  activeOption: activePickerOption,
  activeIndex: pickerActiveIndex,
  optionsFor,
  close: closeReferencePicker,
  onInput: onReferenceInput,
  onKeydown: onReferenceKeydown,
  select: linkReference,
} = useReferencePicker(
  () => props.document,
  (id, referenceId) => {
    editingDimension.value = null;
    emit('update-dimension', id, { reference: referenceId });
  },
);

/** The `aria-activedescendant` target while the picker is open. */
const pickerActiveDescendant = computed<string | undefined>(() =>
  activePickerOption.value === null
    ? undefined
    : `dimension-reference-list-${activePickerOption.value.id}`,
);

/** Pick a row from the list: link the edited dimension and close the field. */
function selectReference(reference: EntityId): void {
  linkReference(editingDimension.value!.id, reference);
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
  if (splitLineHover.value?.lineId === entity.id) return 'text-primary';
  if (midpointHover.value?.lineId === entity.id) return 'text-primary';
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
  /* v8 ignore next -- the badge renders only with an active piece */
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

/** Annotation labels, resolved against their drag-aware anchor and leader points. */
const textViews = computed<TextView[]>(() =>
  props.document.entities.flatMap((entity): TextView[] => {
    if (entity.kind !== 'text') return [];
    const anchor = pointById.value.get(entity.anchor);
    if (anchor === undefined) return [];
    const layout = textLayout(entity, { x: anchor.x, y: anchor.y })!;
    const leaderPoint =
      entity.leader === undefined ? undefined : pointById.value.get(entity.leader);
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
          leaderPoint === undefined
            ? null
            : textLeaderGeometry(
                entity,
                { x: anchor.x, y: anchor.y },
                { x: leaderPoint.x, y: leaderPoint.y },
              ),
      },
    ];
  }),
);

/** Notches and centre lines, resolved from the piece on read like every mark. */
const markViews = computed<MarkView[]>(() =>
  props.document.pieces.flatMap((piece: Piece): MarkView[] =>
    pieceMarks(props.document, piece.id).flatMap((mark): MarkView[] => {
      const selected = props.selectedEntityIds.includes(mark.id);
      if (mark.type === 'notch') {
        const geometry = notchGeometry(props.document, piece, mark);
        if (geometry === null) return [];
        const [first, second] = geometry.feet;
        return [
          {
            id: mark.id,
            kind: 'notch',
            path: `M ${first.x} ${first.y} L ${geometry.tip.x} ${geometry.tip.y} L ${second.x} ${second.y}`,
            selected,
          },
        ];
      }

      const geometry = centreLineGeometry(props.document, mark);
      if (geometry === null) return [];
      return [
        {
          id: mark.id,
          kind: 'centre_line',
          path: `M ${geometry.start.x} ${geometry.start.y} L ${geometry.end.x} ${geometry.end.y}`,
          selected,
        },
      ];
    }),
  ),
);

function lineWidth(id: EntityId): number {
  return pointOnLineHover.value?.lineId === id ||
    splitLineHover.value?.lineId === id ||
    midpointHover.value?.lineId === id ||
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

function labelClass(label: DimensionLabelView): string {
  switch (label.state) {
    case 'referenced':
      return 'fill-dimension-reference';
    case 'broken':
      return 'fill-destructive';
    case 'driven':
      return 'fill-muted-foreground';
    case 'formula':
      return 'fill-dimension-formula';
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
  closeReferencePicker();
  await nextTick();
  dimensionInput.value!.focus();
  dimensionInput.value!.select();
}

function onDimensionEditInput(event: Event): void {
  const editing = editingDimension.value!;
  const value = (event.target as HTMLInputElement).value;
  editingDimension.value = { id: editing.id, value };
  onReferenceInput(editing.id, event);
  openVariablePicker('dimension', editing.id, variableQuery(value));
}

/** Arrow keys move the picker, Enter links or commits, Escape closes or cancels. */
function onDimensionEditorKeydown(event: KeyboardEvent): void {
  const editing = editingDimension.value!;
  if (onVariablePickerKeydown('dimension', editing.id, event)) {
    event.preventDefault();
    return;
  }
  if (onReferenceKeydown(editing.id, event)) {
    event.preventDefault();
    return;
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

/** A formula is applicable only when it resolves; a typo stays editable. */
function formulaEditIsUsable(expr: string): boolean {
  return formulaIssue(props.document, expr) === null;
}

/** Enter: apply a set, formula, driven, unlink or reference edit; keep a typo editable. */
function applyDimensionEdit(): void {
  const editing = editingDimension.value!;
  const edit = parseDimensionEdit(editing.value);
  if (edit.kind === 'invalid') return;
  if (edit.kind === 'formula' && !formulaEditIsUsable(edit.expr)) return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch === null) return;

  editingDimension.value = null;
  closeReferencePicker();
  emit('update-dimension', editing.id, patch);
}

/** Blur: commit an applicable edit and discard an invalid or unresolved one. */
function finishDimensionEdit(): void {
  const editing = editingDimension.value;
  closeReferencePicker();
  closeVariablePicker();
  if (editing === null) return;

  const edit = parseDimensionEdit(editing.value);
  editingDimension.value = null;
  if (edit.kind === 'invalid') return;
  if (edit.kind === 'formula' && !formulaEditIsUsable(edit.expr)) return;

  const patch = dimensionPatchForEdit(edit, optionsFor(editing.id));
  if (patch !== null) emit('update-dimension', editing.id, patch);
}

function cancelDimensionEdit(): void {
  editingDimension.value = null;
  closeReferencePicker();
  closeVariablePicker();
}

const MIDPOINT_TOOLS = new Set<EditorTool>([
  'add_point',
  'add_line',
  'add_arc',
  'add_circle',
  'add_rectangle',
  'add_center_rectangle',
  'add_3point_rectangle',
]);

/** The edge kinds a measured variable may read. */
const MEASURABLE_KINDS = new Set(['line', 'curve', 'arc', 'circle']);

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
  'add_text_leader',
  'split_line',
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

  if (props.measureActive) {
    if (hit !== null && MEASURABLE_KINDS.has(hit.kind)) emit('measure-pick', hit.id);
    return;
  }

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
        const region = props.showAllowances
          ? (regionAt(bandRegions.value, screenToWorld(viewport.value, screen))?.target ?? null)
          : null;

        // Touch keeps its single tap/pan; a mouse or pen drag is a marquee. A
        // press on a region remembers it and still pans, so a drag pans and a
        // tap picks it on release.
        if (event.pointerType === 'touch') {
          if (mode === 'replace') {
            emit('update:selectedEntityIds', []);
            emit('update:selectedDimensionIds', []);
            emit('update:selectedAllowanceTargets', []);
          }
          touchRegion.value = region === null ? null : { target: region, start: screen };
          beginPan(screen);
        } else {
          startMarquee(screen, mode, region);
        }
        break;
      }

      selectEntity(hit.id, mode);
      // Clicks are exclusive: an entity click clears the dimension selection.
      emit('update:selectedDimensionIds', []);
      if (mode !== 'replace') break;
      if (hit.kind === 'point' && !isCornerRoundDerived(props.document, hit.id)) {
        beginDrag(hit.id, pointById.value.get(hit.id)!);
      } else if (hit.kind === 'text') {
        // A label drag moves only its anchor; the arrow target stays put. The
        // hit box is rendered only from a text view whose anchor resolved.
        const anchorId = (getEntity(props.document, hit.id) as TextEntity).anchor;
        beginDrag(anchorId, pointById.value.get(anchorId)!);
      } else if (hit.kind !== 'point') {
        beginPan(screen);
      }
      break;
    }
    case 'add_point':
    case 'add_line':
    case 'add_circle':
    case 'add_rectangle':
    case 'add_center_rectangle':
    case 'add_3point_rectangle':
    case 'add_curve':
    case 'add_arc':
    case 'add_text':
    case 'add_text_leader':
    case 'notch':
    case 'split_line':
    case 'centre_line':
      onDraftingPointerDown(screen, hit);
      break;
    case 'dimension':
    case 'cut_dimension':
      onDimensionPick(hit, props.tool === 'cut_dimension' ? pickLoopHandle(screen) : null);
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
  } else if (onCornerRoundDragMove(screen)) {
    // The tangent-handle drag consumed the move.
  } else if (marqueeState.value) {
    updateMarquee(screen);
  } else if (onDimensionDragMove(screen)) {
    // The dimension drag consumed the move.
  } else if (panState.value) {
    const dx = screen.x - panState.value.start.x;
    const dy = screen.y - panState.value.start.y;
    if (touchRegion.value !== null && Math.hypot(dx, dy) >= MARQUEE_THRESHOLD) {
      touchRegion.value = null;
    }
    viewport.value = panBy(panState.value.origin, dx, dy);
  } else if (dragState.value) {
    const world = snapToGrid(screenToWorld(viewport.value, screen));
    dragState.value = { ...dragState.value, x: world.x, y: world.y };
  }
}

/** Live dimension preview while placing; the canvas-level pointer move. */
function onCanvasPointerMove(event: PointerEvent): void {
  const screen = screenPoint(event);

  if (props.tool === 'select' && props.showAllowances && !props.readOnly) {
    const world = screenToWorld(viewport.value, screen);
    hoveredRegion.value = regionAt(bandRegions.value, world)?.target ?? null;
    bandHovered.value = cutLoopContains(bandCutLoop.value, world);
  } else if (hoveredRegion.value !== null || bandHovered.value) {
    hoveredRegion.value = null;
    bandHovered.value = false;
  }

  const hit = hitEntity(event);

  if (dimensionToolArmed.value) {
    updateDimensionHover(
      hit,
      props.tool === 'cut_dimension' ? pickLoopHandle(screen) : null,
      screenToWorld(viewport.value, screen),
    );
  }

  updateDimensionPlacements(screen);
  onDraftingPointerMove(screen, hit);
}

/** The pointer left the canvas: end the hover and ghost, keep a pending pick. */
function onCanvasPointerLeave(): void {
  clearDimensionHover();
  onDraftingPointerLeave();
  hoveredRegion.value = null;
  bandHovered.value = false;
}

/** Drop every in-flight pointer interaction without emitting a command. */
function cancelPointerInteraction(): void {
  cancelMarquee();
  cancelDimensionDrag();
  dragState.value = null;
  moveDrag.value = null;
  panState.value = null;
  touchRegion.value = null;
  cancelTangentDrag();
  removePointerListeners();
}

function onPointerCancel(): void {
  cancelPointerInteraction();
}

function onPointerUp(): void {
  if (touchRegion.value !== null) {
    const pick = touchRegion.value;
    touchRegion.value = null;
    panState.value = null;
    removePointerListeners();
    selectAllowanceRegion(pick.target, 'replace');
    return;
  }

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

  commitDimensionDrag();

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

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === 'Space' && isEditableTarget(event.target)) return;

  if (event.key === 'Escape' && clearTextOnEscape()) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape' && marqueeState.value !== null) {
    event.preventDefault();
    cancelPointerInteraction();
    return;
  }

  if (event.key === 'Escape' && clearGestureOnEscape()) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape' && clearDimensionOnEscape()) {
    event.preventDefault();
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

/** Combine one allowance region with the current region selection under `mode`. */
function selectAllowanceRegion(target: BandTarget, mode: SelectionMode): void {
  const current = props.selectedAllowanceTargets;
  const key = bandTargetKey(target);
  const next =
    mode === 'replace'
      ? [target]
      : mode === 'add'
        ? current.some((candidate) => bandTargetKey(candidate) === key)
          ? current.filter((candidate) => bandTargetKey(candidate) !== key)
          : [...current, target]
        : current.filter((candidate) => bandTargetKey(candidate) !== key);

  // Clicks stay exclusive: a region pick clears both entity selections.
  emit('update:selectedEntityIds', []);
  emit('update:selectedDimensionIds', []);
  emit('update:selectedAllowanceTargets', next);
}

function startMarquee(screen: Vec2, mode: SelectionMode, region: BandTarget | null = null): void {
  marqueeState.value = { start: screen, current: screen, mode, latched: false, region };
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
    // A click on the band picks its region; anywhere else it clears the
    // selections, as a bare-canvas click always has.
    if (state.region !== null) {
      selectAllowanceRegion(state.region, state.mode);
      return;
    }
    if (state.mode === 'replace') {
      emit('update:selectedEntityIds', []);
      emit('update:selectedDimensionIds', []);
      emit('update:selectedAllowanceTargets', []);
    }
    return;
  }

  // The marquee is the one gesture that may leave both selections non-empty:
  // replace with no hits clears its kind, additive/subtractive with no hits keeps it.
  // A marquee never picks regions: a replace marquee clears them with the rest.
  if (state.mode === 'replace') emit('update:selectedAllowanceTargets', []);

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

function onWindowBlur(): void {
  cancelPointerInteraction();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  removePointerListeners();
});

watch(
  () => props.fitToken,
  () => fit(),
);

watch(
  () => props.tool,
  () => {
    resetDraftingOnToolChange();
    resetDimensionOnToolChange();
    resetCornerRoundOnToolChange();
    editingDimension.value = null;
    cancelPointerInteraction();
  },
);

// Any document edit invalidates the inline editor: the constraint may have
// moved, been removed, or been undone underneath it. A pending line start or
// circle centre that referenced a point also disappears when that point does.
watch(
  () => props.document,
  () => {
    editingDimension.value = null;
    cancelCornerRoundOnDocumentChange();
    pruneDraftingOnDocumentChange();
    pruneDimensionOnDocumentChange();
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
      @mousedown.middle.prevent
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

        <CanvasPieceBandLayers
          :piece-views="pieceViews"
          :region-views="regionViews"
          :seams="seams"
          :region-class="regionClass"
        />

        <CanvasEntityLayers
          :lines="lines"
          :curves="curves"
          :arcs="arcs"
          :circles="circles"
          :highlighted-ids="highlightedIds"
          :dimension-candidate-line-ids="dimensionCandidateLineIds"
          :cut-edge-candidate-ids="cutEdgeCandidateIds"
          :dimension-first-pick="dimensionFirstPick"
          :entity-class="entityClass"
          :entity-dash="entityDash"
          :line-width="lineWidth"
          @hover="onEntityHover"
          @leave="onEntityLeave"
          @curve-double-click="onCurveDoubleClick"
        />

        <CanvasAnnotationLayers
          :marks="markViews"
          :texts="textViews"
          :text-preview="textPreview"
          :tool="props.tool"
        />

        <CanvasPieceCutLayers :piece-views="pieceViews" :move-preview="movePreview" />

        <CanvasPreviews
          :round-preview="roundPreview"
          :tangent-preview="tangentPreview"
          :point-on-line-hover="pointOnLineHover"
          :split-line-hover="splitLineHover"
          :midpoint-hover="midpointHover"
          :pending-line-start="pendingLineStart"
          :line-preview="linePreview"
          :line-start="lineStart"
          :arc-start-position="arcStartPosition"
          :arc-chord="arcChord"
          :arc-preview="arcPreview"
          :arc-pending-start="arcPendingStart"
          :arc-pending-end="arcPendingEnd"
          :pending-circle-center="pendingCircleCenter"
          :circle-preview="circlePreview"
          :circle-preview-radius="circlePreviewRadius"
          :circle-center="circleCenter"
          :round-corner-active="props.roundCornerActive"
          :roundable-corner-points="roundableCornerPoints"
          :rectangle-preview="rectanglePreview"
          :rectangle-pending-corners="rectanglePendingCorners"
          :viewport-scale="viewport.scale"
        />

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

        <CanvasDimensionDrawings
          :drawings="dimensionDrawings"
          :derived-drawings="derivedDimensionDrawings"
          :marquee-dimension-candidates="marqueeDimensionCandidates"
          @pointer-down="onDimensionPointerDown"
        />
      </g>

      <CanvasDimensionLabels
        :labels="dimensionLabels"
        :derived-labels="derivedDimensionLabels"
        :label-class="labelClass"
        :derived-constraint="derivedConstraint"
        @pointer-down="onDimensionPointerDown"
        @double-click="onDimensionDoubleClick"
      />

      <CanvasOverlayLayers
        :round-handles="roundHandles"
        :round-labels="roundLabels"
        :constraint-layer="constraintLayer"
        @begin-tangent-drag="beginTangentDragHandle"
        @open-corner-editor="openCornerRoundEditor"
      />

      <CanvasRuler
        :size="size"
        :x-ticks="xTicks"
        :y-ticks="yTicks"
        :x-tick-position="xTickPosition"
        :y-tick-position="yTickPosition"
      />

      <CanvasMarquee :rect="marqueeRect" />
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
      v-if="midpointHover !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="midpoint-hint"
    >
      Click to create a point at this line's midpoint.
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
      v-if="props.tool === 'split_line' && !props.readOnly && splitLineHover === null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="split-line-hint"
    >
      Click a straight line to split it.
    </p>

    <p
      v-if="splitLineHover !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="split-line-hint"
    >
      {{
        splitLineHover.pointId !== null
          ? 'Click to split this line at this point.'
          : splitLineHover.atCenter
            ? 'Click to split this line at its centre.'
            : 'Click to split this line here.'
      }}
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

    <p
      v-if="textLeaderHint !== null"
      class="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm"
      role="status"
      data-testid="text-leader-hint"
    >
      {{ textLeaderHint }}
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
      class="absolute z-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-1 py-0.5 text-center text-xs shadow-sm"
      :style="{ left: `${editingCornerRound.x}px`, top: `${editingCornerRound.y}px` }"
      data-testid="corner-round-editor"
      :aria-label="`Corner round ${editingCornerRound.id} radius in millimetres`"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="
        editingCornerRound !== null && variablePickerOpen('corner-round', editingCornerRound.id)
      "
      :aria-controls="
        editingCornerRound !== null && variablePickerOpen('corner-round', editingCornerRound.id)
          ? 'corner-round-variable-list'
          : undefined
      "
      @input="onCornerRoundEditInput"
      @keydown="onCornerRoundEditorKeydown"
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

    <VariablePickerList
      v-if="
        dimensionEditor !== null &&
        variablePickerOpen('dimension', dimensionEditor.id) &&
        variablePickerOptions.length > 0
      "
      size="canvas"
      :style="{ left: `${dimensionEditor.x}px`, top: `${dimensionEditor.y + 18}px` }"
      :options="variablePickerOptions"
      :label="`Variables for dimension ${dimensionEditor.id}`"
      list-test-id="dimension-variable-list"
      option-test-id-prefix="dimension-variable"
      @pick="pickVariable('dimension', dimensionEditor.id, $event)"
    />

    <VariablePickerList
      v-if="
        editingCornerRound !== null &&
        variablePickerOpen('corner-round', editingCornerRound.id) &&
        variablePickerOptions.length > 0
      "
      list-id="corner-round-variable-list"
      size="canvas"
      :style="{ left: `${editingCornerRound.x}px`, top: `${editingCornerRound.y + 18}px` }"
      :options="variablePickerOptions"
      :label="`Variables for corner round ${editingCornerRound.id}`"
      list-test-id="corner-round-variable-list"
      option-test-id-prefix="corner-round-variable"
      @pick="pickVariable('corner-round', editingCornerRound.id, $event)"
    />
  </div>
</template>
