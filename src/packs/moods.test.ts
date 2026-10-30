import { describe, expect, it } from "vitest";
import { guessMood, nextPack, visualFor } from "./moods";
import type { Pack } from "./types";

const base: Pack = {
  id: "p", name: "P", author: "", license: "", kind: "images", builtin: false,
  states: {}, frames: {}, card: "auto", scale: 1,
};

describe("visualFor", () => {
  it("falls back to idle for moods the pack lacks", () => {
    const pack = { ...base, states: { idle: ["idle.gif"] } };
    expect(visualFor(pack, "talking")).toEqual({ kind: "image", src: "idle.gif" });
    expect(visualFor(pack, "intro")).toEqual({ kind: "image", src: "idle.gif" });
  });

  it("prefers frame animations over still images", () => {
    const pack = { ...base, states: { idle: ["a.gif"] }, frames: { idle: [["f1.webp", 100]] as [string, number][] } };
    expect(visualFor(pack, "idle")).toEqual({ kind: "frames", frames: [["f1.webp", 100]] });
  });

  it("picks a random image of the mood", () => {
    const pack = { ...base, states: { idle: ["a"], talking: ["t1", "t2", "t3"] } };
    expect(visualFor(pack, "talking", () => 0.99)).toEqual({ kind: "image", src: "t3" });
    expect(visualFor(pack, "talking", () => 0)).toEqual({ kind: "image", src: "t1" });
  });

  it("intro falls back to happy before idle", () => {
    const pack = { ...base, states: { idle: ["i"], happy: ["h"] } };
    expect(visualFor(pack, "intro")).toEqual({ kind: "image", src: "h" });
  });
});

describe("nextPack", () => {
  it("rotates to a different pack when there is one", () => {
    expect(nextPack(["a", "b", "c"], "a", () => 0)).toBe("b");
    expect(nextPack(["a"], "a")).toBe("a");
    expect(nextPack([], "a")).toBe("a");
  });
});

describe("guessMood", () => {
  it("reads moods from file names", () => {
    expect(guessMood("neko-atsume.thinking.gif")).toBe("thinking");
    expect(guessMood("peach-laptop2.gif")).toBe("talking");
    expect(guessMood("happy-dance.gif")).toBe("happy");
    expect(guessMood("cat-flowers.gif")).toBe("idle");
  });
});
