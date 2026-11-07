#!/usr/bin/env bash
# Familiar Plus: pushes the DB migration, sets function secrets from .env, deploys the functions
# and points the Telegram bot's webhook at telegram-webhook. Secrets are never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${TELEGRAM_BOT_TOKEN:?add TELEGRAM_BOT_TOKEN=... to .env (from @BotFather)}"
REF=nzqwizsgilivbpadawdg
WEBHOOK_SECRET=$(openssl rand -hex 32)

supabase db push --linked
args=(TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="$WEBHOOK_SECRET")
[ -n "${KLIPY_KEY:-}" ] && args+=(KLIPY_KEY="$KLIPY_KEY")
supabase secrets set --project-ref "$REF" "${args[@]}" >/dev/null
supabase functions deploy gif-search subscribe telegram-webhook --project-ref "$REF"

curl -fsS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url="https://$REF.supabase.co/functions/v1/telegram-webhook" \
  -d secret_token="$WEBHOOK_SECRET" \
  --data-urlencode 'allowed_updates=["message","pre_checkout_query"]' >/dev/null
echo "Готово: подписка подключена."
