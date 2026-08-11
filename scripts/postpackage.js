const fs = require('fs');
const path = require('path');

const platform = process.argv[2] || 'win';
const dist = path.join(__dirname, '..', 'dist');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('copied', path.basename(src), '->', dest);
}

function findDirs(predicate) {
  if (!fs.existsSync(dist)) return [];
  return fs.readdirSync(dist)
    .map((n) => path.join(dist, n))
    .filter((p) => {
      try { return fs.statSync(p).isDirectory() && predicate(path.basename(p)); }
      catch (_) { return false; }
    });
}

function writeReadme(dir, lines) {
  const dest = path.join(dir, 'README-LANCEMENT.txt');
  fs.writeFileSync(dest, lines.join('\n') + '\n', 'utf8');
  console.log('wrote', dest);
}

if (platform === 'win') {
  for (const dir of findDirs((n) => n.includes('win32'))) {
    copy(path.join(__dirname, 'Launch-Windows.vbs'), path.join(dir, 'Launch-Windows.vbs'));
    copy(path.join(__dirname, 'Launch-Windows.bat'), path.join(dir, 'Launch-Windows.bat'));
    copy(path.join(__dirname, 'Debloquer-Windows.ps1'), path.join(dir, 'Debloquer-Windows.ps1'));
    writeReadme(dir, [
      'LuLune AutoClicker — Windows',
      '',
      '1. Unzip the folder',
      '2. Double-click Launch-Windows.vbs (recommended, no terminal)',
      '3. Or run LuLuneAutoClicker.exe directly',
      '',
      'Discord: LuLune0193'
    ]);
  }
} else if (platform === 'mac') {
  for (const dir of findDirs((n) => n.includes('darwin'))) {
    const dest = path.join(dir, 'Open-macOS.command');
    copy(path.join(__dirname, 'Open-macOS.command'), dest);
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    writeReadme(dir, [
      'LuLune AutoClicker — macOS',
      '',
      '1. Double-click Open-macOS.command (removes Gatekeeper quarantine)',
      '2. Or right-click LuLuneAutoClicker.app → Open',
      '3. Settings → Privacy & Security → Accessibility → allow the app',
      '',
      'Apple Silicon: prefer the arm64 build (npm run package:mac:arm64)',
      'Intel: build x64 (npm run package:mac)',
      '',
      'Discord: LuLune0193'
    ]);
  }
} else if (platform === 'linux') {
  for (const dir of findDirs((n) => n.includes('linux'))) {
    const dest = path.join(dir, 'Launch-Linux.sh');
    copy(path.join(__dirname, 'Launch-Linux.sh'), dest);
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    const bin = path.join(dir, 'LuLuneAutoClicker');
    try { if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755); } catch (_) {}
    writeReadme(dir, [
      'LuLune AutoClicker — Linux',
      '',
      '1. chmod +x Launch-Linux.sh && ./Launch-Linux.sh',
      '2. X11 session recommended (Wayland may block clicks)',
      '3. Useful dependencies: libX11, libXtst, xdotool (optional for window detection)',
      '',
      'Discord: LuLune0193'
    ]);
  }
}
