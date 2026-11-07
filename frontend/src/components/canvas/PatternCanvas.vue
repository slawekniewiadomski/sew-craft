<script setup lang="ts">
import {
  allPoints,
  arcThroughPoints,
  type ArcEntity,
  bounds,
  cornerRoundGeometry,
  cornerRounds,
  cornerRoundsForEntity,
  type CircleEntity,
  type CornerRound,
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
  lineEndpoints,
  type LineEntity,
  type LeaderGeometry,
  measureDistanceDimension,
  measureLinearDimension,
  MIN_RADIUS,
  type Param,
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
  projectPointOnLine,
  type Rect,
  resolveParam,
  type TextLayout,
  type TextEntity,
  textLayout,
  textLeaderGeometry,
  DEFAULT_TEXT_SIZE,
  bandTargetKey,
  pieceBandRegions,
  seamAllowancePaths,
  svgArcCommand,
  type BandRegion,
  type BandTarget,
  type Vec2,
} from '@sewcraft/geometry';
import { cutLoopContains, regionAt } from '@/lib/allowance-regions';
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
  formatCornerRadiusParam,
  parseCornerRadiusField,
  roundableCorners,
  sameCornerRadiusParam,
  tangentDragRadius,
  type CornerRoundLabel,
  type CornerRoundPicks,
} from '@/lib/corner-round';
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
import {
  endpointMissing,
  endpointPosition,
  resolveDraftingEndpoint,
  resolveLeaderEndpoint,
  resolveTextAnchorEndpoint,
  sameDraftingEndpoint,
  type DraftingEndpoint,
} from '@/lib/drafting';
import type { EditorTool } from '@/lib/editor-tools';
import {
  anchorForEdge,
  canEditEntity,
  edgeEndpoints,
  nearestLoopHandle,
  pieceForEntity,
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
import { nearestLineMidpoint } from '@/lib/midpoint';
import { notchTargetAt } from '@/lib/marks';
import { splitCandidate, type SplitCandidate } from '@/lib/split-line';
import {
  MIDPOINT_SNAP_PIXELS,
  nearestPoint,
  POINT_SNAP_TOLERANCE,
  snapPoint,
  snapToGrid,
} from '@/lib/snap';
import { DEFAULT_TEXT_CONTENT, leaderTargetIssue } from '@/lib/text-tool';
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
import { useDimensionGesture } from '@/composables/use-dimension-gesture';
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
import DimensionReferencePicker from '@/components/base/DimensionReferencePicker.vue';
import VariablePickerList from '@/components/base/VariablePickerList.vue';

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
  /** The allowance region the press started on, so a click can pick it. */
  region: BandTarget | null;
}

/** Screen pixels the pointer must travel before a click becomes a marquee. */
const MARQUEE_THRESHOLD = 4;

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
/** The label anchor stored by the first click of the Text with leader tool. */
const textAnchor = ref<DraftingEndpoint | null>(null);
/** The snapped arrow target while the leader gesture is pending. */
const textPointer = ref<Vec2 | null>(null);
/** The point the Centre line tool stored on its first click. */
const centreStart = ref<EntityId | null>(null);
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
/** The round whose tangent handles and label are shown because it is hovered. */
const hoveredRoundId = ref<EntityId | null>(null);

/** The allowance region under the pointer, and whether the pointer is inside its piece. */
const hoveredRegion = ref<BandTarget | null>(null);
const bandHovered = ref(false);

/** A touch that pressed on a region: a tap picks it, a drag still pans. */
const touchRegion = ref<{ target: BandTarget; start: Vec2 } | null>(null);
/**
 * The straight line the Point tool would constrain a click to, with the raw
 * pointer and the projection that click would use.
 */
const pointOnLineHover = ref<{ lineId: EntityId; pointer: Vec2; point: Vec2 } | null>(null);
const splitLineHover = ref<SplitCandidate | null>(null);
/**
 * The visible line whose middle is under the pointer while a point-creating tool
 * is armed. `pointer` is kept so a document edit can re-resolve the candidate.
 */
const midpointHover = ref<{
  lineId: EntityId;
  x: number;
  y: number;
  pointer: Vec2;
} | null>(null);
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
  startParam: Param;
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
  return drag !== null && drag.id === round.id
    ? drag.radius
    : resolveParam(props.document, round.radius);
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

const pendingIds = computed(() => new Set(pending.value));
/** The document point reused as the line start, highlighted while pending. */
const pendingLineStartId = computed(() =>
  lineStart.value?.kind === 'point' ? lineStart.value.id : null,
);
/**
 * World position of the pending start. An id is always current because the
 * document watcher clears a start whose point disappeared.
 */
const pendingLineStart = computed<Vec2 | null>(() =>
  lineStart.value === null ? null : endpointPosition(props.document, lineStart.value),
);
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
const pendingCircleCenter = computed<Vec2 | null>(() =>
  circleCenter.value === null ? null : endpointPosition(props.document, circleCenter.value),
);
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
/** The 8 px magnet in world units, so it stays 8 screen pixels at any zoom. */
const midpointTolerance = computed(() => MIDPOINT_SNAP_PIXELS / viewport.value.scale);
const gridPath = computed(() => `M ${gridStep.value} 0 L 0 0 0 ${gridStep.value}`);
const transform = computed(() => viewportTransform(viewport.value));
const visible = computed(() => visibleWorldRect(viewport.value, size.value));
const xTicks = computed(() => ticksAlong(visible.value, 'x', gridStep.value));
const yTicks = computed(() => ticksAlong(visible.value, 'y', gridStep.value));
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
  const editing = editingCornerRound.value!;
  editingCornerRound.value = { ...editing, value: insertVariableToken(editing.value, slug) };
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

interface MarkView {
  id: EntityId;
  kind: 'notch' | 'centre_line';
  path: string;
  selected: boolean;
}

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

/** The synthetic label a pending leader gesture previews. */
const TEXT_PREVIEW_ENTITY: TextEntity = {
  id: 'text-preview',
  kind: 'text',
  anchor: 'text-preview-anchor',
  content: DEFAULT_TEXT_CONTENT,
  alignment: 'left',
  rotation: 0,
  fontSize: DEFAULT_TEXT_SIZE,
  leader: 'text-preview-target',
};

interface TextLeaderPreview {
  entity: TextEntity;
  anchor: Vec2;
  layout: TextLayout;
  geometry: LeaderGeometry | null;
  issue: string | null;
}

/**
 * The pending leader gesture's ghost label and live rule/arrow. The provisional
 * anchor is a coordinate, so it always resolves; `endpointPosition` returns
 * `null` only for a missing document point, which this gesture never holds.
 */
const textPreview = computed<TextLeaderPreview | null>(() => {
  if (props.tool !== 'add_text_leader' || textAnchor.value === null) return null;
  const entity = TEXT_PREVIEW_ENTITY;
  const anchor = endpointPosition(props.document, textAnchor.value)!;
  const target = textPointer.value;
  return {
    entity,
    anchor,
    layout: textLayout(entity, anchor)!,
    geometry: target === null ? null : textLeaderGeometry(entity, anchor, target),
    issue: target === null ? null : leaderTargetIssue(entity, anchor, target),
  };
});

/** What the leader gesture asks for next, or null while it is satisfied. */
const textLeaderHint = computed<string | null>(() => {
  const preview = textPreview.value;
  if (preview === null) return null;
  if (preview.issue !== null) return preview.issue;
  return textPointer.value === null ? 'Click the arrow target.' : null;
});

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
    radius: radiusOf(round),
    startRadius: radiusOf(round),
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
  if (props.tool !== 'select' || props.constraintActive) return;

  const round = roundsByArc.value.get(id);
  if (round === undefined) return;

  const point = screenPoint(event);
  void openCornerRoundEditor(round, point.x, point.y);
}

function onCornerRoundEditInput(event: Event): void {
  const editing = editingCornerRound.value!;
  const value = (event.target as HTMLInputElement).value;
  editingCornerRound.value = { ...editing, value };
  openVariablePicker('corner-round', editing.id, variableQuery(value));
}

/** Arrow keys drive the `$` picker; Enter commits, Escape cancels. */
function onCornerRoundEditorKeydown(event: KeyboardEvent): void {
  if (onVariablePickerKeydown('corner-round', editingCornerRound.value!.id, event)) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    applyCornerRoundEdit();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelCornerRoundEdit();
  }
}

/** Enter: apply a valid radius or formula, otherwise keep editing to fix it. */
function applyCornerRoundEdit(): void {
  const editing = editingCornerRound.value!;
  const field = parseCornerRadiusField(props.document, editing.value);
  if (field.kind === 'invalid') return;

  editingCornerRound.value = null;
  closeVariablePicker();
  if (!sameCornerRadiusParam(editing.startParam, field.param)) {
    emit('set-corner-round-radius', editing.id, field.param);
  }
}

/** Blur: commit a valid edit and discard an invalid one. */
function finishCornerRoundEdit(): void {
  // Removing the focused input fires a final blur; there is nothing to commit.
  if (editingCornerRound.value === null) return;

  const editing = editingCornerRound.value;
  const field = parseCornerRadiusField(props.document, editing.value);
  editingCornerRound.value = null;
  closeVariablePicker();
  if (field.kind === 'param' && !sameCornerRadiusParam(editing.startParam, field.param)) {
    emit('set-corner-round-radius', editing.id, field.param);
  }
}

function cancelCornerRoundEdit(): void {
  editingCornerRound.value = null;
  closeVariablePicker();
}

/** Tools that show the midpoint magnet and can create a midpoint endpoint. */
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

/** One click of the Text with leader gesture: the anchor, then the target. */
function onTextLeaderPointer(screen: Vec2): void {
  const world = screenToWorld(viewport.value, screen);
  if (textAnchor.value === null) {
    textAnchor.value = resolveTextAnchorEndpoint(props.document, world, props.activePieceId);
    textPointer.value = null;
    return;
  }

  const leader = resolveLeaderEndpoint(props.document, world, props.activePieceId);
  const anchor = endpointPosition(props.document, textAnchor.value)!;
  const target = endpointPosition(props.document, leader)!;
  textPointer.value = target;
  if (leaderTargetIssue(TEXT_PREVIEW_ENTITY, anchor, target) !== null) return;

  emit('add-text', textAnchor.value, leader);
  textAnchor.value = null;
  textPointer.value = null;
}

/**
 * One click of the Notch tool. The hit must be a point on the active piece's
 * loop; the edge nearest the pointer decides which allowance the V cuts into.
 */
function onNotchPointer(hit: Hit | null, screen: Vec2): void {
  if (hit === null || hit.kind !== 'point') return;
  const pieceId = props.activePieceId;
  if (pieceId === null) return;

  const target = notchTargetAt(
    props.document,
    pieceId,
    hit.id,
    screenToWorld(viewport.value, screen),
  );
  if (target !== null) emit('add-notch', target.point, target.edge);
}

/** Two clicks of the Centre line tool: the two snapped points it joins. */
function onCentreLinePointer(hit: Hit | null): void {
  if (hit === null || hit.kind !== 'point') return;

  if (centreStart.value === null) {
    centreStart.value = hit.id;
    return;
  }
  if (centreStart.value === hit.id) return;

  emit('add-centre-line', centreStart.value, hit.id);
  centreStart.value = null;
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
    case 'cut_dimension':
      onDimensionPick(hit, props.tool === 'cut_dimension' ? pickLoopHandle(screen) : null);
      break;
    case 'add_text':
      emit(
        'add-text',
        resolveTextAnchorEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
        ),
      );
      break;
    case 'add_text_leader':
      onTextLeaderPointer(screen);
      break;
    case 'notch':
      onNotchPointer(hit, screen);
      break;
    case 'split_line':
      onSplitLinePointer(hit, screen);
      break;
    case 'centre_line':
      onCentreLinePointer(hit);
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

  if (dimensionToolArmed.value) {
    updateDimensionHover(
      hitEntity(event),
      props.tool === 'cut_dimension' ? pickLoopHandle(screen) : null,
      screenToWorld(viewport.value, screen),
    );
  }

  updateDimensionPlacements(screen);

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

  if (MIDPOINT_TOOLS.has(props.tool) && !props.readOnly) {
    updateMidpointHover(screen);
  }

  if (props.tool === 'add_point' && !props.readOnly) {
    // The midpoint magnet wins over point-on-line, so the two hints never show
    // at once.
    if (midpointHover.value === null) updatePointOnLineHover(event, screen);
    else pointOnLineHover.value = null;
  }

  if (props.tool === 'split_line' && !props.readOnly) {
    updateSplitLineHover(event, screen);
  }

  if (props.tool === 'add_circle' && circleCenter.value !== null) {
    circlePreview.value = snappedPoint(screenToWorld(viewport.value, screen));
  }

  if (rectangleMode.value !== null && rectangleClicks.value.length > 0) {
    rectanglePointer.value = snappedPoint(screenToWorld(viewport.value, screen));
  }

  if (props.tool === 'add_text_leader' && textAnchor.value !== null) {
    const leader = resolveLeaderEndpoint(
      props.document,
      screenToWorld(viewport.value, screen),
      props.activePieceId,
    );
    textPointer.value = endpointPosition(props.document, leader)!;
  }
}

/** The pointer left the canvas: end the hover and ghost, keep a pending pick. */
function onCanvasPointerLeave(): void {
  clearDimensionHover();
  hoveredRegion.value = null;
  bandHovered.value = false;
  pointOnLineHover.value = null;
  splitLineHover.value = null;
  midpointHover.value = null;
  textPointer.value = null;
}

/** Drop every in-flight pointer interaction without emitting a command. */
function cancelPointerInteraction(): void {
  cancelMarquee();
  cancelDimensionDrag();
  dragState.value = null;
  moveDrag.value = null;
  panState.value = null;
  touchRegion.value = null;
  tangentDrag.value = null;
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

function onWheel(event: WheelEvent): void {
  // The rectangle must not change scale under the pointer mid-gesture.
  if (marqueeState.value !== null) return;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewport.value = zoomAt(viewport.value, screenPoint(event), factor);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === 'Space' && isEditableTarget(event.target)) return;

  if (event.key === 'Escape' && textAnchor.value !== null) {
    event.preventDefault();
    textAnchor.value = null;
    textPointer.value = null;
    return;
  }

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

  if (event.key === 'Escape' && midpointHover.value !== null) {
    event.preventDefault();
    midpointHover.value = null;
    return;
  }

  if (event.key === 'Escape' && pointOnLineHover.value !== null) {
    event.preventDefault();
    pointOnLineHover.value = null;
    return;
  }

  if (event.key === 'Escape' && splitLineHover.value !== null) {
    event.preventDefault();
    splitLineHover.value = null;
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

/**
 * Resolve the midpoint magnet under the pointer. An existing point within the
 * 6 mm snap wins, and no tool other than the Point tool competes for the hover.
 */
function updateMidpointHover(screen: Vec2): void {
  const world = screenToWorld(viewport.value, screen);
  if (nearestPoint(world, points.value, POINT_SNAP_TOLERANCE) !== null) {
    midpointHover.value = null;
    return;
  }
  const candidate = nearestLineMidpoint(
    props.document,
    world,
    midpointTolerance.value,
    props.activePieceId,
  );
  midpointHover.value = candidate === null ? null : { ...candidate, pointer: world };
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
 * Track the straight line under the Split tool and where the split would land,
 * so the highlighted line and the ghost match what a click will do.
 */
function updateSplitLineHover(event: Event, screen: Vec2): void {
  const hit = hitEntity(event);
  if (
    hit === null ||
    hit.kind !== 'line' ||
    (props.activePieceId !== null && !canEditEntity(props.document, hit.id, props.activePieceId))
  ) {
    splitLineHover.value = null;
    return;
  }
  splitLineHover.value = splitCandidate(
    props.document,
    hit.id,
    screenToWorld(viewport.value, screen),
  );
}

/** One click of the Split tool: a valid projection dispatches the split. */
function onSplitLinePointer(hit: Hit | null, screen: Vec2): void {
  if (hit === null || hit.kind !== 'line') return;
  const world = screenToWorld(viewport.value, screen);
  if (splitCandidate(props.document, hit.id, world) === null) return;
  splitLineHover.value = null;
  emit('split-line', hit.id, world.x, world.y);
}

/**
 * The Point tool: a click on a straight line creates a point constrained to it,
 * as one undoable gesture; every other click keeps today's free-point behaviour.
 */
function onAddPointPointer(hit: Hit | null, screen: Vec2): void {
  const world = screenToWorld(viewport.value, screen);

  // Point snap wins, then the midpoint magnet, then the line inference, then the
  // grid. This mirrors `updateMidpointHover` so the click matches the marker.
  if (nearestPoint(world, points.value, POINT_SNAP_TOLERANCE) === null) {
    const midpoint = nearestLineMidpoint(
      props.document,
      world,
      midpointTolerance.value,
      props.activePieceId,
    );
    if (midpoint !== null) {
      midpointHover.value = null;
      pointOnLineHover.value = null;
      emit('add-point-midpoint', midpoint.lineId);
      return;
    }
  }

  if (hit !== null && hit.kind === 'line') {
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
          midpointTolerance.value,
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
          midpointTolerance.value,
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
      : resolveCircleEndpoint(
          props.document,
          screenToWorld(viewport.value, screen),
          props.activePieceId,
          midpointTolerance.value,
        );

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
          midpointTolerance.value,
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
    textAnchor.value = null;
    textPointer.value = null;
    centreStart.value = null;
    resetDimensionOnToolChange();
    editingDimension.value = null;
    cancelPointerInteraction();
    hoveredRoundId.value = null;
    editingCornerRound.value = null;
    pointOnLineHover.value = null;
    splitLineHover.value = null;
    midpointHover.value = null;
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
    splitLineHover.value = null;

    // Recompute the Point tool's inferred line against the new document so a
    // removed or degenerate line clears the hover signal.
    const pointOnLine = pointOnLineHover.value;
    if (pointOnLine !== null) {
      const point = pointOnLineTarget(pointOnLine.lineId, pointOnLine.pointer);
      pointOnLineHover.value = point === null ? null : { ...pointOnLine, point };
    }

    // Re-resolve the midpoint magnet against the new document so a removed,
    // trimmed or degenerate line clears or moves the signal immediately.
    const midpoint = midpointHover.value;
    if (midpoint !== null) {
      const candidate = nearestLineMidpoint(
        props.document,
        midpoint.pointer,
        midpointTolerance.value,
        props.activePieceId,
      );
      midpointHover.value = candidate === null ? null : { ...candidate, pointer: midpoint.pointer };
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

        <g class="pointer-events-none" data-testid="piece-region-layer">
          <path
            v-for="region in regionViews"
            :key="region.key"
            :d="region.d"
            :class="regionClass(region)"
            :stroke-width="region.selected || region.hovered ? 1.5 : 0.75"
            vector-effect="non-scaling-stroke"
            :data-region="region.key"
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

        <g
          v-if="highlightedIds.size > 0"
          class="pointer-events-none"
          data-testid="measured-highlight-layer"
          aria-hidden="true"
        >
          <template v-for="entry in lines" :key="`highlight-line-${entry.line.id}`">
            <line
              v-if="highlightedIds.has(entry.line.id)"
              :x1="entry.start.x"
              :y1="entry.start.y"
              :x2="entry.end.x"
              :y2="entry.end.y"
              class="text-dimension-formula"
              stroke="currentColor"
              stroke-width="7"
              stroke-linecap="round"
              stroke-opacity="0.45"
              vector-effect="non-scaling-stroke"
              :data-measured-source="entry.line.id"
            />
          </template>
          <template v-for="entry in curves" :key="`highlight-curve-${entry.curve.id}`">
            <path
              v-if="highlightedIds.has(entry.curve.id)"
              :d="entry.d"
              fill="none"
              class="text-dimension-formula"
              stroke="currentColor"
              stroke-width="7"
              stroke-linecap="round"
              stroke-opacity="0.45"
              vector-effect="non-scaling-stroke"
              :data-measured-source="entry.curve.id"
            />
          </template>
          <template v-for="entry in arcs" :key="`highlight-arc-${entry.arc.id}`">
            <path
              v-if="highlightedIds.has(entry.arc.id)"
              :d="entry.d"
              fill="none"
              class="text-dimension-formula"
              stroke="currentColor"
              stroke-width="7"
              stroke-linecap="round"
              stroke-opacity="0.45"
              vector-effect="non-scaling-stroke"
              :data-measured-source="entry.arc.id"
            />
          </template>
          <template v-for="entry in circles" :key="`highlight-circle-${entry.circle.id}`">
            <circle
              v-if="highlightedIds.has(entry.circle.id)"
              :cx="entry.cx"
              :cy="entry.cy"
              :r="entry.r"
              fill="none"
              class="text-dimension-formula"
              stroke="currentColor"
              stroke-width="7"
              stroke-opacity="0.45"
              vector-effect="non-scaling-stroke"
              :data-measured-source="entry.circle.id"
            />
          </template>
        </g>

        <g data-testid="marks-layer">
          <g v-for="mark in markViews" :key="mark.id" class="group cursor-pointer">
            <path
              :d="mark.path"
              fill="none"
              stroke-width="0.5"
              vector-effect="non-scaling-stroke"
              :class="mark.selected ? 'stroke-primary' : 'stroke-mark group-hover:stroke-primary'"
              :data-entity-id="mark.id"
              data-kind="mark"
              :data-testid="`mark-${mark.id}`"
            />
            <!-- A hairline mark needs its own wide, invisible hit stroke. -->
            <path
              :d="mark.path"
              fill="none"
              stroke="transparent"
              stroke-width="12"
              vector-effect="non-scaling-stroke"
              :data-entity-id="mark.id"
              data-kind="mark"
              :data-testid="`mark-hit-${mark.id}`"
            />
          </g>
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

          <g v-if="textPreview" class="pointer-events-none" data-testid="text-leader-preview">
            <text
              :transform="`translate(${textPreview.anchor.x} ${textPreview.anchor.y}) rotate(${((textPreview.entity.rotation ?? 0) * 180) / Math.PI})`"
              :font-size="textPreview.entity.fontSize"
              class="fill-annotation font-annotation italic opacity-60"
              aria-hidden="true"
              data-testid="text-preview"
            >
              {{ textPreview.entity.content }}
            </text>
            <template v-if="textPreview.geometry">
              <line
                :x1="textPreview.geometry.underline.start.x"
                :y1="textPreview.geometry.underline.start.y"
                :x2="textPreview.geometry.underline.end.x"
                :y2="textPreview.geometry.underline.end.y"
                class="stroke-annotation"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
                data-testid="text-leader-preview-underline"
              />
              <line
                v-if="textPreview.geometry.shaft"
                :x1="textPreview.geometry.shaft.start.x"
                :y1="textPreview.geometry.shaft.start.y"
                :x2="textPreview.geometry.shaft.end.x"
                :y2="textPreview.geometry.shaft.end.y"
                class="stroke-annotation"
                stroke-width="0.5"
                stroke-dasharray="2 2"
                vector-effect="non-scaling-stroke"
                data-testid="text-leader-preview-shaft"
              />
              <polygon
                :points="
                  textPreview.geometry.head.map((point) => `${point.x},${point.y}`).join(' ')
                "
                fill="none"
                class="stroke-annotation"
                stroke-width="0.5"
                vector-effect="non-scaling-stroke"
                data-testid="text-leader-preview-arrow"
              />
            </template>
          </g>
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

        <g
          v-if="splitLineHover !== null"
          class="pointer-events-none"
          aria-hidden="true"
          data-testid="split-line-ghost"
        >
          <path
            v-if="splitLineHover.atCenter"
            :d="`M ${splitLineHover.position.x} ${splitLineHover.position.y - 4} L ${
              splitLineHover.position.x + 4
            } ${splitLineHover.position.y} L ${splitLineHover.position.x} ${
              splitLineHover.position.y + 4
            } L ${splitLineHover.position.x - 4} ${splitLineHover.position.y} Z`"
            class="fill-primary stroke-primary-foreground"
            stroke-width="1"
            data-testid="split-line-center"
          />
          <circle
            v-else
            :cx="splitLineHover.position.x"
            :cy="splitLineHover.position.y"
            :r="splitLineHover.pointId === null ? 4 : 5"
            class="fill-primary stroke-primary-foreground"
            stroke-width="1"
          />
        </g>

        <g
          v-if="midpointHover !== null"
          class="pointer-events-none"
          aria-hidden="true"
          data-testid="midpoint-marker"
        >
          <path
            :d="`M ${midpointHover.x} ${midpointHover.y - 5 / viewport.scale} L ${
              midpointHover.x + 5 / viewport.scale
            } ${midpointHover.y} L ${midpointHover.x} ${
              midpointHover.y + 5 / viewport.scale
            } L ${midpointHover.x - 5 / viewport.scale} ${midpointHover.y} Z`"
            class="fill-primary stroke-primary-foreground"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
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
            @pointerdown.left.stop="onDimensionPointerDown(drawing.constraint, $event)"
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
            @pointerdown.left.stop="onDimensionPointerDown(drawing.constraint, $event)"
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
          @pointerdown.left.stop="
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
          @pointerdown.left.stop="
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
            @pointerdown.left.stop="beginTangentDragHandle(handle, $event)"
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
          @pointerdown.left.stop.prevent
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
          <g transform="translate(-6 -6) scale(0.5)">
            <path
              v-for="(d, index) in CONSTRAINT_ICONS[marker.type].paths"
              :key="index"
              :d="d"
              fill="none"
              stroke="currentColor"
              stroke-width="2.8"
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
