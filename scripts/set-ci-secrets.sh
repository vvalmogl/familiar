#!/bin/sh
# Copy the build secrets GitHub Actions needs from .env and ~/.tauri into the repo's Actions secrets.
set -e
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
REPO=vvalmogl/familiar
gh secret set VITE_SUPABASE_URL -R "$REPO" --body "$VITE_SUPABASE_URL"
gh secret set VITE_SUPABASE_ANON_KEY -R "$REPO" --body "$VITE_SUPABASE_ANON_KEY"
gh secret set TAURI_SIGNING_PRIVATE_KEY -R "$REPO" < "$HOME/.tauri/familiar.key"
gh secret list -R "$REPO"
