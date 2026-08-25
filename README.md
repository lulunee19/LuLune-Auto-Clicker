# LuLune AutoClicker

Cross-platform Electron autoclicker (**Windows · macOS · Linux**) — live CPS, macros, drawable stop zones, Discord-style wallpaper, Discord `LuLune0193`.

**[Download Windows Setup](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-Setup.exe)** · [All releases](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest) · [Website](https://lulunee19.github.io/LuLune-Auto-Clicker/)

## Install

| OS | Installer |
|----|-----------|
| **Windows 10/11** | [**LuLuneAutoClicker-Setup.exe**](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-Setup.exe) — run it, then open the app from the desktop / Start menu. SmartScreen: More info → Run anyway. |
| **macOS (Apple Silicon)** | [LuLuneAutoClicker-macOS-arm64.dmg](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-macOS-arm64.dmg) |
| **macOS (Intel)** | [LuLuneAutoClicker-macOS-x64.dmg](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-macOS-x64.dmg) |
| **Linux** | [LuLuneAutoClicker-Linux.AppImage](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-Linux.AppImage) |

ZIP fallbacks (portable, no installer): [Windows](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-Windows.zip) · [macOS](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-macOS.zip) · [Linux](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest/download/LuLuneAutoClicker-Linux.zip)

On macOS, right-click → Open the first time (unsigned) and allow **Accessibility**. On Linux, prefer an **X11** session.

## Important paths

| What | Path |
|------|------|
| **Source project** | `%USERPROFILE%\Projects\LuLuneAutoClicker` |
| Main code | `main.js`, `preload.js`, `extras.js` |
| UI | `renderer\index.html`, `renderer\renderer.js`, `renderer\style.css` |
| Overlays | `overlay\overlay.html`, `overlay\zone-draw.html` |
| Launchers | `scripts\Launch-Windows.bat`, `scripts\Open-macOS.command`, `scripts\Launch-Linux.sh` |
| Packaging | `scripts\postpackage.js`, `scripts\copy-setup.js`, `scripts\zip-downloads.js` |
| Download page | `website\index.html`, `website\styles.css` |
| **Windows installed app** | `%LOCALAPPDATA%\Programs\LuLune AutoClicker\` |
| User data | `%APPDATA%\lulune-autoclicker\` (Windows) · `~/Library/Application Support/lulune-autoclicker/` (macOS) · `~/.config/lulune-autoclicker/` (Linux) |

## Development

```bash
npm install
npm start
```

## Builds (on each OS)

Native modules (`libnut`, `uiohook-napi`) must be built **on the target machine**.  
Do not cross-compile macOS/Linux from Windows.

```bash
# Windows installer + zip
npm run dist:win

# macOS DMG + zip
npm run dist:mac

# Linux AppImage + zip
npm run dist:linux
```

Outputs: `release/` (`LuLuneAutoClicker-Setup.exe`, `.dmg`, `.AppImage`, zips). GitHub Actions attaches them to [Releases](https://github.com/lulunee19/LuLune-Auto-Clicker/releases/latest).

## Discord

**LuLune0193**

## License

MIT
