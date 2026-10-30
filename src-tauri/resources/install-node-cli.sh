#!/bin/sh
# Installs Node.js (if needed) and an npm CLI into a private prefix — no admin password, no Homebrew.
# Usage: install-node-cli.sh <npm-package> [prefix]
set -eu

PACKAGE="${1:?usage: install-node-cli.sh <npm-package> [prefix]}"
PREFIX="${2:-$HOME/.local/familiar-node}"
NODE_LINE="latest-v24.x"

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "Неподдерживаемая система: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) echo "Неподдерживаемый процессор: $(uname -m)"; exit 1 ;;
esac

mkdir -p "$PREFIX"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ ! -x "$PREFIX/bin/node" ]; then
  echo "Скачиваю Node.js…"
  SUMS=$(curl -fsSL "https://nodejs.org/dist/$NODE_LINE/SHASUMS256.txt")
  FILE=$(printf '%s\n' "$SUMS" | grep -oE "node-v[0-9.]+-$OS-$ARCH\.tar\.gz" | head -1)
  [ -n "$FILE" ] || { echo "Не нашёл сборку Node.js для $OS-$ARCH"; exit 1; }
  curl -fsSL -o "$TMP/$FILE" "https://nodejs.org/dist/$NODE_LINE/$FILE"
  EXPECTED=$(printf '%s\n' "$SUMS" | grep " $FILE\$" | cut -d' ' -f1)
  if command -v shasum >/dev/null 2>&1; then ACTUAL=$(shasum -a 256 "$TMP/$FILE" | cut -d' ' -f1)
  else ACTUAL=$(sha256sum "$TMP/$FILE" | cut -d' ' -f1); fi
  [ "$EXPECTED" = "$ACTUAL" ] || { echo "Контрольная сумма Node.js не совпала — прерываю"; exit 1; }
  tar -xzf "$TMP/$FILE" -C "$PREFIX" --strip-components=1
  echo "Node.js $("$PREFIX/bin/node" --version) установлен"
fi

PATH="$PREFIX/bin:$PATH"
export PATH
echo "Устанавливаю ${PACKAGE}…"
npm install -g --prefix "$PREFIX" --no-fund --no-audit --loglevel=error "$PACKAGE"
echo "Готово ✓"
