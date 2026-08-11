#!/bin/bash
cd "$(dirname "$0")"

APP=""
if [ -d "LuLuneAutoClicker.app" ]; then
  APP="LuLuneAutoClicker.app"
else
  APP="$(ls -d *.app 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "Application .app introuvable dans: $(pwd)"
  echo "Dézippez l'archive macOS complète, puis double-cliquez Open-macOS.command."
  read -r _
  exit 1
fi

# Retire la quarantaine Gatekeeper (équivalent SmartScreen)
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
chmod -R u+rX "$APP" 2>/dev/null || true

echo "Ouverture de $APP…"
echo "Si les clics ne marchent pas: Réglages → Confidentialité → Accessibilité → autorisez LuLune AutoClicker."
open "$APP"
