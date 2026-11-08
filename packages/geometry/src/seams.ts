/** Seam resolution, validation and the advisory sewability report. */
import { instancePlacement, placePoint } from './assembly.js';
import { roundBridge } from './corner-round.js';
import { allowanceDistance, allowanceForEdge, pieceById, pieceEdgeSegments } from './piece.js';
import type {
  Assembly,
  AssemblyInstance,
  EntityId,
  PatternDocument,
  Piece,
  SeamMatch,
  SeamRun,
} from './types.js';
import { magnitude, sub, type Vec2 } from './vector.js';

/** Millimetres within which two seam sides count as the same length. */
export const SEAM_LENGTH_TOLERANCE = 5;

/** Two cut allowances closer than this count as equal. */
export const ALLOWANCE_MATCH_TOLERANCE = 1e-6;

/** Millimetres within which consecutive polyline ends count as joined. */
const VERTEX_TOLERANCE = 1e-6;

const first = (points: readonly Vec2[]): Vec2 => points[0]!;
const last = (points: readonly Vec2[]): Vec2 => points[points.length - 1]!;

function connects(a: Vec2, b: Vec2): boolean {
  return magnitude(sub(a, b)) <= VERTEX_TOLERANCE;
}

/** The length of an open polyline, bridges included. */
function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += magnitude(sub(points[index]!, points[index - 1]!));
  }
  return total;
}

/** The per-edge geometry one side resolves against. */
interface SideContext {
  instance: AssemblyInstance;
  piece: Piece;
  /** One authored-direction stitch polyline per `piece.edges` entry. */
  segments: Vec2[][];
  /** The index in `piece.edges` of every edge the run names. */
  indices: number[];
}

/** Resolve an instance, its piece and its per-edge polylines, or `null`. */
function sideContext(
  document: PatternDocument,
  assembly: Assembly,
  side: SeamRun,
): SideContext | null {
  const instance = assembly.instances.find((candidate) => candidate.id === side.instance);
  if (instance === undefined) return null;

  const piece = pieceById(document, instance.piece);
  if (piece === undefined) return null;

  if (side.edges.length === 0) return null;
  const segments = pieceEdgeSegments(document, piece);
  if (segments === null) return null;

  const indices = side.edges.map((edge) => piece.edges.indexOf(edge));
  if (indices.some((index) => index < 0)) return null;

  return { instance, piece, segments, indices };
}

/**
 * Walk a side's run into one continuous polyline in piece-local space. The run
 * begins at the first edge's outer end (the end not shared with the next edge)
 * unless `reversed`, and a committed corner round between consecutive edges
 * contributes its bridge. `null` when the run cannot be walked.
 */
function sidePolyline(
  document: PatternDocument,
  side: SeamRun,
  context: SideContext,
): Vec2[] | null {
  const polylines = context.indices.map((index) => context.segments[index]!);
  const chain = [...polylines[0]!];

  if (polylines.length > 1) {
    const next = polylines[1]!;
    // The chain must leave the first edge by the end nearest the second edge,
    // which is a direct shared vertex or the start of their corner-round bridge.
    const bridge = roundBridge(document, side.edges[0]!, side.edges[1]!);
    const targets = bridge === null ? [first(next), last(next)] : [first(bridge)];
    const nearest = (point: Vec2): number =>
      Math.min(...targets.map((target) => magnitude(sub(point, target))));
    if (nearest(first(chain)) < nearest(last(chain))) chain.reverse();
  }

  for (let index = 1; index < polylines.length; index += 1) {
    const next = polylines[index]!;
    let oriented: Vec2[] | null = null;

    if (connects(last(chain), first(next))) {
      oriented = next;
    } else if (connects(last(chain), last(next))) {
      oriented = [...next].reverse();
    }

    if (oriented === null) {
      const bridge = roundBridge(document, side.edges[index - 1]!, side.edges[index]!);
      if (bridge === null || bridge.length < 2) return null;
      // The bridge replaces the previous edge's last point: the round trimmed it.
      chain.pop();
      chain.push(...bridge);
      if (connects(last(chain), first(next))) {
        oriented = next;
      } else if (connects(last(chain), last(next))) {
        oriented = [...next].reverse();
      }
    }

    /* v8 ignore next -- roundBridge ends exactly on the next edge's tangent, so this re-check cannot fail */
    if (oriented === null) return null;
    chain.push(...oriented.slice(1));
  }

  return side.reversed === true ? [...chain].reverse() : chain;
}

/** One side resolved into assembly space. */
export interface ResolvedSeamRun {
  instance: EntityId;
  /**
   * Assembly-space stitch polyline, in run order and bridges included. It begins
   * at the seam's start unless `reversed`, in which case it begins at the run's
   * other end; every side of a seam is welded start to start.
   */
  points: Vec2[];
  /** `reversed` as stored; the correspondence reads it, the check ignores it. */
  reversed: boolean;
  length: number;
}

/**
 * Resolve one seam side into assembly space. This is the seam's geometric
 * contract for both consumers: the check measures `length`, and a future preview
 * samples `points` to weld the sides. `null` for any unresolvable reference;
 * never throws.
 */
export function resolveSeamRun(
  document: PatternDocument,
  assembly: Assembly,
  side: SeamRun,
): ResolvedSeamRun | null {
  const context = sideContext(document, assembly, side);
  if (context === null) return null;

  const polyline = sidePolyline(document, side, context);
  if (polyline === null) return null;

  const placement = instancePlacement(document, context.piece, context.instance);
  /* v8 ignore next -- sideContext proved the loop resolves, so the piece has an anchor */
  if (placement === null) return null;

  const points = polyline.map((point) => placePoint(point, placement));
  return {
    instance: side.instance,
    points,
    reversed: side.reversed === true,
    length: polylineLength(points),
  };
}

/** A validation failure with a message the command layer can surface. */
export type SeamValidation = { ok: true } | { ok: false; message: string };

/**
 * Validate one side against its assembly: the instance belongs, the piece
 * resolves, and every edge is in that piece's loop. Run adjacency and cross-side
 * claims are checked by `validateSeam`.
 */
export function validateSeamRun(
  document: PatternDocument,
  assembly: Assembly,
  side: SeamRun,
): SeamValidation {
  if (side.edges.length === 0) {
    return { ok: false, message: 'a seam side needs at least one edge' };
  }

  const instance = assembly.instances.find((candidate) => candidate.id === side.instance);
  if (instance === undefined) {
    return { ok: false, message: `unknown instance: ${side.instance}` };
  }

  const piece = pieceById(document, instance.piece);
  if (piece === undefined) {
    return { ok: false, message: `instance ${side.instance} places an unknown piece` };
  }

  if (pieceEdgeSegments(document, piece) === null) {
    return { ok: false, message: `the loop of piece ${piece.id} does not resolve` };
  }

  for (const edge of side.edges) {
    if (!piece.edges.includes(edge)) {
      return { ok: false, message: `edge ${edge} is not in the loop of piece ${piece.id}` };
    }
  }

  return { ok: true };
}

/**
 * Validate a whole seam: two or more sides, every side valid, every run
 * consecutive in `Piece.edges` order with at most one wrap, no edge repeated,
 * and no edge already sewn by another seam or marked finished. `ignoreSeam`
 * excludes the seam being updated from the claim check.
 */
export function validateSeam(
  document: PatternDocument,
  assembly: Assembly,
  sides: readonly SeamRun[],
  options: { ignoreSeam?: EntityId } = {},
): SeamValidation {
  if (sides.length < 2) {
    return { ok: false, message: 'a seam needs at least two sides' };
  }

  const claimed = new Map<string, string>();
  for (const seam of assembly.seams ?? []) {
    if (seam.id === options.ignoreSeam) continue;
    for (const side of seam.sides) {
      for (const edge of side.edges) claimed.set(`${side.instance}:${edge}`, `seam ${seam.id}`);
    }
  }
  for (const finished of assembly.finishedEdges ?? []) {
    claimed.set(`${finished.instance}:${finished.edge}`, 'a finished edge');
  }

  const chosen = new Set<string>();
  for (const side of sides) {
    const validation = validateSeamRun(document, assembly, side);
    if (!validation.ok) return validation;

    const piece = pieceById(
      document,
      assembly.instances.find((candidate) => candidate.id === side.instance)!.piece,
    )!;
    const indices = side.edges.map((edge) => piece.edges.indexOf(edge));

    for (let index = 0; index < indices.length; index += 1) {
      const edge = side.edges[index]!;
      const key = `${side.instance}:${edge}`;

      if (chosen.has(key)) {
        return { ok: false, message: `edge ${edge} is selected more than once` };
      }
      chosen.add(key);

      const owner = claimed.get(key);
      if (owner !== undefined) {
        return { ok: false, message: `edge ${edge} is already sewn or finished (${owner})` };
      }

      if (index > 0) {
        const previous = indices[index - 1]!;
        const current = indices[index]!;
        if ((current - previous + piece.edges.length) % piece.edges.length !== 1) {
          return { ok: false, message: `edge ${edge} is not consecutive in piece ${piece.id}` };
        }
      }
    }
  }

  return { ok: true };
}

export type SeamIssueKind =
  | 'unmatched_edge' // error: no seam and no finish mark
  | 'length_mismatch' // error unless eased, then warning
  | 'allowance_mismatch' // warning: sides carry different cut distances
  | 'folded_edge_sewn' // warning: an edge with a double-fold allowance is sewn
  | 'missing_reference' // error: instance, piece, edge or loop no longer resolves
  | 'edge_used_twice'; // error: two seams or a seam and a finish mark claim one edge

export interface SeamIssue {
  kind: SeamIssueKind;
  severity: 'error' | 'warning';
  /** The seam the issue belongs to, when it is about a seam. */
  seam?: EntityId;
  /** The instance and edge to highlight. */
  instance?: EntityId;
  edge?: EntityId;
  /** The other side, for a pair comparison. */
  instanceB?: EntityId;
  edgeB?: EntityId;
  /** Millimetres: side lengths, or cut allowances, per the kind. */
  valueA?: number;
  valueB?: number;
  /** `valueA` minus `valueB`, present on the two comparison kinds. */
  delta?: number;
}

export interface SewabilityReport {
  /** Every edge of every resolved placed loop. */
  edgeCount: number;
  seamCount: number;
  finishedCount: number;
  /** Errors first, then warnings; stable document order inside each. */
  issues: SeamIssue[];
  errors: number;
  warnings: number;
}

/** One resolved side, kept with the edge data the comparisons need. */
interface ResolvedSide extends ResolvedSeamRun {
  piece: Piece;
  /** The stored run edges, in authored order. */
  edges: EntityId[];
}

const issueKey = (instance: EntityId, edge: EntityId): string => `${instance}:${edge}`;

/**
 * The advisory sewability report for one assembly. Pure and total: an unknown
 * instance, a broken loop, a one-sided seam or a hand-edited duplicate all become
 * issues rather than exceptions.
 */
export function sewabilityReport(document: PatternDocument, assembly: Assembly): SewabilityReport {
  const errors: SeamIssue[] = [];
  const warnings: SeamIssue[] = [];
  const seams = assembly.seams ?? [];
  const finished = assembly.finishedEdges ?? [];

  const pieces = new Map<EntityId, Piece>();
  for (const instance of assembly.instances) {
    const piece = pieceById(document, instance.piece);
    if (piece === undefined || pieceEdgeSegments(document, piece) === null) {
      errors.push({ kind: 'missing_reference', severity: 'error', instance: instance.id });
      continue;
    }
    pieces.set(instance.id, piece);
  }

  let edgeCount = 0;
  for (const piece of pieces.values()) edgeCount += piece.edges.length;

  const claimed = new Map<string, true>();
  const resolvedSeams: { seam: SeamMatch; sides: ResolvedSide[] }[] = [];

  for (const seam of seams) {
    if (seam.sides.length < 2) {
      errors.push({ kind: 'missing_reference', severity: 'error', seam: seam.id });
      continue;
    }

    const sides: ResolvedSide[] = [];
    let failed = false;
    for (const side of seam.sides) {
      const piece = pieces.get(side.instance);
      const resolved = resolveSeamRun(document, assembly, side);
      if (piece === undefined || resolved === null) {
        errors.push({
          kind: 'missing_reference',
          severity: 'error',
          seam: seam.id,
          instance: side.instance,
          ...(side.edges[0] === undefined ? {} : { edge: side.edges[0] }),
        });
        failed = true;
        break;
      }

      for (const edge of side.edges) {
        const key = issueKey(side.instance, edge);
        if (claimed.has(key)) {
          errors.push({
            kind: 'edge_used_twice',
            severity: 'error',
            seam: seam.id,
            instance: side.instance,
            edge,
          });
        } else {
          claimed.set(key, true);
        }
      }
      sides.push({ ...resolved, piece, edges: [...side.edges] });
    }

    if (!failed) resolvedSeams.push({ seam, sides });
  }

  for (const finishedEdge of finished) {
    const piece = pieces.get(finishedEdge.instance);
    if (piece === undefined || !piece.edges.includes(finishedEdge.edge)) {
      errors.push({
        kind: 'missing_reference',
        severity: 'error',
        instance: finishedEdge.instance,
        edge: finishedEdge.edge,
      });
      continue;
    }

    const key = issueKey(finishedEdge.instance, finishedEdge.edge);
    if (claimed.has(key)) {
      errors.push({
        kind: 'edge_used_twice',
        severity: 'error',
        instance: finishedEdge.instance,
        edge: finishedEdge.edge,
      });
    } else {
      claimed.set(key, true);
    }
  }

  for (const instance of assembly.instances) {
    const piece = pieces.get(instance.id);
    if (piece === undefined) continue;
    for (const edge of piece.edges) {
      if (!claimed.has(issueKey(instance.id, edge))) {
        errors.push({ kind: 'unmatched_edge', severity: 'error', instance: instance.id, edge });
      }
    }
  }

  for (const { seam, sides } of resolvedSeams) {
    const longest = sides.reduce((best, side) => (side.length > best.length ? side : best));
    const shortest = sides.reduce((best, side) => (side.length < best.length ? side : best));
    const delta = longest.length - shortest.length;
    if (delta > SEAM_LENGTH_TOLERANCE) {
      (seam.eased === true ? warnings : errors).push({
        kind: 'length_mismatch',
        severity: seam.eased === true ? 'warning' : 'error',
        seam: seam.id,
        instance: longest.instance,
        edge: longest.edges[0]!,
        instanceB: shortest.instance,
        edgeB: shortest.edges[0]!,
        valueA: longest.length,
        valueB: shortest.length,
        delta,
      });
    }

    const allowances = sides.flatMap((side) =>
      side.edges.map((edge) => ({
        instance: side.instance,
        edge,
        distance: allowanceDistanceOf(document, side.piece, edge),
      })),
    );

    const largest = allowances.reduce((best, entry) =>
      entry.distance > best.distance ? entry : best,
    );
    const smallest = allowances.reduce((best, entry) =>
      entry.distance < best.distance ? entry : best,
    );
    if (largest.distance - smallest.distance > ALLOWANCE_MATCH_TOLERANCE) {
      warnings.push({
        kind: 'allowance_mismatch',
        severity: 'warning',
        seam: seam.id,
        instance: largest.instance,
        edge: largest.edge,
        instanceB: smallest.instance,
        edgeB: smallest.edge,
        valueA: largest.distance,
        valueB: smallest.distance,
        delta: largest.distance - smallest.distance,
      });
    }

    for (const side of sides) {
      for (const edge of side.edges) {
        if (allowanceForEdge(side.piece, edge)?.kind === 'double') {
          warnings.push({
            kind: 'folded_edge_sewn',
            severity: 'warning',
            seam: seam.id,
            instance: side.instance,
            edge,
          });
        }
      }
    }
  }

  return {
    edgeCount,
    seamCount: seams.length,
    finishedCount: finished.length,
    issues: [...errors, ...warnings],
    errors: errors.length,
    warnings: warnings.length,
  };
}

/** The cut distance of one loop edge; no allowance counts as zero. */
function allowanceDistanceOf(document: PatternDocument, piece: Piece, edge: EntityId): number {
  const allowance = allowanceForEdge(piece, edge);
  return allowance === undefined ? 0 : allowanceDistance(allowance, document);
}
