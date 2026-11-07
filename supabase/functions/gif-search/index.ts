// GIF search for the character wizard (Familiar Plus), proxied so the KLIPY key never ships in the app.
// POST { "q": "...", "page": 1, "locale": "ru" } → { items: [{ id, title, preview, url, width, height }], hasNext }
// 401 → not signed in, 402 → no active subscription.
import { caller, cors, hasPlus, json } from "../_shared/plus.ts";

type Media = { url: string; width: number; height: number; size?: number };
type Sizes = Partial<Record<"gif" | "webp" | "jpg" | "mp4" | "webm", Media>>;
type Item = { id: number | string; slug?: string; title?: string; file?: Partial<Record<"hd" | "md" | "sm" | "xs", Sizes>> };

// Best-effort per-user limit (per function instance) so one subscriber can't burn the shared KLIPY quota.
const WINDOW_MS = 60_000;
const PER_WINDOW = 20;
const hits = new Map<string, number[]>();
// Instance-wide budget: bounds KLIPY usage across all subscribers.
const GLOBAL_PER_WINDOW = 300;
let globalHits: number[] = [];
function limited(who: string): boolean {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.delete(who); // re-insert so Map order stays least-recently-used first
  hits.set(who, recent);
  if (hits.size > 10_000) hits.delete(hits.keys().next().value!); // evict the stalest client only
  if (recent.length > PER_WINDOW) return true; // over its own limit: don't spend the shared budget
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  if (globalHits.length >= GLOBAL_PER_WINDOW) return true;
  globalHits.push(now);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await caller(req);
  if (!user) return json({ error: "войди в аккаунт, чтобы искать гифки" }, 401);
  if (!(await hasPlus(user.id))) return json({ error: "поиск гифок входит в Familiar Plus" }, 402);
  if (limited(user.id)) return json({ error: "слишком много запросов, попробуй через минуту" }, 429);
  const key = Deno.env.get("KLIPY_KEY");
  if (!key) return json({ error: "поиск гифок ещё не настроен" }, 503);

  const body = await req.json().catch(() => ({}));
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 100) : "";
  const page = Number.isInteger(body.page) && body.page > 0 && body.page < 50 ? body.page : 1;
  const locale = typeof body.locale === "string" && /^[a-z]{2}$/.test(body.locale) ? body.locale : "us";
  if (!q) return json({ error: "пустой запрос" }, 400);

  const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/search`);
  url.search = new URLSearchParams({ q, page: String(page), per_page: "24", locale, content_filter: "medium", format_filter: "gif,webp" }).toString();
  const r = await fetch(url);
  if (r.status === 429) return json({ error: "слишком много запросов, попробуй через минуту" }, 429);
  if (!r.ok) return json({ error: `KLIPY ответил ${r.status}` }, 502);
  const data = await r.json();
  const list: Item[] = data?.data?.data ?? [];
  const items = list
    .map((it) => {
      const full = it.file?.md?.gif ?? it.file?.hd?.gif ?? it.file?.sm?.gif;
      const preview = it.file?.sm?.webp ?? it.file?.sm?.gif ?? it.file?.xs?.gif ?? full;
      if (!full?.url || !preview?.url) return null;
      return { id: String(it.id), title: it.title ?? it.slug ?? "", preview: preview.url, url: full.url, width: full.width, height: full.height };
    })
    .filter(Boolean);
  return json({ items, hasNext: Boolean(data?.data?.has_next) });
});
