import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when this build has no Supabase project configured — accounts are then hidden. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE: the browser returns to familiar://auth-callback?code=…, which we exchange here.
        auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
      })
    : null;

export const REDIRECT = "familiar://auth-callback";

function client(): SupabaseClient {
  if (!supabase) throw new Error("Аккаунты не настроены в этой сборке");
  return supabase;
}

export async function signInWith(provider: "google" | "github") {
  const { data, error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  await openUrl(data.url);
}

/** OAuth providers switched on in the Supabase project (a provider without keys would only fail). */
export async function enabledProviders(): Promise<Set<string>> {
  if (!url || !key) return new Set();
  const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!r.ok) return new Set(["github"]);
  const { external } = (await r.json()) as { external: Record<string, boolean> };
  return new Set(Object.keys(external).filter((k) => external[k]));
}

export async function signInWithEmail(email: string) {
  const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT } });
  if (error) throw error;
}

/** Finish signing in from the deep link the browser opened. */
export async function handleAuthCallback(link: string) {
  const params = new URL(link).searchParams;
  const failure = params.get("error_description") ?? params.get("error");
  if (failure) throw new Error(failure);
  const code = params.get("code");
  if (!code) throw new Error("в ссылке нет кода входа");
  const { error } = await client().auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export const signOut = () => client().auth.signOut();

/** undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Familiar Plus expiry for the signed-in user: undefined while loading, null when not subscribed. */
export function usePlus(session: Session | null | undefined) {
  const [until, setUntil] = useState<Date | null | undefined>(undefined);
  const userId = session?.user.id;
  const loading = session === undefined;
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return setUntil(null);
    const { data } = await supabase.from("subscriptions").select("expires_at").eq("user_id", userId).maybeSingle();
    const d = data ? new Date(data.expires_at) : null;
    setUntil(d && d.getTime() > Date.now() ? d : null);
  }, [userId]);
  useEffect(() => {
    if (!loading) refresh();
  }, [loading, refresh]);
  return { until, refresh };
}

export const PLUS_STARS = 150;

/** Opens the Telegram Stars subscription for this account in Telegram. */
export async function buyPlus() {
  const { data, error } = await client().functions.invoke<{ url: string }>("subscribe", { body: {} });
  if (error || !data?.url) {
    const body = await (error as { context?: Response })?.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? "не получилось открыть оплату");
  }
  await openUrl(data.url);
}
