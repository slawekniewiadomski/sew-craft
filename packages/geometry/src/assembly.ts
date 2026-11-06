import type { Bounds } from './document.js';
import type { NotchGeometry } from './mark.js';
import { notchGeometry, pieceMarks } from './mark.js';
import { pieceBounds, pieceCutLoop, pieceFoldLines, pieceLoop, loopBounds } from './piece.js';
import type { Assembly, AssemblyInstance, EntityId, PatternDocument, Piece } from './types.js';
import type { Vec2 } from './vector.js';

/**
 * The anchor, transform and derived loops of one placed instance. Pure geometry:
 * no Vue, DOM or network, and nothing is ever written back to the piece.
 */
export interface InstancePlacement {
  /** The piece-local point the instance is positioned and rotated around. */
  anchor: Vec2;
  /** Assembly-space position of the anchor, in millimetres. */
  x: number;
  y: number;
  /** Radians, SVG convention (positive turns clockwise on screen). */
  rotation: number;
  /** Whether the piece is flipped about the anchor's vertical axis first. */
  mirrored: boolean;
}

/** The derived loops of one placed instance, in assembly coordinates. */
export interface InstanceLoops {
  /** The cut loop, filled with the piece colour. */
  cut: Vec2[];
  /** The stitch loop; with `cut` it bounds the allowance band. */
  stitch: Vec2[];
  /** Every double-fold fold line. */
  folds: Vec2[][];
  /** Every resolved V notch, with its feet and tip placed like the loops. */
  notches: NotchGeometry[];
}

/** The centre of a piece's stitch bounds, falling back to its owned points. */
export function pieceAnchor(document: PatternDocument, piece: Piece): Vec2 | null {
  const bounds = pieceBounds(document, piece);
  if (bounds === null) return null;
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
}

/** The placement of one instance, or `null` when its piece has no anchor. */
export function instancePlacement(
  document: PatternDocument,
  piece: Piece,
  instance: AssemblyInstance,
): InstancePlacement | null {
  const anchor = pieceAnchor(document, piece);
  if (anchor === null) return null;
  return {
    anchor,
    x: instance.x,
    y: instance.y,
    rotation: instance.rotation ?? 0,
    mirrored: instance.mirrored ?? false,
  };
}

/**
 * Map one piece-local point into assembly space. The stored transform is
 * translate + rotate with an optional horizontal mirror applied **before** the
 * rotation, about the anchor's vertical axis:
 *
 * `p' = (x, y) + rotate(rotation) · (mirrored ? (-(p.x - a.x), p.y - a.y) : p - a)`
 */
export function placePoint(point: Vec2, placement: InstancePlacement): Vec2 {
  const dx = placement.mirrored ? -(point.x - placement.anchor.x) : point.x - placement.anchor.x;
  const dy = point.y - placement.anchor.y;
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);
  return {
    x: placement.x + dx * cos - dy * sin,
    y: placement.y + dx * sin + dy * cos,
  };
}

/** One piece-local V mapped into assembly space, every vertex through the placement. */
function placeNotch(notch: NotchGeometry, placement: InstancePlacement): NotchGeometry {
  return {
    mouth: placePoint(notch.mouth, placement),
    tip: placePoint(notch.tip, placement),
    feet: [placePoint(notch.feet[0], placement), placePoint(notch.feet[1], placement)],
  };
}

/** Every derived loop of a placed instance, in assembly coordinates. */
export function instanceLoops(
  document: PatternDocument,
  piece: Piece,
  instance: AssemblyInstance,
): InstanceLoops | null {
  const placement = instancePlacement(document, piece, instance);
  if (placement === null) return null;

  const cut = pieceCutLoop(document, piece);
  const stitch = pieceLoop(document, piece);
  const folds = pieceFoldLines(document, piece);
  const notches = pieceMarks(document, piece.id).flatMap((mark) => {
    if (mark.type !== 'notch') return [];
    const geometry = notchGeometry(document, piece, mark);
    return geometry === null ? [] : [placeNotch(geometry, placement)];
  });

  return {
    cut: cut === null ? [] : cut.points.map((point) => placePoint(point, placement)),
    stitch: stitch === null ? [] : stitch.points.map((point) => placePoint(point, placement)),
    folds: folds.map((fold) => fold.map((point) => placePoint(point, placement))),
    notches,
  };
}

/** The union of two boxes, or `null` while neither exists. */
function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y) },
  };
}

/** The assembly-space bounds of every instance whose piece resolves. */
export function assemblyBounds(document: PatternDocument, assembly: Assembly): Bounds | null {
  let box: Bounds | null = null;
  for (const instance of assembly.instances) {
    const piece = document.pieces.find((candidate) => candidate.id === instance.piece);
    if (piece === undefined) continue;
    const loops = instanceLoops(document, piece, instance);
    if (loops === null) continue;
    box = unionBounds(box, loopBounds(loops.cut));
  }
  return box;
}

/** The assembly an id names, or `undefined`. */
export function assemblyById(document: PatternDocument, id: EntityId): Assembly | undefined {
  return document.assemblies.find((assembly) => assembly.id === id);
}

/** Every instance of a piece across every assembly, in document order. */
export function instancesOfPiece(
  document: PatternDocument,
  piece: EntityId,
): { assembly: Assembly; instance: AssemblyInstance }[] {
  return document.assemblies.flatMap((assembly) =>
    assembly.instances
      .filter((instance) => instance.piece === piece)
      .map((instance) => ({ assembly, instance })),
  );
}
