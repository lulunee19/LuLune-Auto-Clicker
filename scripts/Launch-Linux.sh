#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

BIN=""
if [ -x "./LuLuneAutoClicker" ]; then
  BIN="./LuLuneAutoClicker"
elif [ -f "./LuLuneAutoClicker" ]; then
  chmod +x "./LuLuneAutoClicker" || true
  BIN="./LuLuneAutoClicker"
else
  echo "Binaire LuLuneAutoClicker introuvable dans: $(pwd)"
  echo "Dézippez complètement l'archive puis relancez ce script."
  exit 1
fi

chmod +x "$BIN" 2>/dev/null || true
# Chromium helpers sometimes lose +x after unzip
find . -maxdepth 2 -type f \( -name 'chrome-sandbox' -o -name 'chrome_crashpad_handler' \) -exec chmod +x {} \; 2>/dev/null || true

# Wayland casse souvent les clics synthétiques → préfère X11 / XWayland
export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-x11}"

if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  echo "Aucun affichage graphique détecté (DISPLAY / WAYLAND_DISPLAY)."
  echo "Lancez depuis une session bureau."
  exit 1
fi

echo "LuLune AutoClicker (Linux)…"
echo "Astuce: sous Wayland, une session X11 est recommandée pour les clics."
exec "$BIN" "$@"
