// Creates a Telegram Stars subscription link for the signed-in user. POST → { url, stars }
import { caller, cors, json, PAYLOAD_PREFIX, PLUS_STARS } from "../_shared/plus.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const user = await caller(req);
  if (!user) return json({ error: "сначала войди в аккаунт" }, 401);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json({ error: "оплата ещё не настроена" }, 503);

  const r = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Familiar Plus",
      description: "Поиск гифок по всему интернету для своих персонажей. Отменить можно в любой момент в Telegram.",
      // The webhook maps the payment back to this account.
      payload: PAYLOAD_PREFIX + user.id,
      currency: "XTR",
      prices: [{ label: "Familiar Plus, месяц", amount: PLUS_STARS }],
      subscription_period: 2592000,
    }),
  });
  const data = await r.json().catch(() => null);
  if (!data?.ok) return json({ error: "Telegram не создал счёт, попробуй позже" }, 502);
  return json({ url: data.result, stars: PLUS_STARS });
});
