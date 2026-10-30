import type { SupabaseClient } from "@supabase/supabase-js";
import { readSettings, setSetting, store, type Settings } from "./settings";

/** Settings that follow the account. The hotkey stays per machine (combos differ between OSes). */
export const SYNCED_KEYS = [
  "theme", "provider", "models", "apiBaseUrl", "systemPrompt",
  "packId", "packPool", "packRotation", "characterScale", "jumping", "jumpInterval",
] as const satisfies readonly (keyof Settings)[];

type Synced = Pick<Settings, (typeof SYNCED_KEYS)[number]>;

export function pickSynced(s: Settings): Synced {
  return Object.fromEntries(SYNCED_KEYS.map((k) => [k, s[k]])) as Synced;
}

/** Last write wins: compare when this machine last changed settings with the server copy. */
export function decide(localChangedAt: number, remoteUpdatedAt: number | null): "push" | "pull" | "none" {
  if (remoteUpdatedAt === null) return "push";
  if (localChangedAt > remoteUpdatedAt) return "push";
  if (remoteUpdatedAt > localChangedAt) return "pull";
  return "none";
}

const CHANGED_KEY = "familiar.settingsChangedAt";
const localChangedAt = () => Number(localStorage.getItem(CHANGED_KEY) ?? 0);
const markChanged = (t: number) => localStorage.setItem(CHANGED_KEY, String(t));

/**
 * Keep settings in sync with the signed-in account while it lasts.
 * Returns a function that stops syncing.
 */
export async function startSync(sb: SupabaseClient, userId: string, onStatus: (s: string) => void): Promise<() => void> {
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const push = async () => {
    const at = localChangedAt() || Date.now();
    const { error } = await sb.from("user_settings").upsert({
      user_id: userId,
      settings: pickSynced(await readSettings()),
      updated_at: new Date(at).toISOString(),
    });
    onStatus(error ? `не удалось сохранить: ${error.message}` : `синхронизировано ${new Date().toLocaleTimeString()}`);
  };

  // First contact: whichever side changed last wins.
  const { data, error } = await sb.from("user_settings").select("settings, updated_at").eq("user_id", userId).maybeSingle();
  if (error) {
    onStatus(`нет связи с сервером: ${error.message}`);
  } else {
    const remoteAt = data ? Date.parse(data.updated_at) : null;
    const action = decide(localChangedAt(), remoteAt);
    if (action === "push") await push();
    if (action === "pull" && data) {
      applying = true;
      for (const k of SYNCED_KEYS) {
        const v = (data.settings as Record<string, unknown>)[k];
        if (v !== undefined) await setSetting(k, v as never);
      }
      applying = false;
      markChanged(remoteAt!);
      onStatus("настройки загружены из аккаунта");
    }
    if (action === "none") onStatus("синхронизировано");
  }

  // Afterwards: push local edits (debounced).
  const unlisten = await (await store()).onChange((key) => {
    if (applying || !(SYNCED_KEYS as readonly string[]).includes(key)) return;
    markChanged(Date.now());
    clearTimeout(timer);
    timer = setTimeout(push, 1500);
  });
  return () => {
    clearTimeout(timer);
    unlisten();
  };
}
