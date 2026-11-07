/** Project the draped mesh into flat SVG polygons. Pure; no DOM. */
import type { PreviewMesh, PreviewTriangle, Vec3 } from '@sewcraft/geometry';

export interface PreviewView {
  /** Radians around the model's vertical axis. */
  yaw: number;
  /** Radians around the screen's horizontal axis, clamped by the dialog. */
  pitch: number;
}

export interface PreviewPolygon {
  /** SVG `points` for one projected triangle. */
  points: string;
  /** `rgb(...)` fill after flat shading. */
  fill: string;
  /** Painter's-algorithm depth; larger is nearer. */
  depth: number;
  panel: number;
}

export interface PreviewProjection {
  polygons: PreviewPolygon[];
  bounds: { minX: number; minY: number; width: number; height: number };
}

/** The opening camera: a three-quarter view of the front. */
export const DEFAULT_PREVIEW_VIEW: PreviewView = { yaw: -Math.PI / 5, pitch: -Math.PI / 7 };

const PITCH_LIMIT = Math.PI / 2.4;
const FALLBACK_COLOR = '#94a3b8';
const LIGHT: Vec3 = (() => {
  const x = -0.35;
  const y = -0.55;
  const z = 0.76;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
})();

/** Clamp an orbit pitch so the view never flips over the pole. */
export function clampPreviewPitch(pitch: number): number {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}

/** Rotate one point into view space: yaw around Z, then pitch around X. */
function rotate(point: Vec3, view: PreviewView): Vec3 {
  const cosY = Math.cos(view.yaw);
  const sinY = Math.sin(view.yaw);
  const x = point.x * cosY - point.y * sinY;
  const y = point.x * sinY + point.y * cosY;
  const cosP = Math.cos(view.pitch);
  const sinP = Math.sin(view.pitch);
  return { x, y: y * cosP - point.z * sinP, z: y * sinP + point.z * cosP };
}

/** The unit normal of a world-space triangle, or `null` for a degenerate face. */
function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  return length <= 1e-9
    ? null
    : { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

function parseColor(color: string | null): [number, number, number] {
  const value = color !== null && /^#[0-9a-f]{6}$/i.test(color) ? color : FALLBACK_COLOR;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

/** Apply a Lambert term to a panel colour; both sides are lit. */
function shade(color: string | null, normal: Vec3 | null): string {
  const lambert =
    normal === null
      ? 0.35
      : 0.25 + 0.75 * Math.abs(normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z);
  const [r, g, b] = parseColor(color);
  const scale = (value: number): number => Math.max(0, Math.min(255, Math.round(value * lambert)));
  return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`;
}

/** Project one triangle to SVG points. */
function polygonOf(
  triangle: PreviewTriangle,
  mesh: PreviewMesh,
  projected: readonly Vec3[],
): PreviewPolygon {
  const a = mesh.positions[triangle.a]!;
  const b = mesh.positions[triangle.b]!;
  const c = mesh.positions[triangle.c]!;
  const pa = projected[triangle.a]!;
  const pb = projected[triangle.b]!;
  const pc = projected[triangle.c]!;
  const points = `${pa.x.toFixed(3)},${pa.y.toFixed(3)} ${pb.x.toFixed(3)},${pb.y.toFixed(3)} ${pc.x.toFixed(3)},${pc.y.toFixed(3)}`;
  return {
    points,
    fill: shade(mesh.panels[triangle.panel]?.color ?? null, triangleNormal(a, b, c)),
    depth: (pa.z + pb.z + pc.z) / 3,
    panel: triangle.panel,
  };
}

/**
 * Orthographically project a draped mesh. Triangles are painted back to front;
 * the bounds include a small margin so the dialog can fit them directly.
 */
export function projectMesh(mesh: PreviewMesh, view: PreviewView): PreviewProjection {
  const clamped: PreviewView = { yaw: view.yaw, pitch: clampPreviewPitch(view.pitch) };
  const projected = mesh.positions.map((point) => rotate(point, clamped));
  const polygons = mesh.triangles
    .map((triangle, index) => ({ index, polygon: polygonOf(triangle, mesh, projected) }))
    .sort((a, b) => a.polygon.depth - b.polygon.depth || a.index - b.index)
    .map((entry) => entry.polygon);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of projected) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const pad = Math.max(width, height, 1) * 0.08;
  return {
    polygons,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    },
  };
}
