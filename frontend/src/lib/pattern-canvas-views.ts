import {
  arcThroughPoints,
  MIN_RADIUS,
  pieceBandRegions,
  pieceCutLoop,
  pieceFoldLines,
  pieceLoop,
  seamAllowancePaths,
  svgArcCommand,
  type ArcEntity,
  type BandRegion,
  type BandTarget,
  type CircleEntity,
  type CurveEntity,
  type EntityId,
  type LineEntity,
  type PatternDocument,
  type Piece,
  type PointEntity,
  type Vec2,
} from '@sewcraft/geometry';

import { curvePath, polylinePath } from './canvas-render';

/**
 * The drawing models the pattern canvas renders from the document. Everything
 * here is a pure derivation of the document (plus the drag-aware point map and
 * the presentation toggles), so the canvas keeps only state and gestures.
 */

/** A line whose two endpoints resolve to points. */
export interface LineView {
  line: LineEntity;
  start: PointEntity;
  end: PointEntity;
}

/** A curve whose four control points resolve, with its SVG path. */
export interface CurveView {
  curve: CurveEntity;
  d: string;
}

/** An arc whose three points still define a circle, with its SVG path. */
export interface ArcView {
  arc: ArcEntity;
  d: string;
}

/** A circle with a renderable radius, positioned for SVG. */
export interface CircleView {
  circle: CircleEntity;
  cx: number;
  cy: number;
  r: number;
}

/** One seam allowance strip, offset from its edge. */
export interface SeamView {
  edge: EntityId;
  d: string;
  selfIntersects: boolean;
}

/** A piece's derived loops, ready to draw. */
export interface PieceView {
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

/** A region ready to draw, with its selection and hover state resolved. */
export interface RegionView {
  key: string;
  d: string;
  target: BandTarget;
  selected: boolean;
  hovered: boolean;
}

/** The points a canvas draws from, keyed by id so a live drag is followed. */
export type PointMap = ReadonlyMap<EntityId, PointEntity>;

/** A closed SVG path for a derived loop; every caller passes a resolved loop. */
export function closedLoopPath(points: readonly Vec2[]): string {
  return `${polylinePath([...points])} Z`;
}

/** Every line whose endpoints both resolve. */
export function lineViews(document: PatternDocument, pointById: PointMap): LineView[] {
  return document.entities
    .filter((entity): entity is LineEntity => entity.kind === 'line')
    .flatMap((line): LineView[] => {
      const start = pointById.get(line.start);
      const end = pointById.get(line.end);
      if (!start || !end) return [];
      return [{ line, start, end }];
    });
}

/** Every curve whose four control points resolve. */
export function curveViews(document: PatternDocument, pointById: PointMap): CurveView[] {
  return document.entities
    .filter((entity): entity is CurveEntity => entity.kind === 'curve')
    .flatMap((curve): CurveView[] => {
      const resolved = [curve.p0, curve.p1, curve.p2, curve.p3]
        .map((id) => pointById.get(id))
        .filter((point): point is PointEntity => point !== undefined);
      if (resolved.length !== 4) return [];
      const [p0, p1, p2, p3] = resolved;
      return [{ curve, d: curvePath([p0!, p1!, p2!, p3!]) }];
    });
}

/**
 * Every arc whose three points still define a circle. An arc invalidated by a
 * constraint solve is skipped rather than thrown, so it simply disappears from
 * the canvas.
 */
export function arcViews(document: PatternDocument, pointById: PointMap): ArcView[] {
  return document.entities
    .filter((entity): entity is ArcEntity => entity.kind === 'arc')
    .flatMap((arc): ArcView[] => {
      const resolved = [arc.start, arc.end, arc.through]
        .map((id) => pointById.get(id))
        .filter((point): point is PointEntity => point !== undefined);
      if (resolved.length !== 3) return [];

      const start = resolved[0]!;
      const end = resolved[1]!;
      const through = resolved[2]!;
      const geometry = arcThroughPoints(start, end, through);
      if (geometry === null) return [];

      return [{ arc, d: svgArcCommand(geometry, start, end) }];
    });
}

/**
 * Every circle whose centre and rim resolve and whose radius is renderable. A
 * degenerate or dangling circle is skipped, exactly as the export layer skips it.
 */
export function circleViews(document: PatternDocument, pointById: PointMap): CircleView[] {
  return document.entities
    .filter((entity): entity is CircleEntity => entity.kind === 'circle')
    .flatMap((circle): CircleView[] => {
      const center = pointById.get(circle.center);
      const rim = pointById.get(circle.rim);
      if (center === undefined || rim === undefined) return [];
      const r = Math.hypot(rim.x - center.x, rim.y - center.y);
      if (r < MIN_RADIUS) return [];
      return [{ circle, cx: center.x, cy: center.y, r }];
    });
}

/**
 * The seam allowance layer: a render-only offset of the document's seams, empty
 * while the presentation toggle is off.
 */
export function seamViews(document: PatternDocument, showAllowances: boolean): SeamView[] {
  if (!showAllowances) return [];
  return seamAllowancePaths(document).map((allowance) => ({
    edge: allowance.edge,
    d: polylinePath(allowance.path),
    selfIntersects: allowance.selfIntersections.length > 0,
  }));
}

/** The one piece the canvas shows: the active one, or the document's only piece. */
export function bandPieceOf(
  document: PatternDocument,
  activePieceId: EntityId | null | undefined,
): Piece | null {
  return document.pieces.find((piece) => piece.id === activePieceId) ?? document.pieces[0] ?? null;
}

/** The allowance band of one piece, parted into selectable regions. */
export function bandRegionsOf(document: PatternDocument, piece: Piece | null): BandRegion[] {
  return piece === null ? [] : pieceBandRegions(document, piece);
}

/** The piece's cut loop, for the hover that reveals the region boundaries. */
export function bandCutLoopOf(document: PatternDocument, piece: Piece | null) {
  return piece === null ? null : pieceCutLoop(document, piece);
}

/** One region's boundary and fill state, resolved against the current selection. */
export function regionViewsOf(
  regions: readonly BandRegion[],
  options: {
    showAllowances: boolean;
    selectedTargets: readonly BandTarget[];
    hovered: BandTarget | null;
    bandHovered: boolean;
    keyOf: (target: BandTarget) => string;
  },
): RegionView[] {
  if (!options.showAllowances) return [];
  return regions.map((region) => {
    const key = options.keyOf(region.target);
    return {
      key,
      target: region.target,
      d: closedLoopPath(region.polygon),
      selected: options.selectedTargets.some((target) => options.keyOf(target) === key),
      hovered: options.hovered !== null && options.keyOf(options.hovered) === key,
    };
  });
}

/** A region's class: a boundary while the piece is hovered, a fill once picked. */
export function regionClass(region: RegionView, bandHovered: boolean): string {
  if (region.selected) return 'fill-primary/30 stroke-primary';
  if (region.hovered) return 'fill-primary/20 stroke-primary';
  return bandHovered ? 'fill-transparent stroke-primary/40' : 'fill-transparent stroke-transparent';
}

/**
 * Every piece's derived geometry. Loops are recomputed from the document on
 * each read; nothing here is stored or fed back into the document.
 */
export function pieceViewsOf(
  document: PatternDocument,
  options: {
    showAllowances: boolean;
    selectedPieceId: EntityId | null | undefined;
    selectedEntityIds: readonly EntityId[];
  },
): PieceView[] {
  return document.pieces.flatMap((piece: Piece): PieceView[] => {
    const cut = pieceCutLoop(document, piece);
    if (cut === null) return [];
    const stitch = pieceLoop(document, piece)!;

    const cutPath = closedLoopPath(cut.points);
    const stitchPath = closedLoopPath(stitch.points);
    return [
      {
        id: piece.id,
        edges: piece.edges,
        cut: cutPath,
        stitch: stitchPath,
        folds: pieceFoldLines(document, piece).map((fold) => closedLoopPath(fold)),
        band:
          options.showAllowances && cutPath !== '' && stitchPath !== ''
            ? `${cutPath} ${stitchPath}`
            : null,
        selfIntersects: cut.selfIntersections.length > 0,
        selected:
          piece.id === options.selectedPieceId ||
          piece.edges.some((edge) => options.selectedEntityIds.includes(edge)),
      },
    ];
  });
}
