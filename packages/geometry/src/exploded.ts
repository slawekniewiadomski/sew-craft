/**
 * An exploded assembly view: every placed piece as a flat cut part in space,
 * each with its stitch-loop seam sides drawn and linked to the sides they sew to.
 *
 * This is the honest, deterministic view before a drape: no folding, no solver,
 * no shape guess. A seam link is a dash between the midpoints of two sides.
 */
import { instanceLoops } from './assembly.js';
import type { Vec3 } from './drape.js';
import { pieceById } from './piece.js';
import { resolveSeamRun } from './seams.js';
import type { Assembly, EntityId, PatternDocument } from './types.js';
import { magnitude, sub, type Vec2 } from './vector.js';

/** Millimetres between packed parts in the exploded parts sheet. */
export const EXPLODE_GAP = 24;

/** The number of rotating colours the seam links use. */
export const SEAM_COLOR_COUNT = 12;

export interface ExplodedPanel {
  instance: EntityId;
  piece: EntityId;
  label: string;
  color: string | null;
  /** The cut-loop boundary, in 3D, without a repeated closing point. */
  boundary: Vec3[];
  /** The part's label anchor, at the middle of the cut part. */
  center: Vec3;
}

export interface ExplodedSeamSide {
  instance: EntityId;
  /** The stored edge run of the side, for the seam list. */
  edges: EntityId[];
  /** The resolved stitch polyline of the side, in 3D. */
  points: Vec3[];
}

export interface ExplodedSeam {
  id: EntityId;
  /** Two or more resolved sides, in layer order. */
  sides: ExplodedSeamSide[];
  /** Dashes from every other side's midpoint to side 0's midpoint. */
  links: Vec3[][];
  /** Index into the renderer's seam palette. */
  colorIndex: number;
}

export interface ExplodedView {
  panels: ExplodedPanel[];
  seams: ExplodedSeam[];
  /** Instances whose loop did not resolve. */
  skipped: EntityId[];
}

/** The point halfway along an open polyline, by arc length. */
function midpoint(points: readonly Vec2[]): Vec2 {
  const segments = points.slice(1).map((point, index) => ({
    previous: points[index]!,
    point,
    step: magnitude(sub(point, points[index]!)),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.step, 0);
  let walked = 0;
  const match = segments.find((segment) => {
    if (walked + segment.step >= total / 2) return true;
    walked += segment.step;
    return false;
  })!;
  /* v8 ignore next -- a resolved seam side has no zero-length segment */
  const t = match.step === 0 ? 0 : (total / 2 - walked) / match.step;
  return {
    x: match.previous.x + (match.point.x - match.previous.x) * t,
    y: match.previous.y + (match.point.y - match.previous.y) * t,
  };
}

/** The piece label, with an occurrence suffix when the piece is placed twice. */
function panelLabel(
  document: PatternDocument,
  assembly: Assembly,
  instance: EntityId,
  piece: EntityId,
): string {
  const index = document.pieces.findIndex((candidate) => candidate.id === piece);
  /* v8 ignore next -- the instance's piece was resolved before this call */
  const pieceIndex = index < 0 ? 0 : index;
  const name = document.pieces[pieceIndex]?.name?.trim() || `Piece ${pieceIndex + 1}`;
  const siblings = assembly.instances.filter((candidate) => candidate.piece === piece);
  if (siblings.length < 2) return name;
  const occurrence = siblings.findIndex((candidate) => candidate.id === instance) + 1;
  return `${name} ${occurrence}`;
}

/**
 * Build the exploded view for one assembly, or `null` when no cut part resolves.
 * Parts are packed into a deterministic rows-of-parts sheet instead of keeping
 * their assembly positions, so many pieces stay legible; the seam sides and the
 * midpoint links make the pairings explicit.
 */
export function explodedAssembly(
  document: PatternDocument,
  assembly: Assembly,
): ExplodedView | null {
  interface RawPanel {
    instance: EntityId;
    piece: EntityId;
    label: string;
    color: string | null;
    boundary: Vec2[];
    minX: number;
    minY: number;
    width: number;
    height: number;
  }

  const raw: RawPanel[] = [];
  const skipped: EntityId[] = [];

  for (const placed of assembly.instances) {
    const piece = pieceById(document, placed.piece);
    if (piece === undefined) {
      skipped.push(placed.id);
      continue;
    }
    const loops = instanceLoops(document, piece, placed);
    const boundary = loops === null ? [] : loops.cut;
    if (boundary.length < 3) {
      skipped.push(placed.id);
      continue;
    }
    const xs = boundary.map((point) => point.x);
    const ys = boundary.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    raw.push({
      instance: placed.id,
      piece: piece.id,
      label: panelLabel(document, assembly, placed.id, piece.id),
      color: piece.color ?? null,
      boundary,
      minX,
      minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    });
  }

  if (raw.length === 0) return null;

  // Pack rows until the target width is reached; each part keeps its own
  // orientation, and its seam sides move by the same translation.
  const area = raw.reduce((sum, panel) => sum + panel.width * panel.height, 0);
  const target = Math.max(240, Math.sqrt(area) * 1.8);
  const translations = new Map<EntityId, Vec2>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const panel of raw) {
    if (x > 0 && x + panel.width > target) {
      x = 0;
      y += rowHeight + EXPLODE_GAP;
      rowHeight = 0;
    }
    translations.set(panel.instance, { x: x - panel.minX, y: y - panel.minY });
    x += panel.width + EXPLODE_GAP;
    rowHeight = Math.max(rowHeight, panel.height);
  }

  const panels: ExplodedPanel[] = raw.map((panel) => {
    const offset = translations.get(panel.instance)!;
    const points = panel.boundary.map((point) => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
      z: 0,
    }));
    return {
      instance: panel.instance,
      piece: panel.piece,
      label: panel.label,
      color: panel.color,
      boundary: points,
      center: {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        z: 0,
      },
    };
  });

  const seams: ExplodedSeam[] = [];
  for (const [order, seam] of (assembly.seams ?? []).entries()) {
    const sides: ExplodedSeamSide[] = [];
    for (const side of seam.sides) {
      const offset = translations.get(side.instance);
      /* v8 ignore next -- an unknown instance is a missing reference, not a link */
      if (offset === undefined) continue;
      const resolved = resolveSeamRun(document, assembly, side);
      if (resolved === null) continue;
      sides.push({
        instance: side.instance,
        edges: [...side.edges],
        points: resolved.points.map((point) => ({
          x: point.x + offset.x,
          y: point.y + offset.y,
          z: 0,
        })),
      });
    }
    if (sides.length < 2) continue;

    const origin = midpoint(sides[0]!.points.map((point) => ({ x: point.x, y: point.y })));
    const links = sides.slice(1).map((side) => {
      const targetPoint = midpoint(side.points.map((point) => ({ x: point.x, y: point.y })));
      return [
        { x: origin.x, y: origin.y, z: 0 },
        { x: targetPoint.x, y: targetPoint.y, z: 0 },
      ];
    });
    seams.push({ id: seam.id, sides, links, colorIndex: order % SEAM_COLOR_COUNT });
  }

  return { panels, seams, skipped };
}
