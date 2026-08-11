/**
 * Zippe les builds dist/ vers website/downloads/
 * À lancer APRÈS package:win / package:mac / package:linux sur la machine cible.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'website', 'downloads');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { match: (n) => n.includes('win32'), zip: 'LuLuneAutoClicker-Windows.zip' },
  { match: (n) => n.includes('darwin'), zip: 'LuLuneAutoClicker-macOS.zip' },
  { match: (n) => n.includes('linux'), zip: 'LuLuneAutoClicker-Linux.zip' }
];

function zipFolder(folder, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const parent = path.dirname(folder);
  const name = path.basename(folder);
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${folder.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`cd "${parent}" && zip -r -q "${zipPath}" "${name}"`, { stdio: 'inherit' });
  }
  console.log('OK', zipPath, fs.statSync(zipPath).size, 'bytes');
}

if (!fs.existsSync(dist)) {
  console.error('Aucun dossier dist/. Lancez d’abord npm run package:…');
  process.exit(1);
}

const dirs = fs.readdirSync(dist)
  .map((n) => path.join(dist, n))
  .filter((p) => fs.statSync(p).isDirectory());

let done = 0;
for (const t of targets) {
  const folder = dirs.find((p) => t.match(path.basename(p)));
  if (!folder) {
    console.warn('Skip (pas de build):', t.zip);
    continue;
  }
  zipFolder(folder, path.join(outDir, t.zip));
  done++;
}

fs.writeFileSync(
  path.join(outDir, 'README-BUILDS.txt'),
  [
    'LuLune AutoClicker — builds site',
    '',
    'Windows zip: prêt si généré sur Windows (npm run package:win && npm run zip:downloads)',
    'macOS zip:   générer SUR un Mac (npm run package:mac ou package:mac:arm64)',
    'Linux zip:   générer SUR Linux (npm run package:linux)',
    '',
    'Les modules natifs (libnut, uiohook) doivent être compilés sur l’OS cible.',
    'Ne pas cross-compiler mac/linux depuis Windows.',
    '',
    'Discord: LuLune0193'
  ].join('\n') + '\n',
  'utf8'
);

console.log(done ? `Terminé: ${done} archive(s)` : 'Rien à zipper.');
