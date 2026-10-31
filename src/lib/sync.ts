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
const USER_KEY = "familiar.syncedUser";
const localChangedAt = () => Number(localStorage.getItem(CHANGED_KEY) ?? 0);
const markChanged = (t: number) => localStorage.setItem(CHANGED_KEY, String(t));

/** Values just pulled from the server: their change events are echoes, not user edits. */
const pulled = new Map<string, string>();
let onLocalEdit: (() => void) | undefined;
let tracking: Promise<void> | undefined;

/**
 * Note when synced settings change on this machine — signed in or not — so the next sign-in
 * knows whether local or server settings are newer. Safe to call more than once.
 */
export function trackLocalEdits(): Promise<void> {
  tracking ??= store().then((s) =>
    s.onChange((key, value) => {
      if (!(SYNCED_KEYS as readonly string[]).includes(key)) return;
      if (pulled.get(key) === JSON.stringify(value)) {
        pulled.delete(key);
        return;
      }
      markChanged(Date.now());
      onLocalEdit?.();
    }).then(() => {}),
  );
  return tracking;
}

/**
 * Keep settings in sync with the signed-in account while it lasts.
 * Returns a function that stops syncing.
 */
export async function startSync(sb: SupabaseClient, userId: string, onStatus: (s: string) => void): Promise<() => void> {
  await trackLocalEdits();
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

  // First contact: whichever side changed last wins. Local edits made under another account
  // (or never synced) don't count, so they can't overwrite this account's settings.
  const { data, error } = await sb.from("user_settings").select("settings, updated_at").eq("user_id", userId).maybeSingle();
  if (error) {
    onStatus(`нет связи с сервером: ${error.message}`);
  } else {
    const remoteAt = data ? Date.parse(data.updated_at) : null;
    const sameUser = localStorage.getItem(USER_KEY) === userId;
    const action = sameUser ? decide(localChangedAt(), remoteAt) : remoteAt === null ? "push" : "pull";
    if (action === "push") await push();
    if (action === "pull" && data) {
      for (const k of SYNCED_KEYS) {
        const v = (data.settings as Record<string, unknown>)[k];
        if (v === undefined) continue;
        pulled.set(k, JSON.stringify(v));
        await setSetting(k, v as never);
      }
      markChanged(remoteAt!);
      onStatus("настройки загружены из аккаунта");
    }
    if (action === "none") onStatus("синхронизировано");
    localStorage.setItem(USER_KEY, userId);
  }

  // Afterwards: push local edits (debounced).
  onLocalEdit = () => {
    clearTimeout(timer);
    timer = setTimeout(push, 1500);
  };
  return () => {
    clearTimeout(timer);
    onLocalEdit = undefined;
  };
}
