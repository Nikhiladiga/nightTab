// Build nightTab into a temp folder, load a config into it, and screenshot it with headless Chrome.
//   node .claude/skills/nighttab-config/scripts/preview.mjs <config.json> <out.png> [width height]
// The repo's own dist/ folder is never touched.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [configPath, outPath, width = '1440', height = '900'] = process.argv.slice(2);
if (!configPath || !outPath) { console.error('usage: preview.mjs <config.json> <out.png> [width height]'); process.exit(2); }
if (!existsSync(join(ROOT, 'node_modules', 'webpack'))) { console.error(`node_modules missing: run "npm ci" in ${ROOT}`); process.exit(1); }

const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find((p) => p && existsSync(p));
if (!CHROME) { console.error('Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }

const config = readFileSync(configPath, 'utf8');
JSON.parse(config);

const work = mkdtempSync(join(tmpdir(), 'nighttab-preview-'));
const web = join(work, 'web');

// webpack's Node API avoids the interactive "install webpack-cli?" prompt of npx webpack.
const require = createRequire(join(ROOT, 'package.json'));
const webpack = require('webpack');
const webpackConfig = require(join(ROOT, 'webpack.dev.js'));
process.chdir(ROOT);
await new Promise((ok, fail) => webpack({ ...webpackConfig, output: { ...webpackConfig.output, path: web } }, (err, stats) => {
  if (err || stats.hasErrors()) fail(err || new Error(stats.toString({ all: false, errors: true })));
  else ok();
}));

// Seeding and screenshot are two Chrome runs on one profile: a redirect inside --screenshot can capture the blank seed page.
writeFileSync(join(web, 'seed.html'), `<script>localStorage.setItem('nightTab', ${JSON.stringify(config)});document.title='seeded';</script>`);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer((req, res) => {
  const file = join(web, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(web) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

// Async: a sync spawn would block this process's own web server while Chrome loads from it.
const chrome = (...args) => promisify(execFile)(CHROME, ['--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(work, 'profile')}`, ...args], { timeout: 60000, maxBuffer: 256 * 1024 * 1024 }); // --dump-dom echoes the seed page, which holds the whole config (images can be MBs)
try {
  await chrome('--dump-dom', `${base}/seed.html`);
  await chrome(`--window-size=${width},${height}`, '--virtual-time-budget=8000', `--screenshot=${resolve(outPath)}`, `${base}/index.html`);
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
console.log('preview: ' + resolve(outPath));
