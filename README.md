# LuLune AutoClicker

Cross-platform Electron autoclicker (**Windows · macOS · Linux**) — live CPS, macros, drawable stop zones, themes, Discord `LuLune0193`.

## Important paths

| What | Path |
|------|------|
| **Source project** | `C:\Users\Victor\Projects\LuLuneAutoClicker` |
| Main code | `main.js`, `preload.js`, `extras.js` |
| UI | `renderer\index.html`, `renderer\renderer.js`, `renderer\style.css` |
| Overlays | `overlay\overlay.html`, `overlay\zone-draw.html` |
| Launchers | `scripts\Launch-Windows.bat`, `scripts\Open-macOS.command`, `scripts\Launch-Linux.sh` |
| Packaging | `scripts\postpackage.js`, `scripts\zip-downloads.js` |
| Download page | `website\index.html`, `website\styles.css` |
| Site zips | `website\downloads\` |
| **Windows build** | `C:\Users\Victor\Downloads\LuLuneAutoClicker-Windows\LuLuneAutoClicker-win32-x64\LuLuneAutoClicker.exe` |
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

Outputs: `dist/`, then zips in `website/downloads/`.

### Platform notes

- **Windows**: `Launch-Windows.vbs` (recommended) or `LuLuneAutoClicker.exe`. SmartScreen may warn on first run.
- **macOS**: `Open-macOS.command` + Accessibility permission in System Settings.
- **Linux**: `./Launch-Linux.sh` · **X11** session recommended (Wayland may block synthetic clicks).

## Website

Open `website/index.html` in a browser, or serve the `website/` folder.

## Discord

**LuLune0193**

## License

MIT
