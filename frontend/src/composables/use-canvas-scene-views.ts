import {
  allPoints,
  bandTargetKey,
  centreLineGeometry,
  DEFAULT_TEXT_SIZE,
  isCornerRoundDerived,
  notchGeometry,
  pieceMarks,
  textLayout,
  textLeaderGeometry,
  type BandRegion,
  type BandTarget,
  type EntityId,
  type PatternDocument,
  type Piece,
} from '@sewcraft/geometry';
import { computed } from 'vue';

import type { MarkView, TextView } from '@/components/canvas/CanvasAnnotationLayers.vue';
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
  type PieceView,
  type RegionView,
} from '@/lib/pattern-canvas-views';

/** The entity geometry while a drag previews it at the pointer. */
export interface DragPointState {
  id: EntityId;
  x: number;
  y: number;
}

export interface CanvasSceneViewOptions {
  document: () => PatternDocument;
  dragState: () => DragPointState | null;
  showAllowances: () => boolean;
  activePieceId: () => EntityId | null;
  selectedPieceId: () => EntityId | null;
  selectedEntityIds: () => EntityId[];
  highlightedEntityIds: () => EntityId[];
  selectedAllowanceTargets: () => BandTarget[];
  hoveredRegion: () => BandTarget | null;
  bandHovered: () => boolean;
}

/**
 * The scene views the canvas template binds: points, plain geometry, the seam
 * band, every piece's derived geometry and the annotation and mark rows.
 *
 * Everything here is a pure derivation over the document, the presentation
 * toggles and the pointer state the canvas owns; no view mutates the document.
 */
export function useCanvasSceneViews({
  document,
  dragState,
  showAllowances,
  activePieceId,
  selectedPieceId,
  selectedEntityIds,
  highlightedEntityIds,
  selectedAllowanceTargets,
  hoveredRegion,
  bandHovered,
}: CanvasSceneViewOptions) {
  const points = computed(() =>
    allPoints(document()).map((point) => {
      const drag = dragState();
      return drag !== null && drag.id === point.id ? { ...point, x: drag.x, y: drag.y } : point;
    }),
  );

  const pointById = computed(() => new Map(points.value.map((point) => [point.id, point])));

  /**
   * Derived tangent and control points stay in `points` so lines and arcs resolve,
   * but they are not drafting handles: only the explicit tangent handles render.
   */
  const visiblePoints = computed(() =>
    points.value.filter((point) => !isCornerRoundDerived(document(), point.id)),
  );

  const selectedIds = computed(() => new Set(selectedEntityIds()));

  /** The edges a measured variable reads, for the highlight layer. */
  const highlightedIds = computed(() => new Set(highlightedEntityIds()));

  const lines = computed(() => lineViews(document(), pointById.value));

  const curves = computed(() => curveViews(document(), pointById.value));

  const arcs = computed(() => arcViews(document(), pointById.value));

  const circles = computed(() => circleViews(document(), pointById.value));

  /**
   * Seam allowances are a render-only offset layer: hidden entirely when the
   * presentation toggle is off, and never part of the document the UI mutates.
   */
  const seams = computed(() => seamViews(document(), showAllowances()));

  /** The one piece the canvas shows: the active one, or the document's only piece. */
  const bandPiece = computed<Piece | null>(() => bandPieceOf(document(), activePieceId()));

  /** The allowance band parted into selectable regions. */
  const bandRegions = computed<BandRegion[]>(() => bandRegionsOf(document(), bandPiece.value));

  /** The piece's cut loop, for the hover that reveals the region boundaries. */
  const bandCutLoop = computed(() => bandCutLoopOf(document(), bandPiece.value));

  const regionViews = computed<RegionView[]>(() =>
    regionViewsOf(bandRegions.value, {
      showAllowances: showAllowances(),
      selectedTargets: selectedAllowanceTargets(),
      hovered: hoveredRegion(),
      bandHovered: bandHovered(),
      keyOf: bandTargetKey,
    }),
  );

  /** A region draws its boundary while the piece is hovered, and fills once picked. */
  function regionClass(region: RegionView): string {
    return regionClassFor(region, bandHovered());
  }

  /** Every piece's derived geometry, ready to draw. */
  const pieceViews = computed<PieceView[]>(() =>
    pieceViewsOf(document(), {
      showAllowances: showAllowances(),
      selectedPieceId: selectedPieceId(),
      selectedEntityIds: selectedEntityIds(),
    }),
  );

  /** Annotation labels, resolved against their drag-aware anchor and leader points. */
  const textViews = computed<TextView[]>(() =>
    document().entities.flatMap((entity): TextView[] => {
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
    document().pieces.flatMap((piece: Piece): MarkView[] =>
      pieceMarks(document(), piece.id).flatMap((mark): MarkView[] => {
        const selected = selectedEntityIds().includes(mark.id);
        if (mark.type === 'notch') {
          const geometry = notchGeometry(document(), piece, mark);
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

        const geometry = centreLineGeometry(document(), mark);
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

  return {
    points,
    pointById,
    visiblePoints,
    selectedIds,
    highlightedIds,
    lines,
    curves,
    arcs,
    circles,
    seams,
    bandPiece,
    bandRegions,
    bandCutLoop,
    regionViews,
    regionClass,
    pieceViews,
    textViews,
    markViews,
  };
}
