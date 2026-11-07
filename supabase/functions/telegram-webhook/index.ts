// Telegram bot webhook: approves Stars checkouts and records Familiar Plus payments, renewals and refunds.
// Registered with setWebhook(secret_token=TELEGRAM_WEBHOOK_SECRET); anything without that header is dropped.
import { admin, PAYLOAD_PREFIX, PLUS_STARS } from "../_shared/plus.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const userFrom = (payload: unknown) => {
  if (typeof payload !== "string" || !payload.startsWith(PAYLOAD_PREFIX)) return null;
  const id = payload.slice(PAYLOAD_PREFIX.length);
  return UUID.test(id) ? id : null;
};

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const tg = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

Deno.serve(async (req) => {
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || !sameSecret(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => null);
  if (!update) return new Response("ok");
  const db = admin();

  // Must be answered within 10 s, or the payment fails.
  const q = update.pre_checkout_query;
  if (q) {
    const userId = userFrom(q.invoice_payload);
    const ok = !!userId && q.currency === "XTR" && q.total_amount === PLUS_STARS &&
      !!(await db.auth.admin.getUserById(userId)).data.user;
    await tg("answerPreCheckoutQuery", ok
      ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел. Открой оплату заново из Familiar." });
    return new Response("ok");
  }

  const msg = update.message;
  const paid = msg?.successful_payment;
  if (paid) {
    const userId = userFrom(paid.invoice_payload);
    if (!userId || paid.currency !== "XTR") return new Response("ok");
    const { error: dup } = await db.from("payments").insert({
      charge_id: paid.telegram_payment_charge_id,
      user_id: userId,
      telegram_user_id: msg.from.id,
      stars: paid.total_amount,
      recurring: !!paid.is_recurring,
    });
    if (dup) return new Response("ok"); // already recorded (Telegram retried the update)
    const expires = paid.subscription_expiration_date
      ? new Date(paid.subscription_expiration_date * 1000)
      : new Date(Date.now() + 30 * 86400_000);
    await db.from("subscriptions").upsert({
      user_id: userId,
      expires_at: expires.toISOString(),
      telegram_user_id: msg.from.id,
      last_charge_id: paid.telegram_payment_charge_id,
      updated_at: new Date().toISOString(),
    });
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: `Готово! Familiar Plus активен до ${expires.toLocaleDateString("ru-RU")}. Возвращайся в приложение — поиск гифок уже открыт.`,
    });
    return new Response("ok");
  }

  const refund = msg?.refunded_payment;
  if (refund) {
    const { data } = await db.from("payments").update({ refunded: true })
      .eq("charge_id", refund.telegram_payment_charge_id).select("user_id").maybeSingle();
    if (data) {
      await db.from("subscriptions").update({ expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", data.user_id).eq("last_charge_id", refund.telegram_payment_charge_id);
    }
    return new Response("ok");
  }

  if (typeof msg?.text === "string" && msg.text.startsWith("/start")) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: "Привет! Это бот оплаты Familiar.\nПодписка Familiar Plus оформляется из приложения: Настройки → Персонаж → «Найти гифки в интернете».\nОтменить подписку: Настройки Telegram → Мои звёзды.\nСкачать Familiar: https://familiar.roadmapcli.me",
    });
  }
  return new Response("ok");
});
