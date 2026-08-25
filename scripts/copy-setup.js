const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'release');
const destDir = path.join(__dirname, '..', 'website', 'downloads');
fs.mkdirSync(destDir, { recursive: true });

if (!fs.existsSync(srcDir)) {
  console.error('No release/ folder. Run dist:win, dist:mac, or dist:linux first.');
  process.exit(1);
}

let copied = 0;
for (const name of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, name);
  if (!fs.statSync(src).isFile()) continue;
  const keep =
    (/^LuLuneAutoClicker-/.test(name) && !name.endsWith('.blockmap')) ||
    /^latest(-mac|-linux)?\.yml$/.test(name);
  if (!keep) continue;
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  console.log('copied', dest, fs.statSync(dest).size, 'bytes');
  copied++;
}
if (!copied) {
  console.error('No installer found in release/. Run dist:win, dist:mac, or dist:linux first.');
  process.exit(1);
}
