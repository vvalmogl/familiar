import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { buyPlus, enabledProviders, handleAuthCallback, PLUS_STARS, signInWith, signInWithEmail, signOut, supabase, usePlus, useSession } from "../lib/account";
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
  const [providers, setProviders] = useState<Set<string> | null>(null);
  useEffect(() => {
    enabledProviders().then(setProviders, () => setProviders(new Set(["github"])));
  }, []);
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
    const name = u.user_metadata?.full_name ?? u.user_metadata?.user_name ?? u.email ?? "";
    const avatar = u.user_metadata?.avatar_url as string | undefined;
    const via = u.app_metadata?.provider === "github" ? "GitHub" : u.app_metadata?.provider === "google" ? "Google" : "почту";
    return (
      <div className="signin">
        <div className="profile">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <b>{name}</b>
            <div className="muted small">{u.email && u.email !== name ? `${u.email} · ` : ""}вход через {via}</div>
          </div>
          <button onClick={() => run(signOut)}>Выйти</button>
        </div>
        <p className="status ok">● Настройки синхронизируются: тема, нейросеть, персонажи</p>
        <PlusStatus />
        {syncStatus && <p className="muted">{syncStatus}</p>}
        {error && <p className="status bad">{error}</p>}
      </div>
    );
  }

  return (
    <div className="signin">
      <div className="signin-head">
        <h3>Вход в Familiar</h3>
        <p className="muted">Необязательно. С аккаунтом тема, нейросеть и персонажи переезжают на другие компьютеры.</p>
      </div>
      {providers === null ? (
        <p className="muted">Загрузка…</p>
      ) : (
        providers.size > 0 && (
          <div className="oauth">
            {providers.has("google") && (
              <button className="oauth-btn google" onClick={() => run(() => signInWith("google"))}>
                <GoogleIcon /> Продолжить с Google
              </button>
            )}
            {providers.has("github") && (
              <button className="oauth-btn github" onClick={() => run(() => signInWith("github"))}>
                <GitHubIcon /> Продолжить с GitHub
              </button>
            )}
          </div>
        )
      )}
      <div className="divider"><span>или по почте</span></div>
      {sent ? (
        <p className="status ok">Письмо отправлено на {email.trim()}. Открой ссылку из него на этом компьютере.</p>
      ) : (
        <form
          className="email-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes("@")) run(async () => { await signInWithEmail(email.trim()); setSent(true); });
          }}
        >
          <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary" type="submit" disabled={!email.includes("@")}>Получить ссылку</button>
        </form>
      )}
      {(error || authError) && <p className="status bad">{error || authError}</p>}
      <p className="muted small">Пароль не нужен. Мы храним только почту и настройки — без вопросов к нейросети.</p>
    </div>
  );
}

/** Familiar Plus line under the profile: active until …, or a button to subscribe. */
function PlusStatus() {
  const plus = usePlus(useSession());
  const [error, setError] = useState("");
  if (plus.until === undefined) return null;
  if (plus.until)
    return (
      <p className="status ok">
        ★ Familiar Plus до {plus.until.toLocaleDateString("ru-RU")}. Отменить: Telegram → Настройки → Мои звёзды
      </p>
    );
  return (
    <div className="plus-offer">
      <span>
        <b>Familiar Plus</b> <span className="muted">— поиск гифок по всему интернету, {PLUS_STARS} ⭐ в месяц</span>
      </span>
      <button className="primary" onClick={() => buyPlus().catch((e) => setError(String(e.message ?? e)))}>
        Оформить
      </button>
      {error && <p className="status bad">{error}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
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
