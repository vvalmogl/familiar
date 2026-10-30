import { describe, expect, it } from "vitest";
import { ANCHORS, nextAnchor, place } from "./placement";

const screen = { x: 0, y: 0, w: 1440, h: 900 };
const bar = { x: 380, y: 300, w: 680, h: 58 };
const size = { w: 360, h: 203 };

describe("place", () => {
  it("puts the character above the bar, overlapping it a little", () => {
    const p = place(0, bar, size, screen);
    expect(p).toEqual({ x: 404, y: 300 - 203 + 14 });
  });

  it("puts side anchors outside the bar", () => {
    expect(place(3, bar, size, screen).x).toBe(380 - 360 + 10);
    expect(place(4, bar, size, screen).x).toBe(380 + 680 - 10);
  });

  it("clamps to the screen", () => {
    const high = { ...bar, y: 20 };
    expect(place(0, high, size, screen).y).toBe(0);
    const right = { ...bar, x: 1300 };
    expect(place(4, right, size, screen).x).toBe(1440 - 360);
  });
});

describe("nextAnchor", () => {
  it("never repeats the current anchor", () => {
    for (let cur = 0; cur < ANCHORS; cur++) {
      for (let r = 0; r < 1; r += 0.05) {
        const n = nextAnchor(cur, () => r);
        expect(n).not.toBe(cur);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(ANCHORS);
      }
    }
  });
});
