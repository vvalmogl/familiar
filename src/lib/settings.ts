import { load, type Store } from "@tauri-apps/plugin-store";
import { useEffect, useState } from "react";
import type { Rotation } from "../packs/types";

export type ProviderKind = "claude" | "codex" | "gemini" | "api";

export const PROVIDERS: { id: ProviderKind; title: string }[] = [
  { id: "claude", title: "Claude" },
  { id: "codex", title: "ChatGPT" },
  { id: "gemini", title: "Gemini" },
  { id: "api", title: "API / Ollama" },
];

export const DEFAULT_PROMPT =
  "Ты отвечаешь в маленьком всплывающем окне быстрого вопроса (как Spotlight). " +
  "Отвечай кратко и по делу, на языке вопроса. Без заголовков и таблиц; " +
  "можно **жирный**, `код` и короткие списки.";

export interface Settings {
  onboarded: boolean;
  hotkey: string;
  provider: ProviderKind;
  models: Record<ProviderKind, string>;
  apiBaseUrl: string;
  systemPrompt: string;
  theme: string;
  packId: string;
  /** Packs the companion rotates through (see `packRotation`). */
  packPool: string[];
  packRotation: Rotation;
  characterScale: number;
  jumping: boolean;
  jumpInterval: number;
}

export const DEFAULTS: Settings = {
  onboarded: false,
  hotkey: "Alt+Space",
  provider: "claude",
  models: { claude: "sonnet", codex: "", gemini: "", api: "qwen/qwen3.8-flash" },
  apiBaseUrl: "https://openrouter.ai/api/v1",
  systemPrompt: DEFAULT_PROMPT,
  theme: "neon",
  packId: "builtin.spirit",
  packPool: ["builtin.spirit"],
  packRotation: "never",
  characterScale: 1,
  jumping: true,
  jumpInterval: 9,
};

// Every setting is a top-level key in settings.json (the Rust side reads `hotkey` and `onboarded`).
let storePromise: Promise<Store> | null = null;
export function store(): Promise<Store> {
  storePromise ??= load("settings.json", { defaults: DEFAULTS as unknown as Record<string, unknown>, autoSave: 200 });
  return storePromise;
}

export async function readSettings(): Promise<Settings> {
  const s = await store();
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS)) {
    const v = await s.get(key);
    if (v !== undefined && v !== null) out[key] = v;
  }
  return out as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await (await store()).set(key, value);
}

/** Update a setting from its latest stored value (safe against quick successive edits). */
export async function updateSetting<K extends keyof Settings>(key: K, fn: (value: Settings[K]) => Settings[K]) {
  const s = await store();
  const current = ((await s.get(key)) ?? DEFAULTS[key]) as Settings[K];
  await s.set(key, fn(current));
}

/** Live settings, updated when any window changes them. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    readSettings().then(async (s) => {
      if (!alive) return;
      setSettings(s);
      unlisten = await (await store()).onChange((key, value) => {
        setSettings((prev) => (prev ? { ...prev, [key]: value ?? DEFAULTS[key as keyof Settings] } : prev));
      });
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return settings;
}
