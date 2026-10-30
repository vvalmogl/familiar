import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));
const { decide, pickSynced, SYNCED_KEYS } = await import("./sync");
const { DEFAULTS } = await import("./settings");

describe("decide", () => {
  it("pushes when the server has nothing", () => expect(decide(0, null)).toBe("push"));
  it("pushes newer local edits", () => expect(decide(2000, 1000)).toBe("push"));
  it("pulls a newer server copy", () => expect(decide(1000, 2000)).toBe("pull"));
  it("does nothing when equal", () => expect(decide(1000, 1000)).toBe("none"));
});

describe("pickSynced", () => {
  it("keeps only synced keys and never the hotkey or onboarding flag", () => {
    const out = pickSynced({ ...DEFAULTS, hotkey: "Alt+K", onboarded: true });
    expect(Object.keys(out).sort()).toEqual([...SYNCED_KEYS].sort());
    expect(out).not.toHaveProperty("hotkey");
    expect(out).not.toHaveProperty("onboarded");
  });
});
