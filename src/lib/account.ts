import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";

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
