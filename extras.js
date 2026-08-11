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
    title: 'Polish UI, Discord Presence, opacité et builds',
    items: [
      'Opacité de l’interface (10 % → 100 %) : panneaux, barre de titre et barre de statut deviennent vraiment translucides pour laisser voir votre fond.',
      'Couleurs depuis l’image corrigées : une photo grise teinte toute l’UI en gris (y compris le bouton Démarrer et les bordures) — plus de vert en dur qui restait collé.',
      'Couleur personnalisée : cercle / teinte / hex pour forcer une couleur d’accent prioritaire sur le thème et l’image.',
      'Discord Rich Presence clarifié : Client ID seul dans l’UI, logo asset « logo », boutons pour ouvrir le Developer Portal et le fichier logo ; le titre « Joue à LuLuneAutoClicker » se règle dans le portail Discord.',
      'Capture de raccourci sécurisée : pendant que vous choisissez une nouvelle touche, F6 / Panic / Pause / macros sont coupés (Échap annule).',
      'Fenêtre compacte uniquement sur la vue AutoClick (icône souris) ; les autres onglets repassent en grand format.',
      'Icône AutoClick = souris (plus de trombone Clippy) ; macros = icône liste claire.',
      'Hints de raccourcis selon l’OS : Windows voit Ctrl, macOS voit Cmd, Linux voit Ctrl — plus de ligne Windows/Linux/macOS mélangée.',
      'Stats Utilisation réalignées (liste label / valeur) et graphique clics/jour refait en barres HTML (plus de canvas coupé / pavé bugué).',
      'Boutons Maintenance / Apparence restylés (plus de boutons blancs système « Ouvrir le dossier », « Vérifier », « Retirer »).',
      'Macros : tutoriel en 4 étapes + bouton ▶ Jouer ; message clair si pas de raccourci.',
      'Sidebar Réglages : onglets qui ne s’écrasent plus (scroll correct, carte communauté retirée de la colonne).'
    ]
  },
  {
    v: '1.4.0',
    title: 'Moteur avancé, Discord RPC, sauvegardes et i18n',
    items: [
      'Rampe CPS : démarrez lentement puis montez automatiquement jusqu’à un CPS cible sur N secondes (idéal warm-up PVP / idle).',
      'Mode Rafale (Burst) : N clics rapides puis pause, en boucle — parfait pour des salves contrôlées.',
      'Filtre couleur pixel : le clicker ne clique que si la couleur sous le curseur correspond (échantillon + tolérance).',
      'Failsafe curseur : arrêt automatique si la souris ne bouge plus pendant N secondes.',
      'Minuteur de session : stop après X minutes pour éviter de cliquer toute la nuit.',
      'Confirmation CPS élevé : dialogue avant de démarrer au-dessus d’un seuil (ex. 100 CPS).',
      'Hotkeys système Panic (F12) et Pause (F7), configurables — indépendants des préréglages.',
      'Overlay repositionnable (4 coins) + opacité ; masqué en pause si l’option est active.',
      'Mode interface Minimal : garde l’essentiel (start / CPS / hotkey) pour une fenêtre ultra légère.',
      'Langue FR / EN dans toute l’interface (libellés principaux).',
      'Discord Rich Presence : affiche Idle ou Clicking · CPS sur votre profil (nécessite un Client ID d’application Discord).',
      'Objectifs : clics quotidiens et/ou de session avec barre de progression et notification.',
      'Sauvegardes multiples (slots) : plusieurs configs complètes enregistrées / rechargées sans écraser la courante.',
      'Volume des sons, réduction auto de la fenêtre au démarrage du clic, overlay masqué en pause.'
    ]
  },
  {
    v: '1.3.0',
    title: 'Grande mise à jour — contrôle, style et sécurité',
    items: [
      'CPS live : compteur en temps réel dans l’app et dans la barre de statut, pour voir exactement votre vitesse de clic.',
      'Badge overlay ON · CPS : petit indicateur flottant discret pendant que le clicker tourne (désactivable dans Apparence).',
      'Mode Maintien réel : maintenez le raccourci pour cliquer, relâchez pour arrêter (via uiohook, pas seulement une bascule).',
      'Zones d’arrêt dessinables : glissez un rectangle à l’écran, Entrée pour valider, Échap pour annuler — idéal en jeu.',
      'Arrêt coin / bord mieux expliqué : tailles réglables pour chaque coin et chaque bord de l’écran.',
      'Liste de processus : liste blanche ou noire selon l’appli au premier plan (ex. minecraft, chrome).',
      'Préréglages jeux prêts à l’emploi : Minecraft PVP, Cookie Clicker, Idle/AFK, Burst 60 CPS.',
      'Import / export des préréglages et macros (fichiers JSON), plus partage de macro en base64 via le presse-papiers.',
      'Séquences de macros : tapez plusieurs touches d’un coup (ex. a b enter f2) pour construire une combo.',
      'Thèmes Vert / Bleu / Rouge / Clair : le fond, les orbes et les accents suivent vraiment le thème choisi.',
      'Image de fond : bouton « Choisir une image… », aperçu, curseurs de visibilité / transparence / flou des panneaux.',
      'Couleurs depuis l’image : les accents de l’interface (boutons, lueurs, bordures) s’adaptent automatiquement à la palette de votre fond (option dans Apparence).',
      'Sons optionnels au démarrage et à l’arrêt du clicker.',
      'Anti-détection légère : petit jitter d’intervalle + micro-décalage souris (optionnel).',
      'Tutoriel de premier lancement + journal des versions détaillé dans Réglages → Changelog.',
      'Graphique des clics sur 14 jours et stats enrichies (CPS live, sessions, temps total).',
      'Discord LuLune0193 : bouton pour copier le pseudo (pas de Ko-fi).',
      'Vérifier les mises à jour : ouvre le GitHub du projet depuis l’app.',
      'Fenêtre plus large et défilement corrigé pour que Zones, Points et Réglages affichent tout le contenu.'
    ]
  },
  {
    v: '1.2.0',
    title: 'UI animée et combos',
    items: [
      'Interface animée (orbes, transitions, carte communauté).',
      'Raccourcis multi-touches (ex. Shift+F, Ctrl+1).',
      'Correction du layout qui coupait le bas de certaines vues.',
      'Page de téléchargement HTML pour Windows, macOS et Linux.'
    ]
  },
  {
    v: '1.1.0',
    title: 'Moteur de clic fiable',
    items: [
      'Fix du CPS plafonné ~25 (délais nut-js / libnut à zéro).',
      'Clics gauches corrects (migration bouton souris + duty cycle).',
      'Macros F8 / Shift+F8 / F9 avec lecture des étapes.',
      'Compatibilité Windows, macOS et Linux.'
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
    if (x <= b.x + tl && y <= b.y + tl) return 'Coin haut-gauche';
    if (x >= b.x + b.width - tr && y <= b.y + tr) return 'Coin haut-droit';
    if (x <= b.x + bl && y >= b.y + b.height - bl) return 'Coin bas-gauche';
    if (x >= b.x + b.width - br && y >= b.y + b.height - br) return 'Coin bas-droit';
  }
  const es = settings.stopZones?.edgeStop;
  if (es?.enabled) {
    const [top, right, bottom, left] = es.sizes || [40, 40, 40, 40];
    if (y <= b.y + top) return 'Bord haut';
    if (x >= b.x + b.width - right) return 'Bord droit';
    if (y >= b.y + b.height - bottom) return 'Bord bas';
    if (x <= b.x + left) return 'Bord gauche';
  }
  const cz = settings.stopZones?.customZones;
  if (cz?.enabled && Array.isArray(cz.zones)) {
    for (const z of cz.zones) {
      if (pointInZone(x, y, z)) return z.action === 'start' ? null : (z.name || 'Zone personnalisée');
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
