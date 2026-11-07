import type { Command, EntityId, PatternDocument } from '@sewcraft/geometry';
import {
  findDistanceConstraint,
  isLineAnchor,
  measureDistanceDimension,
  usesCutEdgeAnchor,
} from '@sewcraft/geometry';
import type { ComputedRef, Ref } from 'vue';

import { buildArcCommands, type ArcEndpoint } from '@/lib/arc-tool';
import {
  type CutDimensionPlacement,
  type DimensionPatch,
  type DimensionPlacement,
} from '@/lib/dimensions';
import { canonicalCutAnchors, findDerivedDimension } from '@/lib/pieces';
import { buildCircleCommands, type CircleEndpoint } from '@/lib/circle-tool';
import { nextCommandId } from '@/lib/command-ids';
import type { DraftingEndpoint } from '@/lib/drafting';
import { buildLineCommands, type LineEndpoint } from '@/lib/line-tool';
import { buildPointMidpointCommands } from '@/lib/point-midpoint';
import { buildPointOnLineCommands } from '@/lib/point-on-line';
import { buildRectangleCommands, type RectangleMode } from '@/lib/rectangle-tool';
import { buildSplitLineCommands } from '@/lib/split-line';
import { buildTextCommands } from '@/lib/text-tool';

export interface SketchCommandsOptions {
  pattern: () => PatternDocument;
  /** The document the canvas draws in, for shared-space projections. */
  interactionDocument: ComputedRef<PatternDocument>;
  activePieceId: ComputedRef<EntityId | null>;
  selectedEntityIds: Ref<EntityId[]>;
  /** The view's command wrapper; it reports failures through its error strip. */
  run: (action: () => void) => boolean;
  dispatch: (command: Command) => void;
  dispatchGroup: (commands: Command[]) => void;
  /** The view's error strip, for a gesture that has nowhere to place its result. */
  error: Ref<string | null>;
}

/**
 * The canvas gestures that create or edit geometry: point moves, the point,
 * line, arc, circle, rectangle, curve, text, notch and centre-line tools,
 * dimensions and the construction toggle.
 *
 * The document, the active piece and the selection stay with the view; this
 * turns a gesture into the same commands an agent would emit.
 */
export function useSketchCommands({
  pattern,
  interactionDocument,
  activePieceId,
  selectedEntityIds,
  run,
  dispatch,
  dispatchGroup,
  error,
}: SketchCommandsOptions) {
  function onMovePoint(id: EntityId, x: number, y: number): void {
    run(() => dispatch({ id: nextCommandId('move'), type: 'move_point', params: { id, x, y } }));
  }

  function onAddPoint(x: number, y: number): void {
    const piece = activePieceId.value;
    run(() =>
      dispatch({
        id: nextCommandId('point'),
        type: 'add_point',
        /* v8 ignore next -- the canvas only adds points with an active piece */
        params: { x, y, ...(piece === null ? {} : { piece }) },
      }),
    );
  }

  /**
   * One gesture: the point at the projection and its `point_on_line` constraint,
   * as a single journal entry. `null` means the line no longer resolves, so
   * nothing is dispatched.
   */
  function onAddPointOnLine(lineId: EntityId, x: number, y: number): void {
    // The canvas hands us shared-space coordinates, so resolve them against the
    // same document it draws; the bus translates the new point back afterwards.
    const commands = buildPointOnLineCommands(
      interactionDocument.value,
      lineId,
      { x, y },
      nextCommandId,
      /* v8 ignore next -- the canvas only exists inside a piece tab */
      activePieceId.value ?? undefined,
    );
    if (commands === null) return;
    run(() => dispatchGroup(commands));
  }

  /**
   * One gesture: split the line, creating the shared point first when the
   * pointer did not reuse an authored one. `null` means the line no longer
   * resolves or the projection is an endpoint, so nothing is dispatched.
   */
  function onSplitLine(lineId: EntityId, x: number, y: number): void {
    const commands = buildSplitLineCommands(
      interactionDocument.value,
      lineId,
      { x, y },
      nextCommandId,
    );
    if (commands === null) return;
    // The original id belongs to only one half now, so a stale selection would
    // highlight the wrong edge; the user picks a half deliberately.
    selectedEntityIds.value = [];
    run(() => dispatchGroup(commands));
  }

  /**
   * One gesture: the point at the line's visible middle and its `midpoint`
   * relation, as a single journal entry. `null` means the line no longer
   * resolves, so nothing is dispatched.
   */
  function onAddPointMidpoint(lineId: EntityId): void {
    const commands = buildPointMidpointCommands(
      pattern(),
      lineId,
      nextCommandId,
      /* v8 ignore next -- the canvas only exists inside a piece tab */
      activePieceId.value ?? undefined,
    );
    if (commands === null) return;
    run(() => dispatchGroup(commands));
  }

  /** One gesture: new endpoints become points, then the line, as a single entry. */
  function onAddLine(start: LineEndpoint, end: LineEndpoint): void {
    run(() =>
      /* v8 ignore next -- the canvas only exists inside a piece tab */
      dispatchGroup(buildLineCommands(start, end, nextCommandId, activePieceId.value ?? undefined)),
    );
  }

  /** One gesture: new endpoints become points, then the arc, as a single entry. */
  function onAddArc(start: ArcEndpoint, end: ArcEndpoint, through: ArcEndpoint): void {
    run(() =>
      dispatchGroup(
        /* v8 ignore next -- the canvas only exists inside a piece tab */
        buildArcCommands(start, end, through, nextCommandId, activePieceId.value ?? undefined),
      ),
    );
  }

  /** One gesture: new endpoints become points, then the circle, as a single entry. */
  function onAddCircle(center: CircleEndpoint, rim: CircleEndpoint): void {
    run(() =>
      dispatchGroup(
        /* v8 ignore next -- the canvas only exists inside a piece tab */
        buildCircleCommands(center, rim, nextCommandId, activePieceId.value ?? undefined),
      ),
    );
  }

  /**
   * One gesture: new corners become points, then the four sides and their
   * constraints, as a single entry and a single undo.
   */
  function onAddRectangle(mode: RectangleMode, clicks: DraftingEndpoint[]): void {
    run(() =>
      dispatchGroup(
        buildRectangleCommands(
          pattern(),
          mode,
          clicks,
          nextCommandId,
          /* v8 ignore next -- the canvas only exists inside a piece tab */
          activePieceId.value ?? undefined,
        ),
      ),
    );
  }

  function onAddText(anchor: DraftingEndpoint, leader?: DraftingEndpoint): void {
    const pieceId = activePieceId.value;
    /* v8 ignore start -- the canvas only exists inside a piece tab */
    if (pieceId === null) {
      error.value = 'Create or select a piece before placing annotation text.';
      return;
    }
    /* v8 ignore stop */
    run(() => dispatchGroup(buildTextCommands(anchor, pieceId, nextCommandId, leader)));
  }

  /** A notch's depth change from the piece card's mark row. */
  function onSetNotchDepth(id: EntityId, depth: number | null): void {
    run(() =>
      dispatch({ id: nextCommandId('notch-depth'), type: 'update_notch', params: { id, depth } }),
    );
  }

  /** Delete a mark from the piece card, through the ordinary entity cascade. */
  function onDeleteMark(id: EntityId): void {
    run(() =>
      dispatch({ id: nextCommandId('delete-mark'), type: 'delete_entity', params: { id } }),
    );
  }

  /** A notch on the edge the maker pointed at, placed in one command. */
  function onAddNotch(point: EntityId, edge: EntityId): void {
    const pieceId = activePieceId.value;
    /* v8 ignore start -- the canvas only exists inside a piece tab */
    if (pieceId === null) return;
    /* v8 ignore stop */
    run(() =>
      dispatch({
        id: nextCommandId('notch'),
        type: 'add_notch',
        params: { piece: pieceId, edge, point },
      }),
    );
  }

  /** A centre line between the two snapped points of the gesture. */
  function onAddCentreLine(start: EntityId, end: EntityId): void {
    const pieceId = activePieceId.value;
    /* v8 ignore start -- the canvas only exists inside a piece tab */
    if (pieceId === null) return;
    /* v8 ignore stop */
    run(() =>
      dispatch({
        id: nextCommandId('centre-line'),
        type: 'add_centre_line',
        params: { piece: pieceId, start, end },
      }),
    );
  }

  function onAddCurve(points: [EntityId, EntityId, EntityId, EntityId]): void {
    run(() =>
      dispatchGroup([
        {
          id: nextCommandId('curve'),
          type: 'add_curve',
          params: {
            p0: points[0],
            p1: points[1],
            p2: points[2],
            p3: points[3],
            /* v8 ignore next -- the canvas only exists inside a piece tab */
            ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
          },
        },
      ]),
    );
  }

  /**
   * Place a dimension as a driven distance constraint: it measures the span and
   * adds no equation. Reusing an existing distance between the same two points
   * avoids duplicates and keeps that dimension's driven/set state; the placement
   * then only updates its presentation.
   */
  function onAddDimension(placement: DimensionPlacement): void {
    const orientation =
      isLineAnchor(pattern(), placement.a) || isLineAnchor(pattern(), placement.b)
        ? 'aligned'
        : placement.orientation;
    const existing = findDistanceConstraint(pattern(), placement.a, placement.b);
    if (existing !== undefined) {
      run(() =>
        dispatch({
          id: nextCommandId('dimension'),
          type: 'update_constraint',
          params: { id: existing.id, orientation, offset: placement.offset },
        }),
      );
      return;
    }

    const measured = measureDistanceDimension(pattern(), {
      id: placement.a,
      type: 'distance',
      a: placement.a,
      b: placement.b,
      orientation,
    });
    if (measured === null || measured <= 0) return;

    run(() =>
      dispatch({
        id: nextCommandId('dimension'),
        type: 'add_constraint',
        params: {
          type: 'distance',
          entities: [placement.a, placement.b],
          orientation,
          offset: placement.offset,
          /* v8 ignore next -- the canvas only exists inside a piece tab */
          ...(activePieceId.value === null ? {} : { piece: activePieceId.value }),
        },
      }),
    );
  }

  /** Place a read-only cut dimension, updating the existing one on the same span. */
  function onAddCutDimension(placement: CutDimensionPlacement): void {
    // The canvas only starts a placement for a piece that exists in this document.
    const piece = pattern().pieces.find((candidate) => candidate.id === placement.piece)!;

    const [a, b] = canonicalCutAnchors(piece, placement.a, placement.b);
    const orientation = usesCutEdgeAnchor({ a, b }) ? 'aligned' : placement.orientation;
    const existing = findDerivedDimension(pattern(), placement.piece, a, b);
    if (existing !== undefined) {
      run(() =>
        dispatch({
          id: nextCommandId('cut-dimension'),
          type: 'update_constraint',
          params: { id: existing.id, orientation, offset: placement.offset },
        }),
      );
      return;
    }

    run(() =>
      dispatch({
        id: nextCommandId('cut-dimension'),
        type: 'add_derived_dimension',
        params: {
          piece: placement.piece,
          a,
          b,
          orientation,
          offset: placement.offset,
        },
      }),
    );
  }

  function onUpdateDimension(id: EntityId, patch: DimensionPatch): void {
    run(() =>
      dispatch({
        id: nextCommandId('dimension'),
        type: 'update_constraint',
        params: { id, ...patch },
      }),
    );
  }

  function convert(id: string, construction: boolean): void {
    run(() =>
      dispatch({
        id: nextCommandId('construction'),
        type: 'set_construction',
        params: { id, construction },
      }),
    );
  }

  return {
    onMovePoint,
    onAddPoint,
    onAddPointOnLine,
    onSplitLine,
    onAddPointMidpoint,
    onAddLine,
    onAddArc,
    onAddCircle,
    onAddRectangle,
    onAddText,
    onSetNotchDepth,
    onDeleteMark,
    onAddNotch,
    onAddCentreLine,
    onAddCurve,
    onAddDimension,
    onAddCutDimension,
    onUpdateDimension,
    convert,
  };
}
