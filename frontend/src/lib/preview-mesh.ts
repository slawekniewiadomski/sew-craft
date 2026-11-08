/** Project the draped mesh into flat SVG polygons. Pure; no DOM. */
import type { ExplodedView, PreviewMesh, PreviewTriangle, Vec3 } from '@sewcraft/geometry';

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
export const DEFAULT_PREVIEW_VIEW: PreviewView = { yaw: -Math.PI / 4, pitch: -Math.PI / 3.2 };

/** A soft palette that keeps panels distinguishable when no colour is stored. */
export const PANEL_COLORS = [
  '#7d9cc0',
  '#c2906b',
  '#7fa889',
  '#a58ab5',
  '#c07f86',
  '#6fa3ad',
  '#b0a05a',
  '#8b8fb0',
];

/** The rotating palette for exploded seam links. */
export const SEAM_COLORS = [
  '#4f7cac',
  '#5b9e6f',
  '#c08457',
  '#9b6b9e',
  '#b05c6b',
  '#5a9aa8',
  '#a3934a',
  '#7d6fb0',
  '#b07a4a',
  '#4f9a86',
  '#a05c8a',
  '#6b7fb0',
];

const PITCH_LIMIT = Math.PI / 2.4;
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

/** Project one world point with the view's clamped pitch. */
export function projectPoint(point: Vec3, view: PreviewView): Vec3 {
  return rotate(point, { yaw: view.yaw, pitch: clampPreviewPitch(view.pitch) });
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

function parseColor(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

/** Apply a soft Lambert term to a visible outward face. */
function shade(color: string, normal: Vec3 | null): string {
  const lambert =
    normal === null
      ? 0.6
      : 0.5 + 0.5 * Math.max(0, normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z);
  const [r, g, b] = parseColor(color);
  const scale = (value: number): number => Math.max(0, Math.min(255, Math.round(value * lambert)));
  return `rgb(${scale(r)}, ${scale(g)}, ${scale(b)})`;
}

/** Project one triangle to SVG points. */
function polygonOf(
  triangle: PreviewTriangle,
  mesh: PreviewMesh,
  projected: readonly Vec3[],
  view: PreviewView,
): PreviewPolygon | null {
  const a = mesh.positions[triangle.a]!;
  const b = mesh.positions[triangle.b]!;
  const c = mesh.positions[triangle.c]!;
  const normal = triangleNormal(a, b, c);
  if (normal !== null && rotate(normal, view).z <= 0) return null;
  const pa = projected[triangle.a]!;
  const pb = projected[triangle.b]!;
  const pc = projected[triangle.c]!;
  const points = `${pa.x.toFixed(3)},${pa.y.toFixed(3)} ${pb.x.toFixed(3)},${pb.y.toFixed(3)} ${pc.x.toFixed(3)},${pc.y.toFixed(3)}`;
  return {
    points,
    fill: shade(panelColor(mesh.panels[triangle.panel]?.color ?? null, triangle.panel), normal),
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
    .map((triangle, index) => ({
      index,
      polygon: polygonOf(triangle, mesh, projected, clamped),
    }))
    .filter((entry): entry is { index: number; polygon: PreviewPolygon } => entry.polygon !== null)
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

export interface ExplodedPanelProjection {
  /** SVG `points` of the cut-part boundary. */
  points: string;
  color: string;
  label: string;
  labelX: number;
  labelY: number;
  depth: number;
}

export interface ExplodedSeamProjection {
  sides: string[];
  links: string[];
  color: string;
}

export interface ExplodedProjection {
  panels: ExplodedPanelProjection[];
  seams: ExplodedSeamProjection[];
  bounds: { minX: number; minY: number; width: number; height: number };
}

/** A stored colour, or the panel's deterministic palette colour. */
function panelColor(color: string | null, index: number): string {
  return color !== null && /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : PANEL_COLORS[index % PANEL_COLORS.length]!;
}

/** Project a closed or open 3D polyline to SVG points. */
function projectedPoints(points: readonly Vec3[], view: PreviewView): string {
  return points
    .map((point) => {
      const projected = projectPoint(point, view);
      return `${projected.x.toFixed(3)},${projected.y.toFixed(3)}`;
    })
    .join(' ');
}

/**
 * Project the exploded parts and their seam links. Panels are painted back to
 * front; seam sides and the midpoint links are drawn above them.
 */
export function projectExploded(view: ExplodedView, camera: PreviewView): ExplodedProjection {
  const projected = view.panels.map((panel, index) => {
    const boundary = panel.boundary.map((point) => projectPoint(point, camera));
    const center = projectPoint(panel.center, camera);
    return {
      panel,
      color: panelColor(panel.color, index),
      points: boundary.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' '),
      labelX: center.x,
      labelY: center.y,
      depth: boundary.reduce((sum, point) => sum + point.z, 0) / boundary.length,
    };
  });

  const seams = view.seams.map((seam) => ({
    sides: seam.sides.map((side) => projectedPoints(side.points, camera)),
    links: seam.links.map((link) => projectedPoints(link, camera)),
    color: SEAM_COLORS[seam.colorIndex % SEAM_COLORS.length]!,
  }));

  const all = [
    ...view.panels.flatMap((panel) => panel.boundary),
    ...view.seams.flatMap((seam) => [
      ...seam.sides.flatMap((side) => side.points),
      ...seam.links.flatMap((link) => link),
    ]),
  ].map((point) => projectPoint(point, camera));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of all) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const pad = Math.max(width, height, 1) * 0.1;

  return {
    panels: projected
      .sort((a, b) => a.depth - b.depth)
      .map((entry) => ({
        points: entry.points,
        color: entry.color,
        label: entry.panel.label,
        labelX: entry.labelX,
        labelY: entry.labelY,
        depth: entry.depth,
      })),
    seams,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    },
  };
}
