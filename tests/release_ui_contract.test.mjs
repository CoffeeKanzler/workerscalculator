import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('the shipped shell identifies the Command Center and opens on the overview', async () => {
  const [index, app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  assert.match(index, /<title>Republic Command Center/);
  assert.match(index, /Republic Command Center/);
  assert.match(app, /tab: HAS_SAVE_WORKSPACE \? 'home' : 'republic'/);
  assert.match(app, /HAS_SAVE_WORKSPACE \? \['home'\]/);
  assert.match(i18n, /appTitle: 'Republic Command Center'/);
});

// The save workspace now ships in the standard release, so the beta path has no
// features left of its own. It stays as a redirect because bookmarks and forum
// links still point at it, and it must not boot a second copy of the app.
test('the beta path redirects to the stable release instead of booting its own app', async () => {
  const beta = await fs.readFile(path.join(ROOT, 'beta/index.html'), 'utf8');

  assert.doesNotMatch(beta, /<script type="module" src="\.\.\/js\/app\.js/);
  assert.match(beta, /<meta http-equiv="refresh" content="0; url=\.\.\/">/);
  assert.match(beta, /<link rel="canonical" href="\.\.\/">/);
  assert.match(beta, /location\.replace/);
});

test('the standard release carries the save workspace so nothing stays beta-only', async () => {
  const [index, runtimeConfig] = await Promise.all([
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/runtime/runtime_config.js'), 'utf8'),
  ]);
  assert.match(index, /data-runtime-variant="standard"/);
  assert.match(runtimeConfig, /mode === 'hosted'/);
});

test('the operations desk stays crisp and uses the ultrawide runway intentionally', async () => {
  const css = await fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8');
  assert.match(css, /section \{ animation: none; \}/);
  assert.match(css, /@media \(min-width: 4000px\)[\s\S]*4200px/);
  assert.match(css, /body \{ font-size: 20px; \}/);
  assert.match(css, /\.more-nav \{[^}]*display: inline-block;/);
  assert.match(css, /\.more-nav \{[^}]*justify-self: start;/);
  assert.match(css, /\.command-center > \.area-table-panel[\s\S]*grid-column: span 5;/);
  assert.match(css, /\.area-table-panel \.area-health[\s\S]*table-layout: fixed;/);
});
