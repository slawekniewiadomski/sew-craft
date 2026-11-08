import { getEntity, entityPoints, type Bounds } from './document.js';
import { roundBetween, roundBridge } from './corner-round.js';
import { isAnnotation, isCut } from './roles.js';
import {
  edgePolyline,
  findSelfIntersections,
  offsetVariablePolyline,
  offsetVariablePolylineDetailed,
  type SelfIntersection,
  type VariableOffsetVertex,
} from './offset.js';
import type {
  AllowanceKind,
  ArcEntity,
  CutAnchor,
  CurveEntity,
  EntityId,
  LineEntity,
  PatternDocument,
  Piece,
  PointEntity,
} from './types.js';
import { magnitude, sub, type Vec2 } from './vector.js';
import {
  allowanceForEdge,
  cornerAllowanceForRound,
  edgeAllowance,
  pieceForEdge,
  sameAllowance,
  usableCornerWidth,
  type SegmentAllowance,
} from './piece-allowance.js';
export {
  allowanceDistance,
  allowanceForEdge,
  pieceForEdge,
  cornerAllowanceForRound,
  cornerAllowanceState,
  type CornerAllowanceState,
} from './piece-allowance.js';

/** Millimetres within which two edge endpoints count as the same loop vertex. */
const VERTEX_TOLERANCE = 1e-6;

/**
 * Radians within which a change of allowance distance cuts square across a loop
 * vertex. Larger than a flattened arc's chord turn (≈5.6°) and far below any
 * drafted corner.
 */
const TANGENT_STEP = Math.PI / 18;

type PieceEdgeEntity = LineEntity | CurveEntity | ArcEntity;

/** One segment of a resolved piece loop: a stored edge or a derived round bridge. */
interface LoopSegment {
  /** Polyline in walk direction. */
  points: Vec2[];
  /** Index into `piece.edges`, or `null` for a derived bridge. */
  edgeIndex: number | null;
  /** The corner round a bridge stands for, or `null` for a stored edge. */
  round: EntityId | null;
  /** Whether the stored edge runs against the walk; bridges are already oriented. */
  reversed: boolean;
}

type LoopAssembly = { ok: true; segments: LoopSegment[] } | { ok: false; edgeIndex: number };

/** A piece loop resolved against the current document. */
export interface PieceLoop {
  /** Closed polyline of the stitch boundary, in loop order. */
  points: Vec2[];
  /** One signed outward distance per boundary segment. */
  distances: number[];
  /** Boundary vertex index where each edge's span starts in walk order. */
  starts: number[];
  /** Boundary vertex index of each edge's natural start. */
  naturalStart: number[];
  /** Segment count contributed by each edge. */
  spans: number[];
}

/** The cut loop of a piece, with the join point generated at every loop vertex. */
export interface PieceCutLoop {
  points: Vec2[];
  vertices: VariableOffsetVertex[];
  selfIntersections: SelfIntersection[];
}

/** Per-piece measurements shown in the inspector and exported as metadata. */
export interface PieceMetrics {
  finished: { width: number; height: number };
  cut: { width: number; height: number };
  cutArea: number;
  allowanceArea: number;
  quantity: number;
}

export type PieceValidation = { ok: true } | { ok: false; message: string; edge?: EntityId };

/** A piece by id. */
export function pieceById(document: PatternDocument, id: EntityId): Piece | undefined {
  return document.pieces.find((piece) => piece.id === id);
}

/** The edge entities of a piece, in stored loop order, skipping anything missing. */
export function pieceEdges(document: PatternDocument, piece: Piece): PieceEdgeEntity[] {
  return piece.edges.flatMap((id) => {
    const entity = getEntity(document, id);
    if (
      entity === undefined ||
      entity.kind === 'point' ||
      entity.kind === 'text' ||
      entity.kind === 'mark' ||
      entity.kind === 'circle' ||
      !isCut(entity)
    ) {
      return [];
    }
    try {
      // A dangling point reference makes the whole loop unresolvable; report it
      // as an absent edge so every derived function degrades to `null` rather
      // than throwing during a render or an export.
      entityPoints(document, entity);
    } catch {
      return [];
    }
    return [entity];
  });
}

/** The two point ids an edge runs between, or `null` for points and circles. */
export function edgeEndpointIds(entity: PieceEdgeEntity): [EntityId, EntityId] {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end];
    case 'curve':
      return [entity.p0, entity.p3];
    case 'arc':
      return [entity.start, entity.end];
  }
}

const first = (points: readonly Vec2[]): Vec2 => points[0]!;
const last = (points: readonly Vec2[]): Vec2 => points[points.length - 1]!;

function connects(a: Vec2, b: Vec2): boolean {
  return magnitude(sub(a, b)) <= VERTEX_TOLERANCE;
}

/**
 * The stitch polyline of every loop edge, in authored `Piece.edges` order and
 * each edge's authored start→end direction. Corner-round bridges are excluded:
 * they are derived segments and belong to no edge. Returns `null` when the loop
 * does not resolve, so a caller degrades instead of using a partial loop.
 */
export function pieceEdgeSegments(document: PatternDocument, piece: Piece): Vec2[][] | null {
  const segments = orientedPolylines(document, piece);
  if (segments === null) return null;

  const polylines = new Array<Vec2[] | undefined>(piece.edges.length);
  for (const segment of segments) {
    if (segment.edgeIndex === null) continue;
    // The walk may run an edge backwards; undo it to restore the stored direction.
    polylines[segment.edgeIndex] = segment.reversed ? reverse(segment.points) : [...segment.points];
  }

  // `orientedPolylines` already checked that every stored edge has a segment.
  return polylines as Vec2[][];
}

/**
 * Validate that a selection forms one closed chain a piece can own: at least
 * three distinct cut line/curve/arc edges, no circle or construction edge, no
 * edge already in another piece, and every consecutive pair meeting at a vertex
 * with the last meeting the first.
 */
export function validatePiece(
  document: PatternDocument,
  edges: readonly EntityId[],
  options: { ignorePiece?: EntityId; piece?: EntityId } = {},
): PieceValidation {
  if (edges.length < 3) {
    return { ok: false, message: 'A piece needs at least three edges.' };
  }
  if (new Set(edges).size !== edges.length) {
    const duplicate = edges.find((id, index) => edges.indexOf(id) !== index)!;
    return {
      ok: false,
      message: `Edge ${duplicate} is selected more than once.`,
      edge: duplicate,
    };
  }

  const polylines: Vec2[][] = [];
  for (const id of edges) {
    const entity = getEntity(document, id);
    if (entity === undefined) {
      return { ok: false, message: `Edge ${id} does not exist.`, edge: id };
    }
    if (entity.kind === 'point') {
      return { ok: false, message: `Edge ${id} is a point, not a cut edge.`, edge: id };
    }
    if (entity.kind === 'circle') {
      return {
        ok: false,
        message: `Edge ${id} is a circle; circle pieces are not supported yet.`,
        edge: id,
      };
    }
    if (isAnnotation(entity)) {
      return {
        ok: false,
        message: `Edge ${id} is annotation geometry and cannot be a cut edge.`,
        edge: id,
      };
    }
    if (!isCut(entity)) {
      return { ok: false, message: `Edge ${id} is construction geometry.`, edge: id };
    }
    if (
      options.piece !== undefined &&
      entity.piece !== undefined &&
      entity.piece !== options.piece
    ) {
      return { ok: false, message: `Edge ${id} belongs to another piece.`, edge: id };
    }
    if (
      options.piece === undefined &&
      pieceForEdge(document, id, options.ignorePiece) !== undefined
    ) {
      return { ok: false, message: `Edge ${id} already belongs to another piece.`, edge: id };
    }
    try {
      // A dangling point reference makes `edgePolyline` throw; report it as a
      // rejected selection instead of leaking a raw error through the command layer.
      entityPoints(document, entity);
    } catch {
      return { ok: false, message: `Edge ${id} references a missing point.`, edge: id };
    }
    const polyline = edgePolyline(document, id);
    if (polyline === null || polyline.length < 2) {
      return { ok: false, message: `Edge ${id} has no usable geometry.`, edge: id };
    }
    polylines.push(polyline);
  }

  // Walk the ordered edges as one chain: each edge must continue where the
  // previous one ended, and the last must close back to the first. A corner that
  // a committed round has trimmed leaves a gap; `assembleLoop` fills it with the
  // round's derived arc, so a piece stays one closed loop around the round.
  const assembly = assembleLoop(document, edges, polylines);
  if (!assembly.ok) {
    const index = assembly.edgeIndex;
    if (index === 0) {
      return {
        ok: false,
        message: `Edge ${edges[edges.length - 1]} does not connect to edge ${edges[0]}.`,
        edge: edges[0]!,
      };
    }
    return {
      ok: false,
      message: `Edge ${edges[index - 1]} does not connect to edge ${edges[index]}.`,
      edge: edges[index]!,
    };
  }

  return { ok: true };
}

/** Signed area of a closed polyline; positive means counter-clockwise. */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function reverse(points: readonly Vec2[]): Vec2[] {
  return [...points].reverse();
}

/**
 * Walk the stored edges in one direction, inserting a committed round's arc
 * wherever consecutive edges no longer meet because the round trimmed them.
 * Returns the failing edge index when the chain does not close.
 */
function walkLoop(
  document: PatternDocument,
  edgeIds: readonly EntityId[],
  polylines: readonly Vec2[][],
  reverseFirst: boolean,
): LoopAssembly {
  const firstPolyline = reverseFirst ? reverse(polylines[0]!) : [...polylines[0]!];
  const segments: LoopSegment[] = [
    { points: firstPolyline, edgeIndex: 0, round: null, reversed: reverseFirst },
  ];
  let current = last(firstPolyline);

  for (let i = 1; i < edgeIds.length; i += 1) {
    const polyline = polylines[i]!;
    let points: Vec2[] | null = null;
    let reversed = false;
    if (connects(current, first(polyline))) {
      points = [...polyline];
    } else if (connects(current, last(polyline))) {
      points = reverse(polyline);
      reversed = true;
    }

    if (points === null) {
      // `roundBridge` returns the arc already running from the previous edge's
      // tangent to the next one, which is exactly where the walk stands.
      const bridge = roundBridge(document, edgeIds[i - 1]!, edgeIds[i]!);
      const round = roundBetween(document, edgeIds[i - 1]!, edgeIds[i]!);
      if (bridge === null || round === null) return { ok: false, edgeIndex: i };

      segments.push({ points: bridge, edgeIndex: null, round: round.id, reversed: false });
      current = last(bridge);
      if (connects(current, first(polyline))) {
        points = [...polyline];
      } else if (connects(current, last(polyline))) {
        points = reverse(polyline);
        reversed = true;
      } else {
        return { ok: false, edgeIndex: i };
      }
    }

    segments.push({ points, edgeIndex: i, round: null, reversed });
    current = last(points);
  }

  const origin = first(firstPolyline);
  if (!connects(current, origin)) {
    const bridge = roundBridge(document, edgeIds[edgeIds.length - 1]!, edgeIds[0]!);
    const round = roundBetween(document, edgeIds[edgeIds.length - 1]!, edgeIds[0]!);
    if (bridge === null || round === null) return { ok: false, edgeIndex: 0 };

    segments.push({ points: bridge, edgeIndex: null, round: round.id, reversed: false });
    if (!connects(last(bridge), origin)) return { ok: false, edgeIndex: 0 };
  }

  return { ok: true, segments };
}

/**
 * Resolve the stored edges into one closed walk, trying the stored direction
 * first and the reversed direction second. Bridges are derived on read.
 */
function assembleLoop(
  document: PatternDocument,
  edgeIds: readonly EntityId[],
  polylines: readonly Vec2[][],
): LoopAssembly {
  // Mirror the walk's historical first-edge heuristic: when the first edge's
  // end does not meet the second edge, the walk probably runs the other way.
  const second = polylines[1]!;
  const firstEnd = last(polylines[0]!);
  const reverseFirst = !connects(firstEnd, first(second)) && !connects(firstEnd, last(second));

  const preferred = walkLoop(document, edgeIds, polylines, reverseFirst);
  if (preferred.ok) return preferred;

  const fallback = walkLoop(document, edgeIds, polylines, !reverseFirst);
  return fallback.ok ? fallback : preferred;
}

/** Millimetres within which two lengths or distances count as equal. */
const LENGTH_TOLERANCE = 1e-9;

/**
 * The index of the first bridge segment that belongs to the outgoing edge: the
 * vertex nearest half the bridge's arc length. A bridge flattens into an even
 * number of chords, so the halves are equal and a reversed walk picks the
 * mirrored vertex.
 */
function splitIndex(lengths: readonly number[]): number {
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const half = total / 2;
  let cumulative = 0;
  let best = 0;
  let bestGap = half;
  for (let index = 1; index <= lengths.length; index += 1) {
    cumulative += lengths[index - 1]!;
    const gap = Math.abs(cumulative - half);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}

/** What a band region edits: one loop edge or one rounded corner. */
export type BandTarget = { kind: 'edge'; edge: EntityId } | { kind: 'round'; round: EntityId };

/** One boundary segment's resolved allowance and the target that owns it. */
interface SegmentResolution {
  allowance: SegmentAllowance;
  target: BandTarget;
}

/**
 * Resolve every boundary segment, in walk order. A bridge takes its round's own
 * width, the width both adjacent edges agree on, or one half per edge when they
 * differ; a split half belongs to the edge on its side.
 */
function resolveLoopSegments(
  document: PatternDocument,
  piece: Piece,
  edges: readonly PieceEdgeEntity[],
  segments: readonly LoopSegment[],
): SegmentResolution[] {
  const resolved: SegmentResolution[] = [];

  for (const [index, segment] of segments.entries()) {
    const segmentCount = segment.points.length - 1;

    if (segment.edgeIndex !== null) {
      const edge = edges[segment.edgeIndex]!.id;
      const resolution = {
        allowance: edgeAllowance(document, allowanceForEdge(piece, edge)),
        target: { kind: 'edge', edge } as const,
      };
      for (let i = 0; i < segmentCount; i += 1) resolved.push(resolution);
      continue;
    }

    // Segments alternate edge/bridge, so the neighbours' edge indices are at
    // hand; a closing bridge wraps to the first edge.
    const beforeIndex = segments[index - 1]!.edgeIndex!;
    const afterIndex = segments[(index + 1) % segments.length]!.edgeIndex!;
    const beforeEdge = edges[beforeIndex]!.id;
    const afterEdge = edges[afterIndex]!.id;
    const beforeAllowance = allowanceForEdge(piece, beforeEdge);
    const afterAllowance = allowanceForEdge(piece, afterEdge);
    const round = segment.round!;

    const own = usableCornerWidth(cornerAllowanceForRound(piece, round));
    if (own !== null) {
      const resolution = {
        allowance: { distance: own, fold: 0 },
        target: { kind: 'round', round } as const,
      };
      for (let i = 0; i < segmentCount; i += 1) resolved.push(resolution);
      continue;
    }

    if (sameAllowance(beforeAllowance, afterAllowance)) {
      const resolution = {
        allowance: edgeAllowance(document, beforeAllowance),
        target: { kind: 'round', round } as const,
      };
      for (let i = 0; i < segmentCount; i += 1) resolved.push(resolution);
      continue;
    }

    const before = edgeAllowance(document, beforeAllowance);
    const after = edgeAllowance(document, afterAllowance);
    const lengths = segment.points
      .slice(1)
      .map((point, pointIndex) => magnitude(sub(point, segment.points[pointIndex]!)));
    const split = splitIndex(lengths);
    for (let i = 0; i < segmentCount; i += 1) {
      resolved.push(
        i < split
          ? { allowance: before, target: { kind: 'edge', edge: beforeEdge } }
          : { allowance: after, target: { kind: 'edge', edge: afterEdge } },
      );
    }
  }

  return resolved;
}

/**
 * The unsigned allowance distance of every boundary segment, in walk order; the
 * fold variant reports how far a double fold's turn line sits inside the cut.
 */
function loopDistances(
  document: PatternDocument,
  piece: Piece,
  edges: readonly PieceEdgeEntity[],
  segments: readonly LoopSegment[],
  fold: boolean,
): number[] {
  return resolveLoopSegments(document, piece, edges, segments).map((resolution) =>
    fold ? resolution.allowance.fold : resolution.allowance.distance,
  );
}

/**
 * Flatten the piece's edges into one closed boundary, reversing any edge whose
 * stored direction runs against the walk and inserting a committed round's arc
 * where a rounded corner leaves a gap. Returns `null` when the edges cannot be
 * walked as one closed loop.
 */
function orientedPolylines(document: PatternDocument, piece: Piece): LoopSegment[] | null {
  const edges = pieceEdges(document, piece);
  if (edges.length !== piece.edges.length || edges.length < 3) return null;

  const polylines = edges.map((edge) => edgePolyline(document, edge.id));
  if (polylines.some((polyline) => polyline === null)) return null;

  const assembly = assembleLoop(document, piece.edges, polylines as Vec2[][]);
  return assembly.ok ? assembly.segments : null;
}

/**
 * Resolve the stitch boundary and the signed outward distance of every segment.
 * Outward is away from the loop interior, derived from the walk's winding, so
 * no stored side is needed. Returns `null` for an unresolvable loop.
 */
export function pieceLoop(document: PatternDocument, piece: Piece): PieceLoop | null {
  const segments = orientedPolylines(document, piece);
  if (segments === null) return null;
  return loopFromSegments(document, piece, pieceEdges(document, piece), segments);
}

/** Resolve one loop from its already-oriented segments and per-edge allowances. */
function loopFromSegments(
  document: PatternDocument,
  piece: Piece,
  edges: readonly PieceEdgeEntity[],
  segments: LoopSegment[],
): PieceLoop {
  const boundary: Vec2[] = [];
  const starts = new Array<number>(edges.length).fill(0);
  const spans = new Array<number>(edges.length).fill(0);

  for (const segment of segments) {
    if (segment.edgeIndex !== null) {
      starts[segment.edgeIndex] = boundary.length;
      spans[segment.edgeIndex] = segment.points.length - 1;
    }
    for (let i = 0; i < segment.points.length - 1; i += 1) {
      boundary.push(segment.points[i]!);
    }
  }

  const unsigned = loopDistances(document, piece, edges, segments, false);

  const sign = signedArea(boundary) > 0 ? -1 : 1;
  const distances = unsigned.map((distance) => sign * distance);

  // A reversed edge traverses its natural start at the far end of its span.
  const naturalStart = starts.map((start, index) => {
    const segment = segments.find((candidate) => candidate.edgeIndex === index)!;
    if (!segment.reversed) return start;
    const end = (start + spans[index]!) % boundary.length;
    return end;
  });

  return { points: boundary, distances, starts, naturalStart, spans };
}

/** The cut loop: the stitch boundary offset per edge and joined at every vertex. */
export function pieceCutLoop(document: PatternDocument, piece: Piece): PieceCutLoop | null {
  const loop = pieceLoop(document, piece);
  if (loop === null) return null;

  const detailed = offsetVariablePolylineDetailed(loop.points, loop.distances, {
    closed: true,
    tangentStep: TANGENT_STEP,
  });
  return {
    points: detailed.points,
    vertices: detailed.vertices,
    selfIntersections: findSelfIntersections(detailed.points, { closed: true }),
  };
}

/** One selectable area of a piece's allowance band. */
export interface BandRegion {
  /** What the region edits. */
  target: BandTarget;
  /** One closed polygon in the loop's walk order. */
  polygon: Vec2[];
}

/** A stable key for a band target, for grouping and for selection sets. */
export function bandTargetKey(target: BandTarget): string {
  return target.kind === 'edge' ? `edge:${target.edge}` : `round:${target.round}`;
}

const midpointOf = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The cut loop's join points at one loop vertex, in output order. */
function joinAt(cut: PieceCutLoop, vertex: number): Vec2[] {
  const range = cut.vertices[vertex]!;
  return cut.points.slice(range.start, range.end);
}

/**
 * The point where a region boundary crosses the band at one vertex: the vertex's
 * only join point, or the midpoint of its first two (a bevel or a step).
 */
function splitPointAt(join: readonly Vec2[]): Vec2 {
  return join.length === 1 ? join[0]! : midpointOf(join[0]!, join[1]!);
}

/** Drop consecutive duplicates and a closing point equal to the first. */
function dedupePolygon(points: readonly Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous === undefined || magnitude(sub(point, previous)) > VERTEX_TOLERANCE) {
      result.push(point);
    }
  }
  return result;
}

/** Runs of consecutive boundary segments that one target owns. */
function groupSegments(
  resolutions: readonly SegmentResolution[],
): { start: number; count: number; target: BandTarget }[] {
  const total = resolutions.length;
  const groups: { start: number; count: number; target: BandTarget }[] = [];

  // Start where the predecessor owns a different target, so a run that wraps
  // past the loop's start stays one group.
  let start = 0;
  while (
    start < total &&
    bandTargetKey(resolutions[(start + total - 1) % total]!.target) ===
      bandTargetKey(resolutions[start]!.target)
  ) {
    start += 1;
  }
  for (let step = 0; step < total; step += 1) {
    const at = (start + step) % total;
    const previous = groups[groups.length - 1];
    const sameAsPrevious =
      previous !== undefined &&
      bandTargetKey(resolutions[(at + total - 1) % total]!.target) ===
        bandTargetKey(resolutions[at]!.target);
    if (sameAsPrevious) {
      previous.count += 1;
    } else {
      groups.push({ start: at, count: 1, target: resolutions[at]!.target });
    }
  }

  return groups;
}

/**
 * The polygon of one region: its stitch run forward, the join halves at both
 * ends and the cut boundary back. `segmentCount` is the number of boundary
 * segments the region owns.
 */
function regionPolygon(
  loop: PieceLoop,
  cut: PieceCutLoop,
  startSegment: number,
  segmentCount: number,
): Vec2[] {
  const total = loop.points.length;
  const vertex = (offset: number): number => (startSegment + offset) % total;
  const points: Vec2[] = [];

  for (let offset = 0; offset <= segmentCount; offset += 1) {
    points.push(loop.points[vertex(offset)]!);
  }

  const endJoin = joinAt(cut, vertex(segmentCount));
  const startJoin = joinAt(cut, vertex(0));
  points.push(splitPointAt(endJoin));
  if (endJoin.length > 1) points.push(endJoin[0]!);

  for (let offset = segmentCount - 1; offset >= 1; offset -= 1) {
    const join = joinAt(cut, vertex(offset));
    for (let index = join.length - 1; index >= 0; index -= 1) points.push(join[index]!);
  }

  for (let index = startJoin.length - 1; index >= 1; index -= 1) {
    points.push(startJoin[index]!);
  }
  points.push(splitPointAt(startJoin));

  return dedupePolygon(points);
}

/**
 * The band parted into selectable regions: one per loop edge and per corner
 * round, with a split crescent contributing its halves to the adjacent edges.
 * Empty when the loop does not resolve, the cut loop is compacted, or it
 * self-intersects.
 */
export function pieceBandRegions(document: PatternDocument, piece: Piece): BandRegion[] {
  const segments = orientedPolylines(document, piece);
  if (segments === null) return [];

  const edges = pieceEdges(document, piece);
  const loop = loopFromSegments(document, piece, edges, segments);
  const cut = pieceCutLoop(document, piece);
  if (cut === null || cut.selfIntersections.length > 0) return [];
  if (cut.vertices.length !== loop.points.length) return [];

  return groupSegments(resolveLoopSegments(document, piece, edges, segments)).flatMap((group) => {
    const polygon = regionPolygon(loop, cut, group.start, group.count);
    // A target with no band (no allowance, or an empty twin half) has no area.
    return Math.abs(signedArea(polygon)) <= LENGTH_TOLERANCE
      ? []
      : [{ target: group.target, polygon }];
  });
}

/**
 * The fold line of a double-fold piece, at the finished width inside the cut
 * line. Empty when no loop edge is a double fold. For a uniformly doubled piece
 * this loop is exactly the single-fold cut outline.
 */
export function pieceFoldLines(document: PatternDocument, piece: Piece): Vec2[][] {
  const segments = orientedPolylines(document, piece);
  if (segments === null) return [];

  const loop = loopFromSegments(document, piece, pieceEdges(document, piece), segments);

  const unsigned = loopDistances(document, piece, pieceEdges(document, piece), segments, true);
  if (unsigned.every((distance) => distance === 0)) return [];

  const sign = signedArea(loop.points) > 0 ? -1 : 1;
  return [
    offsetVariablePolyline(
      loop.points,
      unsigned.map((distance) => sign * distance),
      { closed: true },
    ),
  ];
}

/**
 * The boundary vertex of an edge's natural start and end. `naturalStart` already
 * points at the far end of a reversed edge's span, so its own end is the walk
 * start rather than one span further on.
 */
function edgeVertexIndex(loop: PieceLoop, edgeIndex: number, at: 'start' | 'end'): number {
  const start = loop.naturalStart[edgeIndex]!;
  if (at === 'start') return start;
  const walkStart = loop.starts[edgeIndex]!;
  // Equal starts mean the edge runs with the walk.
  return walkStart === start ? (start + loop.spans[edgeIndex]!) % loop.points.length : walkStart;
}

/**
 * The resolved cut-loop point at one end of a loop edge, or `null` when the
 * anchor addresses a whole edge or the piece or its cut loop no longer resolves.
 */
export function pieceCutVertex(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  // An edge anchor has no single vertex; only `start`/`end` address a cut vertex.
  if (anchor.at === 'edge') return null;

  const edgeIndex = piece.edges.indexOf(anchor.edge);
  if (edgeIndex < 0) return null;

  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  const vertexIndex = edgeVertexIndex(loop, edgeIndex, anchor.at);
  // The closed cut loop has one vertex entry per source point.
  const vertex = cut.vertices[vertexIndex]!;
  return cut.points[vertex.start]!;
}

/**
 * The edge's **own** cut segment: from the outgoing offset point at the edge's
 * natural start to the incoming offset point at its natural end. This is the
 * source line offset by the edge's allowance, independent of the adjacent
 * allowance, the join style and a corner round, so a bevel join cannot tilt it.
 * `null` for a missing edge, a non-line source or a cut loop that no longer
 * resolves.
 */
export function pieceCutEdge(
  document: PatternDocument,
  piece: Piece,
  edge: EntityId,
): { a: Vec2; b: Vec2 } | null {
  const edgeIndex = piece.edges.indexOf(edge);
  if (edgeIndex < 0) return null;

  // A curve's or arc's cut segment is a chord, not the curve, so it is never a
  // straight edge anchor.
  if (getEntity(document, edge)?.kind !== 'line') return null;

  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  // A compacted cut loop no longer has one vertex entry per source point, so an
  // edge's own span cannot be addressed; report the piece as unresolvable.
  if (cut.vertices.length !== loop.points.length) return null;

  const start = loop.starts[edgeIndex]!;
  const end = (start + loop.spans[edgeIndex]!) % cut.vertices.length;
  const a = cut.points[cut.vertices[start]!.end - 1]!;
  const b = cut.points[cut.vertices[end]!.start]!;
  return { a, b };
}

/** A resolved cut anchor: a loop vertex point or a whole edge's cut segment. */
export type CutAnchorResolution =
  { kind: 'vertex'; point: Vec2 } | { kind: 'edge'; segment: { a: Vec2; b: Vec2 } };

/** Resolve one cut anchor against the piece's cut loop, or `null` when it cannot. */
export function resolveCutAnchor(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): CutAnchorResolution | null {
  if (anchor.at === 'edge') {
    const segment = pieceCutEdge(document, piece, anchor.edge);
    return segment === null ? null : { kind: 'edge', segment };
  }

  const point = pieceCutVertex(document, piece, anchor);
  return point === null ? null : { kind: 'vertex', point };
}

/**
 * The resolved stitch-loop point at one end of a loop edge, or `null` when the
 * piece, the edge or its stitch loop does not resolve. Mirrors `pieceCutVertex`
 * index for index, so both loops agree vertex for vertex; a whole-edge anchor
 * has no stitch equivalent and returns `null`.
 */
export function pieceLoopVertex(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): Vec2 | null {
  if (anchor.at === 'edge') return null;

  const edgeIndex = piece.edges.indexOf(anchor.edge);
  if (edgeIndex < 0) return null;

  const loop = pieceLoop(document, piece);
  if (loop === null) return null;

  return loop.points[edgeVertexIndex(loop, edgeIndex, anchor.at)]!;
}

/** Resolve one anchor against the loop it names, or `null` when it cannot. */
export function resolvePieceAnchor(
  document: PatternDocument,
  piece: Piece,
  anchor: CutAnchor,
): CutAnchorResolution | null {
  if ((anchor.loop ?? 'cut') === 'stitch') {
    const point = pieceLoopVertex(document, piece, anchor);
    return point === null ? null : { kind: 'vertex', point };
  }
  return resolveCutAnchor(document, piece, anchor);
}

/** Axis-aligned bounds of a closed loop, or `null` for an empty loop. */ export function loopBounds(
  points: readonly Vec2[],
): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** The cut loop's bounding box, or `null` when the piece cannot resolve. */
export function pieceCutBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const cut = pieceCutLoop(document, piece);
  return cut === null ? null : loopBounds(cut.points);
}

/**
 * A piece's own bounds: the stitch loop when it resolves, otherwise the bounds
 * of the points it owns. Shared by the piece-tab fit and the assembly anchor, so
 * an allowance edit never moves a placed instance.
 */
export function pieceBounds(document: PatternDocument, piece: Piece): Bounds | null {
  const loop = pieceLoop(document, piece);
  if (loop !== null) return loopBounds(loop.points);

  const owned = document.entities.filter(
    (entity): entity is PointEntity => entity.kind === 'point' && entity.piece === piece.id,
  );
  if (owned.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of owned) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function areaOf(points: readonly Vec2[]): number {
  return Math.abs(signedArea(points));
}

/** Finished and cut sizes, cut area, allowance area and quantity for a piece. */
export function pieceMetrics(document: PatternDocument, piece: Piece): PieceMetrics | null {
  const loop = pieceLoop(document, piece);
  const cut = pieceCutLoop(document, piece);
  if (loop === null || cut === null) return null;

  // A resolved loop always has at least three points.
  const finished = loopBounds(loop.points)!;
  const cutBounds = loopBounds(cut.points)!;

  const finishedArea = areaOf(loop.points);
  const cutArea = areaOf(cut.points);
  return {
    finished: {
      width: finished.max.x - finished.min.x,
      height: finished.max.y - finished.min.y,
    },
    cut: {
      width: cutBounds.max.x - cutBounds.min.x,
      height: cutBounds.max.y - cutBounds.min.y,
    },
    cutArea,
    allowanceArea: cutArea - finishedArea,
    quantity: piece.quantity ?? 1,
  };
}

/**
 * Every simple closed chain among `edgeIds` (default: every cut line, curve and
 * arc). A component qualifies only when every vertex joins exactly two of its
 * edges, so a branch or an open chain is never mistaken for a loop. Used by the
 * 0.1 migration to adopt closed seam chains.
 */
export function basicPieceForLoops(
  document: PatternDocument,
  edgeIds?: readonly EntityId[],
): EntityId[][] {
  const candidates = new Set(
    edgeIds ??
      document.entities
        .filter(
          (entity): entity is PieceEdgeEntity =>
            entity.kind === 'line' || entity.kind === 'curve' || entity.kind === 'arc',
        )
        .filter((entity) => isCut(entity))
        .map((entity) => entity.id),
  );

  const endpoints = new Map<EntityId, [EntityId, EntityId]>();
  const incident = new Map<EntityId, EntityId[]>();

  for (const id of candidates) {
    const entity = getEntity(document, id);
    if (
      entity === undefined ||
      entity.kind === 'point' ||
      entity.kind === 'circle' ||
      entity.kind === 'text' ||
      entity.kind === 'mark' ||
      !isCut(entity)
    ) {
      continue;
    }
    const [start, end] = edgeEndpointIds(entity);
    if (
      getEntity(document, start)?.kind !== 'point' ||
      getEntity(document, end)?.kind !== 'point'
    ) {
      continue;
    }
    endpoints.set(id, [start, end]);
    incident.set(start, [...(incident.get(start) ?? []), id]);
    incident.set(end, [...(incident.get(end) ?? []), id]);
  }

  const remaining = new Set(endpoints.keys());
  const loops: EntityId[][] = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value as EntityId;
    const component = new Set<EntityId>();
    const vertices = new Set<EntityId>();
    const stack = [seed];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      remaining.delete(id);
      for (const vertex of endpoints.get(id)!) {
        vertices.add(vertex);
        for (const neighbour of incident.get(vertex)!) {
          if (!component.has(neighbour) && remaining.has(neighbour)) stack.push(neighbour);
        }
      }
    }

    const simple = [...vertices].every((vertex) => incident.get(vertex)!.length === 2);
    if (!simple || component.size < 3) continue;

    const walk: EntityId[] = [];
    const start = component.values().next().value as EntityId;
    let current = start;
    let vertex = endpoints.get(start)![0];

    while (walk.length < component.size) {
      walk.push(current);
      const [a, b] = endpoints.get(current)!;
      const nextVertex = a === vertex ? b : a;
      const next = incident.get(nextVertex)!.find((id) => id !== current)!;
      if (next === start) break;
      current = next;
      vertex = nextVertex;
    }

    // Every vertex has degree two, so this walk is the component's single cycle.
    loops.push(walk);
  }

  return loops;
}

export const ALLOWANCE_KIND_LABELS: Record<AllowanceKind, string> = {
  seam: 'Seam',
  single: 'Single fold',
  double: 'Double fold',
};
