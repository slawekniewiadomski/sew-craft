import type { EntityId, PatternDocument, Vec2 } from '@sewcraft/geometry';
import {
  DEFAULT_TEXT_SIZE,
  lineEndpoints,
  projectPointOnLine,
  svgArcCommand,
  textLayout,
  textLeaderGeometry,
} from '@sewcraft/geometry';
import { computed, ref } from 'vue';

import { arcFromEndpoints } from '@/lib/arc-tool';
import { polylinePath } from '@/lib/canvas-render';
import { resolveCircleEndpoint, sameCircleEndpoint, type CircleEndpoint } from '@/lib/circle-tool';
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
import { nearestLineMidpoint } from '@/lib/midpoint';
import { notchTargetAt } from '@/lib/marks';
import { canEditEntity } from '@/lib/pieces';
import {
  newRectangleCorners,
  RECTANGLE_CLICKS,
  rectangleCorners,
  type RectangleMode,
} from '@/lib/rectangle-tool';
import { splitCandidate, type SplitCandidate } from '@/lib/split-line';
import { MIDPOINT_SNAP_PIXELS, nearestPoint, POINT_SNAP_TOLERANCE, snapPoint } from '@/lib/snap';
import { DEFAULT_TEXT_CONTENT, leaderTargetIssue } from '@/lib/text-tool';
import { screenToWorld, type Viewport } from '@/lib/viewport';

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

/** The test id each rectangle mode's dashed preview carries. */
const RECTANGLE_PREVIEW_TEST_IDS: Record<RectangleMode, string> = {
  diagonal: 'rectangle-preview',
  center: 'center-rectangle-preview',
  three_point: 'three-point-rectangle-preview',
};

/** The synthetic label a pending leader gesture previews. */
const TEXT_PREVIEW_ENTITY = {
  id: 'text-preview',
  kind: 'text' as const,
  anchor: 'text-preview-anchor',
  content: DEFAULT_TEXT_CONTENT,
  alignment: 'left' as const,
  rotation: 0,
  fontSize: DEFAULT_TEXT_SIZE,
  leader: 'text-preview-target',
};

export interface TextLeaderPreview {
  entity: typeof TEXT_PREVIEW_ENTITY;
  anchor: Vec2;
  layout: NonNullable<ReturnType<typeof textLayout>>;
  geometry: ReturnType<typeof textLeaderGeometry> | null;
  issue: string | null;
}

interface CanvasHit {
  id: EntityId;
  kind: string;
}

interface PointView {
  id: EntityId;
  x: number;
  y: number;
}

export interface DraftingGestureOptions {
  document: () => PatternDocument;
  tool: () => EditorTool;
  activePieceId: () => EntityId | null;
  readOnly: () => boolean;
  /** The document's points, with any live drag already applied. */
  points: () => PointView[];
  viewport: () => Viewport;
  onAddPoint: (x: number, y: number) => void;
  onAddPointOnLine: (lineId: EntityId, x: number, y: number) => void;
  onAddPointMidpoint: (lineId: EntityId) => void;
  onSplitLine: (lineId: EntityId, x: number, y: number) => void;
  onAddLine: (start: DraftingEndpoint, end: DraftingEndpoint) => void;
  onAddArc: (start: DraftingEndpoint, end: DraftingEndpoint, through: DraftingEndpoint) => void;
  onAddCircle: (center: CircleEndpoint, rim: CircleEndpoint) => void;
  onAddRectangle: (mode: RectangleMode, clicks: DraftingEndpoint[]) => void;
  onAddText: (anchor: DraftingEndpoint, leader?: DraftingEndpoint) => void;
  onAddNotch: (point: EntityId, edge: EntityId) => void;
  onAddCentreLine: (start: EntityId, end: EntityId) => void;
  onAddCurve: (points: [EntityId, EntityId, EntityId, EntityId]) => void;
}

/**
 * The creation gestures: point, line, arc, circle, rectangle, text with leader,
 * notch, centre line, split line and the point-on-line/midpoint magnets.
 *
 * Each gesture owns its pending state and preview; the canvas only says which
 * pointer event is a pick and where the pointer is.
 */
export function useDraftingGestures({
  document,
  tool,
  activePieceId,
  readOnly,
  points,
  viewport,
  onAddPoint,
  onAddPointOnLine,
  onAddPointMidpoint,
  onSplitLine,
  onAddLine,
  onAddArc,
  onAddCircle,
  onAddRectangle,
  onAddText,
  onAddNotch,
  onAddCentreLine,
  onAddCurve,
}: DraftingGestureOptions) {
  const pending = ref<EntityId[]>([]);
  const lineStart = ref<DraftingEndpoint | null>(null);
  const linePreview = ref<Vec2 | null>(null);
  const arcStart = ref<DraftingEndpoint | null>(null);
  const arcEnd = ref<DraftingEndpoint | null>(null);
  const arcPointer = ref<Vec2 | null>(null);
  const arcHint = ref(false);
  const circleCenter = ref<CircleEndpoint | null>(null);
  const circlePreview = ref<Vec2 | null>(null);
  const rectangleClicks = ref<DraftingEndpoint[]>([]);
  const rectanglePointer = ref<Vec2 | null>(null);
  const textAnchor = ref<DraftingEndpoint | null>(null);
  const textPointer = ref<Vec2 | null>(null);
  const centreStart = ref<EntityId | null>(null);
  const pointOnLineHover = ref<{ lineId: EntityId; pointer: Vec2; point: Vec2 } | null>(null);
  const splitLineHover = ref<SplitCandidate | null>(null);
  const midpointHover = ref<{
    lineId: EntityId;
    x: number;
    y: number;
    pointer: Vec2;
  } | null>(null);

  const midpointTolerance = computed(() => MIDPOINT_SNAP_PIXELS / viewport().scale);
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
    lineStart.value === null ? null : endpointPosition(document(), lineStart.value),
  );
  /**
   * World position of the pending arc start. An id is always current because the
   * document watcher clears a gesture whose point disappeared.
   */
  const arcStartPosition = computed<Vec2 | null>(() =>
    arcStart.value === null ? null : endpointPosition(document(), arcStart.value),
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
   * The dashed arc that follows the pointer after the second click. It is built
   * by the same `arcFromEndpoints` guard the commit uses, so what is previewed is
   * exactly what a third click would store.
   */
  const arcPreview = computed(() => {
    const start = arcStart.value;
    const end = arcEnd.value;
    const pointer = arcPointer.value;
    if (start === null || end === null || pointer === null) return null;

    const geometry = arcFromEndpoints(document(), start, end, {
      kind: 'new',
      x: pointer.x,
      y: pointer.y,
    });
    if (geometry === null) return null;

    // A non-null geometry means both endpoints resolved to points, so both positions exist.
    const startPosition = endpointPosition(document(), start)!;
    const endPosition = endpointPosition(document(), end)!;
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
    circleCenter.value === null ? null : endpointPosition(document(), circleCenter.value),
  );
  /** The dashed preview radius: pending centre to the snapped pointer. */
  const circlePreviewRadius = computed<number>(() => {
    const center = pendingCircleCenter.value!;
    const rim = circlePreview.value!;
    return Math.hypot(rim.x - center.x, rim.y - center.y);
  });
  /** The rectangle mode the active tool draws, or `null` for every other tool. */
  const rectangleMode = computed<RectangleMode | null>(() => {
    switch (tool()) {
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
  /**
   * The clicks a commit would carry right now: the pending clicks plus the
   * snapped pointer as the last one.
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
  /** The dashed rectangle that follows the pointer. */
  const rectanglePreview = computed<{
    corners: Vec2[];
    path: string;
    testId: string;
  } | null>(() => {
    const mode = rectangleMode.value;
    const clicks = rectanglePreviewClicks.value;
    if (mode === null || clicks === null) return null;

    const corners = rectangleCorners(document(), mode, clicks);
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
    if (preview !== null) return newRectangleCorners(document(), preview.corners);

    return rectangleClicks.value.flatMap((click) =>
      click.kind === 'new' ? [{ x: click.x, y: click.y }] : [],
    );
  });

  /**
   * The pending leader gesture's ghost label and live rule/arrow.
   */
  const textPreview = computed<TextLeaderPreview | null>(() => {
    if (tool() !== 'add_text_leader' || textAnchor.value === null) return null;
    const entity = TEXT_PREVIEW_ENTITY;
    const anchor = endpointPosition(document(), textAnchor.value)!;
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

  function snappedPoint(world: Vec2): Vec2 {
    return snapPoint(
      world,
      points().map((point) => ({ x: point.x, y: point.y })),
    );
  }

  function emitAddPoint(screen: Vec2): void {
    const world = snappedPoint(screenToWorld(viewport(), screen));
    onAddPoint(world.x, world.y);
  }

  /**
   * Where a Point-tool click on `lineId` would land, or `null` when the click is
   * not a line inference.
   */
  function pointOnLineTarget(lineId: EntityId, world: Vec2): Vec2 | null {
    if (nearestPoint(world, points(), POINT_SNAP_TOLERANCE) !== null) return null;
    const segment = lineEndpoints(document(), lineId);
    return segment === null ? null : projectPointOnLine(world, segment);
  }

  /** Resolve the midpoint magnet under the pointer. */
  function updateMidpointHover(screen: Vec2): void {
    const world = screenToWorld(viewport(), screen);
    if (nearestPoint(world, points(), POINT_SNAP_TOLERANCE) !== null) {
      midpointHover.value = null;
      return;
    }
    const candidate = nearestLineMidpoint(
      document(),
      world,
      midpointTolerance.value,
      activePieceId(),
    );
    midpointHover.value = candidate === null ? null : { ...candidate, pointer: world };
  }

  /** Track the line the Point tool would infer, so the click is never a surprise. */
  function updatePointOnLineHover(hit: CanvasHit | null, screen: Vec2): void {
    if (hit === null || hit.kind !== 'line') {
      pointOnLineHover.value = null;
      return;
    }

    const pointer = screenToWorld(viewport(), screen);
    const point = pointOnLineTarget(hit.id, pointer);
    pointOnLineHover.value = point === null ? null : { lineId: hit.id, pointer, point };
  }

  /** Track the straight line under the Split tool and where the split would land. */
  function updateSplitLineHover(hit: CanvasHit | null, screen: Vec2): void {
    const pieceId = activePieceId();
    if (
      hit === null ||
      hit.kind !== 'line' ||
      (pieceId !== null && !canEditEntity(document(), hit.id, pieceId))
    ) {
      splitLineHover.value = null;
      return;
    }
    splitLineHover.value = splitCandidate(document(), hit.id, screenToWorld(viewport(), screen));
  }

  /** One click of the Split tool: a valid projection dispatches the split. */
  function onSplitLinePointer(hit: CanvasHit | null, screen: Vec2): void {
    if (hit === null || hit.kind !== 'line') return;
    const world = screenToWorld(viewport(), screen);
    if (splitCandidate(document(), hit.id, world) === null) return;
    splitLineHover.value = null;
    onSplitLine(hit.id, world.x, world.y);
  }

  /**
   * The Point tool: a click on a straight line creates a point constrained to it;
   * every other click keeps the free-point behaviour.
   */
  function onAddPointPointer(hit: CanvasHit | null, screen: Vec2): void {
    const world = screenToWorld(viewport(), screen);

    if (nearestPoint(world, points(), POINT_SNAP_TOLERANCE) === null) {
      const midpoint = nearestLineMidpoint(
        document(),
        world,
        midpointTolerance.value,
        activePieceId(),
      );
      if (midpoint !== null) {
        midpointHover.value = null;
        pointOnLineHover.value = null;
        onAddPointMidpoint(midpoint.lineId);
        return;
      }
    }

    if (hit !== null && hit.kind === 'line') {
      if (pointOnLineTarget(hit.id, world) !== null) {
        pointOnLineHover.value = null;
        onAddPointOnLine(hit.id, world.x, world.y);
        return;
      }
    }

    emitAddPoint(screen);
  }

  function selectPendingPoint(hit: CanvasHit | null, required: number): void {
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
    onAddCurve([ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
  }

  /**
   * The line gesture: a point hit is reused by id, a bare canvas resolves to the
   * snapped position. The first click stores a provisional start.
   */
  function onLinePointer(hit: CanvasHit | null, screen: Vec2): void {
    const endpoint: DraftingEndpoint =
      hit !== null && hit.kind === 'point'
        ? { kind: 'point', id: hit.id }
        : resolveDraftingEndpoint(
            document(),
            screenToWorld(viewport(), screen),
            activePieceId(),
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
    onAddLine(start, endpoint);
  }

  /** Drop the pending arc gesture without emitting a command. */
  function clearArcGesture(): void {
    arcStart.value = null;
    arcEnd.value = null;
    arcPointer.value = null;
    arcHint.value = false;
  }

  /** The arc gesture: click 1 start, click 2 end, click 3 a point on the arc. */
  function onArcPointer(hit: CanvasHit | null, screen: Vec2): void {
    const endpoint: DraftingEndpoint =
      hit !== null && hit.kind === 'point'
        ? { kind: 'point', id: hit.id }
        : resolveDraftingEndpoint(
            document(),
            screenToWorld(viewport(), screen),
            activePieceId(),
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

    if (arcFromEndpoints(document(), start, end, endpoint) === null) {
      arcHint.value = true;
      return;
    }

    clearArcGesture();
    onAddArc(start, end, endpoint);
  }

  /** The circle gesture mirrors the line gesture. */
  function onCirclePointer(hit: CanvasHit | null, screen: Vec2): void {
    const endpoint: CircleEndpoint =
      hit !== null && hit.kind === 'point'
        ? { kind: 'point', id: hit.id }
        : resolveCircleEndpoint(
            document(),
            screenToWorld(viewport(), screen),
            activePieceId(),
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
    onAddCircle(center, endpoint);
  }

  /** Drop the pending rectangle gesture without emitting a command. */
  function clearRectangleGesture(): void {
    rectangleClicks.value = [];
    rectanglePointer.value = null;
  }

  /**
   * The rectangle gesture: each click resolves like the Line tool; the click that
   * completes the mode emits every click as one gesture.
   */
  function onRectanglePointer(hit: CanvasHit | null, screen: Vec2): void {
    const mode = rectangleMode.value!;

    const endpoint: DraftingEndpoint =
      hit !== null && hit.kind === 'point'
        ? { kind: 'point', id: hit.id }
        : resolveDraftingEndpoint(
            document(),
            screenToWorld(viewport(), screen),
            activePieceId(),
            midpointTolerance.value,
          );

    if (rectangleClicks.value.some((click) => sameDraftingEndpoint(click, endpoint))) return;

    const clicks = [...rectangleClicks.value, endpoint];
    if (clicks.length < RECTANGLE_CLICKS[mode]) {
      rectangleClicks.value = clicks;
      rectanglePointer.value = null;
      return;
    }

    if (rectangleCorners(document(), mode, clicks) === null) return;

    clearRectangleGesture();
    onAddRectangle(mode, clicks);
  }

  /** One click of the Text with leader gesture: the anchor, then the target. */
  function onTextLeaderPointer(screen: Vec2): void {
    const world = screenToWorld(viewport(), screen);
    if (textAnchor.value === null) {
      textAnchor.value = resolveTextAnchorEndpoint(document(), world, activePieceId());
      textPointer.value = null;
      return;
    }

    const leader = resolveLeaderEndpoint(document(), world, activePieceId());
    const anchor = endpointPosition(document(), textAnchor.value)!;
    const target = endpointPosition(document(), leader)!;
    textPointer.value = target;
    if (leaderTargetIssue(TEXT_PREVIEW_ENTITY, anchor, target) !== null) return;

    onAddText(textAnchor.value, leader);
    textAnchor.value = null;
    textPointer.value = null;
  }

  /** One click of the Notch tool. */
  function onNotchPointer(hit: CanvasHit | null, screen: Vec2): void {
    if (hit === null || hit.kind !== 'point') return;
    const pieceId = activePieceId();
    if (pieceId === null) return;

    const target = notchTargetAt(document(), pieceId, hit.id, screenToWorld(viewport(), screen));
    if (target !== null) onAddNotch(target.point, target.edge);
  }

  /** Two clicks of the Centre line tool. */
  function onCentreLinePointer(hit: CanvasHit | null): void {
    if (hit === null || hit.kind !== 'point') return;

    if (centreStart.value === null) {
      centreStart.value = hit.id;
      return;
    }
    if (centreStart.value === hit.id) return;

    onAddCentreLine(centreStart.value, hit.id);
    centreStart.value = null;
  }

  /** Dispatch a pointer press to the active creation tool. */
  function onPointerDown(screen: Vec2, hit: CanvasHit | null): void {
    switch (tool()) {
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
      case 'add_text':
        onAddText(
          resolveTextAnchorEndpoint(document(), screenToWorld(viewport(), screen), activePieceId()),
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

  /** Update every live creation preview and magnet for the pointer position. */
  function onPointerMove(screen: Vec2, hit: CanvasHit | null): void {
    if (tool() === 'add_line' && lineStart.value !== null) {
      linePreview.value = snappedPoint(screenToWorld(viewport(), screen));
    }

    if (tool() === 'add_arc' && arcStart.value !== null) {
      const world = snappedPoint(screenToWorld(viewport(), screen));
      arcPointer.value = world;

      if (
        arcEnd.value !== null &&
        arcFromEndpoints(document(), arcStart.value, arcEnd.value, {
          kind: 'new',
          x: world.x,
          y: world.y,
        }) !== null
      ) {
        arcHint.value = false;
      }
    }

    if (MIDPOINT_TOOLS.has(tool()) && !readOnly()) {
      updateMidpointHover(screen);
    }

    if (tool() === 'add_point' && !readOnly()) {
      if (midpointHover.value === null) updatePointOnLineHover(hit, screen);
      else pointOnLineHover.value = null;
    }

    if (tool() === 'split_line' && !readOnly()) {
      updateSplitLineHover(hit, screen);
    }

    if (tool() === 'add_circle' && circleCenter.value !== null) {
      circlePreview.value = snappedPoint(screenToWorld(viewport(), screen));
    }

    if (rectangleMode.value !== null && rectangleClicks.value.length > 0) {
      rectanglePointer.value = snappedPoint(screenToWorld(viewport(), screen));
    }

    if (tool() === 'add_text_leader' && textAnchor.value !== null) {
      const leader = resolveLeaderEndpoint(
        document(),
        screenToWorld(viewport(), screen),
        activePieceId(),
      );
      textPointer.value = endpointPosition(document(), leader)!;
    }
  }

  /** The pointer left the canvas: end the hover and ghost, keep a pending pick. */
  function onPointerLeave(): void {
    pointOnLineHover.value = null;
    splitLineHover.value = null;
    midpointHover.value = null;
    textPointer.value = null;
  }

  /** Escape clears the text leader; returns whether it did. */
  function clearTextOnEscape(): boolean {
    if (textAnchor.value === null) return false;
    textAnchor.value = null;
    textPointer.value = null;
    return true;
  }

  /** Escape clears a rectangle or a magnet; returns whether it did. */
  function clearGestureOnEscape(): boolean {
    if (rectangleClicks.value.length > 0) {
      clearRectangleGesture();
      return true;
    }

    if (midpointHover.value !== null) {
      midpointHover.value = null;
      return true;
    }

    if (pointOnLineHover.value !== null) {
      pointOnLineHover.value = null;
      return true;
    }

    if (splitLineHover.value !== null) {
      splitLineHover.value = null;
      return true;
    }

    return false;
  }

  /** A tool switch drops every pending gesture and magnet. */
  function resetOnToolChange(): void {
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
    pointOnLineHover.value = null;
    splitLineHover.value = null;
    midpointHover.value = null;
  }

  /** A document edit re-resolves the magnets and drops gestures that lost a point. */
  function pruneOnDocumentChange(): void {
    splitLineHover.value = null;

    const pointOnLine = pointOnLineHover.value;
    if (pointOnLine !== null) {
      const point = pointOnLineTarget(pointOnLine.lineId, pointOnLine.pointer);
      pointOnLineHover.value = point === null ? null : { ...pointOnLine, point };
    }

    const midpoint = midpointHover.value;
    if (midpoint !== null) {
      const candidate = nearestLineMidpoint(
        document(),
        midpoint.pointer,
        midpointTolerance.value,
        activePieceId(),
      );
      midpointHover.value = candidate === null ? null : { ...candidate, pointer: midpoint.pointer };
    }

    if (
      pendingLineStartId.value !== null &&
      !points().some((point) => point.id === pendingLineStartId.value)
    ) {
      lineStart.value = null;
      linePreview.value = null;
    }

    const arcPointMissing = [arcStart.value, arcEnd.value].some((endpoint) =>
      endpointMissing(document(), endpoint),
    );
    if (arcPointMissing) clearArcGesture();

    if (
      pendingCircleCenterId.value !== null &&
      !points().some((point) => point.id === pendingCircleCenterId.value)
    ) {
      circleCenter.value = null;
      circlePreview.value = null;
    }

    if (rectangleClicks.value.some((endpoint) => endpointMissing(document(), endpoint))) {
      clearRectangleGesture();
    }
  }

  return {
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
    textAnchor,
    pointOnLineHover,
    splitLineHover,
    midpointHover,
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    clearTextOnEscape,
    clearGestureOnEscape,
    resetOnToolChange,
    pruneOnDocumentChange,
  };
}
