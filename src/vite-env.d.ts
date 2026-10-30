/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL; accounts are hidden when unset. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key — public by design, protected by RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
