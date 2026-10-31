import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { handleAuthCallback, signInWith, signInWithEmail, signOut, supabase, useSession } from "../lib/account";
import { startSync, trackLocalEdits } from "../lib/sync";
import { notifyPacksChanged, usePacks } from "../packs/registry";

/** Finish sign-in from deep links and keep settings synced while signed in. Mount once in the main window. */
export function useAccount() {
  const session = useSession();
  const [syncStatus, setSyncStatus] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // Pull rather than trust the event: a link that launched the app arrived before this listener.
    const take = async () => {
      const link = await invoke<string | null>("take_auth_callback");
      if (!link) return;
      setAuthError("");
      await handleAuthCallback(link).catch((e) => setAuthError(String(e.message ?? e)));
    };
    take();
    trackLocalEdits();
    const un = listen("auth:callback", take);
    return () => void un.then((f) => f());
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let stop: (() => void) | undefined;
    let alive = true;
    startSync(supabase, userId, setSyncStatus).then((s) => (alive ? (stop = s) : s()));
    return () => {
      alive = false;
      stop?.();
    };
  }, [userId]);

  return { session, syncStatus, authError };
}

export function AccountSection({ account }: { account: ReturnType<typeof useAccount> }) {
  const { session, syncStatus, authError } = account;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const run = (f: () => Promise<unknown>) => {
    setError("");
    f().catch((e) => setError(String(e.message ?? e)));
  };

  if (!supabase) {
    return <p className="muted">В этой сборке аккаунты отключены. Всё остальное работает без входа.</p>;
  }
  if (session === undefined) return <p className="muted">Загрузка…</p>;

  if (session) {
    const u = session.user;
    return (
      <div className="account">
        <p>
          Ты вошёл как <b>{u.user_metadata?.full_name ?? u.email}</b>
          {u.email && u.user_metadata?.full_name && <span className="muted"> · {u.email}</span>}
        </p>
        <p className="status ok">● Настройки синхронизируются: тема, нейросеть, персонажи</p>
        {syncStatus && <p className="muted">{syncStatus}</p>}
        <button onClick={() => run(signOut)}>Выйти</button>
      </div>
    );
  }

  return (
    <div className="account">
      <p className="muted">
        Аккаунт не обязателен. С ним настройки переезжают на другие компьютеры и открывается галерея персонажей.
      </p>
      <div className="presets">
        <button onClick={() => run(() => signInWith("google"))}>Войти через Google</button>
        <button onClick={() => run(() => signInWith("github"))}>Войти через GitHub</button>
      </div>
      <label className="field">
        Или по ссылке на почту
        <div className="row">
          <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={!email.includes("@")} onClick={() => run(async () => { await signInWithEmail(email.trim()); setSent(true); })}>
            Прислать ссылку
          </button>
        </div>
      </label>
      {sent && <p className="status ok">Письмо отправлено — открой ссылку из него на этом компьютере.</p>}
      {(error || authError) && <p className="status bad">{error || authError}</p>}
    </div>
  );
}

interface GalleryPack {
  id: string;
  name: string;
  author: string;
  description: string | null;
  license: string;
  price_cents: number;
  preview_url: string | null;
  size_bytes: number;
}

export function GallerySection() {
  const installed = usePacks();
  const [packs, setPacks] = useState<GalleryPack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("packs")
      .select("id, name, author, description, license, price_cents, preview_url, size_bytes")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setPacks(data ?? [])));
  }, []);

  if (!supabase) return <p className="muted">Галерея недоступна в этой сборке.</p>;

  const install = async (p: GalleryPack) => {
    setBusy(p.id);
    setError("");
    try {
      const { data, error } = await supabase!.functions.invoke<{ url: string }>("pack-download", { body: { pack_id: p.id } });
      if (error || !data) throw error ?? new Error("нет ссылки");
      await invoke("install_pack_from_url", { url: data.url, packId: p.id });
      await notifyPacksChanged();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="muted">Персонажи от авторов. Устанавливаются в один клик и появляются в разделе «Персонаж».</p>
      {packs === null && !error && <p className="muted">Загрузка…</p>}
      {packs?.length === 0 && <p className="muted">Пока пусто — скоро здесь появятся первые паки.</p>}
      <div className="packs">
        {packs?.map((p) => {
          const have = installed.some((i) => i.id === p.id);
          return (
            <div key={p.id} className="pack gallery-pack">
              <div className="pack-preview">{p.preview_url && <img src={p.preview_url} alt="" />}</div>
              <b>{p.name}</b>
              <span className="muted">{p.author} · {(p.size_bytes / 1024 / 1024).toFixed(1)} МБ</span>
              {p.description && <span className="muted">{p.description}</span>}
              {p.price_cents > 0 ? (
                <button disabled>Скоро · ${(p.price_cents / 100).toFixed(2)}</button>
              ) : (
                <button className={have ? "" : "primary"} disabled={have || busy !== null} onClick={() => install(p)}>
                  {have ? "Установлен" : busy === p.id ? "Устанавливаю…" : "Установить"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="status bad">{error}</p>}
    </>
  );
}
