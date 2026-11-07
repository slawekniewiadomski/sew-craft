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

/** Fixed solver iterations; the preview is deterministic. */
export const PREVIEW_ITERATIONS = 60;

/** Inflation per iteration at the slider's maximum, in millimetres. */
const PREVIEW_STEP = 0.35;

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
  /** Defaults to PREVIEW_ITERATIONS; tests use fewer. */
  iterations?: number;
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
  points: Vec2[];
  triangles: Triangle[];
  /** Sampled seam vertices, keyed `seam:layer:sample`. */
  samples: Map<string, number>;
  simplified: boolean;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  simplified: boolean;
}

/** Split every triangle into four at its edge midpoints, deduplicating shared edges. */
function subdivideOnce(
  points: Vec2[],
  triangles: Triangle[],
): { points: Vec2[]; triangles: Triangle[] } {
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
  for (const [a, b, c] of triangles) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    result.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return { points: next, triangles: result };
}

/** The longest edge of a triangle. */
function longestEdge(points: readonly Vec2[], triangle: Triangle): number {
  const [a, b, c] = triangle.map((index) => points[index]!);
  return Math.max(distance(a!, b!), distance(b!, c!), distance(c!, a!));
}

/** Subdivide until every edge is short enough, the level cap or the budget stops it. */
function subdivide(points: Vec2[], triangles: Triangle[], budget: number): Subdivision {
  let current = { points: [...points], triangles: [...triangles] };
  let simplified = false;

  for (let level = 0; level < MAX_SUBDIVISION_LEVELS; level += 1) {
    const needsSplit = current.triangles.some(
      (triangle) => longestEdge(current.points, triangle) > PREVIEW_MAX_EDGE,
    );
    if (!needsSplit) return { ...current, simplified };

    if (current.triangles.length * 4 > budget) {
      return { ...current, simplified: true };
    }
    current = subdivideOnce(current.points, current.triangles);
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
): { points: Vec2[]; triangles: Triangle[]; samples: Map<string, number> } {
  const points = [...loop];
  const faces: Triangle[] = triangles.map((triangle) => [...triangle] as Triangle);
  const mapped = new Map<string, number>();

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

    // The fan must follow the owning triangle's winding, which may run against
    // the loop; the samples are ordered along the loop, so reverse when needed.
    const alongLoop = owned.first === segment;
    const orderedIndices = alongLoop ? indices : [...indices].reverse();
    faces.splice(owned.index, 1);
    let previous = owned.first;
    for (const index of orderedIndices) {
      faces.push([previous, index, owned.opposite]);
      previous = index;
    }
    faces.push([previous, owned.second, owned.opposite]);
  }

  return { points, triangles: faces, samples: mapped };
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
  const subdivided = subdivide(inserted.points, inserted.triangles, budget);
  return {
    instance,
    piece,
    sign,
    points: subdivided.points,
    triangles: subdivided.triangles,
    samples: inserted.samples,
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
          placed.add(from.panel);
          changed = true;
          break;
        }
        if (placed.has(from.panel)) break;
      }
    }
  }
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

  const positions: Vec3[] = [];
  const remap = new Map<number, number>();
  const globalOf = (panelIndex: number, local: number): number => {
    const index = offsets[panelIndex]! + local;
    const root = sets.find(index);
    const existing = remap.get(root);
    if (existing !== undefined) return existing;
    const next = positions.length;
    const point = panels[panelIndex]!.points[local]!;
    positions.push({ x: point.x, y: point.y, z: 0 });
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
      triangles.push({ a: ga, b: gb, c: gc, panel: panelIndex });
    }
  }

  /* v8 ignore next -- a hand-edited panel can collapse every triangle */
  if (triangles.length === 0) return null;

  return {
    positions,
    triangles,
    panels: panels.map((panel) => ({
      instance: assembly.instances[panel.instance]!.id,
      piece: panel.piece.id,
      color: panel.piece.color ?? null,
    })),
    simplified,
    skipped,
  };
}

/* -------------------------------------------------------------------------- */
/* Inflate solver                                                             */
/* -------------------------------------------------------------------------- */

interface EdgeConstraint {
  a: number;
  b: number;
  rest: number;
}

interface BendConstraint {
  a: number;
  b: number;
  rest: number;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** The mesh's triangle edges with their rest lengths. */
function edgeConstraints(mesh: GlobalMesh): EdgeConstraint[] {
  const edges = new Map<string, EdgeConstraint>();
  for (const triangle of mesh.triangles) {
    for (const [a, b] of [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ] as const) {
      const key = edgeKey(a, b);
      if (edges.has(key)) continue;
      edges.set(key, {
        a,
        b,
        rest: distance3(mesh.positions[a]!, mesh.positions[b]!),
      });
    }
  }
  return [...edges.values()];
}

/** Opposite-vertex bend constraints for every interior edge. */
function bendConstraints(mesh: GlobalMesh): BendConstraint[] {
  const opposite = new Map<string, number[]>();
  for (const triangle of mesh.triangles) {
    for (const [a, b, c] of [
      [triangle.a, triangle.b, triangle.c],
      [triangle.b, triangle.c, triangle.a],
      [triangle.c, triangle.a, triangle.b],
    ] as const) {
      const key = edgeKey(a, b);
      const list = opposite.get(key);
      if (list === undefined) opposite.set(key, [c]);
      else list.push(c);
    }
  }

  const bends: BendConstraint[] = [];
  for (const list of opposite.values()) {
    if (list.length < 2) continue;
    bends.push({
      a: list[0]!,
      b: list[1]!,
      rest: distance3(mesh.positions[list[0]!]!, mesh.positions[list[1]!]!),
    });
  }
  return bends;
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalise(vector: Vec3): Vec3 | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length <= EPSILON
    ? null
    : { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/** Area-weighted normals per vertex, multiplied by the incident panel direction. */
function vertexDirections(mesh: GlobalMesh, signs: readonly number[]): Vec3[] {
  const directions = mesh.positions.map(() => ({ x: 0, y: 0, z: 0 }));
  for (const triangle of mesh.triangles) {
    const a = mesh.positions[triangle.a]!;
    const b = mesh.positions[triangle.b]!;
    const c = mesh.positions[triangle.c]!;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    const sign = signs[triangle.panel]!;
    for (const index of [triangle.a, triangle.b, triangle.c]) {
      const target = directions[index]!;
      target.x += normal.x * sign;
      target.y += normal.y * sign;
      target.z += normal.z * sign;
    }
  }
  return directions.map((direction) => normalise(direction) ?? { x: 0, y: 0, z: 0 });
}

/** Move the two ends of a distance constraint toward each other. */
function projectDistance(
  positions: Vec3[],
  constraint: { a: number; b: number; rest: number },
  factor: number,
  anchored: number,
): void {
  const a = positions[constraint.a]!;
  const b = positions[constraint.b]!;
  const current = distance3(a, b);
  /* v8 ignore next -- a rest length is positive and a solved edge cannot collapse */
  if (current <= EPSILON) return;
  const correction = ((current - constraint.rest) / current) * factor;
  const aWeight = constraint.a === anchored ? 0 : 1;
  const bWeight = constraint.b === anchored ? 0 : 1;
  const total = aWeight + bWeight;
  /* v8 ignore next -- both ends cannot be the one anchor */
  if (total === 0) return;
  const aShare = (aWeight / total) * correction;
  const bShare = (bWeight / total) * correction;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  a.x += dx * aShare;
  a.y += dy * aShare;
  a.z += dz * aShare;
  b.x -= dx * bShare;
  b.y -= dy * bShare;
  b.z -= dz * bShare;
}

/** Run the inflate, distance, bending and anchor passes. */
function solve(
  mesh: GlobalMesh,
  signs: readonly number[],
  inflate: number,
  iterations: number,
): void {
  const edges = edgeConstraints(mesh);
  const bends = bendConstraints(mesh);
  const anchored = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const directions = vertexDirections(mesh, signs);
    for (const [index, position] of mesh.positions.entries()) {
      if (index === anchored) continue;
      const direction = directions[index]!;
      const step = inflate * PREVIEW_STEP;
      position.x += direction.x * step;
      position.y += direction.y * step;
      position.z += direction.z * step;
    }

    for (let pass = 0; pass < 3; pass += 1) {
      for (const edge of edges) projectDistance(mesh.positions, edge, 1, anchored);
    }
    for (const bend of bends) projectDistance(mesh.positions, bend, 0.25, anchored);
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
 * inflated by the solver.
 */
export function drapeAssembly(
  document: PatternDocument,
  assembly: Assembly,
  options: DrapeOptions = {},
): PreviewMesh | null {
  const inflate = Math.min(1, Math.max(0, options.inflate ?? 0.6));
  const iterations = Math.max(0, Math.floor(options.iterations ?? PREVIEW_ITERATIONS));

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
  const welded = weldPanels(assembly, panels, planned, skipped, simplified);
  /* v8 ignore next -- a hand-edited panel can collapse every triangle */
  if (welded === null) return null;

  solve(welded, signs, inflate, iterations);
  return { ...welded, openBoundaries: openBoundaries(welded) };
}
