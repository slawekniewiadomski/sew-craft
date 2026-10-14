export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const magnitude = (a: Vec2): number => Math.hypot(a.x, a.y);

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const normalize = (a: Vec2): Vec2 => {
  const length = magnitude(a);

  return length === 0 ? { x: 0, y: 0 } : scale(a, 1 / length);
};

export const equals = (a: Vec2, b: Vec2, tolerance = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
