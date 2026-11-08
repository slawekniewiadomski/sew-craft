/**
 * The 3D preview: turn stitch loops and seam records into one welded mesh and
 * inflate it into a dummy shell. Pure geometry; the frontend only projects it.
 *
 * The algorithm is deliberately small: triangulate each panel, insert seam
 * samples into its boundary, weld the samples across sides, then run a
 * position-based inflate pass. There is no gravity, collision, time step or
 * global volume constraint.
 */
import { instanceLoops } from './assembly.js';
import { pieceById, signedArea } from './piece.js';
import { resolveSeamRun, type ResolvedSeamRun } from './seams.js';
import type { Assembly, EntityId, PatternDocument, Piece, SeamRun } from './types.js';
import type { Vec2 } from './vector.js';

/** Millimetres between two seam samples along a side. */
export const PREVIEW_SAMPLE_SPACING = 8;

/** Longest triangle edge after subdivision, in millimetres. */
export const PREVIEW_MAX_EDGE = 18;

/** Above this many triangles the preview stops growing. */
export const PREVIEW_TRIANGLE_LIMIT = 6000;

/** A panel's height at full inflate, as a fraction of its half-size. */
const PREVIEW_THICKNESS = 1.0;

/** The fraction of the boundary distance that forms the rounded edge. */
const PREVIEW_EDGE = 0.3;

/** Uniform subdivision levels, a hard stop before the triangle budget. */
const MAX_SUBDIVISION_LEVELS = 5;

/** Millimetres within which two points count as the same vertex. */
const EPSILON = 1e-6;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Triangle = [number, number, number];

export interface PreviewTriangle {
  a: number;
  b: number;
  c: number;
  /** Index into `panels`. */
  panel: number;
}

export interface PreviewPanel {
  instance: EntityId;
  piece: EntityId;
  color: string | null;
}

export interface PreviewMesh {
  /** Final position of every welded vertex, in assembly millimetres. */
  positions: Vec3[];
  triangles: PreviewTriangle[];
  panels: PreviewPanel[];
  /** Boundary loops that stayed open, as vertex-index cycles. */
  openBoundaries: number[][];
  /** True when the triangle budget or the subdivision cap simplified the mesh. */
  simplified: boolean;
  /** Instances whose stitch loop did not resolve. */
  skipped: EntityId[];
}

export interface DrapeOptions {
  /** 0–1; the Inflate slider. Defaults to 0.6. */
  inflate?: number;
}

/** A seam side prepared for sampling and welding. */
interface PlannedSide {
  seam: number;
  /** Position in `SeamMatch.sides`, the layer order. */
  layer: number;
  side: SeamRun;
  resolved: ResolvedSeamRun;
  /** The assembly instance index, or -1 when it no longer resolves. */
  instance: number;
}

interface SeamPlan {
  sides: PlannedSide[];
  /** One common sample count, so index k means the same fraction on every side. */
  samples: number;
}

interface PanelBuild {
  instance: number;
  piece: Piece;
  sign: number;
  /** The stitch loop in the panel's aligned layout, for the gusset caps. */
  loop: Vec2[];
  points: Vec2[];
  triangles: Triangle[];
  /** Sampled seam vertices, keyed `seam:layer:sample`. */
  samples: Map<string, number>;
  /** Local boundary edges that belong to a seam side. */
  seamEdges: Set<string>;
  /** Distance from each point to the panel's stitch boundary. */
  heights: number[];
  simplified: boolean;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A stable undirected key for two vertex indices. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** The arc length of every loop vertex; the closing segment is included. */
function cumulativeLengths(points: readonly Vec2[]): number[] {
  const lengths = [0];
  for (let index = 0; index < points.length; index += 1) {
    lengths.push(lengths[index]! + distance(points[index]!, points[(index + 1) % points.length]!));
  }
  return lengths;
}

/** The point at one arc position along an open polyline. */
function pointAt(points: readonly Vec2[], target: number): Vec2 {
  let walked = 0;
  const segments = points.slice(1).map((point, index) => ({
    previous: points[index]!,
    point,
    step: distance(points[index]!, point),
  }));
  const match = segments.find((segment) => {
    if (walked + segment.step >= target) return true;
    walked += segment.step;
    return false;
  })!;
  const t = match.step === 0 ? 0 : (target - walked) / match.step;
  return {
    x: match.previous.x + (match.point.x - match.previous.x) * t,
    y: match.previous.y + (match.point.y - match.previous.y) * t,
  };
}

/* -------------------------------------------------------------------------- */
/* Triangulation                                                              */
/* -------------------------------------------------------------------------- */

/** Twice the signed area of a triangle, positive for counter-clockwise. */
function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Remove consecutive duplicates (and a closing duplicate), keeping original indices. */
function dedupeLoop(points: readonly Vec2[]): number[] {
  const kept: number[] = [];
  for (const [index, point] of points.entries()) {
    const previous = kept.length === 0 ? null : points[kept[kept.length - 1]!]!;
    if (previous !== null && distance(previous, point) <= EPSILON) continue;
    kept.push(index);
  }
  if (kept.length > 1 && distance(points[kept[0]!]!, points[kept[kept.length - 1]!]!) <= EPSILON) {
    kept.pop();
  }
  return kept;
}

/** Whether two segments cross at an interior point. */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  );
}

/** Reject a clearly self-intersecting loop before ear clipping. */
function isSimple(points: readonly Vec2[]): boolean {
  // Real stitch loops are small; a very long hand-edited loop skips the check
  // rather than spending quadratic time on every preview.
  if (points.length > 256) return true;
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first]!;
    const b = points[(first + 1) % points.length]!;
    for (let second = first + 2; second < points.length; second += 1) {
      if (first === 0 && second === points.length - 1) continue;
      const c = points[second]!;
      const d = points[(second + 1) % points.length]!;
      if (segmentsCross(a, b, c, d)) return false;
    }
  }
  return true;
}

/** Whether a point lies inside or on the edge of a triangle. */
function insideTriangle(point: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const ab = cross(a, b, point);
  const bc = cross(b, c, point);
  const ca = cross(c, a, point);
  const negative = Math.min(ab, bc, ca) < -EPSILON;
  const positive = Math.max(ab, bc, ca) > EPSILON;
  return !(negative && positive);
}

/**
 * Ear-clip a simple polygon into counter-clockwise triangles, indexing the
 * original array. Consecutive duplicates are dropped; collinear boundary vertices
 * are kept because seam samples live on them. `null` for a degenerate or
 * self-intersecting loop.
 */
export function triangulate(points: readonly Vec2[]): Triangle[] | null {
  const kept = dedupeLoop(points);
  if (kept.length < 3) return null;
  const loop = kept.map((index) => points[index]!);
  if (!isSimple(loop)) return null;

  const ccw = signedArea(loop) > 0;
  const order = loop.map((_, index) => index);
  if (!ccw) order.reverse();

  const triangles: Triangle[] = [];
  const remaining = [...order];
  const guard = loop.length * loop.length + 1;
  let steps = 0;

  while (remaining.length > 3) {
    steps += 1;
    /* v8 ignore next -- a simple polygon always clips within n² steps */
    if (steps > guard) return null;

    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index + remaining.length - 1) % remaining.length]!;
      const current = remaining[index]!;
      const next = remaining[(index + 1) % remaining.length]!;
      if (cross(loop[previous]!, loop[current]!, loop[next]!) <= EPSILON) continue;

      const contains = remaining.some(
        (candidate) =>
          candidate !== previous &&
          candidate !== current &&
          candidate !== next &&
          insideTriangle(loop[candidate]!, loop[previous]!, loop[current]!, loop[next]!),
      );
      if (contains) continue;

      triangles.push([kept[previous]!, kept[current]!, kept[next]!]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    /* v8 ignore next -- a simple polygon always has an ear */
    if (!clipped) return null;
  }

  if (cross(loop[remaining[0]!]!, loop[remaining[1]!]!, loop[remaining[2]!]!) > EPSILON) {
    triangles.push([kept[remaining[0]!]!, kept[remaining[1]!]!, kept[remaining[2]!]!]);
  }
  return triangles.length === 0 ? null : triangles;
}

/* -------------------------------------------------------------------------- */
/* Subdivision                                                                */
/* -------------------------------------------------------------------------- */

interface Subdivision {
  points: Vec2[];
  triangles: Triangle[];
  seamEdges: Set<string>;
  simplified: boolean;
}

/**
 * Split every triangle into four at its edge midpoints, deduplicating shared
 * edges. Seam edges are carried through the split.
 */
function subdivideOnce(
  points: Vec2[],
  triangles: Triangle[],
  seamEdges: ReadonlySet<string>,
): { points: Vec2[]; triangles: Triangle[]; seamEdges: Set<string> } {
  const midpoints = new Map<string, number>();
  const next = [...points];

  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const existing = midpoints.get(key);
    if (existing !== undefined) return existing;
    const pa = points[a]!;
    const pb = points[b]!;
    const index = next.length;
    next.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    midpoints.set(key, index);
    return index;
  };

  const result: Triangle[] = [];
  const nextSeamEdges = new Set<string>();
  for (const [a, b, c] of triangles) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    result.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    for (const [from, to, middle] of [
      [a, b, ab],
      [b, c, bc],
      [c, a, ca],
    ] as const) {
      if (!seamEdges.has(edgeKey(from, to))) continue;
      nextSeamEdges.add(edgeKey(from, middle));
      nextSeamEdges.add(edgeKey(middle, to));
    }
  }
  return { points: next, triangles: result, seamEdges: nextSeamEdges };
}

/** The longest edge of a triangle. */
function longestEdge(points: readonly Vec2[], triangle: Triangle): number {
  const [a, b, c] = triangle.map((index) => points[index]!);
  return Math.max(distance(a!, b!), distance(b!, c!), distance(c!, a!));
}

/** Subdivide until every edge is short enough, the level cap or the budget stops it. */
function subdivide(
  points: Vec2[],
  triangles: Triangle[],
  seamEdges: ReadonlySet<string>,
  budget: number,
): Subdivision {
  let current = { points: [...points], triangles: [...triangles], seamEdges: new Set(seamEdges) };
  let simplified = false;

  for (let level = 0; level < MAX_SUBDIVISION_LEVELS; level += 1) {
    const needsSplit = current.triangles.some(
      (triangle) => longestEdge(current.points, triangle) > PREVIEW_MAX_EDGE,
    );
    if (!needsSplit) return { ...current, simplified };

    if (current.triangles.length * 4 > budget) {
      return { ...current, simplified: true };
    }
    current = subdivideOnce(current.points, current.triangles, current.seamEdges);
  }

  simplified = current.triangles.some(
    (triangle) => longestEdge(current.points, triangle) > PREVIEW_MAX_EDGE,
  );
  return { ...current, simplified };
}

/* -------------------------------------------------------------------------- */
/* Panel assembly                                                             */
/* -------------------------------------------------------------------------- */

/** The assembly instance index a seam side names, or -1. */
function sideInstance(assembly: Assembly, side: SeamRun): number {
  return assembly.instances.findIndex((candidate) => candidate.id === side.instance);
}

/** Resolve every seam once and pick the common sample count per seam. */
function planSeams(document: PatternDocument, assembly: Assembly): SeamPlan[] {
  const plans: SeamPlan[] = [];
  for (const [seamIndex, seam] of (assembly.seams ?? []).entries()) {
    const sides: PlannedSide[] = [];
    let maxLength = 0;
    for (const [layer, side] of seam.sides.entries()) {
      const resolved = resolveSeamRun(document, assembly, side);
      if (resolved === null || resolved.points.length < 2) continue;
      sides.push({
        seam: seamIndex,
        layer,
        side,
        resolved,
        instance: sideInstance(assembly, side),
      });
      maxLength = Math.max(maxLength, resolved.length);
    }
    plans.push({
      sides,
      samples: Math.max(2, Math.ceil(maxLength / PREVIEW_SAMPLE_SPACING)),
    });
  }
  return plans;
}

/** Locate a side's first point on the panel loop and the direction it travels. */
function locateSide(
  loop: readonly Vec2[],
  side: ResolvedSeamRun,
): { start: number; forward: boolean } | null {
  let start = -1;
  let best = Infinity;
  for (const [index, point] of loop.entries()) {
    const gap = distance(point, side.points[0]!);
    if (gap < best) {
      best = gap;
      start = index;
    }
  }
  /* v8 ignore next -- a resolved side starts on its own stitch loop */
  if (start < 0 || best > 1e-4) return null;

  const next = loop[(start + 1) % loop.length]!;
  const previous = loop[(start - 1 + loop.length) % loop.length]!;
  const second = side.points[1]!;
  return { start, forward: distance(next, second) <= distance(previous, second) };
}

/** Whether a point is inside a simple polygon (ray casting). */
function pointInPolygon(point: Vec2, loop: readonly Vec2[]): boolean {
  let inside = false;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index]!;
    const b = loop[(index + 1) % loop.length]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A symmetric centre fan for a star-shaped boundary. The centroid becomes the
 * mesh apex, so a height field over it forms a centred dome rather than a
 * pyramid whose apex is a far corner. `null` when the fan would leave the loop.
 */
function centroidFan(
  points: readonly Vec2[],
  boundary: readonly number[],
): { points: Vec2[]; triangles: Triangle[] } | null {
  /* v8 ignore next -- a built panel boundary always has at least three points */
  if (boundary.length < 3) return null;
  const loop = boundary.map((index) => points[index]!);
  const center = {
    x: loop.reduce((sum, point) => sum + point.x, 0) / loop.length,
    y: loop.reduce((sum, point) => sum + point.y, 0) / loop.length,
  };
  if (!pointInPolygon(center, loop)) return null;

  const next = [...points, center];
  const apex = points.length;
  const ccw = signedArea(loop) > 0;
  const triangles: Triangle[] = [];
  let fanArea = 0;

  for (let index = 0; index < boundary.length; index += 1) {
    const following = (index + 1) % boundary.length;
    triangles.push(
      ccw
        ? [apex, boundary[index]!, boundary[following]!]
        : [apex, boundary[following]!, boundary[index]!],
    );
    fanArea += Math.abs(cross(loop[index]!, loop[following]!, center)) / 2;
  }

  const area = Math.abs(signedArea(loop));
  /* v8 ignore next -- the point-outside check catches the practical non-star loops */
  if (Math.abs(fanArea - area) > Math.max(1e-6, area * 1e-6)) return null;
  return { points: next, triangles };
}

/** One boundary sample before it becomes a mesh vertex. */
interface LoopSample {
  key: string;
  point: Vec2;
  /** Segment index, or -1 when the sample lands exactly on an existing vertex. */
  segment: number;
  /** Position within the segment, 0–1. */
  t: number;
  vertex: number | null;
}

/** Sample every seam side of one panel and locate each sample on the loop. */
function collectSamples(
  loop: readonly Vec2[],
  planned: readonly SeamPlan[],
  instance: number,
): LoopSample[] {
  const lengths = cumulativeLengths(loop);
  const total = lengths[loop.length]!;
  const samples: LoopSample[] = [];

  for (const plan of planned) {
    for (const side of plan.sides) {
      if (side.instance !== instance) continue;
      const located = locateSide(loop, side.resolved);
      /* v8 ignore next -- a resolved side starts on its own stitch loop */
      if (located === null) continue;

      const sideLength = side.resolved.length;
      const startArc = lengths[located.start]!;
      for (let sample = 0; sample <= plan.samples; sample += 1) {
        const along = (sideLength * sample) / plan.samples;
        const point = pointAt(side.resolved.points, along);
        const raw = startArc + (located.forward ? along : -along);
        const arc = ((raw % total) + total) % total;

        const vertex = loop.findIndex((candidate) => distance(candidate, point) <= EPSILON);
        if (vertex >= 0) {
          samples.push({
            key: `${side.seam}:${side.layer}:${sample}`,
            point,
            segment: -1,
            t: 0,
            vertex,
          });
          continue;
        }

        let segment = loop.length - 1;
        for (let index = 0; index < loop.length; index += 1) {
          if (arc >= lengths[index]! && arc <= lengths[index + 1]!) {
            segment = index;
            break;
          }
        }
        const span = lengths[segment + 1]! - lengths[segment]!;
        /* v8 ignore next -- every loop segment has a positive length after dedupe */
        const t = span <= EPSILON ? 0 : (arc - lengths[segment]!) / span;
        samples.push({
          key: `${side.seam}:${side.layer}:${sample}`,
          point,
          segment,
          t,
          vertex: null,
        });
      }
    }
  }
  return samples;
}

/** The triangle that owns a boundary edge, in its own winding order. */
function owningFace(
  faces: readonly Triangle[],
  start: number,
  end: number,
): { index: number; first: number; second: number; opposite: number } {
  // Every boundary segment of a triangulated loop belongs to exactly one face,
  // so the lookup always resolves; the non-null assertion keeps the invariant out
  // of the branch budget.
  return faces
    .flatMap(([a, b, c], index) => [
      { index, first: a, second: b, opposite: c },
      { index, first: b, second: c, opposite: a },
      { index, first: c, second: a, opposite: b },
    ])
    .find(
      (face) =>
        (face.first === start && face.second === end) ||
        (face.first === end && face.second === start),
    )!;
}

/** Split the owning triangle along a boundary edge at the sample points. */
function insertSamples(
  loop: readonly Vec2[],
  triangles: readonly Triangle[],
  samples: readonly LoopSample[],
): {
  points: Vec2[];
  triangles: Triangle[];
  samples: Map<string, number>;
  seamEdges: Set<string>;
  boundary: number[];
} {
  const points = [...loop];
  const faces: Triangle[] = triangles.map((triangle) => [...triangle] as Triangle);
  const mapped = new Map<string, number>();
  const seamEdges = new Set<string>();

  for (const sample of samples) {
    if (sample.vertex !== null) mapped.set(sample.key, sample.vertex);
  }

  const bySegment = new Map<number, LoopSample[]>();
  for (const sample of samples) {
    if (sample.segment < 0) continue;
    const list = bySegment.get(sample.segment) ?? [];
    list.push(sample);
    bySegment.set(sample.segment, list);
  }
  const segmentIndices = new Map<number, number[]>();

  for (const [segment, list] of bySegment) {
    const ordered = [...list].sort((a, b) => a.t - b.t);
    const unique: { point: Vec2; keys: string[] }[] = [];
    for (const sample of ordered) {
      const existing = unique.find((entry) => distance(entry.point, sample.point) <= EPSILON);
      if (existing === undefined) unique.push({ point: sample.point, keys: [sample.key] });
      else existing.keys.push(sample.key);
    }

    const owned = owningFace(faces, segment, (segment + 1) % loop.length);

    const indices: number[] = [];
    for (const entry of unique) {
      indices.push(points.length);
      points.push(entry.point);
      for (const key of entry.keys) mapped.set(key, points.length - 1);
    }
    segmentIndices.set(segment, indices);

    // The fan must follow the owning triangle's winding, which may run against
    // the loop; the samples are ordered along the loop, so reverse when needed.
    const alongLoop = owned.first === segment;
    const orderedIndices = alongLoop ? indices : [...indices].reverse();
    const boundary = [segment, ...indices, (segment + 1) % loop.length];
    for (let index = 1; index < boundary.length; index += 1) {
      seamEdges.add(edgeKey(boundary[index - 1]!, boundary[index]!));
    }
    faces.splice(owned.index, 1);
    let previous = owned.first;
    for (const index of orderedIndices) {
      faces.push([previous, index, owned.opposite]);
      previous = index;
    }
    faces.push([previous, owned.second, owned.opposite]);
  }

  const boundary: number[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    boundary.push(index);
    const inserted = segmentIndices.get(index);
    if (inserted !== undefined) boundary.push(...inserted);
  }

  return { points, triangles: faces, samples: mapped, seamEdges, boundary };
}

/** The panel direction from the layer order: side 0 pushes one way, the rest the other. */
function panelSigns(planned: readonly SeamPlan[], panelCount: number): number[] {
  const totals = new Array<number>(panelCount).fill(0);
  for (const plan of planned) {
    for (const side of plan.sides) {
      totals[side.instance]! += side.layer === 0 ? 1 : -1;
    }
  }
  return totals.map((total) => (total < 0 ? -1 : 1));
}

/** Build one panel: triangulate its loop, insert seam samples and subdivide. */
function buildPanel(
  loop: readonly Vec2[],
  planned: readonly SeamPlan[],
  instance: number,
  piece: Piece,
  sign: number,
  budget: number,
): PanelBuild | null {
  const triangles = triangulate(loop);
  if (triangles === null) return null;

  const samples = collectSamples(loop, planned, instance);
  const inserted = insertSamples(loop, triangles, samples);
  const fan = centroidFan(inserted.points, inserted.boundary);
  const base = fan ?? { points: inserted.points, triangles: inserted.triangles };
  const subdivided = subdivide(base.points, base.triangles, inserted.seamEdges, budget);
  return {
    instance,
    piece,
    sign,
    loop: loop.map((point) => ({ x: point.x, y: point.y })),
    points: subdivided.points,
    triangles: subdivided.triangles,
    samples: inserted.samples,
    seamEdges: subdivided.seamEdges,
    heights: subdivided.points.map((point) => distanceToLoop(point, loop)),
    simplified: subdivided.simplified,
  };
}

/** The sample points of one seam side on a built panel, in layer order. */
function sideSamples(panel: PanelBuild, side: PlannedSide, plan: SeamPlan): Vec2[] {
  const points: Vec2[] = [];
  for (let sample = 0; sample <= plan.samples; sample += 1) {
    const local = panel.samples.get(`${side.seam}:${side.layer}:${sample}`);
    /* v8 ignore next -- every sampled side mapped all of its samples */
    if (local === undefined) continue;
    points.push(panel.points[local]!);
  }
  return points;
}

/** The best rigid transform from one point set to another, reflection allowed. */
function rigidTransform(
  from: readonly Vec2[],
  to: readonly Vec2[],
): ((point: Vec2) => Vec2) | null {
  const count = Math.min(from.length, to.length);
  /* v8 ignore next -- a sampled side always has at least two points */
  if (count < 2) return null;

  const centroid = (points: readonly Vec2[]): Vec2 => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });
  const target = centroid(to);

  let best: { residual: number; transform: (point: Vec2) => Vec2 } | null = null;
  for (const reflection of [1, -1]) {
    const source = centroid(from);
    let dot = 0;
    let cross = 0;
    for (let index = 0; index < count; index += 1) {
      const fx = reflection * from[index]!.x - reflection * source.x;
      const fy = from[index]!.y - source.y;
      const tx = to[index]!.x - target.x;
      const ty = to[index]!.y - target.y;
      dot += fx * tx + fy * ty;
      cross += fx * ty - fy * tx;
    }
    const theta = Math.atan2(cross, dot);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const tx = target.x - (cos * (reflection * source.x) - sin * source.y);
    const ty = target.y - (sin * (reflection * source.x) + cos * source.y);
    const transform = (point: Vec2): Vec2 => ({
      x: cos * (reflection * point.x) - sin * point.y + tx,
      y: sin * (reflection * point.x) + cos * point.y + ty,
    });
    let residual = 0;
    for (let index = 0; index < count; index += 1) {
      const moved = transform(from[index]!);
      residual += (moved.x - to[index]!.x) ** 2 + (moved.y - to[index]!.y) ** 2;
    }
    if (best === null || residual < best.residual) best = { residual, transform };
  }
  return best!.transform;
}

/**
 * Rigidly assemble the panels: start with the first panel placed and move each
 * unplaced panel onto a placed one through their shared seam samples. This closes
 * the shell before welding instead of pulling distant panels through the solver.
 */
function alignPanels(panels: PanelBuild[], planned: readonly SeamPlan[]): void {
  if (panels.length < 2) return;

  const panelOf = (instance: number): number =>
    panels.findIndex((panel) => panel.instance === instance);
  const placed = new Set<number>([0]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const plan of planned) {
      const entries = plan.sides
        .map((side) => ({ side, panel: panelOf(side.instance) }))
        .filter((entry) => entry.panel >= 0);
      for (const from of entries) {
        if (placed.has(from.panel)) continue;
        for (const to of entries) {
          if (!placed.has(to.panel) || to.panel === from.panel) continue;
          const transform = rigidTransform(
            sideSamples(panels[from.panel]!, from.side, plan),
            sideSamples(panels[to.panel]!, to.side, plan),
          );
          /* v8 ignore next -- sampled sides always produce a transform */
          if (transform === null) continue;
          const panel = panels[from.panel]!;
          panel.points = panel.points.map(transform);
          panel.loop = panel.loop.map(transform);
          placed.add(from.panel);
          changed = true;
          break;
        }
        if (placed.has(from.panel)) break;
      }
    }
  }
}

/** The shortest distance from a point to a loop's boundary segments. */
function distanceToLoop(point: Vec2, loop: readonly Vec2[]): number {
  let best = Infinity;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index]!;
    const b = loop[(index + 1) % loop.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    best = Math.min(best, Math.hypot(point.x - x, point.y - y));
  }
  return best;
}

/** A smoothstep from the boundary to the flat centre of a panel. */
function roundedProfile(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, Math.abs(distance) / radius));
  return t * t * (3 - 2 * t);
}

/* -------------------------------------------------------------------------- */
/* Welding                                                                    */
/* -------------------------------------------------------------------------- */

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root]!;
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

/** One global vertex and triangle list after welding the seam samples. */
interface GlobalMesh {
  positions: Vec3[];
  triangles: PreviewTriangle[];
  panels: PreviewPanel[];
  /** Global edges that belong to a seam side, used to pin the seam plane. */
  seamEdges: Set<string>;
  /** Signed distance from each welded vertex to its panel boundary. */
  heights: number[];
  simplified: boolean;
  skipped: EntityId[];
}

/** Merge every panel into one indexed mesh and weld the seam samples. */
function weldPanels(
  assembly: Assembly,
  panels: readonly PanelBuild[],
  planned: readonly SeamPlan[],
  skipped: EntityId[],
  simplified: boolean,
): GlobalMesh | null {
  const offsets: number[] = [];
  let count = 0;
  for (const panel of panels) {
    offsets.push(count);
    count += panel.points.length;
  }
  const sets = new DisjointSet(count);
  for (const plan of planned) {
    const mapped = plan.sides.map((side) => {
      const panel = panels.findIndex((candidate) => candidate.instance === side.instance);
      return panel < 0 ? null : { panel, seam: side.seam, layer: side.layer };
    });

    for (let sample = 0; sample <= plan.samples; sample += 1) {
      let root: number | null = null;
      for (const entry of mapped) {
        if (entry === null) continue;
        const local = panels[entry.panel]!.samples.get(`${entry.seam}:${entry.layer}:${sample}`);
        /* v8 ignore next -- a sampled side always mapped its samples */
        if (local === undefined) continue;
        const global = offsets[entry.panel]! + local;
        if (root === null) root = global;
        else sets.union(root, global);
      }
    }
  }

  // The panels were rigidly aligned, so seam subdivision vertices on different
  // panels can share the same point even when they are not sample vertices.
  const seamPositions = new Map<string, number[]>();
  for (const [panelIndex, panel] of panels.entries()) {
    for (const key of panel.seamEdges) {
      const [a, b] = key.split(':').map(Number) as [number, number];
      for (const local of [a, b]) {
        const point = panel.points[local]!;
        const positionKey = `${Math.round(point.x * 1e4)}:${Math.round(point.y * 1e4)}`;
        const bucket = seamPositions.get(positionKey);
        const global = offsets[panelIndex]! + local;
        if (bucket === undefined) seamPositions.set(positionKey, [global]);
        else bucket.push(global);
      }
    }
  }
  for (const bucket of seamPositions.values()) {
    for (const global of bucket.slice(1)) sets.union(bucket[0]!, global);
  }

  const positions: Vec3[] = [];
  const heights: number[] = [];
  const remap = new Map<number, number>();
  const globalOf = (panelIndex: number, local: number): number => {
    const index = offsets[panelIndex]! + local;
    const root = sets.find(index);
    const existing = remap.get(root);
    if (existing !== undefined) return existing;
    const next = positions.length;
    const point = panels[panelIndex]!.points[local]!;
    const panel = panels[panelIndex]!;
    positions.push({ x: point.x, y: point.y, z: 0 });
    heights.push(panel.sign * panel.heights[local]!);
    remap.set(root, next);
    return next;
  };

  const triangles: PreviewTriangle[] = [];
  for (const [panelIndex, panel] of panels.entries()) {
    for (const [a, b, c] of panel.triangles) {
      const ga = globalOf(panelIndex, a);
      const gb = globalOf(panelIndex, b);
      const gc = globalOf(panelIndex, c);
      /* v8 ignore next -- a hand-edited seam can collapse a triangle */
      if (ga === gb || gb === gc || gc === ga) continue;
      // The signed height field puts the back panel on the other side; flip its
      // winding so every triangle's normal points away from the shell interior.
      const outward = panel.sign < 0;
      triangles.push({ a: ga, b: outward ? gc : gb, c: outward ? gb : gc, panel: panelIndex });
    }
  }

  /* v8 ignore next -- a hand-edited panel can collapse every triangle */
  if (triangles.length === 0) return null;

  const globalSeamEdges = new Set<string>();
  for (const [panelIndex, panel] of panels.entries()) {
    for (const key of panel.seamEdges) {
      const [a, b] = key.split(':').map(Number) as [number, number];
      globalSeamEdges.add(edgeKey(globalOf(panelIndex, a), globalOf(panelIndex, b)));
    }
  }

  return {
    positions,
    triangles,
    panels: panels.map((panel) => ({
      instance: assembly.instances[panel.instance]!.id,
      piece: panel.piece.id,
      color: panel.piece.color ?? null,
    })),
    seamEdges: globalSeamEdges,
    heights,
    simplified,
    skipped,
  };
}

/* -------------------------------------------------------------------------- */
/* Inflate                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Raise each panel's interior on a rounded profile. Seam, finished and open
 * boundaries stay at z = 0, so two mirrored panels meet on the seam plane and
 * form a pouch; the interior of each panel is a smooth height field over its
 * flat layout. No distances, bending or time step are needed.
 */
function inflateHeightField(mesh: GlobalMesh, inflate: number): void {
  const maximum = Math.max(1, ...mesh.heights.map((height) => Math.abs(height)));
  const radius = maximum * PREVIEW_EDGE;

  for (const [index, position] of mesh.positions.entries()) {
    const height = mesh.heights[index]!;
    const profile = roundedProfile(Math.abs(height), radius);
    position.z = (height < 0 ? -1 : 1) * inflate * maximum * PREVIEW_THICKNESS * profile;
  }
}

/** Every boundary edge (used by one triangle) as an undirected vertex pair. */
function openBoundaries(mesh: GlobalMesh): number[][] {
  const counts = new Map<string, number>();
  const neighbours = new Map<number, number[]>();
  for (const triangle of mesh.triangles) {
    for (const [a, b] of [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ] as const) {
      const key = edgeKey(a, b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!neighbours.has(a)) neighbours.set(a, []);
      if (!neighbours.has(b)) neighbours.set(b, []);
    }
  }

  for (const [key, count] of counts) {
    if (count !== 1) continue;
    const [a, b] = key.split(':').map(Number) as [number, number];
    neighbours.get(a)!.push(b);
    neighbours.get(b)!.push(a);
  }

  const loops: number[][] = [];
  const visited = new Set<string>();
  for (const start of neighbours.keys()) {
    const next = neighbours.get(start)!;
    if (next.length !== 2) continue;
    if (visited.has(`${start}:${next[0]}`) || visited.has(`${start}:${next[1]}`)) continue;

    const loop = [start];
    visited.add(edgeKey(start, next[0]!));
    let current = next[0]!;
    while (current !== start && loop.length <= mesh.positions.length) {
      loop.push(current);
      const options = neighbours.get(current)!;
      if (options.length !== 2) break;
      const candidate = options[0] === loop[loop.length - 2] ? options[1]! : options[0]!;
      if (visited.has(edgeKey(current, candidate))) break;
      visited.add(edgeKey(current, candidate));
      current = candidate;
    }
    if (current === start && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build a preview mesh for one assembly, or `null` when no panel resolves. The
 * result is a deterministic flat-shaded dummy: panels are welded along seams and
 * raised on a rounded height field.
 */

/* -------------------------------------------------------------------------- */
/* Gusset box                                                                 */
/* -------------------------------------------------------------------------- */

/** The three panels a gusset strip joins, and the strip's fabric width. */
interface GussetParts {
  strip: number;
  front: number;
  back: number;
  width: number;
}

/** Pairwise seam neighbours of every panel; self-seams are ignored. */
function seamNeighbours(
  planned: readonly SeamPlan[],
  panels: readonly PanelBuild[],
): Map<number, Map<number, number>> {
  const panelOf = (instance: number): number =>
    panels.findIndex((candidate) => candidate.instance === instance);
  const counts = new Map<number, Map<number, number>>();
  const bump = (from: number, to: number): void => {
    const map = counts.get(from) ?? new Map<number, number>();
    map.set(to, (map.get(to) ?? 0) + 1);
    counts.set(from, map);
  };

  for (const plan of planned) {
    const seen = new Set<string>();
    for (const a of plan.sides) {
      for (const b of plan.sides) {
        if (a.instance === b.instance) continue;
        const from = panelOf(a.instance);
        const to = panelOf(b.instance);
        if (from < 0 || to < 0) continue;
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bump(from, to);
        bump(to, from);
      }
    }
  }
  return counts;
}

/**
 * A strip's principal extent and width. The major axis comes from the loop's
 * covariance, so a strip split into short perimeter edges still measures its
 * true length; the width is the area over that length.
 */
function stripMetrics(loop: readonly Vec2[]): { width: number; extent: number } | null {
  const area = Math.abs(signedArea(loop));
  /* v8 ignore next -- a built strip loop is simple and non-degenerate */
  if (area < EPSILON) return null;

  const count = loop.length;
  const cx = loop.reduce((sum, point) => sum + point.x, 0) / count;
  const cy = loop.reduce((sum, point) => sum + point.y, 0) / count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of loop) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  let min = Infinity;
  let max = -Infinity;
  for (const point of loop) {
    const along = (point.x - cx) * axis.x + (point.y - cy) * axis.y;
    min = Math.min(min, along);
    max = Math.max(max, along);
  }
  const extent = max - min;
  /* v8 ignore next -- a built strip loop has a positive extent */
  if (extent < EPSILON) return null;
  return { width: area / extent, extent };
}

/**
 * A strip with exactly two face neighbours, both places of the same piece, is a
 * gusset. The strip must be at least twice as long as it is wide; anything else
 * falls back to the height field.
 */
function detectGusset(
  planned: readonly SeamPlan[],
  panels: readonly PanelBuild[],
): GussetParts | null {
  const neighbours = seamNeighbours(planned, panels);
  for (const [stripIndex, map] of neighbours) {
    if (map.size !== 2) continue;
    const entries = [...map.entries()];
    if (entries.some(([, count]) => count < 2)) continue;

    const frontIndex = entries[0]![0];
    const backIndex = entries[1]![0];
    const strip = panels[stripIndex]!;
    const front = panels[frontIndex]!;
    const back = panels[backIndex]!;
    if (front.piece.id !== back.piece.id) continue;
    if (strip.piece.id === front.piece.id) continue;

    const metrics = stripMetrics(strip.loop);
    /* v8 ignore next -- a built strip always has positive metrics */
    if (metrics === null) continue;
    if (metrics.extent < 2 * metrics.width) continue;

    return { strip: stripIndex, front: frontIndex, back: backIndex, width: metrics.width };
  }
  return null;
}

/**
 * Build a closed box from a gusset: the two faces become flat caps at
 * `±inflate * width / 2`, and the strip becomes a vertical wall around the front
 * face perimeter. The strip's own wall grid is not reused; the front loop's
 * boundary is the reliable correspondence between the two caps.
 */
function buildGussetMesh(
  assembly: Assembly,
  panels: readonly PanelBuild[],
  parts: GussetParts,
  inflate: number,
  skipped: EntityId[],
): PreviewMesh | null {
  const loop = panels[parts.front]!.loop;
  const triangles2d = triangulate(loop);
  /* v8 ignore next -- detection already triangulated this loop */
  if (triangles2d === null) return null;

  const count = loop.length;
  const depth = inflate * parts.width;
  const area = signedArea(loop);
  /* v8 ignore next -- a detected gusset has a non-degenerate loop */
  if (Math.abs(area) < EPSILON) return null;
  const sign = area > 0 ? 1 : -1;

  const positions: Vec3[] = [
    ...loop.map((point) => ({ x: point.x, y: point.y, z: depth / 2 })),
    ...loop.map((point) => ({ x: point.x, y: point.y, z: -depth / 2 })),
  ];
  const triangles: PreviewTriangle[] = [];

  const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });

  const outward = (a: number, b: number, c: number, panel: number, side: Vec3): void => {
    const pa = positions[a]!;
    const pb = positions[b]!;
    const pc = positions[c]!;
    const normal = cross3(
      { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z },
      { x: pc.x - pa.x, y: pc.y - pa.y, z: pc.z - pa.z },
    );
    const dot = normal.x * side.x + normal.y * side.y + normal.z * side.z;
    triangles.push(dot < 0 ? { a, b: c, c: b, panel } : { a, b, c, panel });
  };

  // The front cap faces +z, the back cap -z; each uses the common face loop.
  for (const [a, b, c] of triangles2d) {
    outward(a, b, c, 0, { x: 0, y: 0, z: 1 });
    outward(count + a, count + b, count + c, 1, { x: 0, y: 0, z: -1 });
  }

  // A vertical quad per loop segment; the loop orientation gives the outward
  // horizontal normal, so a concave face still points away from the box.
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const dx = loop[next]!.x - loop[index]!.x;
    const dy = loop[next]!.y - loop[index]!.y;
    const side = { x: sign * dy, y: -sign * dx, z: 0 };
    outward(index, next, count + next, 2, side);
    outward(index, count + next, count + index, 2, side);
  }

  const panelOf = (index: number): PreviewPanel => {
    const panel = panels[index]!;
    return {
      instance: assembly.instances[panel.instance]!.id,
      piece: panel.piece.id,
      color: panel.piece.color ?? null,
    };
  };

  return {
    positions,
    triangles,
    panels: [panelOf(parts.front), panelOf(parts.back), panelOf(parts.strip)],
    openBoundaries: [],
    simplified: false,
    skipped,
  };
}

export function drapeAssembly(
  document: PatternDocument,
  assembly: Assembly,
  options: DrapeOptions = {},
): PreviewMesh | null {
  const inflate = Math.min(1, Math.max(0, options.inflate ?? 0.6));

  const planned = planSeams(document, assembly);
  const signs = panelSigns(planned, assembly.instances.length);
  const panelBudget = Math.max(
    64,
    Math.floor(PREVIEW_TRIANGLE_LIMIT / Math.max(1, assembly.instances.length)),
  );

  const panels: PanelBuild[] = [];
  const skipped: EntityId[] = [];
  let simplified = false;

  for (const [instance, placed] of assembly.instances.entries()) {
    const piece = pieceById(document, placed.piece);
    if (piece === undefined) {
      skipped.push(placed.id);
      continue;
    }
    const loops = instanceLoops(document, piece, placed);
    if (loops === null || loops.stitch.length < 3) {
      skipped.push(placed.id);
      continue;
    }
    const panel = buildPanel(
      loops.stitch,
      planned,
      instance,
      piece,
      signs[instance]!,
      Math.max(64, panelBudget),
    );
    if (panel === null) {
      skipped.push(placed.id);
      continue;
    }
    simplified = simplified || panel.simplified;
    panels.push(panel);
  }

  if (panels.length === 0) return null;

  alignPanels(panels, planned);
  const parts = detectGusset(planned, panels);
  if (parts !== null) {
    const boxed = buildGussetMesh(assembly, panels, parts, inflate, skipped);
    if (boxed !== null) return { ...boxed, openBoundaries: [] };
  }
  const welded = weldPanels(assembly, panels, planned, skipped, simplified);
  /* v8 ignore next -- a hand-edited panel can collapse every triangle */
  if (welded === null) return null;

  inflateHeightField(welded, inflate);
  return { ...welded, openBoundaries: openBoundaries(welded) };
}
