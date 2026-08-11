# LuLune AutoClicker

Autoclicker Electron multiplateforme (**Windows · macOS · Linux**) — CPS live, macros, zones dessinables, thèmes, Discord `LuLune0193`.

## Emplacements importants

| Quoi | Chemin |
|------|--------|
| **Projet source** | `C:\Users\Victor\Projects\LuLuneAutoClicker` |
| Code principal | `main.js`, `preload.js`, `extras.js` |
| Interface | `renderer\index.html`, `renderer\renderer.js`, `renderer\style.css` |
| Overlays | `overlay\overlay.html`, `overlay\zone-draw.html` |
| Lanceurs | `scripts\Launch-Windows.bat`, `scripts\Open-macOS.command`, `scripts\Launch-Linux.sh` |
| Packaging | `scripts\postpackage.js`, `scripts\zip-downloads.js` |
| Page téléchargement | `website\index.html`, `website\styles.css` |
| Zips site | `website\downloads\` |
| **Exe Windows prêt** | `C:\Users\Victor\Downloads\LuLuneAutoClicker-Windows\LuLuneAutoClicker-win32-x64\LuLuneAutoClicker.exe` |
| App packagée (resources) | `...\LuLuneAutoClicker-win32-x64\resources\app\` |
| Réglages utilisateur | `%APPDATA%\lulune-autoclicker\` (Windows) · `~/Library/Application Support/lulune-autoclicker/` (macOS) · `~/.config/lulune-autoclicker/` (Linux) |

## Dev

```bash
npm install
npm start
```

## Builds (sur chaque OS)

Les modules natifs (`libnut`, `uiohook-napi`) doivent être compilés **sur la machine cible**.  
Ne pas cross-compiler macOS/Linux depuis Windows.

```bash
# Windows
npm run package:win
npm run zip:downloads

# macOS (Intel)
npm run package:mac
npm run zip:downloads

# macOS (Apple Silicon)
npm run package:mac:arm64
npm run zip:downloads

# Linux
npm run package:linux
npm run zip:downloads
```

Sorties : `dist/` puis zips dans `website/downloads/`.

### Notes plateforme

- **Windows** : `Launch-Windows.bat` (Unblock-File / SmartScreen).
- **macOS** : `Open-macOS.command` + Accessibilité dans Réglages.
- **Linux** : `./Launch-Linux.sh` · session **X11** recommandée (Wayland peut bloquer les clics).

## Page HTML

Ouvrir `website/index.html` dans un navigateur, ou servir le dossier `website/`.

## Discord

**LuLune0193**
