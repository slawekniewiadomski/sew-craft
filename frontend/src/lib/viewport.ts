import type { Bounds, Vec2 } from '@sewcraft/geometry';

/** The canvas viewport: the world-space origin and the zoom factor. */
export interface Viewport {
  /** World x (mm) shown at the canvas's left edge. */
  x: number;
  /** World y (mm) shown at the canvas's top edge. */
  y: number;
  /** Screen pixels per world millimetre. */
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  min: Vec2;
  max: Vec2;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 100;

const NICE_MULTIPLES = [1, 2, 5] as const;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(viewport: Viewport, point: Vec2): Vec2 {
  return {
    x: (point.x - viewport.x) * viewport.scale,
    y: (point.y - viewport.y) * viewport.scale,
  };
}

export function screenToWorld(viewport: Viewport, point: Vec2): Vec2 {
  return {
    x: viewport.x + point.x / viewport.scale,
    y: viewport.y + point.y / viewport.scale,
  };
}

/** Move the viewport by a screen-space delta (positive drags the world with it). */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return {
    ...viewport,
    x: viewport.x - dx / viewport.scale,
    y: viewport.y - dy / viewport.scale,
  };
}

/** Zoom by `factor` while keeping the world point under `anchor` fixed. */
export function zoomAt(viewport: Viewport, anchor: Vec2, factor: number): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const world = screenToWorld(viewport, anchor);
  return { scale, x: world.x - anchor.x / scale, y: world.y - anchor.y / scale };
}

/** The world-space rectangle currently visible in a canvas of the given size. */
export function visibleWorldRect(viewport: Viewport, size: Size): Rect {
  return {
    min: screenToWorld(viewport, { x: 0, y: 0 }),
    max: screenToWorld(viewport, { x: size.width, y: size.height }),
  };
}

/** A viewport that fits `bounds` inside `size` with `padding` screen pixels. */
export function fitToBounds(bounds: Bounds, size: Size, padding = 24): Viewport {
  const worldWidth = bounds.max.x - bounds.min.x;
  const worldHeight = bounds.max.y - bounds.min.y;
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);

  const scale = clampScale(
    Math.min(
      worldWidth > 0 ? availableWidth / worldWidth : Number.POSITIVE_INFINITY,
      worldHeight > 0 ? availableHeight / worldHeight : Number.POSITIVE_INFINITY,
    ),
  );

  return {
    scale,
    x: bounds.min.x - (size.width / scale - worldWidth) / 2,
    y: bounds.min.y - (size.height / scale - worldHeight) / 2,
  };
}

/** The SVG transform that maps world millimetres onto screen pixels. */
export function viewportTransform(viewport: Viewport): string {
  return `translate(${-viewport.x * viewport.scale} ${-viewport.y * viewport.scale}) scale(${viewport.scale})`;
}

/**
 * A "nice" grid step in millimetres (1/2/5 × 10ⁿ) so grid lines stay roughly
 * `targetPixels` apart on screen whatever the zoom level.
 */
export function niceStep(scale: number, targetPixels = 64): number {
  const raw = targetPixels / scale;
  const magnitude = 10 ** Math.floor(Math.log10(raw));

  for (const multiple of NICE_MULTIPLES) {
    if (multiple * magnitude >= raw) return multiple * magnitude;
  }
  return 10 * magnitude;
}

/** Every multiple of `step` inside `rect` along one axis, for ruler ticks. */
export function ticksAlong(rect: Rect, axis: 'x' | 'y', step: number): number[] {
  const min = axis === 'x' ? rect.min.x : rect.min.y;
  const max = axis === 'x' ? rect.max.x : rect.max.y;

  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(value);
  }
  return ticks;
}
