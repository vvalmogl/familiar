import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import AnimatedImage from "../packs/AnimatedImage";
import Spirit from "../packs/Spirit";
import { hasSolidBackground } from "../packs/card";
import { isOneShot, nextPack, visualFor } from "../packs/moods";
import { SPIRIT, usePacks } from "../packs/registry";
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
  const packs = usePacks();
  const [mood, setMood] = useState<Mood>("idle");
  const [glitch, setGlitch] = useState<"in" | "out" | "">("");
  const [packId, setPackId] = useState<string>("");
  const [src, setSrc] = useState<string>("");
  const [aspect, setAspect] = useState(16 / 9);
  const [card, setCard] = useState(false);
  const frame = useRef<Frame | null>(null);
  const anchor = useRef(0);
  const visible = useRef(false);
  const pendingShow = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (settings) applyTheme(themeById(settings.theme));
  }, [settings?.theme]);

  // The chosen pack is the starting point; rotation may switch to others from the pool.
  useEffect(() => {
    if (settings) setPackId(settings.packId);
  }, [settings?.packId]);

  const pack = packs.find((p) => p.id === packId) ?? SPIRIT;
  const packsRef = useRef(packs);
  packsRef.current = packs;

  // The bar's placeholder names whoever is on screen ("Спроси — Котик ответит…").
  useEffect(() => {
    emitTo("bar", "character:pack", pack.name);
  }, [pack.name]);

  function rotate() {
    const s = settingsRef.current;
    if (!s) return;
    const available = new Set(packsRef.current.map((p) => p.id));
    const pool = [...new Set([s.packId, ...s.packPool])].filter((id) => available.has(id));
    setPackId((cur) => nextPack(pool, cur || s.packId));
  }

  // Pick what to show for the current mood: a frame animation or a random image.
  useEffect(() => {
    if (pack.kind === "svg") return;
    const v = visualFor(pack, mood);
    if (v.kind === "image") {
      setSrc(v.src);
      return;
    }
    if (v.kind === "none") return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const [url, ms] = v.frames[i];
      setSrc(url);
      i++;
      if (i >= v.frames.length) {
        if (isOneShot(mood)) return; // hold the last frame; the mood timer brings us back to idle
        i = 0;
      }
      timer = setTimeout(step, Math.max(ms, 16)); // a 0 ms frame would spin the CPU
    };
    step();
    return () => clearTimeout(timer);
  }, [pack, mood]);

  // Solid-background images get a card frame (pack.json can force it on or off).
  useEffect(() => {
    if (pack.kind === "svg" || !src) return setCard(false);
    if (pack.card !== "auto") return setCard(pack.card === "on");
    let alive = true;
    hasSolidBackground(src).then((solid) => alive && setCard(solid));
    return () => {
      alive = false;
    };
  }, [pack, src]);

  const scale = (settings?.characterScale ?? 1) * pack.scale;
  const size =
    pack.kind === "svg"
      ? { w: Math.round(200 * scale), h: Math.round(200 * scale) }
      : (() => {
          const h = (card ? 165 : 220) * scale;
          return { w: Math.round(h * aspect), h: Math.round(h) };
        })();
  const sizeRef = useRef(size);
  sizeRef.current = size;

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
    if (settingsRef.current?.packRotation === "jump") rotate();
    anchor.current = nextAnchor(anchor.current);
    await move();
    glitchIn();
  }

  useEffect(() => {
    // Start hidden (e.g. after a reload); the bar shows us when it opens.
    win.hide();
    const subs = [
      listen("character:show", () => {
        visible.current = true;
        pendingShow.current = true;
        anchor.current = 0;
        if (settingsRef.current?.packRotation === "show") rotate();
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
    <div className={`character glitch-${glitch} ${card ? "card" : ""}`} onClick={jump}>
      {pack.kind === "svg" ? (
        <Spirit mood={mood} />
      ) : (
        src && <AnimatedImage src={src} onSize={(w, h) => w && h && setAspect(w / h)} />
      )}
    </div>
  );
}
