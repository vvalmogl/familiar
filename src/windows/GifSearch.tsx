import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { buyPlus, PLUS_STARS, supabase, usePlus, useSession } from "../lib/account";

interface Gif {
  id: string;
  title: string;
  preview: string;
  url: string;
}

/** Search GIFs (KLIPY, through our gif-search function), pick several, hand local copies to the wizard. */
export default function GifSearch({ onCancel, onPicked }: { onCancel: () => void; onPicked: (files: string[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Gif[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [picked, setPicked] = useState<Gif[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = async (query: string, p: number) => {
    if (!supabase || !query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke<{ items: Gif[]; hasNext: boolean; error?: string }>("gif-search", {
        body: { q: query, page: p, locale: navigator.language.startsWith("ru") ? "ru" : "us" },
      });
      if (error || !data) {
        const body = await (error as { context?: Response })?.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? error?.message ?? "поиск не ответил");
      }
      setResults((r) => (p === 1 ? data.items : [...r, ...data.items.filter((g) => !r.some((x) => x.id === g.id))]));
      setHasNext(data.hasNext);
      setPage(p);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (g: Gif) =>
    setPicked((p) => (p.some((x) => x.id === g.id) ? p.filter((x) => x.id !== g.id) : [...p, g]));

  const next = async () => {
    setBusy(true);
    setError("");
    try {
      const files = await invoke<string[]>("download_gifs", { gifs: picked.map((g) => ({ url: g.url, title: g.title || q })) });
      onPicked(files);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const session = useSession();
  const plus = usePlus(session);

  if (!supabase) return <p className="muted">Поиск гифок недоступен в этой сборке.</p>;
  if (session === undefined || plus.until === undefined) return <p className="muted">Загрузка…</p>;
  if (!plus.until) return <Paywall signedIn={!!session} refresh={plus.refresh} onCancel={onCancel} />;

  return (
    <div className="gif-search">
      <form
        className="email-row"
        onSubmit={(e) => {
          e.preventDefault();
          search(q, 1);
        }}
      >
        <input autoFocus placeholder="Search KLIPY" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" type="submit" disabled={busy || !q.trim()}>Найти</button>
      </form>
      <p className="muted small">
        Аниме, фильмы, мемы, знаменитости — что угодно. Выбери несколько гифок: потом разложим их по настроениям. Персонаж
        останется только у тебя.
      </p>
      <div className="gif-grid">
        {results.map((g) => {
          const n = picked.findIndex((x) => x.id === g.id);
          return (
            <button key={g.id} className={`gif ${n >= 0 ? "on" : ""}`} onClick={() => toggle(g)} title={g.title}>
              <img src={g.preview} alt={g.title} loading="lazy" referrerPolicy="no-referrer" />
              {n >= 0 && <span className="badge">{n + 1}</span>}
            </button>
          );
        })}
      </div>
      {hasNext && (
        <button disabled={busy} onClick={() => search(q, page + 1)}>
          Ещё
        </button>
      )}
      {busy && <p className="muted">Загрузка…</p>}
      {error && <p className="status bad">{error}</p>}
      <div className="gif-foot">
        <span className="muted small">Powered by KLIPY</span>
        <div className="presets">
          <button onClick={onCancel}>Отмена</button>
          <button className="primary" disabled={busy || picked.length === 0} onClick={next}>
            Дальше{picked.length ? ` (${picked.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown instead of the search until the account has Familiar Plus. Own GIFs stay free. */
function Paywall({ signedIn, refresh, onCancel }: { signedIn: boolean; refresh: () => Promise<void>; onCancel: () => void }) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");

  // After the checkout opens in Telegram, pick up the payment as soon as the webhook records it.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(refresh, 3000);
    const stop = setTimeout(() => setWaiting(false), 10 * 60_000);
    return () => (clearInterval(t), clearTimeout(stop));
  }, [waiting, refresh]);

  const buy = async () => {
    setError("");
    try {
      await buyPlus();
      setWaiting(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  return (
    <div className="paywall">
      <h3>Familiar Plus</h3>
      <p>Поиск гифок по всему интернету: аниме, фильмы, мемы, знаменитости. Нашёл, выбрал несколько, и персонаж готов.</p>
      <ul className="muted">
        <li>Миллионы гифок прямо в приложении</li>
        <li>Сколько угодно своих персонажей</li>
        <li>Отменить можно в любой момент в Telegram</li>
      </ul>
      <p className="muted small">Свои гифки с компьютера добавляются бесплатно, без подписки.</p>
      {signedIn ? (
        <button className="primary" onClick={buy}>
          Оформить за {PLUS_STARS} ⭐ в месяц
        </button>
      ) : (
        <p className="status">Сначала войди в разделе «Аккаунт»: подписка привязывается к нему.</p>
      )}
      {waiting && <p className="muted">Оплата открыта в Telegram. Как только пройдёт, поиск откроется сам.</p>}
      {error && <p className="status bad">{error}</p>}
      <div className="presets">
        <button onClick={onCancel}>Назад</button>
        {waiting && <button onClick={refresh}>Я оплатил</button>}
      </div>
    </div>
  );
}
