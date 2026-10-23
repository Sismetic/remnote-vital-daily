// Reproducible local build; no Git metadata, validation CLI or dist deletion.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const widgets = ['index', 'vital_daily_popup', 'important_daily_popup'];

async function build() {
  fs.mkdirSync(dist, { recursive: true });
  for (const widget of widgets) {
    for (const sandbox of [true, false]) {
      await esbuild.build({
        entryPoints: [path.join(root, 'src/widgets', `${widget}.tsx`)],
        bundle: true, platform: 'browser', target: 'es2020',
        format: sandbox ? 'iife' : 'esm',
        define: { 'process.env.NODE_ENV': '"production"' },
        banner: sandbox ? undefined : { js: 'const IMPORT_META = import.meta;' },
        outfile: path.join(dist, `${widget}${sandbox ? '-sandbox' : ''}.js`),
      });
    }
  }
  const hash = crypto.createHash('sha256');
  for (const widget of widgets) hash.update(fs.readFileSync(path.join(dist, `${widget}-sandbox.js`)));
  const version = hash.digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body>
<script>
const widgetName = new URLSearchParams(location.search).get('widgetName');
const allowed = ${JSON.stringify(widgets)};
if (allowed.includes(widgetName)) {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = widgetName + '-sandbox.js?v=${version}';
  script.onerror = () => { document.body.textContent = 'No pude cargar la práctica. Comprueba tu conexión y el origen de instalación de Priority Tags.'; };
  document.body.appendChild(script);
} else { document.body.textContent = 'Priority Tags · Práctica diaria'; }
</script></html>`);
  fs.copyFileSync(path.join(root, 'public/manifest.json'), path.join(dist, 'manifest.json'));
  fs.copyFileSync(path.join(root, 'README.md'), path.join(dist, 'README.md'));
  fs.writeFileSync(path.join(dist, 'App.css'), 'body{font-family:system-ui,sans-serif;margin:0;}button{font:inherit;}');
  fs.writeFileSync(path.join(dist, 'snippet.css'), '/* Priority Tags does not register a global CSS snippet. */');
  console.log(`Built ${widgets.join(', ')} · ${version}`);
}
build().catch((error) => { console.error(error); process.exitCode = 1; });
