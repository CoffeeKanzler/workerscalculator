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
  assert.match(app, /tab: IS_BETA \? 'home' : 'republic'/);
  assert.match(i18n, /appTitle: 'Republic Command Center'/);
});

test('the operations desk stays crisp and uses the ultrawide runway intentionally', async () => {
  const css = await fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8');
  assert.match(css, /section \{ animation: none; \}/);
  assert.match(css, /@media \(min-width: 4000px\)[\s\S]*3200px/);
  assert.match(css, /body \{ font-size: 17px; \}/);
  assert.match(css, /\.more-nav \{[^}]*display: inline-block;/);
  assert.match(css, /\.more-nav \{[^}]*justify-self: start;/);
  assert.match(css, /\.command-center > \.tablewrap \{ grid-column: 1 \/ -1; \}/);
});
