import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import Spirit from "../packs/Spirit";
import { packById } from "../packs/registry";
import type { Mood } from "../packs/types";
import { nextAnchor, place, type Rect } from "../lib/placement";
import { useSettings } from "../lib/settings";
import { applyTheme, themeById } from "../lib/themes";

interface Frame {
  bar: Rect;
  screen: Rect;
}

/** The companion window: follows the bar, teleports around it, reacts to the conversation. */
export default function Character() {
  const settings = useSettings();
  const [mood, setMood] = useState<Mood>("idle");
  const [glitch, setGlitch] = useState<"in" | "out" | "">("");
  const frame = useRef<Frame | null>(null);
  const anchor = useRef(0);
  const visible = useRef(false);
  const pendingShow = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pack = packById(settings?.packId ?? "");
  const scale = settings?.characterScale ?? 1;
  const size = { w: Math.round(pack.width * scale), h: Math.round(pack.height * scale) };
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (settings) applyTheme(themeById(settings.theme));
  }, [settings?.theme]);

  const win = getCurrentWindow();

  async function move() {
    if (!frame.current) return;
    const s = sizeRef.current;
    const p = place(anchor.current, frame.current.bar, s, frame.current.screen);
    await win.setSize(new LogicalSize(s.w, s.h));
    await win.setPosition(new LogicalPosition(Math.round(p.x), Math.round(p.y)));
  }

  function glitchIn() {
    setGlitch("");
    requestAnimationFrame(() => setGlitch("in"));
  }

  async function jump() {
    if (!visible.current) return;
    setGlitch("out");
    await new Promise((r) => setTimeout(r, 180));
    if (!visible.current) return;
    anchor.current = nextAnchor(anchor.current);
    await move();
    glitchIn();
  }

  useEffect(() => {
    const subs = [
      listen("character:show", () => {
        visible.current = true;
        pendingShow.current = true;
        anchor.current = 0;
        setMood("intro");
      }),
      listen<Frame>("bar:frame", async ({ payload }) => {
        frame.current = payload;
        if (!visible.current) return;
        await move();
        if (pendingShow.current) {
          pendingShow.current = false;
          await invoke("show_character");
          glitchIn();
          setTimeout(() => setMood((m) => (m === "intro" ? "idle" : m)), 1200);
        }
      }),
      listen("character:hide", async () => {
        visible.current = false;
        setGlitch("out");
        await new Promise((r) => setTimeout(r, 160));
        if (!visible.current) await win.hide();
      }),
      listen<Mood>("character:mood", ({ payload }) => {
        setMood(payload);
        if (payload === "happy") setTimeout(() => setMood((m) => (m === "happy" ? "idle" : m)), 1500);
      }),
      listen("character:jump", () => jump()),
    ];
    return () => subs.forEach((s) => s.then((f) => f()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teleport every few seconds while visible.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const s = settingsRef.current;
      if (!s?.jumping) return;
      timer = setTimeout(async () => {
        await jump();
        schedule();
      }, s.jumpInterval * 1000 * (0.6 + Math.random() * 0.8));
    };
    schedule();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.jumping, settings?.jumpInterval]);

  useEffect(() => {
    if (visible.current) move();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  return (
    <div className={`character glitch-${glitch}`} onClick={jump}>
      {pack.kind === "svg" ? <Spirit mood={mood} /> : null}
    </div>
  );
}
