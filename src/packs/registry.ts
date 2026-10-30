import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { Frame, Mood, Pack } from "./types";

export const SPIRIT: Pack = {
  id: "builtin.spirit", name: "Дух", author: "Familiar", license: "Apache-2.0", kind: "svg", builtin: true,
  states: {}, frames: {}, card: "off", scale: 1,
};

/** Shape returned by the Rust `list_packs` command (absolute file paths). */
interface PackInfo {
  id: string;
  name: string;
  author: string;
  license: string;
  builtin: boolean;
  states: Partial<Record<Mood, string[]>>;
  frames: Partial<Record<Mood, [string, number][]>>;
  card: "auto" | "on" | "off";
  scale: number;
  preview: string | null;
}

function toPack(p: PackInfo): Pack {
  const url = (path: string) => convertFileSrc(path);
  const states: Pack["states"] = {};
  for (const [m, list] of Object.entries(p.states)) states[m as Mood] = list.map(url);
  const frames: Pack["frames"] = {};
  for (const [m, list] of Object.entries(p.frames)) frames[m as Mood] = list.map(([f, ms]): Frame => [url(f), ms]);
  return {
    id: p.id, name: p.name, author: p.author, license: p.license, kind: "images", builtin: p.builtin,
    states, frames, card: p.card, scale: p.scale, preview: p.preview ? url(p.preview) : undefined,
  };
}

export async function loadPacks(): Promise<Pack[]> {
  const list = await invoke<PackInfo[]>("list_packs");
  return [SPIRIT, ...list.map(toPack)];
}

/** Tell every window that packs were added or removed. */
export const notifyPacksChanged = () => emit("packs:changed");

export function usePacks(): Pack[] {
  const [packs, setPacks] = useState<Pack[]>([SPIRIT]);
  useEffect(() => {
    const refresh = () => loadPacks().then(setPacks).catch(console.error);
    refresh();
    const un = listen("packs:changed", refresh);
    return () => void un.then((f) => f());
  }, []);
  return packs;
}
