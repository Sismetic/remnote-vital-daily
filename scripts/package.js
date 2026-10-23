// Strict public-code allowlist. Never package a KB, export, or local cache.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const files = ['index.html', 'index-sandbox.js', 'index.js',
  'vital_daily_popup-sandbox.js', 'vital_daily_popup.js',
  'important_daily_popup-sandbox.js', 'important_daily_popup.js',
  'mobile_launcher-sandbox.js', 'mobile_launcher.js',
  'manifest.json', 'App.css', 'snippet.css', 'README.md'];
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8'));
if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(manifest.repoUrl)) {
  throw new Error('The submission must link to the real public source repository.');
}
if (!manifest.enableOnMobile || !manifest.unlisted) throw new Error('Mobile/unlisted flags are required.');
for (const file of files) {
  if (!fs.statSync(path.join(root, 'dist', file)).isFile()) throw new Error(`Missing ${file}`);
}
const version = Object.values(manifest.version).join('.');
const archive = path.join(root, `PriorityTags-${version}.zip`);
if (fs.existsSync(archive)) throw new Error('Archive already exists; choose a new version or output directory.');
execFileSync('zip', ['-X', '-q', archive, ...files], { cwd: path.join(root, 'dist') });
console.log(archive);
console.log('SHA256 ' + crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
