/** Where the character sits around the prompt bar. Logical pixels, y grows downwards. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ANCHORS = 6;
const OVERLAP = 14;

/**
 * 0 top-left · 1 top-right · 2 top-center · 3 left side · 4 right side · 5 under the answer.
 * The result is clamped to the screen's work area.
 */
export function place(anchor: number, target: Rect, size: { w: number; h: number }, screen: Rect) {
  const { w, h } = size;
  const t = target;
  const above = t.y - h + OVERLAP;
  const side = t.y - h * 0.4;
  const positions: [number, number][] = [
    [t.x + 24, above],
    [t.x + t.w - w - 24, above],
    [t.x + t.w / 2 - w / 2, above],
    [t.x - w + 10, side],
    [t.x + t.w - 10, side],
    [t.x + t.w - w * 0.75, t.y + t.h - OVERLAP],
  ];
  const [x, y] = positions[((anchor % ANCHORS) + ANCHORS) % ANCHORS];
  return {
    x: Math.min(Math.max(x, screen.x), screen.x + screen.w - w),
    y: Math.min(Math.max(y, screen.y), screen.y + screen.h - h),
  };
}

/** A different anchor than the current one. */
export function nextAnchor(current: number, random = Math.random): number {
  const n = Math.floor(random() * (ANCHORS - 1));
  return n >= current ? n + 1 : n;
}
