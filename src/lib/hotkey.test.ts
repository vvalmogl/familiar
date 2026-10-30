import { describe, expect, it } from "vitest";
import { toAccelerator } from "./hotkey";

const ev = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

describe("toAccelerator", () => {
  it("builds accelerators from physical keys (layout-independent)", () => {
    expect(toAccelerator(ev("Space", { altKey: true }))).toBe("Alt+Space");
    expect(toAccelerator(ev("KeyK", { metaKey: true, shiftKey: true }))).toBe("Shift+Super+K");
    expect(toAccelerator(ev("Digit1", { ctrlKey: true }))).toBe("Control+1");
  });

  it("rejects bare keys and lone modifiers", () => {
    expect(toAccelerator(ev("KeyA"))).toBeNull();
    expect(toAccelerator(ev("AltLeft", { altKey: true }))).toBeNull();
  });
});
