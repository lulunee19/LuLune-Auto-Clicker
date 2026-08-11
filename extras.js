const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const GAME_PRESETS = [
  {
    name: 'Minecraft PVP',
    settings: { cps: 12, mouseButton: 'left', speedRandomization: { enabled: true, percent: 12 }, hotkey: 'F6', dutyCycle: 0 }
  },
  {
    name: 'Cookie Clicker',
    settings: { cps: 40, mouseButton: 'left', speedRandomization: { enabled: false, percent: 0 }, hotkey: 'F6', dutyCycle: 0 }
  },
  {
    name: 'Idle / AFK',
    settings: { cps: 5, mouseButton: 'left', speedRandomization: { enabled: true, percent: 25 }, hotkey: 'F6', dutyCycle: 0 }
  },
  {
    name: 'Burst 60 CPS',
    settings: { cps: 60, mouseButton: 'left', speedRandomization: { enabled: false, percent: 0 }, hotkey: 'F6', dutyCycle: 0, limits: { enabled: true, mode: 'click', clicks: 120, timeSeconds: 60 } }
  }
];

const CHANGELOG = [
  {
    v: '1.4.1',
    title: 'UI polish, Discord Presence, opacity, and builds',
    items: [
      'Interface opacity (10% → 100%): panels, title bar, and status bar become truly translucent so your background shows through.',
      'Colors from image fixed: a gray photo tints the whole UI gray (including the Start button and borders) — no more hard-coded green sticking around.',
      'Custom color: circle / hue / hex to force an accent color that overrides the theme and image.',
      'Discord Rich Presence clarified: Client ID alone in the UI, logo asset named "logo", buttons to open the Developer Portal and logo file; the "Playing LuLuneAutoClicker" title is set in the Discord portal.',
      'Safe hotkey capture: while you choose a new key, F6 / Panic / Pause / macros are disabled (Esc cancels).',
      'Compact window only on the AutoClick view (mouse icon); other tabs return to the large layout.',
      'AutoClick icon = mouse (no more Clippy paperclip); macros = clear list icon.',
      'Hotkey hints by OS: Windows shows Ctrl, macOS shows Cmd, Linux shows Ctrl — no mixed Windows/Linux/macOS line.',
      'Usage stats realigned (label / value list) and clicks/day chart rebuilt as HTML bars (no more clipped / broken canvas tile).',
      'Maintenance / Appearance buttons restyled (no more system-white "Open folder", "Check", "Remove" buttons).',
      'Macros: 4-step tutorial + ▶ Play button; clear message when there is no hotkey.',
      'Settings sidebar: tabs no longer crush each other (correct scroll, community card removed from the column).'
    ]
  },
  {
    v: '1.4.0',
    title: 'Advanced engine, Discord RPC, backups, and i18n',
    items: [
      'CPS ramp: start slow then automatically climb to a target CPS over N seconds (great for PVP / idle warm-up).',
      'Burst mode: N fast clicks then a pause, looping — perfect for controlled salvos.',
      'Pixel color filter: the clicker only clicks if the color under the cursor matches (sample + tolerance).',
      'Cursor failsafe: automatic stop if the mouse stops moving for N seconds.',
      'Session timer: stop after X minutes so you do not click all night.',
      'High CPS confirmation: dialog before starting above a threshold (e.g. 100 CPS).',
      'System hotkeys Panic (F12) and Pause (F7), configurable — independent of presets.',
      'Repositionable overlay (4 corners) + opacity; hidden while paused if the option is on.',
      'Minimal UI mode: keeps the essentials (start / CPS / hotkey) for an ultra-light window.',
      'FR / EN language across the main UI labels.',
      'Discord Rich Presence: shows Idle or Clicking · CPS on your profile (requires a Discord application Client ID).',
      'Goals: daily and/or session clicks with progress bar and notification.',
      'Multiple backups (slots): several full configs saved / reloaded without overwriting the current one.',
      'Sound volume, auto-minimize window when clicking starts, overlay hidden while paused.'
    ]
  },
  {
    v: '1.3.0',
    title: 'Major update — control, style, and safety',
    items: [
      'Live CPS: real-time counter in the app and status bar so you see exact click speed.',
      'ON · CPS overlay badge: small discreet floating indicator while the clicker runs (can be disabled in Appearance).',
      'Real Hold mode: hold the hotkey to click, release to stop (via uiohook, not just a toggle).',
      'Drawable stop zones: drag a rectangle on screen, Enter to confirm, Esc to cancel — ideal in-game.',
      'Corner / edge stop better explained: adjustable sizes for each corner and each screen edge.',
      'Process list: whitelist or blacklist based on the foreground app (e.g. minecraft, chrome).',
      'Ready-to-use game presets: Minecraft PVP, Cookie Clicker, Idle/AFK, Burst 60 CPS.',
      'Import / export of presets and macros (JSON files), plus base64 macro sharing via the clipboard.',
      'Macro sequences: type several keys at once (e.g. a b enter f2) to build a combo.',
      'Green / Blue / Red / Light themes: background, orbs, and accents truly follow the chosen theme.',
      'Background image: "Choose an image…" button, preview, visibility / transparency / panel blur sliders.',
      'Colors from image: UI accents (buttons, glows, borders) automatically adapt to your background palette (Appearance option).',
      'Optional sounds when the clicker starts and stops.',
      'Light anti-detection: small interval jitter + tiny mouse offset (optional).',
      'First-launch tutorial + detailed version history in Settings → Changelog.',
      '14-day click chart and richer stats (live CPS, sessions, total time).',
      'Discord LuLune0193: button to copy the username (no Ko-fi).',
      'Check for updates: opens the project GitHub from the app.',
      'Wider window and fixed scrolling so Zones, Points, and Settings show all content.'
    ]
  },
  {
    v: '1.2.0',
    title: 'Animated UI and combos',
    items: [
      'Animated interface (orbs, transitions, community card).',
      'Multi-key hotkeys (e.g. Shift+F, Ctrl+1).',
      'Layout fix that was clipping the bottom of some views.',
      'HTML download page for Windows, macOS, and Linux.'
    ]
  },
  {
    v: '1.1.0',
    title: 'Reliable click engine',
    items: [
      'Fixed CPS capped around ~25 (nut-js / libnut delays set to zero).',
      'Correct left clicks (mouse button migration + duty cycle).',
      'F8 / Shift+F8 / F9 macros with step playback.',
      'Windows, macOS, and Linux compatibility.'
    ]
  }
];

function placeOverlayWindow(win, position) {
  if (!win || win.isDestroyed()) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const ww = 190, wh = 48, m = 16;
  const map = {
    'top-right': [Math.max(m, width - ww - m), m],
    'top-left': [m, m],
    'bottom-right': [Math.max(m, width - ww - m), Math.max(m, height - wh - m)],
    'bottom-left': [m, Math.max(m, height - wh - m)]
  };
  const [x, y] = map[position] || map['top-right'];
  win.setPosition(Math.round(x), Math.round(y));
}

function createOverlayController(appPath) {
  let win = null;
  let lastPosition = 'top-right';
  return {
    show(enabled, opts = {}) {
      if (!enabled) { this.hide(); return; }
      if (opts.position) lastPosition = opts.position;
      if (win && !win.isDestroyed()) {
        placeOverlayWindow(win, lastPosition);
        win.showInactive();
        if (opts.opacity != null) this.update({ opacity: opts.opacity });
        return;
      }
      win = new BrowserWindow({
        width: 190, height: 48, frame: false, transparent: true, resizable: false,
        alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setIgnoreMouseEvents(false);
      placeOverlayWindow(win, lastPosition);
      win.loadFile(path.join(appPath, 'overlay', 'overlay.html'));
      win.webContents.once('did-finish-load', () => {
        if (opts.opacity != null) this.update({ opacity: opts.opacity });
      });
    },
    update(payload) {
      if (win && !win.isDestroyed()) win.webContents.send('overlay-update', payload || {});
    },
    hide() {
      if (win && !win.isDestroyed()) win.close();
      win = null;
    }
  };
}

function openZoneDrawer(appPath) {
  return new Promise((resolve) => {
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x, y, width, height,
      frame: false, transparent: true, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, fullscreen: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(path.join(appPath, 'overlay', 'zone-draw.html'));
    win.setMenuBarVisibility(false);

    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };
    const onDone = (_e, rect) => done(rect);
    const onCancel = () => done(null);
    const cleanup = () => {
      ipcMain.removeListener('zone-draw-done', onDone);
      ipcMain.removeListener('zone-draw-cancel', onCancel);
      if (!win.isDestroyed()) win.close();
    };
    ipcMain.once('zone-draw-done', onDone);
    ipcMain.once('zone-draw-cancel', onCancel);
    win.on('closed', () => done(null));
  });
}

async function getForegroundApp() {
  try {
    if (process.platform === 'win32') {
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class F {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder t, int c);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$h = [F]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][F]::GetWindowText($h, $sb, $sb.Capacity)
$pidOut = 0
[void][F]::GetWindowThreadProcessId($h, [ref]$pidOut)
$p = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
Write-Output (($p.ProcessName) + "|" + ($sb.ToString()))
`;
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 2000 });
      const [name, title] = String(stdout || '').trim().split('|');
      return { name: (name || '').toLowerCase(), title: title || '' };
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'], { timeout: 2000 });
      return { name: String(stdout || '').trim().toLowerCase(), title: '' };
    }
    try {
      const { stdout: id } = await execFileAsync('xdotool', ['getactivewindow'], { timeout: 1500 });
      const { stdout: name } = await execFileAsync('xdotool', ['getwindowname', String(id).trim()], { timeout: 1500 });
      return { name: String(name || '').trim().toLowerCase(), title: String(name || '').trim() };
    } catch (_) {
      return { name: '', title: '' };
    }
  } catch (_) {
    return { name: '', title: '' };
  }
}

function pointInZone(px, py, z) {
  return px >= z.x && py >= z.y && px <= z.x + z.w && py <= z.y + z.h;
}

function checkSafetyStops(settings, cursor, displayBounds) {
  const { x, y } = cursor;
  const b = displayBounds;
  const cs = settings.stopZones?.cornerStop;
  if (cs?.enabled) {
    const [tl, tr, bl, br] = cs.sizes || [50, 50, 50, 50];
    if (x <= b.x + tl && y <= b.y + tl) return 'Top-left corner';
    if (x >= b.x + b.width - tr && y <= b.y + tr) return 'Top-right corner';
    if (x <= b.x + bl && y >= b.y + b.height - bl) return 'Bottom-left corner';
    if (x >= b.x + b.width - br && y >= b.y + b.height - br) return 'Bottom-right corner';
  }
  const es = settings.stopZones?.edgeStop;
  if (es?.enabled) {
    const [top, right, bottom, left] = es.sizes || [40, 40, 40, 40];
    if (y <= b.y + top) return 'Top edge';
    if (x >= b.x + b.width - right) return 'Right edge';
    if (y >= b.y + b.height - bottom) return 'Bottom edge';
    if (x <= b.x + left) return 'Left edge';
  }
  const cz = settings.stopZones?.customZones;
  if (cz?.enabled && Array.isArray(cz.zones)) {
    for (const z of cz.zones) {
      if (pointInZone(x, y, z)) return z.action === 'start' ? null : (z.name || 'Custom zone');
    }
  }
  return null;
}

function setupHoldHook({ getHotkeyParts, onDown, onUp, isHoldMode }) {
  let uIOhook = null;
  let UiohookKey = null;
  try {
    ({ uIOhook, UiohookKey } = require('uiohook-napi'));
  } catch (_) {
    return { start() {}, stop() {}, available: false };
  }

  const keyMap = {
    f1: UiohookKey.F1, f2: UiohookKey.F2, f3: UiohookKey.F3, f4: UiohookKey.F4,
    f5: UiohookKey.F5, f6: UiohookKey.F6, f7: UiohookKey.F7, f8: UiohookKey.F8,
    f9: UiohookKey.F9, f10: UiohookKey.F10, f11: UiohookKey.F11, f12: UiohookKey.F12,
    a: UiohookKey.A, b: UiohookKey.B, c: UiohookKey.C, d: UiohookKey.D, e: UiohookKey.E,
    f: UiohookKey.F, g: UiohookKey.G, h: UiohookKey.H, i: UiohookKey.I, j: UiohookKey.J,
    k: UiohookKey.K, l: UiohookKey.L, m: UiohookKey.M, n: UiohookKey.N, o: UiohookKey.O,
    p: UiohookKey.P, q: UiohookKey.Q, r: UiohookKey.R, s: UiohookKey.S, t: UiohookKey.T,
    u: UiohookKey.U, v: UiohookKey.V, w: UiohookKey.W, x: UiohookKey.X, y: UiohookKey.Y, z: UiohookKey.Z,
    '1': UiohookKey['1'], '2': UiohookKey['2'], '3': UiohookKey['3'], '4': UiohookKey['4'],
    '5': UiohookKey['5'], '6': UiohookKey['6'], '7': UiohookKey['7'], '8': UiohookKey['8'],
    '9': UiohookKey['9'], '0': UiohookKey['0'],
    space: UiohookKey.Space, escape: UiohookKey.Escape
  };

  let running = false;
  let pressed = false;

  function matches(e) {
    const parts = getHotkeyParts();
    if (!parts || !parts.key) return false;
    const code = keyMap[parts.key];
    if (code == null || e.keycode !== code) return false;
    if (!!parts.shift !== !!e.shiftKey) return false;
    if (!!parts.alt !== !!e.altKey) return false;
    if (!!parts.ctrl !== !!e.ctrlKey) return false;
    if (!!parts.meta !== !!e.metaKey) return false;
    return true;
  }

  const onKeyDown = (e) => {
    if (!isHoldMode()) return;
    if (!matches(e) || pressed) return;
    pressed = true;
    onDown();
  };
  const onKeyUp = (e) => {
    if (!isHoldMode()) return;
    if (!matches(e)) return;
    pressed = false;
    onUp();
  };

  return {
    available: true,
    start() {
      if (running) return;
      uIOhook.on('keydown', onKeyDown);
      uIOhook.on('keyup', onKeyUp);
      try { uIOhook.start(); running = true; } catch (_) {}
    },
    stop() {
      try {
        uIOhook.off('keydown', onKeyDown);
        uIOhook.off('keyup', onKeyUp);
        uIOhook.stop();
      } catch (_) {}
      running = false;
      pressed = false;
    }
  };
}

function parseHotkeyParts(str) {
  const parts = String(str || '').toLowerCase().split(/[+\-]/).map(s => s.trim()).filter(Boolean);
  const mods = new Set(parts.filter(p => ['ctrl', 'control', 'alt', 'option', 'shift', 'cmd', 'meta', 'command'].includes(p)));
  const key = parts.find(p => !mods.has(p)) || null;
  return {
    ctrl: mods.has('ctrl') || mods.has('control'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
    meta: mods.has('cmd') || mods.has('meta') || mods.has('command'),
    key
  };
}

module.exports = {
  GAME_PRESETS,
  CHANGELOG,
  createOverlayController,
  openZoneDrawer,
  getForegroundApp,
  checkSafetyStops,
  setupHoldHook,
  parseHotkeyParts
};
