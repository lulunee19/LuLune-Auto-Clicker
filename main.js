const { app, BrowserWindow, ipcMain, globalShortcut, screen, dialog, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const {
  GAME_PRESETS,
  CHANGELOG,
  createOverlayController,
  openZoneDrawer,
  getForegroundApp,
  checkSafetyStops,
  setupHoldHook,
  parseHotkeyParts
} = require('./extras');
const { t } = require('./i18n');
const { createDiscordRpcController } = require('./discordRpc');

const WINDOW_WIDTH = 920;
const WINDOW_HEIGHT = 760;
const WINDOW_COMPACT = { width: 800, height: 620 };
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const APP_VERSION = require('./package.json').version;
const LATEST_VERSION = APP_VERSION;
const GITHUB_URL = 'https://github.com/lulunee19/LuLune-Auto-Clicker';

app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
  // Wayland often breaks synthetic mouse/keyboard — prefer X11 / XWayland
  if (!process.env.ELECTRON_OZONE_PLATFORM_HINT) {
    app.commandLine.appendSwitch('ozone-platform-hint', 'x11');
  }
}
if (IS_MAC) {
  // Helps some input / focus edge cases with global shortcuts
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

let mouse, keyboard, Button, Key, Point, libnut;
let nutAvailable = true;

function loadLibnut() {
  const candidates = [];
  if (IS_WIN) candidates.push('@nut-tree-fork/libnut-win32');
  else if (IS_MAC) candidates.push('@nut-tree-fork/libnut-darwin');
  else candidates.push('@nut-tree-fork/libnut-linux');
  candidates.push('@nut-tree-fork/libnut');

  for (const mod of candidates) {
    try {
      const loaded = require(mod);
      return loaded.libnut || loaded;
    } catch (_) { /* try next */ }
  }
  return null;
}

try {
  const nut = require('@nut-tree-fork/nut-js');
  mouse = nut.mouse;
  keyboard = nut.keyboard;
  Button = nut.Button;
  Key = nut.Key;
  Point = nut.Point;
  nut.mouse.config.mouseSpeed = 4000;
  nut.mouse.config.autoDelayMs = 0;
  nut.keyboard.config.autoDelayMs = 0;

  libnut = loadLibnut();
  if (!libnut) throw new Error('libnut native module not found for ' + process.platform);
  if (typeof libnut.setMouseDelay === 'function') libnut.setMouseDelay(0);
  if (typeof libnut.setKeyboardDelay === 'function') libnut.setKeyboardDelay(0);
} catch (e) {
  nutAvailable = false;
  console.error('nut-js unavailable, running in simulation mode:', e.message);
}

/** Normalize UI / legacy values to libnut button names. */
function mouseBtnName() {
  const raw = String(settings?.mouseButton ?? 'left').toLowerCase().trim();
  if (raw === 'right' || raw === 'droit' || raw === 'droite' || raw === '2') return 'right';
  if (raw === 'middle' || raw === 'milieu' || raw === 'center' || raw === '3') return 'middle';
  return 'left';
}

const USER_DATA = app.getPath('userData');
const SETTINGS_FILE = path.join(USER_DATA, 'settings.json');
const PRESETS_FILE = path.join(USER_DATA, 'presets.json');
const MACROS_FILE = path.join(USER_DATA, 'macros.json');
const STATS_FILE = path.join(USER_DATA, 'stats.json');
const SLOTS_FILE = path.join(USER_DATA, 'settings-slots.json');

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { return fallback; }
}
function saveJSON(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) { console.error(e); }
}

const DEFAULT_SETTINGS = {
  cps: 60,
  rateUnit: 'second',
  rateMode: 'rate',
  intervalMs: 17,
  hotkey: 'F6',
  hotkeyMode: 'toggle',
  clickerType: 'mouse',
  keyboardKey: 'space',
  mouseButton: 'left',
  doubleClick: false,
  dutyCycle: 0,
  language: 'en',
  speedRandomization: { enabled: false, percent: 0 },
  limits: { enabled: false, mode: 'click', clicks: 1000, timeSeconds: 60 },
  maxCps: 1000,
  cpsProfile: { enabled: false, fromCps: 10, toCps: 60, rampSeconds: 30 },
  burst: { enabled: false, clicks: 5, pauseMs: 200 },
  pixelClick: { enabled: false, r: 255, g: 255, b: 255, tolerance: 30 },
  failsafe: { enabled: false, idleSeconds: 10 },
  sessionTimer: { enabled: false, minutes: 30 },
  hotkeys: { panic: 'F12', pause: 'F7' },
  confirmHighCps: { enabled: true, threshold: 100 },
  discordRpc: {
    enabled: false,
    clientId: '',
    largeImageKey: 'logo',
    websiteUrl: ''
  },
  goals: { enabled: false, dailyClicks: 10000, sessionClicks: 0 },
  behavior: {
    alwaysOnTop: false,
    stopHitboxOverlay: true,
    stopReasonAlert: true,
    strictHotkeyModifiers: false,
    stopOnAltTab: true,
    extendedClickSpeedLimit: false,
    hideOverlayWhenPaused: true
  },
  clickPointsDefaults: { clicks: 1, radius: 0 },
  startup: { minimizeToTray: false, rememberWindowPosition: true, runOnStartup: false, tutorialSeen: false },
  appearance: {
    mode: 'global',
    backgroundImage: '',
    backgroundOpacity: 100,
    backgroundImageOpacity: 70,
    backgroundPosition: '50% 50%',
    backgroundPosX: 50,
    backgroundPosY: 50,
    backgroundZoom: 100,
    backgroundFit: 'cover',
    panelOpacity: 100,
    panelBlur: 0,
    activeIcon: true,
    iconTheme: 'auto',
    iconColor: 'theme',
    statusBar: true,
    footer: true,
    theme: 'green',
    overlayBadge: true,
    showLiveCps: true,
    matchImageColors: true,
    customAccentEnabled: false,
    customAccent: '#9ca3af',
    overlayPosition: 'top-right',
    overlayOpacity: 90,
    uiMode: 'normal',
    autoHideOnClick: false
  },
  keybinds: { simple: '1', advanced: '2', zones: '3', clickPoints: '4', settings: '5' },
  stopZones: {
    cornerStop: { enabled: true, sizes: [50, 50, 50, 50] },
    edgeStop: { enabled: true, sizes: [40, 40, 40, 40] },
    customZones: { enabled: false, zones: [] }
  },
  clickPoints: { enabled: false, points: [], stopWhenComplete: false },
  processList: { enabled: false, mode: 'whitelist', selected: [] },
  sounds: { enabled: false, volume: 50 },
  antiDetect: { enabled: false, jitterPx: 2 },
  windowPosition: null
};

const NESTED_MERGE_KEYS = [
  'behavior', 'appearance', 'stopZones', 'processList', 'sounds',
  'antiDetect', 'startup', 'speedRandomization', 'limits',
  'clickPoints', 'clickPointsDefaults', 'keybinds',
  'cpsProfile', 'burst', 'pixelClick', 'failsafe', 'sessionTimer',
  'hotkeys', 'confirmHighCps', 'discordRpc', 'goals'
];

function mergeLoadedSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  for (const key of NESTED_MERGE_KEYS) {
    if (key === 'stopZones') {
      const sz = raw.stopZones || {};
      merged.stopZones = {
        cornerStop: { ...DEFAULT_SETTINGS.stopZones.cornerStop, ...(sz.cornerStop || {}) },
        edgeStop: { ...DEFAULT_SETTINGS.stopZones.edgeStop, ...(sz.edgeStop || {}) },
        customZones: {
          ...DEFAULT_SETTINGS.stopZones.customZones,
          ...(sz.customZones || {}),
          zones: Array.isArray(sz.customZones?.zones) ? sz.customZones.zones : []
        }
      };
    } else {
      merged[key] = { ...DEFAULT_SETTINGS[key], ...(raw[key] || {}) };
    }
  }
  return merged;
}

function applyPartialSettings(partial) {
  if (!partial || typeof partial !== 'object') return;
  for (const key of Object.keys(partial)) {
    if (NESTED_MERGE_KEYS.includes(key) && partial[key] && typeof partial[key] === 'object' && !Array.isArray(partial[key])) {
      if (key === 'stopZones') {
        const sz = partial.stopZones;
        settings.stopZones = settings.stopZones || JSON.parse(JSON.stringify(DEFAULT_SETTINGS.stopZones));
        if (sz.cornerStop) settings.stopZones.cornerStop = { ...settings.stopZones.cornerStop, ...sz.cornerStop };
        if (sz.edgeStop) settings.stopZones.edgeStop = { ...settings.stopZones.edgeStop, ...sz.edgeStop };
        if (sz.customZones) {
          settings.stopZones.customZones = {
            ...settings.stopZones.customZones,
            ...sz.customZones,
            zones: Array.isArray(sz.customZones.zones)
              ? sz.customZones.zones
              : (settings.stopZones.customZones.zones || [])
          };
        }
      } else {
        settings[key] = { ...(settings[key] || DEFAULT_SETTINGS[key] || {}), ...partial[key] };
      }
    } else {
      settings[key] = partial[key];
    }
  }
}

let settings = mergeLoadedSettings(loadJSON(SETTINGS_FILE, {}));
const ENGINE_VERSION = 4;
const loadedEngine = Number(settings._engineVersion) || 0;
if (loadedEngine < ENGINE_VERSION) {
  if (loadedEngine < 2) {
    settings.mouseButton = 'left';
    settings.dutyCycle = 0;
    settings.speedRandomization = { enabled: false, percent: 0 };
  }
  settings.rateMode = 'rate';
  if (settings.failsafe) settings.failsafe.enabled = false;
  settings._engineVersion = ENGINE_VERSION;
  try { saveJSON(SETTINGS_FILE, settings); } catch (_) {}
}
settings.mouseButton = mouseBtnName();

let presets = loadJSON(PRESETS_FILE, []);
if (!Array.isArray(presets) || presets.length === 0) {
  presets = GAME_PRESETS.map((p) => ({
    name: p.name,
    settings: p.settings,
    date: new Date().toLocaleDateString(),
    game: true
  }));
  saveJSON(PRESETS_FILE, presets);
}

let macros = loadJSON(MACROS_FILE, []);
let settingsSlots = loadJSON(SLOTS_FILE, {});
if (!settingsSlots || typeof settingsSlots !== 'object' || Array.isArray(settingsSlots)) settingsSlots = {};
let stats = loadJSON(STATS_FILE, {
  totalClicks: 0,
  totalClickingTimeMs: 0,
  clickingSessions: 0,
  lastSessionClicks: 0,
  lastStopReason: 'App started',
  dailyClicks: [],
  dailyGoalNotifiedDay: ''
});
if (!Array.isArray(stats.dailyClicks)) stats.dailyClicks = [];

let mainWindow;
let clicking = false;
let paused = false;
let sessionClicks = 0;
let sessionStart = 0;
let clickPointIndex = 0;
let lastStatsSend = 0;
let macroRecording = false;
let recordedMacroSteps = [];
let macroRecordLastTs = 0;
let macroRunning = false;
let clickTimestamps = [];
let lastProcessCheck = 0;
let holdHook = null;
let hotkeyCaptureActive = false;
let overlay = null;
let failsafeLastPos = null;
let failsafeLastMoveAt = 0;
const discordRpc = createDiscordRpcController();

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

const CPS_WINDOW_SECONDS = [1, 5, 10, 15, 30, 60];

function recordClickTs() {
  const now = Date.now();
  clickTimestamps.push(now);
  const cutoff = now - 60000;
  while (clickTimestamps.length && clickTimestamps[0] < cutoff) clickTimestamps.shift();
}

function countClicksInWindow(seconds) {
  const now = Date.now();
  const cutoff = now - Math.max(1, seconds) * 1000;
  let n = 0;
  for (let i = clickTimestamps.length - 1; i >= 0; i--) {
    if (clickTimestamps[i] < cutoff) break;
    n++;
  }
  return n;
}

function getLiveCps() {
  return countClicksInWindow(1);
}

/** Moyenne CPS sur chaque fenêtre (clics / secondes). */
function getCpsWindows() {
  const out = {};
  for (const s of CPS_WINDOW_SECONDS) {
    out[String(s)] = Math.round((countClicksInWindow(s) / s) * 10) / 10;
  }
  return out;
}

function bumpDailyClicks(n = 1) {
  const day = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(stats.dailyClicks)) stats.dailyClicks = [];
  let entry = stats.dailyClicks.find((d) => d.day === day);
  if (!entry) {
    entry = { day, clicks: 0 };
    stats.dailyClicks.push(entry);
  }
  entry.clicks += n;
  if (stats.dailyClicks.length > 14) stats.dailyClicks = stats.dailyClicks.slice(-14);
  maybeNotifyDailyGoal(entry.clicks);
}

function getTodayClicks() {
  const day = new Date().toISOString().slice(0, 10);
  const entry = (stats.dailyClicks || []).find((d) => d.day === day);
  return entry?.clicks || 0;
}

function maybeNotifyDailyGoal(todayClicks) {
  const g = settings.goals;
  if (!g?.enabled || !g.dailyClicks) return;
  const day = new Date().toISOString().slice(0, 10);
  if (todayClicks < g.dailyClicks) return;
  if (stats.dailyGoalNotifiedDay === day) return;
  stats.dailyGoalNotifiedDay = day;
  saveJSON(STATS_FILE, stats);
  send('goal-reached', { type: 'daily', clicks: todayClicks, target: g.dailyClicks });
}

function syncDiscord() {
  try {
    discordRpc.sync(settings, {
      clicking,
      paused,
      liveCps: getLiveCps(),
      sessionStart,
      getLive: () => ({ clicking, paused, liveCps: getLiveCps(), sessionStart })
    });
  } catch (_) { /* ignore */ }
}

function syncOverlay() {
  if (!overlay) overlay = createOverlayController(__dirname);
  const wantBadge = settings.appearance?.overlayBadge !== false;
  const hidePaused = settings.behavior?.hideOverlayWhenPaused !== false;
  if (wantBadge && clicking && !(paused && hidePaused)) {
    overlay.show(true, {
      position: settings.appearance?.overlayPosition || 'top-right',
      opacity: settings.appearance?.overlayOpacity ?? 90
    });
    overlay.update({
      clicking: true,
      paused,
      liveCps: getLiveCps(),
      opacity: settings.appearance?.overlayOpacity ?? 90
    });
  } else {
    overlay.hide();
  }
}

function maybeSendStats(force) {
  const now = performance.now();
  if (force || now - lastStatsSend >= 250) {
    const payload = getStatsPayload();
    send('stats-update', payload);
    if (overlay && settings.appearance?.overlayBadge !== false && clicking && !(paused && settings.behavior?.hideOverlayWhenPaused !== false)) {
      overlay.update({
        clicking: true,
        paused,
        liveCps: payload.liveCps,
        opacity: settings.appearance?.overlayOpacity ?? 90
      });
    }
    lastStatsSend = now;
  }
}

function getEffectiveCps() {
  let perSec = settings.cps;
  const ramp = settings.cpsProfile;
  if (ramp?.enabled && clicking && sessionStart) {
    const dur = Math.max(0.1, Number(ramp.rampSeconds) || 30);
    const tNorm = Math.min(1, Math.max(0, (Date.now() - sessionStart) / (dur * 1000)));
    const from = Number(ramp.fromCps) || 0;
    const to = Number(ramp.toCps) || perSec;
    perSec = from + (to - from) * tNorm;
  }
  if (settings.rateUnit === 'minute') perSec = perSec / 60;
  if (settings.rateUnit === 'hour') perSec = perSec / 3600;
  if (settings.rateUnit === 'day') perSec = perSec / 86400;
  const cap = settings.behavior?.extendedClickSpeedLimit ? 1000 : settings.maxCps;
  return Math.max(0.001, Math.min(perSec, cap));
}

function computeIntervalMs() {
  if (settings.rateMode === 'interval') {
    const ms = Number(settings.intervalMs);
    if (Number.isFinite(ms) && ms >= 1) return ms;
  }
  return 1000 / getEffectiveCps();
}

function parseColorSample(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw.r != null) {
    return { r: Number(raw.r) || 0, g: Number(raw.g) || 0, b: Number(raw.b) || 0 };
  }
  const s = String(raw).trim();
  const hex = s.replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return null;
}

function samplePixelColorAt(x, y) {
  if (!libnut) return null;
  try {
    if (typeof libnut.getPixelColor === 'function') {
      const c = parseColorSample(libnut.getPixelColor(x, y));
      if (c) return c;
    }
    if (libnut.screen && typeof libnut.screen.capture === 'function') {
      const bmp = libnut.screen.capture(x, y, 1, 1);
      const img = bmp?.image;
      if (img && (img.length >= 4 || img.byteLength >= 4)) {
        const b = img[0], g = img[1], r = img[2];
        return { r, g, b };
      }
    }
  } catch (_) { /* skip */ }
  return null;
}

function pixelGateAllowsClick() {
  const pc = settings.pixelClick;
  if (!pc?.enabled) return true;
  try {
    const pos = typeof libnut?.getMousePos === 'function'
      ? libnut.getMousePos()
      : screen.getCursorScreenPoint();
    const sample = samplePixelColorAt(pos.x, pos.y);
    if (!sample) return true; // can't sample → don't block clicks
    const tol = Math.max(0, Number(pc.tolerance) || 0);
    return Math.abs(sample.r - (pc.r || 0)) <= tol
      && Math.abs(sample.g - (pc.g || 0)) <= tol
      && Math.abs(sample.b - (pc.b || 0)) <= tol;
  } catch (_) {
    return true;
  }
}

function checkFailsafe() {
  const fs = settings.failsafe;
  if (!fs?.enabled || !clicking || paused) return null;
  try {
    const pos = screen.getCursorScreenPoint();
    if (!failsafeLastPos
      || pos.x !== failsafeLastPos.x
      || pos.y !== failsafeLastPos.y) {
      failsafeLastPos = { x: pos.x, y: pos.y };
      failsafeLastMoveAt = Date.now();
      return null;
    }
    const idleMs = Math.max(1, Number(fs.idleSeconds) || 10) * 1000;
    if (Date.now() - failsafeLastMoveAt >= idleMs) return 'Failsafe';
  } catch (_) { /* ignore */ }
  return null;
}

function randomizedInterval(base) {
  let result = base;
  if (settings.speedRandomization?.enabled) {
    const pct = settings.speedRandomization.percent / 100;
    const delta = base * pct * (Math.random() * 2 - 1);
    result = Math.max(1, base + delta);
  }
  if (settings.antiDetect?.enabled) {
    result = Math.max(1, result + (Math.random() * 8 - 2));
  }
  return result;
}

function applyAntiDetectJitter() {
  if (!settings.antiDetect?.enabled || !libnut) return;
  try {
    const pos = typeof libnut.getMousePos === 'function'
      ? libnut.getMousePos()
      : screen.getCursorScreenPoint();
    const j = Math.max(0, Number(settings.antiDetect.jitterPx) || 2);
    if (j <= 0) return;
    const dx = Math.floor((Math.random() * 2 - 1) * j);
    const dy = Math.floor((Math.random() * 2 - 1) * j);
    if (dx || dy) libnut.moveMouse(pos.x + dx, pos.y + dy);
  } catch (_) { /* ignore */ }
}

function performMouseClick(btnName) {
  const btn = btnName === 'right' || btnName === 'middle' ? btnName : 'left';
  if (settings.doubleClick) {
    libnut.mouseClick(btn, true);
    return;
  }
  libnut.mouseClick(btn);
}

function doClick() {
  if (!nutAvailable || !libnut) {
    sessionClicks++;
    stats.totalClicks++;
    recordClickTs();
    bumpDailyClicks(1);
    return;
  }
  try {
    if (settings.clickerType === 'keyboard') {
      const key = String(settings.keyboardKey || 'space').toLowerCase();
      libnut.keyTap ? libnut.keyTap(key) : (libnut.keyToggle(key, 'down'), libnut.keyToggle(key, 'up'));
    } else if (settings.clickPoints.enabled && settings.clickPoints.points.length > 0) {
      const btnName = mouseBtnName();
      const p = settings.clickPoints.points[clickPointIndex % settings.clickPoints.points.length];
      const r = p.radius || 0;
      const x = p.x + (r ? Math.floor((Math.random() * 2 - 1) * r) : 0);
      const y = p.y + (r ? Math.floor((Math.random() * 2 - 1) * r) : 0);
      libnut.moveMouse(x, y);
      for (let i = 0; i < (p.clicks || 1); i++) performMouseClick(btnName);
      clickPointIndex++;
      if (settings.clickPoints.stopWhenComplete && clickPointIndex >= settings.clickPoints.points.length) {
        stopClicking('Click points complete');
        return;
      }
    } else {
      applyAntiDetectJitter();
      performMouseClick(mouseBtnName());
    }
    sessionClicks++;
    stats.totalClicks++;
    recordClickTs();
    bumpDailyClicks(1);
  } catch (e) {
    console.error('click error', e);
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function processListAllows(fg) {
  const pl = settings.processList;
  if (!pl?.enabled) return true;
  const selected = (pl.selected || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const name = String(fg?.name || '').toLowerCase();
  if (pl.mode === 'blacklist') {
    if (!selected.length) return true;
    return !selected.some((s) => name.includes(s) || s.includes(name));
  }
  // whitelist
  if (!selected.length) return false;
  return selected.some((s) => name.includes(s) || s.includes(name));
}

function checkSessionLimits() {
  if (settings.sessionTimer?.enabled) {
    const mins = Math.max(0.01, Number(settings.sessionTimer.minutes) || 30);
    if (Date.now() - sessionStart >= mins * 60000) return 'Session timer';
  }
  if (settings.limits?.enabled) {
    if (settings.limits.mode === 'click' && sessionClicks >= settings.limits.clicks) {
      return 'Click limit reached';
    }
    if (settings.limits.mode === 'time' && (Date.now() - sessionStart) >= settings.limits.timeSeconds * 1000) {
      return 'Time limit reached';
    }
  }
  if (settings.goals?.enabled && settings.goals.sessionClicks > 0 && sessionClicks >= settings.goals.sessionClicks) {
    return 'Session goal reached';
  }
  return null;
}

async function clickLoop() {
  let nextClickAt = performance.now();

  while (clicking) {
    while (clicking && paused) {
      await sleep(40);
      maybeSendStats(false);
    }
    if (!clicking) break;

    try {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const zoneReason = checkSafetyStops(settings, cursor, display.bounds);
      if (zoneReason) {
        stopClicking(zoneReason);
        break;
      }
      const fsReason = checkFailsafe();
      if (fsReason) {
        stopClicking(fsReason);
        break;
      }
    } catch (_) { /* ignore */ }

    const nowCheck = Date.now();
    if (settings.processList?.enabled && nowCheck - lastProcessCheck >= 400) {
      lastProcessCheck = nowCheck;
      try {
        const fg = await getForegroundApp();
        if (!processListAllows(fg)) {
          stopClicking(settings.processList.mode === 'whitelist'
            ? 'Processus hors liste blanche'
            : 'Processus en liste noire');
          break;
        }
      } catch (_) { /* ignore */ }
    }

    const timerReason = checkSessionLimits();
    if (timerReason) {
      stopClicking(timerReason);
      break;
    }

    if (settings.burst?.enabled) {
      const n = Math.max(1, Math.min(500, Number(settings.burst.clicks) || 5));
      for (let i = 0; i < n && clicking && !paused; i++) {
        if (pixelGateAllowsClick()) doClick();
        const lim = checkSessionLimits();
        if (lim) { stopClicking(lim); break; }
      }
      if (!clicking) break;
      const pauseMs = Math.max(0, Number(settings.burst.pauseMs) || 0);
      if (pauseMs > 0) await sleep(pauseMs);
      nextClickAt = performance.now();
    } else {
      const intervalMs = Math.max(1, randomizedInterval(computeIntervalMs()));
      const now = performance.now();
      if (now < nextClickAt) {
        await sleep(nextClickAt - now);
        if (!clicking || paused) continue;
      }
      if (pixelGateAllowsClick()) doClick();
      if (!clicking) break;
      const lim = checkSessionLimits();
      if (lim) { stopClicking(lim); break; }
      nextClickAt = performance.now() + intervalMs;
    }

    maybeSendStats(false);
  }
  maybeSendStats(true);
}

function startClicking() {
  if (clicking) return;
  clicking = true;
  paused = false;
  sessionClicks = 0;
  clickPointIndex = 0;
  sessionStart = Date.now();
  lastStatsSend = 0;
  lastProcessCheck = 0;
  clickTimestamps = [];
  failsafeLastPos = null;
  failsafeLastMoveAt = Date.now();
  try {
    const p = screen.getCursorScreenPoint();
    failsafeLastPos = { x: p.x, y: p.y };
  } catch (_) {}
  stats.clickingSessions++;
  send('click-state', { clicking: true, paused: false });
  syncOverlay();
  syncDiscord();
  if (settings.appearance?.autoHideOnClick && mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.minimize(); } catch (_) {}
  }
  clickLoop();
}

function stopClicking(reason) {
  if (!clicking && !paused) return;
  clicking = false;
  paused = false;
  clickTimestamps = [];
  stats.totalClickingTimeMs += sessionStart ? (Date.now() - sessionStart) : 0;
  stats.lastSessionClicks = sessionClicks;
  stats.lastStopReason = reason || 'Stopped from hotkey';
  saveJSON(STATS_FILE, stats);
  send('click-state', { clicking: false, paused: false, reason: stats.lastStopReason, sessionClicks });
  syncOverlay();
  syncDiscord();
  maybeSendStats(true);
}

function toggleClicking() {
  if (hotkeyCaptureActive) return;
  if (clicking) {
    stopClicking('Stopped from hotkey');
    return;
  }
  const conf = settings.confirmHighCps || DEFAULT_SETTINGS.confirmHighCps;
  const cps = Number(settings.cps) || 0;
  if (conf.enabled && cps > (conf.threshold || 100)) {
    // Ask renderer to confirm (works for F6 / global hotkey too)
    send('confirm-high-cps', { cps, threshold: conf.threshold || 100 });
    return;
  }
  startClicking();
}

function togglePause() {
  if (hotkeyCaptureActive) return;
  if (!clicking) return;
  paused = !paused;
  send('click-state', { clicking: true, paused, reason: paused ? 'Paused' : 'Resumed' });
  syncOverlay();
  syncDiscord();
  maybeSendStats(true);
}

function panicStop() {
  if (hotkeyCaptureActive) return;
  if (clicking || paused) stopClicking('Panic');
  else {
    paused = false;
    try { overlay?.hide(); } catch (_) {}
    send('click-state', { clicking: false, paused: false, reason: 'Panic' });
  }
}

function getStatsPayload() {
  return {
    totalClicks: stats.totalClicks,
    totalClickingTimeMs: stats.totalClickingTimeMs + (clicking ? Date.now() - sessionStart : 0),
    clickingSessions: stats.clickingSessions,
    sessionClicks,
    clicking,
    paused,
    lastStopReason: stats.lastStopReason,
    liveCps: getLiveCps(),
    cpsWindows: getCpsWindows(),
    dailyClicks: stats.dailyClicks || [],
    todayClicks: getTodayClicks(),
    goals: settings.goals || DEFAULT_SETTINGS.goals
  };
}

function normalizeAccelerator(hotkeyStr) {
  if (!hotkeyStr) return null;
  const parts = String(hotkeyStr).split(/[+\-]/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  const mods = [];
  let key = null;

  for (const part of parts) {
    const up = part.toUpperCase();
    if (['CTRL', 'CONTROL', 'CONTROLORCOMMAND', 'COMMANDORCONTROL'].includes(up)) {
      mods.push('CommandOrControl');
      continue;
    }
    if (['CMD', 'COMMAND', 'META'].includes(up)) {
      mods.push(IS_MAC ? 'Command' : 'CommandOrControl');
      continue;
    }
    if (up === 'SUPER') { mods.push('Super'); continue; }
    if (up === 'ALT' || up === 'OPTION') { mods.push('Alt'); continue; }
    if (up === 'SHIFT') { mods.push('Shift'); continue; }
    if (up === 'SPACE') { key = 'Space'; continue; }
    if (up === 'ESC' || up === 'ESCAPE') { key = 'Escape'; continue; }
    if (up === 'TAB') { key = 'Tab'; continue; }
    if (up === 'ENTER' || up === 'RETURN') { key = 'Enter'; continue; }
    if (up === 'BACKSPACE') { key = 'Backspace'; continue; }
    if (up === 'DELETE' || up === 'DEL') { key = 'Delete'; continue; }
    if (up === 'UP' || up === 'ARROWUP') { key = 'Up'; continue; }
    if (up === 'DOWN' || up === 'ARROWDOWN') { key = 'Down'; continue; }
    if (up === 'LEFT' || up === 'ARROWLEFT') { key = 'Left'; continue; }
    if (up === 'RIGHT' || up === 'ARROWRIGHT') { key = 'Right'; continue; }
    if (/^F([1-9]|1[0-2])$/.test(up)) { key = up; continue; }
    if (part.length === 1) { key = part.toUpperCase(); continue; }
    key = capitalize(part.toLowerCase());
  }

  if (!key) return null;
  const order = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift', 'Super'];
  const uniq = [...new Set(mods)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...uniq, key].join('+');
}

function ensureHoldHook() {
  if (holdHook) return holdHook;
  holdHook = setupHoldHook({
    getHotkeyParts: () => parseHotkeyParts(settings.hotkey),
    onDown: () => { if (!clicking) startClicking(); },
    onUp: () => { if (clicking) stopClicking('Relâché'); },
    isHoldMode: () => settings.hotkeyMode === 'hold' && !macroRecording && !hotkeyCaptureActive
  });
  return holdHook;
}

function setHotkeyCaptureActive(active) {
  hotkeyCaptureActive = !!active;
  if (hotkeyCaptureActive) {
    try { globalShortcut.unregisterAll(); } catch (_) {}
    try { ensureHoldHook().stop(); } catch (_) {}
    return { ok: true, capturing: true };
  }
  if (!macroRecording) registerMainHotkey();
  return { ok: true, capturing: false };
}

function registerExtraHotkeys() {
  const hk = settings.hotkeys || DEFAULT_SETTINGS.hotkeys;
  const panicAccel = normalizeAccelerator(hk.panic || 'F12');
  const pauseAccel = normalizeAccelerator(hk.pause || 'F7');
  if (panicAccel) {
    try { globalShortcut.register(panicAccel, panicStop); } catch (e) {
      console.error('Failed to register panic hotkey', panicAccel, e.message);
    }
  }
  if (pauseAccel) {
    try { globalShortcut.register(pauseAccel, togglePause); } catch (e) {
      console.error('Failed to register pause hotkey', pauseAccel, e.message);
    }
  }
}

function registerMainHotkey() {
  try { globalShortcut.unregisterAll(); } catch (e) {}
  const hook = ensureHoldHook();

  // Pendant la capture d’un nouveau raccourci, aucun hotkey ne doit rester actif
  if (hotkeyCaptureActive) {
    try { hook.stop(); } catch (_) {}
    return;
  }

  if (macroRecording) {
    try { hook.stop(); } catch (_) {}
    registerRecordingHotkeys();
    registerExtraHotkeys();
    return;
  }

  if (settings.hotkeyMode === 'hold') {
    try { hook.start(); } catch (_) {}
    registerMacroShortcuts();
    registerExtraHotkeys();
    return;
  }

  try { hook.stop(); } catch (_) {}
  const accel = normalizeAccelerator(settings.hotkey);
  if (accel) {
    try {
      globalShortcut.register(accel, toggleClicking);
    } catch (e) {
      console.error('Failed to register hotkey', accel, e.message);
    }
  }
  registerMacroShortcuts();
  registerExtraHotkeys();
}

function registerMacroShortcuts() {
  for (const m of macros) {
    if (!m.hotkey) continue;
    const accel = normalizeAccelerator(m.hotkey);
    if (!accel) continue;
    try {
      globalShortcut.register(accel, () => { runMacro(m.id); });
    } catch (e) {
      console.error('macro hotkey failed', accel, e.message);
    }
  }
}

function registerRecordingHotkeys() {
  const add = (btn) => {
    if (!macroRecording) return;
    const pos = screen.getCursorScreenPoint();
    pushRecordedStep({ type: 'click', button: btn, x: pos.x, y: pos.y });
  };
  try {
    globalShortcut.register('F8', () => add('left'));
    globalShortcut.register('Shift+F8', () => add('right'));
    globalShortcut.register('F9', () => stopMacroRecording());
  } catch (e) {
    console.error('recording hotkeys failed', e.message);
  }
}

function pushRecordedStep(step) {
  const now = Date.now();
  const delay = macroRecordLastTs ? Math.min(Math.max(0, now - macroRecordLastTs), 10000) : 0;
  if (delay > 0) recordedMacroSteps.push({ type: 'delay', ms: delay });
  recordedMacroSteps.push(step);
  macroRecordLastTs = now;
  send('macro-recording-update', {
    recording: true,
    steps: recordedMacroSteps,
    count: recordedMacroSteps.filter(s => s.type !== 'delay').length
  });
}

function ensureMacroRecording(clear = false) {
  if (clicking) stopClicking('Stopped for macro recording');
  if (!macroRecording) {
    macroRecording = true;
    try { globalShortcut.unregisterAll(); } catch (e) {}
    try { ensureHoldHook().stop(); } catch (_) {}
    registerRecordingHotkeys();
    try { registerExtraHotkeys(); } catch (_) {}
  }
  if (clear) {
    recordedMacroSteps = [];
    macroRecordLastTs = Date.now();
  } else if (!macroRecordLastTs) {
    macroRecordLastTs = Date.now();
  }
  send('macro-recording-update', {
    recording: true,
    steps: recordedMacroSteps,
    count: recordedMacroSteps.filter((s) => s.type !== 'delay').length
  });
  return { recording: true, steps: recordedMacroSteps };
}

function startMacroRecording() {
  return ensureMacroRecording(true);
}

function stopMacroRecording() {
  if (!macroRecording) return { recording: false, steps: recordedMacroSteps };
  macroRecording = false;
  registerMainHotkey();
  send('macro-recording-update', {
    recording: false,
    steps: recordedMacroSteps,
    count: recordedMacroSteps.filter(s => s.type !== 'delay').length
  });
  return { recording: false, steps: recordedMacroSteps };
}

function normalizeLibnutKey(raw) {
  if (raw == null) return null;
  let k = String(raw).trim();
  if (!k) return null;
  const lower = k.toLowerCase();
  const map = {
    ' ': 'space', space: 'space', spacebar: 'space',
    enter: 'enter', return: 'enter',
    escape: 'escape', esc: 'escape',
    tab: 'tab', backspace: 'backspace', delete: 'delete', del: 'delete',
    arrowup: 'up', up: 'up',
    arrowdown: 'down', down: 'down',
    arrowleft: 'left', left: 'left',
    arrowright: 'right', right: 'right',
    control: 'control', ctrl: 'control',
    alt: 'alt', shift: 'shift',
    meta: 'command', cmd: 'command', command: 'command',
    home: 'home', end: 'end', pageup: 'pageup', pagedown: 'pagedown',
    insert: 'insert'
  };
  if (map[lower]) return map[lower];
  if (/^f([1-9]|1[0-2])$/i.test(lower)) return lower;
  if (k.length === 1) return k.toLowerCase();
  return lower;
}

async function runMacro(id) {
  const macro = macros.find(m => m.id === id);
  if (!macro) {
    send('macro-ran', { id, ok: false, error: 'Macro introuvable' });
    return false;
  }
  if (!nutAvailable || !libnut) {
    send('macro-ran', { id, ok: false, error: 'Moteur de clic indisponible' });
    return false;
  }
  if (macroRunning) {
    send('macro-ran', { id, ok: false, error: 'Une macro est déjà en cours' });
    return false;
  }
  if (macroRecording) stopMacroRecording();
  if (clicking) stopClicking('Stopped for macro');

  macroRunning = true;
  try {
    const steps = Array.isArray(macro.steps) ? macro.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      if (step.type === 'delay') {
        const ms = Math.min(Math.max(0, Number(step.ms) || 0), 30000);
        if (i === 0 && ms > 1000) continue;
        if (ms > 0) await sleep(ms);
        continue;
      }
      if (step.type === 'moveTo') {
        libnut.moveMouse(Number(step.x) || 0, Number(step.y) || 0);
        continue;
      }
      if (step.type === 'click') {
        const raw = String(step.button || 'left').toLowerCase();
        const btnName = raw === 'right' ? 'right' : raw === 'middle' ? 'middle' : 'left';
        if (step.x != null && step.y != null) {
          libnut.moveMouse(Number(step.x), Number(step.y));
          await sleep(15);
        }
        libnut.mouseClick(btnName);
        continue;
      }
      if (step.type === 'sequence' && Array.isArray(step.keys)) {
        for (const rawKey of step.keys) {
          const key = normalizeLibnutKey(rawKey);
          if (!key) continue;
          try {
            libnut.keyToggle(key, 'down');
            await sleep(25);
            libnut.keyToggle(key, 'up');
            await sleep(40);
          } catch (err) {
            console.error('macro sequence key failed', key, err.message);
          }
        }
        continue;
      }
      if (step.type === 'key') {
        const key = normalizeLibnutKey(step.key);
        if (!key) continue;
        try {
          libnut.keyToggle(key, 'down');
          await sleep(25);
          libnut.keyToggle(key, 'up');
        } catch (err) {
          console.error('macro key failed', key, err.message);
        }
        continue;
      }
    }
    send('macro-ran', { id, ok: true });
    return true;
  } catch (e) {
    console.error('runMacro error', e);
    send('macro-ran', { id, ok: false, error: e.message });
    return false;
  } finally {
    macroRunning = false;
  }
}

function createWindow() {
  const useTransparency = IS_WIN || IS_MAC;
  const opts = {
    width: WINDOW_COMPACT.width,
    height: WINDOW_COMPACT.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: useTransparency ? '#00000000' : '#101216',
    transparent: useTransparency,
    alwaysOnTop: !!settings.behavior?.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  if (IS_MAC) {
    opts.titleBarStyle = 'hidden';
    opts.trafficLightPosition = { x: 12, y: 12 };
  }

  const iconPng = path.join(__dirname, 'assets', 'icon.png');
  const iconSvg = path.join(__dirname, 'assets', 'icon.svg');
  if (fs.existsSync(iconPng)) opts.icon = iconPng;
  else if (fs.existsSync(iconSvg)) opts.icon = iconSvg;

  mainWindow = new BrowserWindow(opts);

  if (settings.windowPosition && settings.startup.rememberWindowPosition) {
    const { x, y } = settings.windowPosition;
    if (typeof x === 'number' && typeof y === 'number') {
      mainWindow.setPosition(x, y);
    }
  }

  mainWindow.setResizable(false);
  mainWindow.setMinimumSize(560, 420);
  mainWindow.setSize(WINDOW_COMPACT.width, WINDOW_COMPACT.height);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    syncOverlay();
  });

  mainWindow.on('close', () => {
    const [x, y] = mainWindow.getPosition();
    settings.windowPosition = { x, y };
    saveJSON(SETTINGS_FILE, settings);
  });
}

app.whenReady().then(() => {
  createWindow();
  registerMainHotkey();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  saveJSON(SETTINGS_FILE, settings);
  saveJSON(STATS_FILE, stats);
  try { overlay?.hide(); } catch (_) {}
  try { holdHook?.stop(); } catch (_) {}
  try { discordRpc.destroy(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { holdHook?.stop(); } catch (_) {}
  try { overlay?.hide(); } catch (_) {}
  try { discordRpc.destroy(); } catch (_) {}
});

ipcMain.handle('get-init-state', () => ({
  settings,
  presets,
  macros,
  stats: getStatsPayload(),
  nutAvailable,
  platform: process.platform,
  version: APP_VERSION,
  changelog: CHANGELOG,
  latestVersion: LATEST_VERSION,
  discordUser: 'LuLune0193',
  language: settings.language || 'en',
  slots: Object.keys(settingsSlots)
}));

ipcMain.handle('update-settings', (e, partial) => {
  applyPartialSettings(partial);
  if (partial && partial.mouseButton != null) {
    settings.mouseButton = mouseBtnName();
  }
  if (partial && partial.cps != null) {
    const cps = Math.max(0.001, Number(partial.cps) || 0.001);
    settings.cps = cps;
    settings.rateMode = 'rate';
    settings.intervalMs = 1000 / getEffectiveCps();
  }
  if (partial && typeof partial.dutyCycle === 'number') {
    settings.dutyCycle = Math.max(0, Math.min(100, partial.dutyCycle));
  }
  saveJSON(SETTINGS_FILE, settings);
  registerMainHotkey();
  if (mainWindow) mainWindow.setAlwaysOnTop(!!settings.behavior?.alwaysOnTop);
  syncOverlay();
  syncDiscord();
  return settings;
});

ipcMain.handle('toggle-clicking', () => { toggleClicking(); return { clicking, paused }; });
ipcMain.handle('start-clicking', (_e, opts) => {
  const conf = settings.confirmHighCps || DEFAULT_SETTINGS.confirmHighCps;
  const cps = Number(settings.cps) || 0;
  if (conf.enabled && cps > (conf.threshold || 100) && !(opts && opts.confirmed)) {
    return { needsConfirm: true, threshold: conf.threshold || 100, cps, clicking, paused };
  }
  startClicking();
  return { clicking, paused };
});
ipcMain.handle('stop-clicking', () => { stopClicking('Stopped manually'); return { clicking, paused }; });
ipcMain.handle('toggle-pause', () => { togglePause(); return { clicking, paused }; });
ipcMain.handle('panic-stop', () => { panicStop(); return { clicking, paused }; });

ipcMain.handle('sample-pixel-color', () => {
  try {
    const pos = typeof libnut?.getMousePos === 'function'
      ? libnut.getMousePos()
      : screen.getCursorScreenPoint();
    const c = samplePixelColorAt(pos.x, pos.y);
    return c || null;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('list-slots', () => Object.keys(settingsSlots));
ipcMain.handle('save-slot', (_e, name) => {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'Nom vide', slots: Object.keys(settingsSlots) };
  settingsSlots[n] = JSON.parse(JSON.stringify(settings));
  saveJSON(SLOTS_FILE, settingsSlots);
  return { ok: true, slots: Object.keys(settingsSlots) };
});
ipcMain.handle('load-slot', (_e, name) => {
  const n = String(name || '').trim();
  const snap = settingsSlots[n];
  if (!snap) return { ok: false, error: 'Introuvable', settings, slots: Object.keys(settingsSlots) };
  settings = mergeLoadedSettings(snap);
  saveJSON(SETTINGS_FILE, settings);
  registerMainHotkey();
  syncOverlay();
  syncDiscord();
  if (mainWindow) mainWindow.setAlwaysOnTop(!!settings.behavior?.alwaysOnTop);
  return { ok: true, settings, slots: Object.keys(settingsSlots) };
});
ipcMain.handle('delete-slot', (_e, name) => {
  const n = String(name || '').trim();
  delete settingsSlots[n];
  saveJSON(SLOTS_FILE, settingsSlots);
  return { ok: true, slots: Object.keys(settingsSlots) };
});
ipcMain.handle('i18n-t', (_e, { lang, key, vars }) => t(lang || settings.language || 'en', key, vars));

ipcMain.handle('save-preset', (e, preset) => {
  const idx = presets.findIndex(p => p.name === preset.name);
  const data = { ...preset, date: new Date().toLocaleDateString() };
  if (idx >= 0) presets[idx] = data; else presets.push(data);
  saveJSON(PRESETS_FILE, presets);
  return presets;
});
ipcMain.handle('delete-preset', (e, name) => {
  presets = presets.filter(p => p.name !== name);
  saveJSON(PRESETS_FILE, presets);
  return presets;
});
ipcMain.handle('rename-preset', (e, { oldName, newName }) => {
  const p = presets.find(p => p.name === oldName);
  if (p) p.name = newName;
  saveJSON(PRESETS_FILE, presets);
  return presets;
});
ipcMain.handle('duplicate-preset', (e, name) => {
  const p = presets.find(p => p.name === name);
  if (p) {
    presets.push({ ...p, name: p.name + ' Copy', date: new Date().toLocaleDateString() });
    saveJSON(PRESETS_FILE, presets);
  }
  return presets;
});
ipcMain.handle('apply-preset', (e, name) => {
  const p = presets.find(p => p.name === name);
  if (p && p.settings) {
    applyPartialSettings(p.settings);
    saveJSON(SETTINGS_FILE, settings);
    registerMainHotkey();
    syncOverlay();
  }
  return settings;
});

ipcMain.handle('seed-game-presets', () => {
  let added = 0;
  for (const gp of GAME_PRESETS) {
    if (presets.some((p) => p.name === gp.name)) continue;
    presets.push({
      name: gp.name,
      settings: gp.settings,
      date: new Date().toLocaleDateString(),
      game: true
    });
    added++;
  }
  saveJSON(PRESETS_FILE, presets);
  return { presets, added };
});

ipcMain.handle('save-macro', (e, macro) => {
  const steps = Array.isArray(macro.steps) ? macro.steps : recordedMacroSteps;
  const cleaned = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    if (s.type === 'delay') {
      const ms = Math.min(Math.max(0, Number(s.ms) || 0), 30000);
      if (ms <= 0) continue;
      if (cleaned.length === 0) continue;
      cleaned.push({ type: 'delay', ms });
      continue;
    }
    cleaned.push(s);
  }
  const data = {
    id: macro.id || ('m_' + Date.now()),
    name: (macro.name || 'Macro').trim() || 'Macro',
    hotkey: (macro.hotkey || '').trim(),
    steps: cleaned
  };
  const idx = macros.findIndex(m => m.id === data.id);
  if (idx >= 0) macros[idx] = data; else macros.push(data);
  saveJSON(MACROS_FILE, macros);
  if (macroRecording) stopMacroRecording();
  else registerMainHotkey();
  return macros;
});
ipcMain.handle('delete-macro', (e, id) => {
  macros = macros.filter(m => m.id !== id);
  saveJSON(MACROS_FILE, macros);
  registerMainHotkey();
  return macros;
});
ipcMain.handle('run-macro', async (e, id) => runMacro(id));
ipcMain.handle('macro-start-recording', () => startMacroRecording());
ipcMain.handle('macro-stop-recording', () => stopMacroRecording());
ipcMain.handle('macro-set-steps', (_e, steps) => {
  recordedMacroSteps = Array.isArray(steps) ? steps.map((s) => ({ ...s })) : [];
  macroRecordLastTs = Date.now();
  send('macro-recording-update', {
    recording: macroRecording,
    steps: recordedMacroSteps,
    count: recordedMacroSteps.filter((s) => s.type !== 'delay').length
  });
  return { steps: recordedMacroSteps, recording: macroRecording };
});
ipcMain.handle('macro-add-click', (e, button = 'left') => {
  ensureMacroRecording(false);
  const pos = screen.getCursorScreenPoint();
  pushRecordedStep({
    type: 'click',
    button: button === 'right' ? 'right' : button === 'middle' ? 'middle' : 'left',
    x: pos.x,
    y: pos.y
  });
  return { steps: recordedMacroSteps, recording: true };
});
ipcMain.handle('macro-add-key', (e, key) => {
  ensureMacroRecording(false);
  const k = normalizeLibnutKey(key);
  if (k) pushRecordedStep({ type: 'key', key: k });
  return { steps: recordedMacroSteps, recording: true };
});
ipcMain.handle('macro-add-sequence', (e, seq) => {
  ensureMacroRecording(false);
  const keys = String(seq || '')
    .split(/[\s,]+/)
    .map((k) => normalizeLibnutKey(k))
    .filter(Boolean);
  if (keys.length === 1) pushRecordedStep({ type: 'key', key: keys[0] });
  else if (keys.length > 1) pushRecordedStep({ type: 'sequence', keys });
  return { steps: recordedMacroSteps, recording: true };
});
ipcMain.handle('macro-add-delay', (e, ms) => {
  ensureMacroRecording(false);
  const n = Math.min(Math.max(0, Number(ms) || 0), 30000);
  if (n > 0) {
    recordedMacroSteps.push({ type: 'delay', ms: n });
    macroRecordLastTs = Date.now();
    send('macro-recording-update', {
      recording: true,
      steps: recordedMacroSteps,
      count: recordedMacroSteps.filter((s) => s.type !== 'delay').length
    });
  }
  return { steps: recordedMacroSteps, recording: true };
});
ipcMain.handle('macro-clear-steps', () => {
  recordedMacroSteps = [];
  macroRecordLastTs = Date.now();
  send('macro-recording-update', { recording: macroRecording, steps: [], count: 0 });
  return { steps: [], recording: macroRecording };
});
ipcMain.handle('macro-get-recording', () => ({
  recording: macroRecording,
  steps: recordedMacroSteps,
  count: recordedMacroSteps.filter(s => s.type !== 'delay').length
}));

ipcMain.handle('reset-settings', () => {
  settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings._engineVersion = 4;
  saveJSON(SETTINGS_FILE, settings);
  registerMainHotkey();
  syncOverlay();
  return settings;
});
ipcMain.handle('reset-stats', () => {
  stats = {
    totalClicks: 0,
    totalClickingTimeMs: 0,
    clickingSessions: 0,
    lastSessionClicks: 0,
    lastStopReason: '',
    dailyClicks: []
  };
  saveJSON(STATS_FILE, stats);
  return getStatsPayload();
});
ipcMain.handle('open-diagnostics-folder', () => {
  shell.openPath(USER_DATA);
});

ipcMain.handle('reveal-discord-logo', async () => {
  const candidates = [
    path.join(__dirname, 'assets', 'discord-logo.png'),
    path.join(__dirname, 'website', 'assets', 'discord-logo.png')
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return { ok: false, error: 'Logo introuvable' };
  try {
    shell.showItemInFolder(file);
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-external', async (e, url) => {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    await shell.openExternal(u.toString());
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('draw-zone', async () => {
  const rect = await openZoneDrawer(__dirname);
  if (!rect || rect.w < 8 || rect.h < 8) return { ok: false, settings };
  const zones = [...(settings.stopZones?.customZones?.zones || [])];
  zones.push({
    name: `Zone ${zones.length + 1}`,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
    action: 'stop'
  });
  settings.stopZones = settings.stopZones || JSON.parse(JSON.stringify(DEFAULT_SETTINGS.stopZones));
  settings.stopZones.customZones = { enabled: true, zones };
  saveJSON(SETTINGS_FILE, settings);
  return { ok: true, settings, zone: zones[zones.length - 1] };
});

ipcMain.handle('export-presets', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter les préréglages',
    defaultPath: 'lulune-presets.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify({ type: 'lulune-presets', version: APP_VERSION, presets }, null, 2));
  return { ok: true, filePath };
});

ipcMain.handle('import-presets', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer des préréglages',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.[0]) return { ok: false, presets };
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    const list = Array.isArray(data) ? data : (data.presets || []);
    let added = 0;
    for (const p of list) {
      if (!p?.name) continue;
      const idx = presets.findIndex((x) => x.name === p.name);
      const entry = { ...p, date: p.date || new Date().toLocaleDateString() };
      if (idx >= 0) presets[idx] = entry;
      else { presets.push(entry); added++; }
    }
    saveJSON(PRESETS_FILE, presets);
    return { ok: true, presets, added };
  } catch (e) {
    return { ok: false, error: e.message, presets };
  }
});

ipcMain.handle('export-macros', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter les macros',
    defaultPath: 'lulune-macros.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify({ type: 'lulune-macros', version: APP_VERSION, macros }, null, 2));
  return { ok: true, filePath };
});

ipcMain.handle('import-macros', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer des macros',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.[0]) return { ok: false, macros };
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    const list = Array.isArray(data) ? data : (data.macros || []);
    let added = 0;
    for (const m of list) {
      if (!m) continue;
      const entry = {
        id: m.id || ('m_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
        name: m.name || 'Macro',
        hotkey: m.hotkey || '',
        steps: Array.isArray(m.steps) ? m.steps : []
      };
      const idx = macros.findIndex((x) => x.id === entry.id || x.name === entry.name);
      if (idx >= 0) macros[idx] = entry;
      else { macros.push(entry); added++; }
    }
    saveJSON(MACROS_FILE, macros);
    registerMainHotkey();
    return { ok: true, macros, added };
  } catch (e) {
    return { ok: false, error: e.message, macros };
  }
});

ipcMain.handle('clipboard-write-json', (e, payload) => {
  try {
    clipboard.writeText(JSON.stringify(payload));
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('clipboard-read-json', () => {
  try {
    return JSON.parse(clipboard.readText());
  } catch (_) {
    return null;
  }
});

ipcMain.handle('macro-share-encode', (e, id) => {
  const macro = macros.find((m) => m.id === id);
  if (!macro) return { ok: false, error: 'Macro introuvable' };
  const b64 = Buffer.from(JSON.stringify(macro), 'utf8').toString('base64');
  clipboard.writeText(b64);
  return { ok: true, b64 };
});

ipcMain.handle('macro-share-decode', (e, text) => {
  try {
    const raw = String(text || clipboard.readText() || '').trim();
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const macro = JSON.parse(json);
    if (!macro || !Array.isArray(macro.steps)) return { ok: false, error: 'Format invalide' };
    const entry = {
      id: 'm_' + Date.now(),
      name: (macro.name || 'Macro partagée').trim(),
      hotkey: '',
      steps: macro.steps
    };
    macros.push(entry);
    saveJSON(MACROS_FILE, macros);
    registerMainHotkey();
    return { ok: true, macros, macro: entry };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-changelog', () => CHANGELOG);

ipcMain.handle('check-updates', async () => {
  const current = APP_VERSION;
  const latest = LATEST_VERSION;
  const upToDate = current === latest;
  try {
    await shell.openExternal(GITHUB_URL);
  } catch (_) { /* ignore */ }
  return { current, latest, upToDate, url: GITHUB_URL };
});

ipcMain.handle('copy-text', (e, text) => {
  try {
    clipboard.writeText(String(text || ''));
    return true;
  } catch (_) {
    return false;
  }
});

function imageMimeFromPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return ({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp'
  })[ext] || '';
}

function isAllowedImagePath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext);
}

function localImageToDataUrl(src) {
  try {
    if (!src) return '';
    const raw = String(src).trim();
    if (/^data:image\//i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
      // Only image-looking URLs (or gif/png/…)
      if (!/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(raw) && !/\/image\//i.test(raw)) return '';
      return raw;
    }
    let filePath = raw;
    if (raw.startsWith('file:')) filePath = fileURLToPath(raw);
    if (!fs.existsSync(filePath) || !isAllowedImagePath(filePath)) return '';
    const mime = imageMimeFromPath(filePath);
    if (!mime) return '';
    const buf = fs.readFileSync(filePath);
    // GIFs can be heavier — allow up to ~20MB, other images ~12MB
    const max = mime === 'image/gif' ? 20 * 1024 * 1024 : 12 * 1024 * 1024;
    if (buf.length > max) return '';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_) {
    return '';
  }
}

ipcMain.handle('pick-background-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir une image ou un GIF de fond',
    filters: [
      { name: 'Images (PNG, JPG, WEBP, GIF, BMP)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
    ],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.[0]) return null;
  try {
    const src = filePaths[0];
    if (!isAllowedImagePath(src)) return null;
    const destDir = path.join(USER_DATA, 'backgrounds');
    fs.mkdirSync(destDir, { recursive: true });
    // Always overwrite previous background copy
    for (const f of fs.readdirSync(destDir)) {
      try { fs.unlinkSync(path.join(destDir, f)); } catch (_) {}
    }
    const dest = path.join(destDir, 'current' + path.extname(src).toLowerCase());
    fs.copyFileSync(src, dest);
    return pathToFileURL(dest).href;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('resolve-background-image', (_e, src) => localImageToDataUrl(src));

ipcMain.handle('win-minimize', () => mainWindow.minimize());
ipcMain.handle('win-close', () => mainWindow.close());
ipcMain.handle('win-pin', (e, pinned) => mainWindow.setAlwaysOnTop(!!pinned));
ipcMain.handle('set-hotkey-capture', (_e, active) => setHotkeyCaptureActive(active));

ipcMain.handle('set-window-mode', (_e, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  // compact = catégorie AutoClick (souris) uniquement
  const compact = mode === 'compact';
  const w = compact ? WINDOW_COMPACT.width : WINDOW_WIDTH;
  const h = compact ? WINDOW_COMPACT.height : WINDOW_HEIGHT;
  try {
    mainWindow.setMinimumSize(compact ? 720 : 800, compact ? 520 : 600);
    mainWindow.setSize(w, h, true);
    return { ok: true, mode: compact ? 'compact' : 'full', width: w, height: h };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('get-cursor-pos', () => screen.getCursorScreenPoint());
