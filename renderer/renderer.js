let state = { settings: {}, presets: [], macros: [], stats: {}, changelog: [], version: '1.3.0', discordUser: 'LuLune0193' };
let recording = false;
let recordedSteps = [];
let editingMacroId = null;
let audioCtx = null;

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

async function init() {
  state = await window.api.getInit();
  state.slots = state.slots || [];
  applyTheme(state.settings?.appearance?.theme || 'green');
  applyUiMode(state.settings?.appearance?.uiMode || 'normal');
  applySettingsToUI();
  applyLanguage();
  renderPresets();
  renderMacros();
  renderCustomZones();
  renderProcessList();
  renderSlots();
  renderChangelog(state.changelog || []);
  updateStatsUI();
  bindNav();
  bindTitlebar();
  bindSimple();
  bindAdvanced();
  bindZones();
  bindPoints();
  bindMacrosUI();
  bindSettingsTabs();
  bindBehaviorAppearanceKeybinds();
  bindEngineSettings();
  bindSlotsUI();
  bindMaintenance();
  bindPresetsUI();
  bindSupportLinks();
  bindDiscord();
  bindTutorial();
  bindConfirmCpsModal();
  bindCpsTest();
  updatePlatformBadge(state.platform);
  if (state.version) {
    const v = 'v' + state.version;
    const vl = $('#app-version-label');
    if (vl) vl.textContent = v;
    const sr = $('#statusbar-right');
    if (sr) sr.textContent = v;
  }

  window.api.onStats((d) => {
    state.stats = d;
    updateStatsUI();
    updateStartStopUI(d.clicking, d.paused);
    updateCpsSourceBadge();
    if (!cpsTest.active) syncCpsTestScoresFromStats();
  });
  window.api.onClickState((d) => {
    updateStartStopUI(d.clicking, d.paused);
    if (!d.paused) playClickSound(!!d.clicking);
    if (d.reason) {
      const mid = $('#statusbar-mid');
      if (mid) {
        const showCps = state.settings?.appearance?.showLiveCps !== false;
        const cpsPart = showCps
          ? ` <span id="statusbar-cps-wrap">• <span id="statusbar-livecps">${state.stats?.liveCps || 0}</span> CPS</span>`
          : '';
        mid.innerHTML = `${d.reason} • ${d.sessionClicks || 0} clics${cpsPart}`;
      }
    }
    applyHudVisibility();
  });
  window.api.onConfirmHighCps?.(async () => {
    const ok = await askHighCpsConfirm();
    if (ok) {
      const r = await window.api.startClicking({ confirmed: true });
      updateStartStopUI(r.clicking, r.paused);
    }
  });
  window.api.onGoalReached?.((d) => {
    const lang = state.settings?.language || 'fr';
    const msg = window.i18n?.t(lang, 'goals.reached') || 'Objectif quotidien atteint !';
    const mid = $('#statusbar-mid');
    if (mid) mid.textContent = `${msg} (${d?.clicks || 0})`;
  });
  window.api.onMacroRecording((d) => {
    recording = !!d.recording;
    recordedSteps = d.steps || [];
    updateMacroRecordingUI();
    updateMacroPreview();
  });
  window.api.onMacroRan((d) => {
    if (d && d.ok === false) {
      $('#statusbar-mid').textContent = `Macro échouée: ${d.error || 'erreur'}`;
    } else if (d && d.ok) {
      $('#statusbar-mid').textContent = 'Macro exécutée';
    }
  });
  enhanceNumberInputs();
}

function lang() { return state.settings?.language === 'en' ? 'en' : 'fr'; }

function tr(key, vars) {
  return window.i18n?.t(lang(), key, vars) || key;
}

function applyLanguage() {
  document.documentElement.lang = lang();
  $$('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = tr(key);
  });
  $$('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = tr(key);
  });
  $$('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = tr(key);
  });
  updateStartStopUI(!!state.stats?.clicking, !!state.stats?.paused);
}

function applyUiMode(mode) {
  document.body.classList.toggle('ui-minimal', mode === 'minimal');
}

function playBeep(freq, dur, type = 'sine') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const vol = Math.max(0, Math.min(100, Number(state.settings?.sounds?.volume ?? 50))) / 100;
    g.gain.value = 0.08 * vol;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (_) { /* ignore */ }
}

function playClickSound(starting) {
  if (!state.settings?.sounds?.enabled) return;
  if (starting) playBeep(880, 0.08);
  else playBeep(440, 0.1);
}

function applyTheme(theme) {
  const t = ['green', 'blue', 'red', 'light'].includes(theme) ? theme : 'green';
  document.body.setAttribute('data-theme', t);
}

function toCssBackgroundUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (/^(https?:|file:|data:)/i.test(url)) return url;
  // Windows path → file URL
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('\\\\')) {
    const normalized = url.replace(/\\/g, '/');
    return 'file:///' + encodeURI(normalized).replace(/#/g, '%23');
  }
  return url;
}

let appearanceApplyToken = 0;
let lastTintUrl = '';
let lastTintPalette = null;

const ACCENT_CSS_VARS = [
  '--green', '--green-soft', '--green-bright', '--green-dim',
  '--glow-a', '--glow-b', '--glow-c',
  '--orb-a', '--orb-b', '--orb-c',
  '--hover-accent', '--app-top', '--app-bottom'
];

function rgbStr(c) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}
function rgbaStr(c, a) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}
function mixToward(c, target, t) {
  return {
    r: Math.round(c.r + (target - c.r) * t),
    g: Math.round(c.g + (target - c.g) * t),
    b: Math.round(c.b + (target - c.b) * t)
  };
}
function hexToRgb(hex) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(c) {
  const h = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
function saturationOf(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}
function boostAccent(c) {
  const sat = saturationOf(c);
  // Grayscale / near-gray: keep neutral tones (silver UI), don't invent a hue
  if (sat < 0.14) {
    let lum = Math.round((c.r + c.g + c.b) / 3);
    if (lum < 90) lum = 130;
    if (lum > 200) lum = 170;
    return { r: lum, g: lum, b: lum };
  }
  const max = Math.max(c.r, c.g, c.b) || 1;
  const scale = 210 / max;
  let out = {
    r: Math.min(255, Math.round(c.r * scale)),
    g: Math.min(255, Math.round(c.g * scale)),
    b: Math.min(255, Math.round(c.b * scale))
  };
  const lum = (out.r + out.g + out.b) / 3;
  if (lum < 90) out = mixToward(out, 255, 0.25);
  if (lum > 200) out = mixToward(out, 0, 0.2);
  return out;
}

function clearImageTint() {
  // Must clear on body too: theme vars live on body[data-theme], which override :root
  [document.documentElement, document.body].forEach((node) => {
    ACCENT_CSS_VARS.forEach((v) => node.style.removeProperty(v));
  });
  $('#app')?.classList.remove('image-tinted');
  const swatch = $('#image-tint-swatch');
  if (swatch) swatch.hidden = true;
}

function applyImageTint(palette, sourceLabel) {
  if (!palette?.accent) {
    clearImageTint();
    return;
  }
  const accent = boostAccent(palette.accent);
  const soft = mixToward(accent, 255, 0.28);
  const bright = mixToward(accent, 255, 0.48);
  const avg = palette.avg || accent;
  const dark = mixToward(avg, 0, 0.78);
  const mid = mixToward(avg, 0, 0.62);

  // Apply on body so it wins over body[data-theme="…"] theme tokens
  const targets = [document.documentElement, document.body];
  const set = (k, v) => targets.forEach((n) => n.style.setProperty(k, v));
  set('--green', rgbStr(accent));
  set('--green-soft', rgbStr(soft));
  set('--green-bright', rgbStr(bright));
  set('--green-dim', rgbaStr(accent, 0.16));
  set('--glow-a', rgbaStr(accent, 0.28));
  set('--glow-b', rgbaStr(soft, 0.16));
  set('--glow-c', rgbaStr(accent, 0.12));
  set('--orb-a', rgbaStr(accent, 0.4));
  set('--orb-b', rgbaStr(soft, 0.28));
  set('--orb-c', rgbaStr(accent, 0.2));
  set('--hover-accent', rgbaStr(accent, 0.3));
  set('--app-top', rgbStr(mid));
  set('--app-bottom', rgbStr(dark));
  // Kill leftover blue/cyan theme glows so gray/custom tint is total
  set('--glow-b', rgbaStr(soft, 0.18));
  set('--orb-b', rgbaStr(soft, 0.26));
  $('#app')?.classList.add('image-tinted');

  const swatch = $('#image-tint-swatch');
  if (swatch) {
    swatch.hidden = false;
    const a = $('#swatch-accent');
    const s = $('#swatch-soft');
    const v = $('#swatch-avg');
    if (a) a.style.background = rgbStr(accent);
    if (s) s.style.background = rgbStr(soft);
    if (v) v.style.background = rgbStr(avg);
    const label = $('#image-tint-label');
    if (label) {
      const gray = saturationOf(accent) < 0.14;
      label.textContent = sourceLabel
        || (gray ? 'Palette grise (image)' : 'Palette de l’image appliquée');
    }
  }
}

function extractImagePalette(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        let maxSat = 0;
        let best = { r: 160, g: 160, b: 160, score: -1 };
        for (let i = 0; i < data.length; i += 4) {
          const ar = data[i], ag = data[i + 1], ab = data[i + 2], aa = data[i + 3];
          if (aa < 140) continue;
          const max = Math.max(ar, ag, ab);
          const min = Math.min(ar, ag, ab);
          const lum = (ar + ag + ab) / 3;
          if (lum < 18 || lum > 248) continue;
          r += ar; g += ag; b += ab; n++;
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat > maxSat) maxSat = sat;
          // Prefer vivid colors when present; otherwise mid luminance (works for gray photos)
          const score = sat * 2.2 + (1 - Math.abs(lum - 140) / 140) * (sat < 0.12 ? 1.2 : 0.55);
          if (score > best.score) best = { r: ar, g: ag, b: ab, score };
        }
        if (!n) return resolve(null);
        const avg = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
        // Mostly gray image → accent = average gray (not leftover green from theme)
        const accent = maxSat < 0.12 ? avg : { r: best.r, g: best.g, b: best.b };
        resolve({ avg, accent, grayscale: maxSat < 0.12 });
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function applyAppearance(livePartial) {
  const token = ++appearanceApplyToken;
  const a = { ...(state.settings?.appearance || {}), ...(livePartial || {}) };
  const root = document.documentElement;
  const app = $('#app');
  const layer = $('#bg-layer');
  const preview = $('#bg-preview');
  const previewLabel = $('#bg-preview-label');

  const themeOpacity = Math.max(0, Math.min(100, Number(a.backgroundOpacity ?? 100))) / 100;
  const imgOpacity = Math.max(0, Math.min(100, Number(a.backgroundImageOpacity ?? 70))) / 100;
  // Opacité interface 10–100 % (panneaux + barre titre + statut)
  const uiOpacityPct = Math.max(10, Math.min(100, Number(a.panelOpacity ?? 100)));
  const panelSlider = uiOpacityPct / 100;
  const panelBlur = Math.max(0, Math.min(24, Number(a.panelBlur ?? 0)));
  const matchColors = a.matchImageColors !== false;
  const customOn = !!a.customAccentEnabled;
  const customRgb = hexToRgb(a.customAccent);
  const bgPos = String(a.backgroundPosition || 'center').trim() || 'center';
  const bgFit = a.backgroundFit === 'contain' ? 'contain' : 'cover';

  root.style.setProperty('--theme-bg-opacity', String(themeOpacity));
  root.style.setProperty('--bg-position', bgPos);
  root.style.setProperty('--bg-fit', bgFit);
  // Mapping large : 10% → très transparent, 100% → opaque
  if ((a.theme || 'green') === 'light') {
    root.style.setProperty('--panel-alpha', String(0.08 + panelSlider * 0.88));
  } else {
    root.style.setProperty('--panel-alpha', String(0.06 + panelSlider * 0.82));
  }
  root.style.setProperty('--chrome-alpha', String(0.12 + panelSlider * 0.78));
  root.style.setProperty('--panel-blur-extra', panelBlur + 'px');

  let cssUrl = '';
  const raw = String(a.backgroundImage || '').trim();
  if (raw) {
    if (/^data:image\//i.test(raw)) {
      cssUrl = raw;
    } else if (/^https?:\/\//i.test(raw)) {
      if (/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(raw) || /\/image\//i.test(raw)) {
        cssUrl = raw;
      } else {
        cssUrl = '';
      }
    } else if (window.api.resolveBackgroundImage) {
      cssUrl = await window.api.resolveBackgroundImage(raw);
    }
    if (!cssUrl && !/^https?:\/\//i.test(raw)) cssUrl = toCssBackgroundUrl(raw);
  }
  if (token !== appearanceApplyToken) return;

  if (cssUrl && layer) {
    const safe = cssUrl.replace(/"/g, '%22');
    layer.style.backgroundImage = `url("${safe}")`;
    root.style.setProperty('--bg-image-opacity', String(imgOpacity));
    app?.classList.add('has-bg-image');
    if (preview) {
      preview.style.backgroundImage = `url("${safe}")`;
      preview.classList.add('has-image');
    }
    if (previewLabel) previewLabel.textContent = '';
  } else {
    if (layer) layer.style.backgroundImage = 'none';
    root.style.setProperty('--bg-image-opacity', '0');
    app?.classList.remove('has-bg-image');
    if (preview) {
      preview.style.backgroundImage = 'none';
      preview.classList.remove('has-image');
    }
    if (previewLabel) previewLabel.textContent = 'Aucune image';
  }

  // Accent priority: custom picker > image palette > theme presets
  if (customOn && customRgb) {
    applyImageTint({ accent: customRgb, avg: customRgb }, 'Couleur personnalisée');
  } else if (cssUrl && matchColors) {
    if (cssUrl !== lastTintUrl || !lastTintPalette) {
      lastTintUrl = cssUrl;
      lastTintPalette = await extractImagePalette(cssUrl);
    }
    if (token !== appearanceApplyToken) return;
    if (lastTintPalette) {
      applyImageTint(
        lastTintPalette,
        lastTintPalette.grayscale ? 'Palette grise (image)' : 'Palette de l’image appliquée'
      );
    } else clearImageTint();
  } else {
    clearImageTint();
  }

  const customWrap = $('#custom-accent-wrap');
  if (customWrap) customWrap.classList.toggle('is-on', customOn);
  const picker = $('#appearance-custom-accent');
  if (picker && a.customAccent) picker.value = a.customAccent;
  const hue = $('#appearance-accent-hue');
  if (hue && customRgb) {
    const { h } = rgbToHsv(customRgb);
    hue.value = String(Math.round(h));
  }

  const setVal = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  setVal('#appearance-bgopacity-val', Math.round(themeOpacity * 100) + '%');
  setVal('#appearance-bgimgopacity-val', Math.round(imgOpacity * 100) + '%');
  setVal('#appearance-panelopacity-val', Math.round(uiOpacityPct) + '%');
  setVal('#appearance-panelblur-val', panelBlur + 'px');
}

function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255)
  };
}

function updatePlatformBadge(platform) {
  const map = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  const label = map[platform] || platform || 'Unknown';
  ['#platform-badge', '#platform-badge-adv'].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = label;
  });
  const hint = $('#platform-hint');
  if (hint) {
    if (platform === 'darwin') hint.textContent = 'macOS : autorisez Accessibilité dans Réglages → Confidentialité.';
    else if (platform === 'linux') hint.textContent = 'Linux : session X11 recommandée (Wayland peut bloquer les clics).';
    else hint.textContent = 'Windows : lancez via Launch-Windows.bat si SmartScreen apparaît.';
  }
  const hkHint = $('#hotkey-platform-hint');
  if (hkHint) {
    if (platform === 'darwin') hkHint.textContent = 'macOS : Cmd+… (ex: Cmd+1, Shift+F)';
    else if (platform === 'linux') hkHint.textContent = 'Linux : Ctrl+… (ex: Ctrl+1, Shift+F)';
    else hkHint.textContent = 'Windows : Ctrl+… (ex: Ctrl+1, Shift+F)';
  }
  const navHk = $('#nav-hotkey-platform-hint');
  if (navHk) {
    if (platform === 'darwin') navHk.textContent = 'Cliquez un champ puis pressez une touche ou un combo (ex: Shift+F, Cmd+1).';
    else if (platform === 'linux') navHk.textContent = 'Cliquez un champ puis pressez une touche ou un combo (ex: Shift+F, Ctrl+1).';
    else navHk.textContent = 'Cliquez un champ puis pressez une touche ou un combo (ex: Shift+F, Ctrl+1).';
  }
}

function updateStartStopUI(clicking, paused) {
  const isOn = !!clicking;
  const isPaused = !!(paused || state.stats?.paused);
  const label = isOn ? tr('common.stop') : tr('common.start');
  let statusText;
  if (isOn && isPaused) statusText = tr('status.paused');
  else if (isOn) statusText = tr('status.clicking');
  else statusText = `${tr('status.ready')} — <b id="hotkey-display">${(state.settings.hotkey || 'F6').toUpperCase()}</b>`;
  ['#start-stop-btn', '#start-stop-btn-adv'].forEach((sel) => {
    const btn = $(sel);
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle('stop', isOn);
  });
  $$('.status-panel').forEach((p) => {
    p.classList.toggle('is-running', isOn && !isPaused);
    p.classList.toggle('is-paused', isOn && isPaused);
  });
  $('#app')?.classList.toggle('is-running', isOn && !isPaused);
  const big = $('#big-status');
  if (big) big.innerHTML = statusText;
  const bigAdv = $('#big-status-adv');
  if (bigAdv) {
    bigAdv.innerHTML = (isOn && isPaused)
      ? tr('status.paused')
      : (isOn
        ? tr('status.clicking')
        : `${tr('status.ready')} — <b id="hotkey-display-adv">${(state.settings.hotkey || 'F6').toUpperCase()}</b>`);
  }
  updateActiveMouseLabel();
  updateCpsSourceBadge();
}

function updateActiveMouseLabel() {
  const map = { left: 'Gauche', middle: 'Milieu', right: 'Droit' };
  const btn = state.settings?.mouseButton || 'left';
  const el = $('#active-mouse-label');
  if (el) el.textContent = map[btn] || 'Gauche';
}

function syncSegment(containerId, value) {
  const c = $('#' + containerId);
  if (!c) return;
  c.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.val === String(value)));
}

function renderStatsChart() {
  const wrap = $('#stats-chart-wrap');
  const barsEl = $('#stats-chart-bars');
  const metaEl = $('#stats-chart-meta');
  if (!barsEl) return;
  const days = state.stats?.dailyClicks || [];
  if (!days.length || !days.some((d) => (d.clicks || 0) > 0)) {
    if (wrap) wrap.hidden = true;
    barsEl.innerHTML = '';
    if (metaEl) metaEl.textContent = '';
    return;
  }
  if (wrap) wrap.hidden = false;
  const max = Math.max(...days.map((d) => Number(d.clicks) || 0), 1);
  const last = days[days.length - 1];
  if (metaEl) {
    metaEl.textContent = last
      ? `${last.day} · ${(Number(last.clicks) || 0).toLocaleString()} clics`
      : '';
  }
  barsEl.innerHTML = days.map((d) => {
    const clicks = Number(d.clicks) || 0;
    const pct = Math.max(4, Math.round((clicks / max) * 100));
    const title = `${d.day}: ${clicks}`;
    return `<div class="stats-bar" title="${title}" style="--h:${pct}%"></div>`;
  }).join('');
}

function applyHudVisibility() {
  const showCps = state.settings?.appearance?.showLiveCps !== false;
  $$('.live-cps-row, .live-cps-stat, #statusbar-cps-wrap').forEach((el) => {
    el.style.display = showCps ? '' : 'none';
  });
  document.body.classList.toggle('hide-live-cps', !showCps);
}

function updateStatsUI() {
  const s = state.stats || {};
  const clickEl = $('#stat-total-clicks');
  const prev = clickEl?.textContent;
  const next = (s.totalClicks || 0).toLocaleString();
  if (clickEl) {
    clickEl.textContent = next;
    if (prev && prev !== next) {
      clickEl.classList.remove('bump');
      void clickEl.offsetWidth;
      clickEl.classList.add('bump');
    }
  }
  const secs = Math.floor((s.totalClickingTimeMs || 0) / 1000);
  const timeEl = $('#stat-total-time');
  if (timeEl) timeEl.textContent = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  const sess = $('#stat-sessions');
  if (sess) sess.textContent = s.clickingSessions || 0;
  const live = Math.round(s.liveCps || 0);
  ['#live-cps', '#live-cps-adv', '#stat-live-cps', '#statusbar-livecps'].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = String(live);
  });
  const clicksBar = $('#statusbar-clicks');
  if (clicksBar) clicksBar.textContent = s.totalClicks || 0;
  updateGoalsUI();
  applyHudVisibility();
  renderStatsChart();
}

const CPS_TEST_WINDOWS = [1, 5, 10, 15, 30, 60];
const cpsTest = {
  duration: 10,
  active: false,
  done: false,
  startAt: 0,
  clicks: 0,
  timestamps: [],
  raf: 0,
  endTimer: 0,
  source: 'idle' // idle | manual | auto
};

function fmtCps(n) {
  return (Math.round((Number(n) || 0) * 10) / 10).toFixed(1);
}

function cpsWindowLabel(sec) {
  return sec >= 60 ? '1 min' : `${sec} s`;
}

function countLocalClicksInWindow(seconds, now = Date.now()) {
  const cutoff = now - Math.max(1, seconds) * 1000;
  let n = 0;
  for (let i = cpsTest.timestamps.length - 1; i >= 0; i--) {
    if (cpsTest.timestamps[i] < cutoff) break;
    n++;
  }
  return n;
}

function renderCpsTestScores(map) {
  for (const s of CPS_TEST_WINDOWS) {
    const el = $(`#cps-test-${s}`);
    if (el) el.textContent = fmtCps(map?.[String(s)] ?? 0);
  }
}

function syncCpsTestScoresFromStats() {
  renderCpsTestScores(state.stats?.cpsWindows || {});
}

function updateCpsSourceBadge() {
  const badge = $('#cps-source-badge');
  const retry = $('#cps-test-retry');
  if (retry) retry.hidden = !cpsTest.done || cpsTest.active;

  let source = 'idle';
  let label = 'Source : —';
  if (cpsTest.active || cpsTest.done) {
    source = 'manual';
    label = cpsTest.active
      ? 'Source : clics manuels (test en cours)'
      : 'Source : clics manuels (dernier test)';
  } else if (state.stats?.clicking && !state.stats?.paused) {
    source = 'auto';
    label = 'Source : Autoclicker ON';
  } else if (state.stats?.clicking && state.stats?.paused) {
    source = 'auto';
    label = 'Source : Autoclicker en pause';
  } else {
    source = 'idle';
    label = 'Source : Autoclicker OFF';
  }
  cpsTest.source = source;
  if (badge) {
    badge.dataset.source = source;
    badge.textContent = label;
  }
}

function updateCpsTestPadUI(now = Date.now()) {
  const title = $('#cps-test-pad-title');
  const meta = $('#cps-test-pad-meta');
  const score = $('#cps-test-pad-score');
  const pad = $('#cps-test-pad');
  if (!pad) return;
  pad.classList.toggle('is-running', cpsTest.active);
  pad.classList.toggle('is-done', cpsTest.done && !cpsTest.active);

  if (cpsTest.active) {
    const elapsed = Math.max(0, (now - cpsTest.startAt) / 1000);
    const left = Math.max(0, cpsTest.duration - elapsed);
    const cps = elapsed > 0 ? cpsTest.clicks / elapsed : 0;
    if (title) title.textContent = 'Test en cours…';
    if (meta) meta.textContent = `${left.toFixed(1)} s restantes · ${cpsTest.clicks} clics`;
    if (score) score.textContent = `${fmtCps(cps)} CPS`;
  } else if (cpsTest.done) {
    const cps = cpsTest.duration > 0 ? cpsTest.clicks / cpsTest.duration : 0;
    if (title) title.textContent = 'Terminé';
    if (meta) meta.textContent = `${cpsTest.clicks} clics en ${cpsWindowLabel(cpsTest.duration)}`;
    if (score) score.textContent = `${fmtCps(cps)} CPS`;
  } else {
    if (title) title.textContent = 'Cliquez ici';
    if (meta) meta.textContent = `Durée : ${cpsWindowLabel(cpsTest.duration)} · prêt`;
    if (score) score.textContent = '0.0 CPS';
  }
  updateCpsSourceBadge();
}

function finishCpsTest() {
  if (!cpsTest.active) return;
  cpsTest.active = false;
  cpsTest.done = true;
  if (cpsTest.endTimer) { clearTimeout(cpsTest.endTimer); cpsTest.endTimer = 0; }
  if (cpsTest.raf) { cancelAnimationFrame(cpsTest.raf); cpsTest.raf = 0; }
  const map = {};
  for (const s of CPS_TEST_WINDOWS) {
    map[String(s)] = Math.round((countLocalClicksInWindow(s) / s) * 10) / 10;
  }
  renderCpsTestScores(map);
  updateCpsTestPadUI();
}

function tickCpsTest() {
  if (!cpsTest.active) return;
  const now = Date.now();
  const map = {};
  for (const s of CPS_TEST_WINDOWS) {
    map[String(s)] = Math.round((countLocalClicksInWindow(s, now) / s) * 10) / 10;
  }
  renderCpsTestScores(map);
  updateCpsTestPadUI(now);
  cpsTest.raf = requestAnimationFrame(tickCpsTest);
}

function startCpsTest(now = Date.now()) {
  cpsTest.active = true;
  cpsTest.done = false;
  cpsTest.startAt = now;
  cpsTest.clicks = 0;
  cpsTest.timestamps = [];
  if (cpsTest.endTimer) clearTimeout(cpsTest.endTimer);
  cpsTest.endTimer = setTimeout(finishCpsTest, cpsTest.duration * 1000);
  if (cpsTest.raf) cancelAnimationFrame(cpsTest.raf);
  cpsTest.raf = requestAnimationFrame(tickCpsTest);
  updateCpsTestPadUI(now);
}

function resetCpsTest() {
  if (cpsTest.endTimer) clearTimeout(cpsTest.endTimer);
  if (cpsTest.raf) cancelAnimationFrame(cpsTest.raf);
  cpsTest.active = false;
  cpsTest.done = false;
  cpsTest.startAt = 0;
  cpsTest.clicks = 0;
  cpsTest.timestamps = [];
  cpsTest.endTimer = 0;
  cpsTest.raf = 0;
  updateCpsTestPadUI();
  syncCpsTestScoresFromStats();
  updateCpsSourceBadge();
}

function retryCpsTest() {
  resetCpsTest();
  // Leave pad ready — next click starts; or auto-start empty ready state
  updateCpsTestPadUI();
}

function bindCpsTest() {
  const dur = $('#cps-test-duration');
  dur?.querySelectorAll('button[data-sec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cpsTest.duration = Number(btn.getAttribute('data-sec')) || 10;
      dur.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      if (!cpsTest.active) {
        if (cpsTest.done) resetCpsTest();
        else updateCpsTestPadUI();
      }
    });
  });

  const pad = $('#cps-test-pad');
  pad?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (!cpsTest.active) startCpsTest(now);
    if (!cpsTest.active) return;
    cpsTest.clicks += 1;
    cpsTest.timestamps.push(now);
    const cutoff = now - 60000;
    while (cpsTest.timestamps.length && cpsTest.timestamps[0] < cutoff) cpsTest.timestamps.shift();
    pad.classList.remove('is-hit');
    void pad.offsetWidth;
    pad.classList.add('is-hit');
    updateCpsTestPadUI(now);
  });

  $('#cps-test-retry')?.addEventListener('click', () => retryCpsTest());
  $('#cps-test-reset')?.addEventListener('click', () => resetCpsTest());
  updateCpsTestPadUI();
  syncCpsTestScoresFromStats();
  updateCpsSourceBadge();
}

function updateGoalsUI() {
  const g = state.settings?.goals || {};
  const today = state.stats?.todayClicks ?? 0;
  const target = Math.max(1, Number(g.dailyClicks) || 10000);
  const pct = Math.min(100, Math.round((today / target) * 100));
  const bar = $('#goal-daily-bar');
  if (bar) bar.style.width = pct + '%';
  const label = $('#goal-daily-label');
  if (label) label.textContent = `${today} / ${target}`;
}

function needsHighCpsConfirm() {
  const conf = state.settings?.confirmHighCps;
  if (!conf?.enabled) return false;
  const cps = Number(state.settings?.cps) || 0;
  return cps > (Number(conf.threshold) || 100);
}

let confirmCpsResolver = null;
function askHighCpsConfirm() {
  return new Promise((resolve) => {
    confirmCpsResolver = resolve;
    const conf = state.settings?.confirmHighCps || {};
    const cps = Number(state.settings?.cps) || 0;
    const text = $('#confirm-cps-text');
    if (text) text.textContent = tr('confirm.dialog', { cps, threshold: conf.threshold || 100 });
    const modal = $('#confirm-cps-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    } else {
      resolve(window.confirm(tr('confirm.dialog', { cps, threshold: conf.threshold || 100 })));
    }
  });
}

function bindConfirmCpsModal() {
  const close = (ok) => {
    $('#confirm-cps-modal')?.classList.add('hidden');
    $('#confirm-cps-modal')?.setAttribute('aria-hidden', 'true');
    if (confirmCpsResolver) {
      confirmCpsResolver(!!ok);
      confirmCpsResolver = null;
    }
  };
  $('#confirm-cps-ok')?.addEventListener('click', () => close(true));
  $('#confirm-cps-cancel')?.addEventListener('click', () => close(false));
}

async function requestStartOrToggle() {
  const clicking = !!state.stats?.clicking;
  if (clicking) {
    const r = await window.api.toggleClicking();
    updateStartStopUI(r.clicking, r.paused);
    return;
  }
  if (needsHighCpsConfirm()) {
    const ok = await askHighCpsConfirm();
    if (!ok) return;
    const r = await window.api.startClicking({ confirmed: true });
    updateStartStopUI(r.clicking, r.paused);
    return;
  }
  const r = await window.api.toggleClicking();
  updateStartStopUI(r.clicking, r.paused);
}

// ---------- NAV ----------
function bindNav() {
  const map = {
    'nav-settings': 'settings',
    'nav-macros': 'macros',
    'nav-advanced': 'advanced',
    'nav-zones': 'zones',
    'nav-points': 'points',
    'nav-cpstest': 'cpstest'
  };
  Object.entries(map).forEach(([btnId, view]) => {
    $('#' + btnId)?.addEventListener('click', () => switchView(view));
  });
  switchView('advanced');
  document.addEventListener('keydown', (e) => {
    const kb = state.settings.keybinds;
    if (!kb) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (document.querySelector('.capturing')) return;
    if (eventMatchesBinding(e, kb.simple)) { e.preventDefault(); switchView('simple'); }
    else if (eventMatchesBinding(e, kb.advanced)) { e.preventDefault(); switchView('advanced'); }
    else if (eventMatchesBinding(e, kb.zones)) { e.preventDefault(); switchView('zones'); }
    else if (eventMatchesBinding(e, kb.clickPoints)) { e.preventDefault(); switchView('points'); }
    else if (eventMatchesBinding(e, kb.settings)) { e.preventDefault(); switchView('settings'); }
  });
}
function switchView(view) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) {
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }
  $$('#titlebar-left .icon-btn').forEach(b => b.classList.remove('active-nav'));
  const navMap = {
    settings: 'nav-settings',
    macros: 'nav-macros',
    advanced: 'nav-advanced',
    zones: 'nav-zones',
    points: 'nav-points',
    cpstest: 'nav-cpstest'
  };
  if (navMap[view]) $('#' + navMap[view])?.classList.add('active-nav');
  // AutoClick (souris) = fenêtre compacte ; le reste = plus large
  const compact = view === 'advanced' || view === 'simple';
  window.api.setWindowMode?.(compact ? 'compact' : 'full');
}

function bindTitlebar() {
  $('#min-btn').addEventListener('click', () => window.api.winMinimize());
  $('#close-btn').addEventListener('click', () => window.api.winClose());
  let pinned = false;
  $('#pin-btn').addEventListener('click', () => { pinned = !pinned; window.api.winPin(pinned); $('#pin-btn').classList.toggle('active-nav', pinned); });
}

function bindDropdown(btnId, menuId, onSelect) {
  const btn = $('#' + btnId), menu = $('#' + menuId);
  btn.addEventListener('click', (e) => { e.stopPropagation(); $$('.dropdown-menu').forEach(m => m !== menu && m.classList.remove('show')); menu.classList.toggle('show'); });
  menu.querySelectorAll('div').forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.val;
      btn.textContent = item.textContent + ' ▾';
      menu.classList.remove('show');
      onSelect(val);
    });
  });
  document.addEventListener('click', () => menu.classList.remove('show'));
}

function bindSegmented(containerId, onSelect) {
  const c = $('#' + containerId);
  if (!c) return;
  c.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      c.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.val);
    });
  });
}

async function pushSettings(partial) {
  state.settings = await window.api.updateSettings(partial);
  updateStartStopUI(state.stats.clicking, state.stats.paused);
  if (partial.hotkey != null) {
    const hk = (state.settings.hotkey || '').toUpperCase();
    if ($('#hotkey-input')) $('#hotkey-input').value = state.settings.hotkey;
    if ($('#adv-hotkey-input')) $('#adv-hotkey-input').value = state.settings.hotkey;
    if ($('#hotkey-display')) $('#hotkey-display').textContent = hk;
    if ($('#hotkey-display-adv')) $('#hotkey-display-adv').textContent = hk;
  }
  if (partial.appearance) {
    if (partial.appearance.theme) applyTheme(state.settings.appearance.theme);
    if (partial.appearance.uiMode) applyUiMode(state.settings.appearance.uiMode);
    applyAppearance();
  }
  if (partial.language != null) {
    applyLanguage();
    updateStartStopUI(state.stats?.clicking, state.stats?.paused);
  }
  if (partial.goals) updateGoalsUI();
}

// ---------- SIMPLE ----------
function bindSimple() {
  $('#cps-input').addEventListener('change', (e) => pushSettings({ cps: Number(e.target.value) }));
  $('#hotkey-input').addEventListener('change', (e) => pushSettings({ hotkey: e.target.value }));
  $('#hotkey-capture-btn')?.addEventListener('click', () => {
    captureNextKey('#hotkey-input', (combo) => pushSettings({ hotkey: combo }));
  });
  bindDropdown('rate-unit-btn', 'rate-unit-menu', (v) => pushSettings({ rateUnit: v }));
  bindDropdown('rate-mode-btn', 'rate-mode-menu', (v) => pushSettings({ rateMode: v }));
  bindDropdown('hotkey-mode-btn', 'hotkey-mode-menu', (v) => pushSettings({ hotkeyMode: v }));
  bindSegmented('mouse-btn-segment', async (v) => {
    await pushSettings({ mouseButton: v });
    syncSegment('adv-mouse-segment', v);
    updateActiveMouseLabel();
  });
  bindSegmented('max-cps-segment', (v) => pushSettings({ maxCps: Number(v) }));
  $('#duty-cycle-input').addEventListener('change', (e) => pushSettings({ dutyCycle: Number(e.target.value) }));
  $('#speed-random-input').addEventListener('change', (e) => pushSettings({ speedRandomization: { ...state.settings.speedRandomization, percent: Number(e.target.value), enabled: Number(e.target.value) > 0 } }));
  $('#clicker-type-btn').addEventListener('click', () => { $('#clicker-type-btn').classList.add('active'); $('#clicker-type-kb-btn').classList.remove('active'); pushSettings({ clickerType: 'mouse' }); });
  $('#clicker-type-kb-btn').addEventListener('click', () => { $('#clicker-type-kb-btn').classList.add('active'); $('#clicker-type-btn').classList.remove('active'); pushSettings({ clickerType: 'keyboard' }); });
  $('#start-stop-btn').addEventListener('click', () => requestStartOrToggle());
  $('#start-stop-btn-adv')?.addEventListener('click', () => requestStartOrToggle());
}

// ---------- ADVANCED ----------
function bindAdvanced() {
  $('#adv-cps-input').addEventListener('change', (e) => { pushSettings({ cps: Number(e.target.value) }); syncAdvIntervalDisplay(); });
  bindSegmented('adv-limits-toggle', (v) => pushSettings({ limits: { ...state.settings.limits, enabled: v === 'on' } }));
  bindSegmented('adv-limits-mode', (v) => pushSettings({ limits: { ...state.settings.limits, mode: v } }));
  $('#adv-limits-value').addEventListener('change', (e) => {
    const mode = state.settings.limits.mode;
    pushSettings({ limits: { ...state.settings.limits, [mode === 'click' ? 'clicks' : 'timeSeconds']: Number(e.target.value) } });
  });
  bindSegmented('adv-duty-mode', () => {});
  $('#adv-duty-input').addEventListener('change', (e) => pushSettings({ dutyCycle: Number(e.target.value) }));
  bindSegmented('adv-randspeed-toggle', (v) => pushSettings({ speedRandomization: { ...state.settings.speedRandomization, enabled: v === 'on' } }));
  $('#adv-randspeed-input').addEventListener('change', (e) => pushSettings({ speedRandomization: { ...state.settings.speedRandomization, percent: Number(e.target.value) } }));
  bindSegmented('adv-dblclick', (v) => pushSettings({ doubleClick: v === 'on' }));
  bindSegmented('adv-mouse-segment', async (v) => {
    await pushSettings({ mouseButton: v });
    syncSegment('mouse-btn-segment', v);
    updateActiveMouseLabel();
  });
  $('#adv-hotkey-input').addEventListener('change', (e) => pushSettings({ hotkey: e.target.value }));
  $('#adv-edit-hotkey').addEventListener('click', () => {
    captureNextKey('#adv-hotkey-input', (combo) => pushSettings({ hotkey: combo }));
  });
  $('#adv-hkmode-toggle')?.addEventListener('click', () => {
    $('#adv-hkmode-toggle').classList.add('active');
    $('#adv-hkmode-hold')?.classList.remove('active');
    pushSettings({ hotkeyMode: 'toggle' });
  });
  $('#adv-hkmode-hold')?.addEventListener('click', () => {
    $('#adv-hkmode-hold').classList.add('active');
    $('#adv-hkmode-toggle')?.classList.remove('active');
    pushSettings({ hotkeyMode: 'hold' });
  });
}
function syncAdvIntervalDisplay() {
  const cps = state.settings.cps || 60;
  const el = $('#adv-interval-display');
  if (el) el.textContent = `${Math.round(1000 / cps)}ms d'intervalle`;
}

function keyTokenFromEvent(e) {
  const code = e.code || '';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && code.length > 6) {
    const n = code.slice(6).toLowerCase();
    if (/^\d$/.test(n)) return n;
  }
  if (/^F([1-9]|1[0-2])$/i.test(e.key)) return e.key.toUpperCase();
  const special = {
    ' ': 'space', Space: 'space',
    Escape: 'escape', Esc: 'escape',
    Tab: 'tab', Enter: 'enter',
    Backspace: 'backspace', Delete: 'delete',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Insert: 'insert'
  };
  if (special[e.key]) return special[e.key];
  if (e.key && e.key.length === 1) return e.key.toLowerCase();
  return null;
}

function formatHotkeyFromEvent(e) {
  const key = keyTokenFromEvent(e);
  if (!key) return null;
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const displayKey = /^f\d{1,2}$/i.test(key) ? key.toUpperCase() : (key.length === 1 ? key.toUpperCase() : key);
  parts.push(displayKey);
  return parts.join('+');
}

function parseBinding(str) {
  const parts = String(str || '').toLowerCase().split(/[+\-]/).map(s => s.trim()).filter(Boolean);
  const mods = new Set(parts.filter(p => ['ctrl', 'control', 'alt', 'option', 'shift', 'cmd', 'meta', 'command', 'super'].includes(p)));
  const key = parts.find(p => !mods.has(p)) || null;
  return {
    ctrl: mods.has('ctrl') || mods.has('control'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
    meta: mods.has('cmd') || mods.has('meta') || mods.has('command') || mods.has('super'),
    key
  };
}

function eventMatchesBinding(e, bindingStr) {
  const b = parseBinding(bindingStr);
  if (!b.key) return false;
  if (!!b.ctrl !== !!e.ctrlKey) return false;
  if (!!b.alt !== !!e.altKey) return false;
  if (!!b.shift !== !!e.shiftKey) return false;
  if (!!b.meta !== !!e.metaKey) return false;
  const ek = keyTokenFromEvent(e);
  if (!ek) return false;
  return ek.toLowerCase() === b.key.toLowerCase();
}

function captureNextKey(inputSel, onDone) {
  const input = typeof inputSel === 'string' ? $(inputSel) : inputSel;
  if (!input) return;
  const prev = input.value;
  input.value = 'Appuyez une touche… (Échap = annuler)';
  input.classList.add('capturing');
  // Coupe F6 / panic / pause / macros le temps de choisir la nouvelle touche
  window.api.setHotkeyCapture?.(true);
  const finish = (combo) => {
    input.classList.remove('capturing');
    document.removeEventListener('keydown', handler, true);
    window.api.setHotkeyCapture?.(false);
    if (combo) {
      input.value = combo;
      if (typeof onDone === 'function') onDone(combo);
      else input.dispatchEvent(new Event('change'));
    } else {
      input.value = prev || '';
    }
  };
  const handler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
      return;
    }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const combo = formatHotkeyFromEvent(e);
    if (!combo) return;
    finish(combo);
  };
  document.addEventListener('keydown', handler, true);
}

function bindSupportLinks() {
  $$('.support-link[data-url]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) window.api.openExternal(url);
    });
  });
}

function bindDiscord() {
  const user = state.discordUser || 'LuLune0193';
  const label = $('#discord-user');
  if (label) label.textContent = user;
  const copy = async () => {
    const ok = await window.api.copyText(user);
    $('#statusbar-mid').textContent = ok ? `Discord copié : ${user}` : 'Copie Discord échouée';
  };
  $('#discord-copy-btn')?.addEventListener('click', copy);
  $('#discord-copy-btn-wide')?.addEventListener('click', copy);
}

function bindTutorial() {
  const modal = $('#tutorial-modal');
  if (!modal) return;
  if (!state.settings?.startup?.tutorialSeen) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  $('#tutorial-dismiss-btn')?.addEventListener('click', async () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    await pushSettings({ startup: { tutorialSeen: true } });
  });
}

// ---------- ZONES ----------
function bindZones() {
  bindSegmented('corner-stop-toggle', (v) => pushSettings({ stopZones: { cornerStop: { ...state.settings.stopZones.cornerStop, enabled: v === 'on' } } }));
  bindSegmented('edge-stop-toggle', (v) => pushSettings({ stopZones: { edgeStop: { ...state.settings.stopZones.edgeStop, enabled: v === 'on' } } }));
  bindSegmented('custom-zones-toggle', (v) => pushSettings({ stopZones: { customZones: { ...state.settings.stopZones.customZones, enabled: v === 'on' } } }));
  $$('.corner-input').forEach(inp => inp.addEventListener('change', saveCornerSizes));
  $$('.edge-input').forEach(inp => inp.addEventListener('change', saveEdgeSizes));
  $('#add-zone-btn')?.addEventListener('click', async () => {
    const r = await window.api.drawZone();
    if (r?.ok) {
      state.settings = r.settings;
      renderCustomZones();
      syncSegment('custom-zones-toggle', 'on');
      $('#statusbar-mid').textContent = 'Zone personnalisée ajoutée';
    }
  });
}
function saveCornerSizes() {
  const sizes = $$('.corner-input').map(i => Number(i.value));
  pushSettings({ stopZones: { cornerStop: { ...state.settings.stopZones.cornerStop, sizes } } });
}
function saveEdgeSizes() {
  const sizes = $$('.edge-input').map(i => Number(i.value));
  pushSettings({ stopZones: { edgeStop: { ...state.settings.stopZones.edgeStop, sizes } } });
}
function renderCustomZones() {
  const list = $('#custom-zones-list');
  const empty = $('#zones-empty-hint');
  const zones = state.settings?.stopZones?.customZones?.zones || [];
  if (!list) return;
  if (!zones.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = zones.map((z, i) => `
    <div class="zone-item">
      <span>${z.name || 'Zone'} · ${z.w}×${z.h} @ ${z.x},${z.y}</span>
      <button type="button" data-i="${i}">✕</button>
    </div>`).join('');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const next = zones.filter((_, idx) => idx !== Number(b.dataset.i));
    await pushSettings({ stopZones: { customZones: { ...state.settings.stopZones.customZones, zones: next, enabled: next.length > 0 } } });
    renderCustomZones();
  }));
}

// ---------- CLICK POINTS ----------
let picking = false;
function bindPoints() {
  bindSegmented('click-points-toggle', (v) => pushSettings({ clickPoints: { ...state.settings.clickPoints, enabled: v === 'on' } }));
  bindSegmented('points-stop-complete', (v) => pushSettings({ clickPoints: { ...state.settings.clickPoints, stopWhenComplete: v === 'on' } }));
  $('#start-picking-btn').addEventListener('click', async () => {
    picking = !picking;
    $('#start-picking-btn').textContent = picking ? 'Clic droit pour ajouter (Échap pour arrêter)' : 'Commencer à choisir';
    if (picking) armPicking();
  });
}
async function armPicking() {
  const onContext = async (e) => {
    if (!picking) { document.removeEventListener('contextmenu', onContext); return; }
    e.preventDefault();
    const pos = await window.api.getCursorPos();
    const points = [...state.settings.clickPoints.points, { x: pos.x, y: pos.y, clicks: state.settings.clickPointsDefaults.clicks, radius: state.settings.clickPointsDefaults.radius }];
    await pushSettings({ clickPoints: { ...state.settings.clickPoints, points } });
    renderPoints();
  };
  document.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { picking = false; $('#start-picking-btn').textContent = 'Commencer à choisir'; document.removeEventListener('keydown', esc); }
  });
}
function renderPoints() {
  const list = $('#points-list');
  const pts = state.settings.clickPoints?.points || [];
  if (!list) return;
  if (!pts.length) { list.innerHTML = '<div class="empty-hint">Aucun point de clic pour le moment.</div>'; return; }
  list.innerHTML = pts.map((p, i) => `<div class="point-item"><span>Point ${i + 1}: (${p.x}, ${p.y})</span><button data-i="${i}">✕</button></div>`).join('');
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const points = state.settings.clickPoints.points.filter((_, idx) => idx !== Number(b.dataset.i));
    await pushSettings({ clickPoints: { ...state.settings.clickPoints, points } });
    renderPoints();
  }));
}

// ---------- MACROS ----------
function bindMacrosUI() {
  $('#record-macro-btn')?.addEventListener('click', toggleRecording);
  $('#save-macro-btn')?.addEventListener('click', saveMacro);
  $('#macro-new-btn')?.addEventListener('click', async () => {
    if (recording) await window.api.macroStopRecording();
    recording = false;
    editingMacroId = null;
    recordedSteps = [];
    await window.api.macroClearSteps();
    $('#macro-name-input').value = '';
    $('#macro-hotkey-input').value = '';
    updateMacroRecordingUI();
    updateMacroPreview();
    $('#statusbar-mid').textContent = 'Nouvelle macro';
  });
  $('#macro-edit-hotkey')?.addEventListener('click', () => {
    captureNextKey('#macro-hotkey-input', (combo) => { $('#macro-hotkey-input').value = combo; });
  });
  const syncFromApi = (r) => {
    recordedSteps = r?.steps || [];
    recording = !!r?.recording;
    updateMacroRecordingUI();
    updateMacroPreview();
  };
  $('#macro-add-click-btn')?.addEventListener('click', async () => {
    syncFromApi(await window.api.macroAddClick('left'));
  });
  $('#macro-add-right-btn')?.addEventListener('click', async () => {
    syncFromApi(await window.api.macroAddClick('right'));
  });
  $('#macro-add-delay-btn')?.addEventListener('click', async () => {
    syncFromApi(await window.api.macroAddDelay(200));
  });
  $('#macro-clear-btn')?.addEventListener('click', async () => {
    syncFromApi(await window.api.macroClearSteps());
  });
  $('#macro-add-key-btn')?.addEventListener('click', async () => {
    const key = $('#macro-key-input').value.trim();
    if (!key) {
      $('#statusbar-mid').textContent = 'Tapez une touche (ex: a ou enter)';
      return;
    }
    syncFromApi(await window.api.macroAddKey(key));
    $('#macro-key-input').value = '';
  });
  $('#macro-key-input')?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    $('#macro-add-key-btn')?.click();
  });
  $('#macro-add-sequence-btn')?.addEventListener('click', async () => {
    const seq = $('#macro-sequence-input')?.value.trim();
    if (!seq) {
      $('#statusbar-mid').textContent = 'Ex: a b enter  (plusieurs touches)';
      return;
    }
    syncFromApi(await window.api.macroAddSequence(seq));
    $('#macro-sequence-input').value = '';
  });
  $('#macro-sequence-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    $('#macro-add-sequence-btn')?.click();
  });
  $('#macro-import-share-btn')?.addEventListener('click', async () => {
    const r = await window.api.macroShareDecode();
    if (r?.ok) {
      state.macros = r.macros;
      renderMacros();
      $('#statusbar-mid').textContent = `Macro importée : ${r.macro?.name || ''}`;
    } else {
      $('#statusbar-mid').textContent = `Import base64 échoué : ${r?.error || 'erreur'}`;
    }
  });
  $('#export-macros-btn')?.addEventListener('click', async () => {
    const r = await window.api.exportMacros();
    if (r?.ok) $('#statusbar-mid').textContent = 'Macros exportées';
  });
  $('#import-macros-btn')?.addEventListener('click', async () => {
    const r = await window.api.importMacros();
    if (r?.ok) {
      state.macros = r.macros;
      renderMacros();
      $('#statusbar-mid').textContent = `Macros importées (+${r.added || 0})`;
    }
  });
}

async function toggleRecording() {
  if (!recording) {
    editingMacroId = null;
    const r = await window.api.macroStartRecording();
    recording = true;
    recordedSteps = r.steps || [];
  } else {
    const r = await window.api.macroStopRecording();
    recording = false;
    recordedSteps = r.steps || [];
  }
  updateMacroRecordingUI();
  updateMacroPreview();
}

function updateMacroRecordingUI() {
  const btn = $('#record-macro-btn');
  if (!btn) return;
  if (recording) {
    btn.textContent = '■ Stop Rec (F9)';
    btn.classList.add('recording');
  } else {
    btn.textContent = '● Rec (F8)';
    btn.classList.remove('recording');
  }
}

function updateMacroPreview() {
  const steps = recordedSteps || [];
  const actions = steps.filter(s => s.type !== 'delay');
  const preview = $('#macro-steps-preview');
  if (preview) {
    preview.textContent = actions.length
      ? `${actions.length} étape(s) prêtes — Sauvegarder pour les garder`
      : 'Aucune étape — + Clic, + Touche ou + Touches (ex: a b enter).';
  }
  const list = $('#macro-steps-list');
  if (!list) return;
  if (!steps.length) { list.innerHTML = ''; return; }
  list.innerHTML = steps.slice(0, 40).map((s) => {
    if (s.type === 'delay') return `<div class="macro-step-item"><span>Délai</span><b>${s.ms}ms</b></div>`;
    if (s.type === 'click') return `<div class="macro-step-item"><span>Clic ${s.button || 'left'}</span><b>${s.x}, ${s.y}</b></div>`;
    if (s.type === 'key') return `<div class="macro-step-item"><span>Touche</span><b>${s.key}</b></div>`;
    if (s.type === 'sequence') return `<div class="macro-step-item"><span>Touches</span><b>${(s.keys || []).join(' → ')}</b></div>`;
    return `<div class="macro-step-item"><span>${s.type}</span><b>…</b></div>`;
  }).join('');
}

async function saveMacro() {
  if (recording) {
    const r = await window.api.macroStopRecording();
    recording = false;
    recordedSteps = r.steps || recordedSteps;
    updateMacroRecordingUI();
  }
  // Sync draft to main in case we edited without recording mode
  await window.api.macroSetSteps?.(recordedSteps);
  const name = $('#macro-name-input').value.trim() || `Macro ${state.macros.length + 1}`;
  const hotkey = $('#macro-hotkey-input').value.trim();
  if (!recordedSteps.length) {
    $('#macro-steps-preview').textContent = 'Ajoutez au moins une étape (+ Clic ou + Touches) avant de sauvegarder.';
    return;
  }
  if (!hotkey) {
    $('#statusbar-mid').textContent = 'Astuce : capturez un raccourci, sinon utilisez ▶ dans la liste';
  }
  const macro = { id: editingMacroId || ('m_' + Date.now()), name, hotkey, steps: recordedSteps };
  state.macros = await window.api.saveMacro(macro);
  editingMacroId = null;
  renderMacros();
  $('#macro-name-input').value = '';
  $('#macro-hotkey-input').value = '';
  recordedSteps = [];
  await window.api.macroClearSteps();
  updateMacroPreview();
  $('#statusbar-mid').textContent = `Macro sauvegardée: ${name}${hotkey ? ' · ' + hotkey : ''}`;
}

function renderMacros() {
  const list = $('#macros-list');
  if (!list) return;
  if (!state.macros.length) { list.innerHTML = '<div class="empty-hint">Aucune macro enregistrée.</div>'; return; }
  list.innerHTML = state.macros.map(m => `
    <div class="preset-card">
      <div class="preset-top"><b>${m.name}</b><span class="preset-date">${m.hotkey || 'aucun raccourci'}</span></div>
      <div class="hint">${(m.steps || []).filter(s => s.type !== 'delay').length} étape(s)</div>
      <div class="preset-actions">
        <button class="apply" data-act="run" data-id="${m.id}">▶ Jouer</button>
        <button data-act="edit" data-id="${m.id}">Modifier</button>
        <button data-act="share" data-id="${m.id}">Partager</button>
        <button class="delete" data-act="del" data-id="${m.id}">Supprimer</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'run') {
      const macro = state.macros.find((x) => x.id === id);
      $('#statusbar-mid').textContent = 'Exécution macro…';
      const ok = await window.api.runMacro(id);
      $('#statusbar-mid').textContent = ok ? `Macro jouée : ${macro?.name || ''}` : 'Macro échouée — vérifiez les étapes / moteur';
    }
    if (act === 'del') { state.macros = await window.api.deleteMacro(id); renderMacros(); }
    if (act === 'share') {
      const r = await window.api.macroShareEncode(id);
      $('#statusbar-mid').textContent = r?.ok ? 'Macro copiée (base64)' : (r?.error || 'Échec partage');
    }
    if (act === 'edit') {
      const m = state.macros.find(x => x.id === id);
      if (!m) return;
      if (recording) {
        await window.api.macroStopRecording();
        recording = false;
        updateMacroRecordingUI();
      }
      $('#macro-name-input').value = m.name;
      $('#macro-hotkey-input').value = m.hotkey || '';
      recordedSteps = [...(m.steps || [])];
      editingMacroId = id;
      await window.api.macroSetSteps?.(recordedSteps);
      updateMacroPreview();
      $('#statusbar-mid').textContent = `Édition : ${m.name}`;
    }
  }));
}

function enhanceNumberInputs() {
  $$('input[type="number"]').forEach((input) => {
    if (input.closest('.num-stepper') || input.dataset.enhanced === '1') return;
    input.dataset.enhanced = '1';
  });
}

// ---------- SETTINGS TABS ----------
function bindSettingsTabs() {
  $$('.settings-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.settings-tab').forEach(t => t.classList.remove('active'));
    $$('.settings-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`.settings-pane[data-pane="${tab.dataset.tab}"]`)?.classList.add('active');
  }));
}

function renderProcessList() {
  const list = $('#process-list');
  if (!list) return;
  const selected = state.settings?.processList?.selected || [];
  if (!selected.length) {
    list.innerHTML = '<div class="empty-hint">Aucun processus.</div>';
    return;
  }
  list.innerHTML = selected.map((name, i) => `
    <span class="process-chip">${name}<button type="button" data-i="${i}">✕</button></span>
  `).join('');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const next = selected.filter((_, idx) => idx !== Number(b.dataset.i));
    await pushSettings({ processList: { ...state.settings.processList, selected: next } });
    renderProcessList();
  }));
}

function renderChangelog(items) {
  const list = $('#changelog-list');
  if (!list) return;
  const data = items?.length ? items : (state.changelog || []);
  if (!data.length) {
    list.innerHTML = '<div class="empty-hint">Changelog vide.</div>';
    return;
  }
  list.innerHTML = data.map((c) => `
    <div class="changelog-item">
      <div class="changelog-v">v${c.v}</div>
      ${c.title ? `<div class="changelog-title">${c.title}</div>` : ''}
      <ul>${(c.items || []).map((i) => `<li>${i}</li>`).join('')}</ul>
    </div>
  `).join('');
}

// ---------- BEHAVIOR / APPEARANCE / KEYBINDS ----------
function bindBehaviorAppearanceKeybinds() {
  const map = [
    ['behavior-alwaysontop', 'alwaysOnTop'], ['behavior-hitbox', 'stopHitboxOverlay'], ['behavior-stopalert', 'stopReasonAlert'],
    ['behavior-strict', 'strictHotkeyModifiers'], ['behavior-alttab', 'stopOnAltTab'], ['behavior-extended', 'extendedClickSpeedLimit']
  ];
  map.forEach(([id, key]) => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('change', (e) => pushSettings({ behavior: { ...state.settings.behavior, [key]: e.target.checked } }));
  });
  [['startup-tray', 'minimizeToTray'], ['startup-remember', 'rememberWindowPosition'], ['startup-run', 'runOnStartup']].forEach(([id, key]) => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('change', (e) => pushSettings({ startup: { ...state.settings.startup, [key]: e.target.checked } }));
  });

  $('#sounds-enabled')?.addEventListener('change', (e) => pushSettings({ sounds: { ...state.settings.sounds, enabled: e.target.checked } }));
  $('#sounds-volume')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if ($('#sounds-volume-val')) $('#sounds-volume-val').textContent = v + '%';
  });
  $('#sounds-volume')?.addEventListener('change', (e) => pushSettings({ sounds: { ...state.settings.sounds, volume: Number(e.target.value) } }));
  $('#antidetect-enabled')?.addEventListener('change', (e) => pushSettings({ antiDetect: { ...state.settings.antiDetect, enabled: e.target.checked } }));
  $('#appearance-autohide')?.addEventListener('change', (e) => pushSettings({ appearance: { ...state.settings.appearance, autoHideOnClick: e.target.checked } }));
  $('#behavior-hideoverlaypaused')?.addEventListener('change', (e) => pushSettings({ behavior: { ...state.settings.behavior, hideOverlayWhenPaused: e.target.checked } }));
  bindSegmented('discordrpc-toggle', (v) => pushSettings({ discordRpc: { ...state.settings.discordRpc, enabled: v === 'on' } }));
  $('#discord-clientid')?.addEventListener('change', async (e) => {
    const clientId = e.target.value.trim();
    await pushSettings({
      discordRpc: {
        ...state.settings.discordRpc,
        clientId,
        largeImageKey: 'logo',
        enabled: clientId ? true : !!state.settings.discordRpc?.enabled
      }
    });
    if (clientId) syncSegment('discordrpc-toggle', 'on');
    $('#statusbar-mid').textContent = clientId
      ? 'Discord RPC : Client ID OK — pense à renommer l’app en LuLuneAutoClicker + asset logo'
      : 'Discord RPC : Client ID vidé';
  });
  $('#discord-open-portal')?.addEventListener('click', () => {
    window.api.openExternal('https://discord.com/developers/applications');
  });
  $('#discord-open-logo')?.addEventListener('click', async () => {
    const r = await window.api.revealDiscordLogo?.();
    $('#statusbar-mid').textContent = r?.ok
      ? 'Logo Discord ouvert — uploade-le comme asset « logo »'
      : (r?.error || 'Logo introuvable');
  });
  bindSegmented('language-segment', (v) => pushSettings({ language: v === 'en' ? 'en' : 'fr' }));
  bindSegmented('uimode-segment', (v) => {
    applyUiMode(v);
    pushSettings({ appearance: { ...state.settings.appearance, uiMode: v } });
  });
  bindSegmented('overlay-position-segment', (v) => pushSettings({ appearance: { ...state.settings.appearance, overlayPosition: v } }));
  $('#appearance-overlayopacity')?.addEventListener('input', (e) => {
    if ($('#appearance-overlayopacity-val')) $('#appearance-overlayopacity-val').textContent = Number(e.target.value) + '%';
  });
  $('#appearance-overlayopacity')?.addEventListener('change', (e) => {
    pushSettings({ appearance: { ...state.settings.appearance, overlayOpacity: Number(e.target.value) } });
  });
  $('#hotkey-panic-capture')?.addEventListener('click', () => {
    captureNextKey('#hotkey-panic', (combo) => pushSettings({ hotkeys: { ...state.settings.hotkeys, panic: combo } }));
  });
  $('#hotkey-pause-capture')?.addEventListener('click', () => {
    captureNextKey('#hotkey-pause', (combo) => pushSettings({ hotkeys: { ...state.settings.hotkeys, pause: combo } }));
  });
  bindSegmented('goals-toggle', (v) => pushSettings({ goals: { ...state.settings.goals, enabled: v === 'on' } }));
  $('#goals-daily')?.addEventListener('change', (e) => pushSettings({ goals: { ...state.settings.goals, dailyClicks: Number(e.target.value) } }));
  $('#goals-session')?.addEventListener('change', (e) => pushSettings({ goals: { ...state.settings.goals, sessionClicks: Number(e.target.value) } }));

  const appearanceKeyMap = {
    bgopacity: 'backgroundOpacity',
    bgimgopacity: 'backgroundImageOpacity',
    panelopacity: 'panelOpacity',
    panelblur: 'panelBlur'
  };
  ['bgopacity', 'bgimgopacity', 'panelopacity', 'panelblur'].forEach(name => {
    const input = $('#appearance-' + name);
    if (!input) return;
    input.addEventListener('input', () => {
      const key = appearanceKeyMap[name];
      applyAppearance({ [key]: Number(input.value) });
    });
    input.addEventListener('change', () => {
      const key = appearanceKeyMap[name];
      pushSettings({ appearance: { ...state.settings.appearance, [key]: Number(input.value) } });
    });
  });
  $('#appearance-bgimage')?.addEventListener('change', async (e) => {
    let val = e.target.value.trim();
    if (val && !/^data:image\//i.test(val) && !/^file:/i.test(val)) {
      if (!/^https?:\/\//i.test(val) || !/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/i.test(val)) {
        $('#statusbar-mid').textContent = 'URL refusée — image uniquement (.png .jpg .webp .gif .bmp)';
        e.target.value = state.settings?.appearance?.backgroundImage || '';
        return;
      }
    }
    await pushSettings({ appearance: { ...state.settings.appearance, backgroundImage: val } });
    applyAppearance();
  });
  $('#appearance-pick-image')?.addEventListener('click', async () => {
    const url = await window.api.pickBackgroundImage();
    if (!url) {
      $('#statusbar-mid').textContent = 'Aucune image sélectionnée (PNG/JPG/WEBP/GIF/BMP)';
      return;
    }
    if ($('#appearance-bgimage')) $('#appearance-bgimage').value = url;
    await pushSettings({ appearance: { ...state.settings.appearance, backgroundImage: url } });
    applyAppearance();
    $('#statusbar-mid').textContent = /\.gif($|\?)/i.test(url) || url.includes('.gif')
      ? 'GIF de fond appliqué'
      : 'Image de fond appliquée';
  });
  $('#appearance-clear-image')?.addEventListener('click', async () => {
    if ($('#appearance-bgimage')) $('#appearance-bgimage').value = '';
    await pushSettings({ appearance: { ...state.settings.appearance, backgroundImage: '' } });
    applyAppearance();
  });
  bindSegmented('bg-position-segment', (v) => {
    pushSettings({ appearance: { ...state.settings.appearance, backgroundPosition: v } });
    applyAppearance({ backgroundPosition: v });
  });
  bindSegmented('bg-fit-segment', (v) => {
    pushSettings({ appearance: { ...state.settings.appearance, backgroundFit: v } });
    applyAppearance({ backgroundFit: v });
  });
  [['appearance-activeicon', 'activeIcon'], ['appearance-statusbar', 'statusBar'], ['appearance-footer', 'footer']].forEach(([id, key]) => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('change', (e) => pushSettings({ appearance: { ...state.settings.appearance, [key]: e.target.checked } }));
  });
  $('#appearance-overlaybadge')?.addEventListener('change', (e) => {
    pushSettings({ appearance: { ...state.settings.appearance, overlayBadge: e.target.checked } });
  });
  $('#appearance-livecps')?.addEventListener('change', (e) => {
    pushSettings({ appearance: { ...state.settings.appearance, showLiveCps: e.target.checked } });
    applyHudVisibility();
  });
  $('#appearance-matchcolors')?.addEventListener('change', async (e) => {
    await pushSettings({ appearance: { ...state.settings.appearance, matchImageColors: e.target.checked } });
    lastTintUrl = '';
    applyAppearance();
  });

  bindSegmented('custom-accent-toggle', async (v) => {
    await pushSettings({ appearance: { ...state.settings.appearance, customAccentEnabled: v === 'on' } });
    applyAppearance();
  });
  const commitCustomAccent = async (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const clean = rgbToHex(rgb);
    if ($('#appearance-custom-accent')) $('#appearance-custom-accent').value = clean;
    if ($('#appearance-custom-hex')) $('#appearance-custom-hex').value = clean;
    await pushSettings({
      appearance: {
        ...state.settings.appearance,
        customAccent: clean,
        customAccentEnabled: true
      }
    });
    syncSegment('custom-accent-toggle', 'on');
    applyAppearance({ customAccent: clean, customAccentEnabled: true });
  };
  $('#appearance-custom-accent')?.addEventListener('input', (e) => {
    applyAppearance({ customAccent: e.target.value, customAccentEnabled: true });
    if ($('#appearance-custom-hex')) $('#appearance-custom-hex').value = e.target.value;
  });
  $('#appearance-custom-accent')?.addEventListener('change', (e) => commitCustomAccent(e.target.value));
  $('#appearance-custom-hex')?.addEventListener('change', (e) => {
    let v = e.target.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    commitCustomAccent(v);
  });
  $('#appearance-accent-hue')?.addEventListener('input', (e) => {
    const h = Number(e.target.value) || 0;
    if ($('#appearance-accent-hue-val')) $('#appearance-accent-hue-val').textContent = h + '°';
    const rgb = hsvToRgb(h, 0.55, 0.78);
    const hex = rgbToHex(rgb);
    if ($('#appearance-custom-accent')) $('#appearance-custom-accent').value = hex;
    if ($('#appearance-custom-hex')) $('#appearance-custom-hex').value = hex;
    applyAppearance({ customAccent: hex, customAccentEnabled: true });
  });
  $('#appearance-accent-hue')?.addEventListener('change', (e) => {
    const h = Number(e.target.value) || 0;
    const rgb = hsvToRgb(h, 0.55, 0.78);
    commitCustomAccent(rgbToHex(rgb));
  });

  bindSegmented('theme-segment', (v) => {
    applyTheme(v);
    pushSettings({ appearance: { ...state.settings.appearance, theme: v } });
    lastTintUrl = '';
    applyAppearance({ theme: v });
  });

  $$('.kb-input').forEach((inp) => {
    inp.addEventListener('click', () => {
      captureNextKey(inp, (combo) => {
        pushSettings({ keybinds: { ...state.settings.keybinds, [inp.dataset.page]: combo } });
      });
    });
  });

  bindSegmented('processlist-enable', (v) => pushSettings({ processList: { ...state.settings.processList, enabled: v === 'on' } }));
  bindSegmented('processlist-mode', (v) => pushSettings({ processList: { ...state.settings.processList, mode: v } }));
  $('#process-add-btn')?.addEventListener('click', async () => {
    const name = $('#process-name-input')?.value.trim().toLowerCase();
    if (!name) return;
    const selected = [...(state.settings.processList?.selected || [])];
    if (!selected.includes(name)) selected.push(name);
    await pushSettings({ processList: { ...state.settings.processList, selected } });
    $('#process-name-input').value = '';
    renderProcessList();
  });
}

// ---------- ENGINE / SLOTS ----------
function bindEngineSettings() {
  bindSegmented('cpsprofile-toggle', (v) => pushSettings({ cpsProfile: { ...state.settings.cpsProfile, enabled: v === 'on' } }));
  $('#cpsprofile-from')?.addEventListener('change', (e) => pushSettings({ cpsProfile: { ...state.settings.cpsProfile, fromCps: Number(e.target.value) } }));
  $('#cpsprofile-to')?.addEventListener('change', (e) => pushSettings({ cpsProfile: { ...state.settings.cpsProfile, toCps: Number(e.target.value) } }));
  $('#cpsprofile-seconds')?.addEventListener('change', (e) => pushSettings({ cpsProfile: { ...state.settings.cpsProfile, rampSeconds: Number(e.target.value) } }));

  bindSegmented('burst-toggle', (v) => pushSettings({ burst: { ...state.settings.burst, enabled: v === 'on' } }));
  $('#burst-clicks')?.addEventListener('change', (e) => pushSettings({ burst: { ...state.settings.burst, clicks: Number(e.target.value) } }));
  $('#burst-pause')?.addEventListener('change', (e) => pushSettings({ burst: { ...state.settings.burst, pauseMs: Number(e.target.value) } }));

  bindSegmented('pixel-toggle', (v) => pushSettings({ pixelClick: { ...state.settings.pixelClick, enabled: v === 'on' } }));
  const pushPixel = () => pushSettings({
    pixelClick: {
      ...state.settings.pixelClick,
      r: Number($('#pixel-r')?.value || 0),
      g: Number($('#pixel-g')?.value || 0),
      b: Number($('#pixel-b')?.value || 0),
      tolerance: Number($('#pixel-tol')?.value || 0)
    }
  });
  ['#pixel-r', '#pixel-g', '#pixel-b', '#pixel-tol'].forEach((sel) => $(sel)?.addEventListener('change', pushPixel));
  $('#pixel-capture-btn')?.addEventListener('click', async () => {
    const c = await window.api.samplePixelColor();
    if (!c) {
      $('#statusbar-mid').textContent = lang() === 'en' ? 'Could not sample pixel' : 'Impossible de capturer le pixel';
      return;
    }
    if ($('#pixel-r')) $('#pixel-r').value = c.r;
    if ($('#pixel-g')) $('#pixel-g').value = c.g;
    if ($('#pixel-b')) $('#pixel-b').value = c.b;
    updatePixelSwatch(c);
    await pushSettings({ pixelClick: { ...state.settings.pixelClick, r: c.r, g: c.g, b: c.b } });
  });

  bindSegmented('failsafe-toggle', (v) => pushSettings({ failsafe: { ...state.settings.failsafe, enabled: v === 'on' } }));
  $('#failsafe-idle')?.addEventListener('change', (e) => pushSettings({ failsafe: { ...state.settings.failsafe, idleSeconds: Number(e.target.value) } }));
  bindSegmented('sessiontimer-toggle', (v) => pushSettings({ sessionTimer: { ...state.settings.sessionTimer, enabled: v === 'on' } }));
  $('#sessiontimer-minutes')?.addEventListener('change', (e) => pushSettings({ sessionTimer: { ...state.settings.sessionTimer, minutes: Number(e.target.value) } }));
  $('#confirm-highcps')?.addEventListener('change', (e) => pushSettings({ confirmHighCps: { ...state.settings.confirmHighCps, enabled: e.target.checked } }));
  $('#confirm-threshold')?.addEventListener('change', (e) => pushSettings({ confirmHighCps: { ...state.settings.confirmHighCps, threshold: Number(e.target.value) } }));
}

function updatePixelSwatch(c) {
  const el = $('#pixel-swatch');
  if (!el || !c) return;
  el.style.background = `rgb(${c.r}, ${c.g}, ${c.b})`;
}

function bindSlotsUI() {
  $('#save-slot-btn')?.addEventListener('click', async () => {
    const name = $('#slot-name-input')?.value.trim();
    if (!name) return;
    const r = await window.api.saveSlot(name);
    state.slots = r.slots || [];
    $('#slot-name-input').value = '';
    renderSlots();
  });
}

function renderSlots() {
  const list = $('#slots-list');
  if (!list) return;
  const slots = state.slots || [];
  if (!slots.length) {
    list.innerHTML = `<div class="empty-hint">${lang() === 'en' ? 'No slots yet.' : 'Aucune sauvegarde.'}</div>`;
    return;
  }
  list.innerHTML = slots.map((name) => `
    <div class="preset-card">
      <div class="preset-top"><b>${name}</b></div>
      <div class="preset-actions">
        <button class="apply" data-act="load" data-name="${name}">${tr('common.load')}</button>
        <button class="delete" data-act="del" data-name="${name}">${tr('common.delete')}</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const name = b.dataset.name;
    if (b.dataset.act === 'load') {
      const r = await window.api.loadSlot(name);
      if (r?.ok) {
        state.settings = r.settings;
        applySettingsToUI();
        applyLanguage();
        $('#statusbar-left').textContent = `${tr('common.load')}: ${name}`;
      }
    }
    if (b.dataset.act === 'del') {
      const r = await window.api.deleteSlot(name);
      state.slots = r.slots || [];
      renderSlots();
    }
  }));
}

// ---------- MAINTENANCE ----------
function bindMaintenance() {
  $('#reset-settings-btn').addEventListener('click', async () => { state.settings = await window.api.resetSettings(); applySettingsToUI(); });
  $('#reset-stats-btn').addEventListener('click', async () => { state.stats = await window.api.resetStats(); updateStatsUI(); });
  $('#open-diag-btn').addEventListener('click', () => window.api.openDiagnostics());
  const check = async () => {
    const r = await window.api.checkUpdates();
    $('#statusbar-mid').textContent = r?.upToDate
      ? `À jour (v${r.current})`
      : `Version locale v${r?.current} · dernière connue v${r?.latest}`;
  };
  $('#check-updates-btn')?.addEventListener('click', check);
  $('#check-updates-btn-2')?.addEventListener('click', check);
}

// ---------- PRESETS ----------
function bindPresetsUI() {
  $('#save-preset-btn').addEventListener('click', async () => {
    const name = $('#preset-name-input').value.trim();
    if (!name) return;
    state.presets = await window.api.savePreset({ name, settings: state.settings });
    $('#preset-name-input').value = '';
    renderPresets();
  });
  $('#seed-game-presets-btn')?.addEventListener('click', async () => {
    const r = await window.api.seedGamePresets();
    state.presets = r.presets;
    renderPresets();
    $('#statusbar-mid').textContent = r.added ? `+${r.added} préréglages jeux` : 'Préréglages jeux déjà présents';
  });
  $('#export-presets-btn')?.addEventListener('click', async () => {
    const r = await window.api.exportPresets();
    if (r?.ok) $('#statusbar-mid').textContent = 'Préréglages exportés';
  });
  $('#import-presets-btn')?.addEventListener('click', async () => {
    const r = await window.api.importPresets();
    if (r?.ok) {
      state.presets = r.presets;
      renderPresets();
      $('#statusbar-mid').textContent = `Import OK (+${r.added || 0})`;
    }
  });
  $('#copy-presets-btn')?.addEventListener('click', async () => {
    const ok = await window.api.clipboardWriteJson({ type: 'lulune-presets', presets: state.presets });
    $('#statusbar-mid').textContent = ok ? 'JSON préréglages copié' : 'Copie échouée';
  });
}
function renderPresets() {
  const list = $('#presets-list');
  if (!list) return;
  if (!state.presets.length) { list.innerHTML = '<div class="empty-hint">Aucun préréglage.</div>'; return; }
  list.innerHTML = state.presets.map(p => `
    <div class="preset-card">
      <div class="preset-top"><b>${p.name}</b><span class="preset-date">${p.game ? 'Jeu · ' : ''}${p.date || ''}</span></div>
      <div class="preset-actions">
        <button class="apply" data-act="apply" data-name="${p.name}">Appliquer</button>
        <button data-act="rename" data-name="${p.name}">Renommer</button>
        <button data-act="dup" data-name="${p.name}">Dupliquer</button>
        <button class="delete" data-act="del" data-name="${p.name}">Supprimer</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const name = b.dataset.name, act = b.dataset.act;
    if (act === 'apply') { state.settings = await window.api.applyPreset(name); applySettingsToUI(); $('#statusbar-left').textContent = `Préréglage actif: ${name}`; }
    if (act === 'del') { state.presets = await window.api.deletePreset(name); renderPresets(); }
    if (act === 'dup') { state.presets = await window.api.duplicatePreset(name); renderPresets(); }
    if (act === 'rename') {
      const newName = prompt('Nouveau nom :', name);
      if (newName) { state.presets = await window.api.renamePreset({ oldName: name, newName }); renderPresets(); }
    }
  }));
}

// ---------- APPLY SETTINGS TO UI ----------
function applySettingsToUI() {
  const s = state.settings;
  if (!s) return;
  if ($('#cps-input')) $('#cps-input').value = s.cps;
  if ($('#adv-cps-input')) $('#adv-cps-input').value = s.cps;
  if ($('#hotkey-input')) $('#hotkey-input').value = s.hotkey;
  if ($('#adv-hotkey-input')) $('#adv-hotkey-input').value = s.hotkey;
  if ($('#hotkey-display')) $('#hotkey-display').textContent = (s.hotkey || 'F6').toUpperCase();
  if ($('#duty-cycle-input')) $('#duty-cycle-input').value = s.dutyCycle;
  if ($('#adv-duty-input')) $('#adv-duty-input').value = s.dutyCycle;
  if ($('#speed-random-input')) $('#speed-random-input').value = s.speedRandomization?.percent || 0;
  if ($('#adv-randspeed-input')) $('#adv-randspeed-input').value = s.speedRandomization?.percent || 0;
  syncAdvIntervalDisplay();
  applyTheme(s.appearance?.theme || 'green');
  if ($('#appearance-bgimage')) $('#appearance-bgimage').value = s.appearance?.backgroundImage || '';
  if ($('#appearance-bgopacity')) $('#appearance-bgopacity').value = s.appearance?.backgroundOpacity ?? 100;
  if ($('#appearance-bgimgopacity')) $('#appearance-bgimgopacity').value = s.appearance?.backgroundImageOpacity ?? 70;
  if ($('#appearance-panelopacity')) $('#appearance-panelopacity').value = s.appearance?.panelOpacity ?? 100;
  if ($('#appearance-panelblur')) $('#appearance-panelblur').value = s.appearance?.panelBlur ?? 0;
  syncSegment('bg-position-segment', s.appearance?.backgroundPosition || 'center');
  syncSegment('bg-fit-segment', s.appearance?.backgroundFit === 'contain' ? 'contain' : 'cover');
  applyAppearance();

  const setChk = (id, val) => { const el = $('#' + id); if (el) el.checked = !!val; };
  setChk('behavior-alwaysontop', s.behavior?.alwaysOnTop);
  setChk('behavior-hitbox', s.behavior?.stopHitboxOverlay);
  setChk('behavior-stopalert', s.behavior?.stopReasonAlert);
  setChk('behavior-strict', s.behavior?.strictHotkeyModifiers);
  setChk('behavior-alttab', s.behavior?.stopOnAltTab);
  setChk('behavior-extended', s.behavior?.extendedClickSpeedLimit);
  setChk('startup-tray', s.startup?.minimizeToTray);
  setChk('startup-remember', s.startup?.rememberWindowPosition);
  setChk('startup-run', s.startup?.runOnStartup);
  setChk('sounds-enabled', s.sounds?.enabled);
  setChk('antidetect-enabled', s.antiDetect?.enabled);
  setChk('appearance-overlaybadge', s.appearance?.overlayBadge !== false);
  setChk('appearance-livecps', s.appearance?.showLiveCps !== false);
  setChk('appearance-matchcolors', s.appearance?.matchImageColors !== false);
  syncSegment('custom-accent-toggle', s.appearance?.customAccentEnabled ? 'on' : 'off');
  if ($('#appearance-custom-accent')) $('#appearance-custom-accent').value = s.appearance?.customAccent || '#9ca3af';
  if ($('#appearance-custom-hex')) $('#appearance-custom-hex').value = s.appearance?.customAccent || '#9ca3af';
  $('#custom-accent-wrap')?.classList.toggle('is-on', !!s.appearance?.customAccentEnabled);
  setChk('appearance-autohide', s.appearance?.autoHideOnClick);
  setChk('behavior-hideoverlaypaused', s.behavior?.hideOverlayWhenPaused !== false);
  setChk('confirm-highcps', s.confirmHighCps?.enabled !== false);
  applyHudVisibility();
  setChk('appearance-activeicon', s.appearance?.activeIcon);
  setChk('appearance-statusbar', s.appearance?.statusBar);
  setChk('appearance-footer', s.appearance?.footer);

  if ($('#sounds-volume')) $('#sounds-volume').value = s.sounds?.volume ?? 50;
  if ($('#sounds-volume-val')) $('#sounds-volume-val').textContent = (s.sounds?.volume ?? 50) + '%';
  if ($('#appearance-overlayopacity')) $('#appearance-overlayopacity').value = s.appearance?.overlayOpacity ?? 90;
  if ($('#appearance-overlayopacity-val')) $('#appearance-overlayopacity-val').textContent = (s.appearance?.overlayOpacity ?? 90) + '%';
  if ($('#discord-clientid')) $('#discord-clientid').value = s.discordRpc?.clientId || '';
  if ($('#hotkey-panic')) $('#hotkey-panic').value = s.hotkeys?.panic || 'F12';
  if ($('#hotkey-pause')) $('#hotkey-pause').value = s.hotkeys?.pause || 'F7';
  if ($('#confirm-threshold')) $('#confirm-threshold').value = s.confirmHighCps?.threshold ?? 100;
  if ($('#goals-daily')) $('#goals-daily').value = s.goals?.dailyClicks ?? 10000;
  if ($('#goals-session')) $('#goals-session').value = s.goals?.sessionClicks ?? 0;
  if ($('#cpsprofile-from')) $('#cpsprofile-from').value = s.cpsProfile?.fromCps ?? 10;
  if ($('#cpsprofile-to')) $('#cpsprofile-to').value = s.cpsProfile?.toCps ?? 60;
  if ($('#cpsprofile-seconds')) $('#cpsprofile-seconds').value = s.cpsProfile?.rampSeconds ?? 30;
  if ($('#burst-clicks')) $('#burst-clicks').value = s.burst?.clicks ?? 5;
  if ($('#burst-pause')) $('#burst-pause').value = s.burst?.pauseMs ?? 200;
  if ($('#pixel-r')) $('#pixel-r').value = s.pixelClick?.r ?? 255;
  if ($('#pixel-g')) $('#pixel-g').value = s.pixelClick?.g ?? 255;
  if ($('#pixel-b')) $('#pixel-b').value = s.pixelClick?.b ?? 255;
  if ($('#pixel-tol')) $('#pixel-tol').value = s.pixelClick?.tolerance ?? 30;
  updatePixelSwatch({ r: s.pixelClick?.r ?? 255, g: s.pixelClick?.g ?? 255, b: s.pixelClick?.b ?? 255 });
  if ($('#failsafe-idle')) $('#failsafe-idle').value = s.failsafe?.idleSeconds ?? 10;
  if ($('#sessiontimer-minutes')) $('#sessiontimer-minutes').value = s.sessionTimer?.minutes ?? 30;

  $$('.kb-input').forEach(inp => { if (s.keybinds) inp.value = s.keybinds[inp.dataset.page] || inp.value; });
  renderPoints();
  renderCustomZones();
  renderProcessList();
  renderSlots();
  updateStatsUI();
  applyUiMode(s.appearance?.uiMode || 'normal');

  syncSegment('max-cps-segment', s.maxCps);
  syncSegment('mouse-btn-segment', s.mouseButton || 'left');
  syncSegment('adv-mouse-segment', s.mouseButton || 'left');
  syncSegment('adv-dblclick', s.doubleClick ? 'on' : 'off');
  syncSegment('adv-randspeed-toggle', s.speedRandomization?.enabled ? 'on' : 'off');
  syncSegment('theme-segment', s.appearance?.theme || 'green');
  syncSegment('processlist-enable', s.processList?.enabled ? 'on' : 'off');
  syncSegment('processlist-mode', s.processList?.mode || 'whitelist');
  syncSegment('custom-zones-toggle', s.stopZones?.customZones?.enabled ? 'on' : 'off');
  syncSegment('corner-stop-toggle', s.stopZones?.cornerStop?.enabled ? 'on' : 'off');
  syncSegment('edge-stop-toggle', s.stopZones?.edgeStop?.enabled ? 'on' : 'off');
  syncSegment('language-segment', s.language === 'en' ? 'en' : 'fr');
  syncSegment('uimode-segment', s.appearance?.uiMode || 'normal');
  syncSegment('overlay-position-segment', s.appearance?.overlayPosition || 'top-right');
  syncSegment('discordrpc-toggle', s.discordRpc?.enabled ? 'on' : 'off');
  syncSegment('goals-toggle', s.goals?.enabled ? 'on' : 'off');
  syncSegment('cpsprofile-toggle', s.cpsProfile?.enabled ? 'on' : 'off');
  syncSegment('burst-toggle', s.burst?.enabled ? 'on' : 'off');
  syncSegment('pixel-toggle', s.pixelClick?.enabled ? 'on' : 'off');
  syncSegment('failsafe-toggle', s.failsafe?.enabled !== false ? 'on' : 'off');
  syncSegment('sessiontimer-toggle', s.sessionTimer?.enabled ? 'on' : 'off');

  if (s.hotkeyMode === 'hold') {
    $('#adv-hkmode-hold')?.classList.add('active');
    $('#adv-hkmode-toggle')?.classList.remove('active');
  } else {
    $('#adv-hkmode-toggle')?.classList.add('active');
    $('#adv-hkmode-hold')?.classList.remove('active');
  }

  updateActiveMouseLabel();
  updateStartStopUI(!!state.stats?.clicking, !!state.stats?.paused);
  applyLanguage();
}

init();
