import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { THEMES, isTheme, resolveTheme, themeAttribute, nextTheme } from '../js/ui/theme.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('auto follows the system, explicit choices override it', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  // Anything unrecognised behaves as auto rather than breaking the page.
  assert.equal(resolveTheme(undefined, true), 'dark');
  assert.equal(resolveTheme('nonsense', false), 'light');
});

test('auto sets no root attribute so the media query keeps tracking the system', () => {
  assert.equal(themeAttribute('auto'), null);
  assert.equal(themeAttribute(undefined), null);
  assert.equal(themeAttribute('dark'), 'dark');
  assert.equal(themeAttribute('light'), 'light');
});

test('the toggle cycles through every theme and returns to the start', () => {
  assert.deepEqual(THEMES, ['auto', 'light', 'dark']);
  assert.equal(nextTheme('auto'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'auto');
  assert.equal(nextTheme('nonsense'), 'auto');
  assert.equal(THEMES.every(isTheme), true);
  assert.equal(isTheme('nope'), false);
});

// --- palette contrast -------------------------------------------------------

function parsePalette(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} must exist in the stylesheet`);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
    .map(match => [match[1], match[2].trim()]));
}

function channel(value) {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? [...clean].map(c => c + c).join('') : clean;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const stylesheet = () => fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8');

test('both palettes define every token the stylesheet uses', async () => {
  const css = await stylesheet();
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(match => match[1]));
  assert.ok(used.size >= 14, `expected the design to use many tokens, found ${used.size}`);

  for (const selector of [':root {', '[data-theme="dark"] {']) {
    const palette = parsePalette(css, selector);
    const missing = [...used].filter(token => palette[token] === undefined);
    assert.deepEqual(missing, [], `${selector} is missing ${missing.join(', ')}`);
  }
});

// Text that cannot be read is worse than no dark theme at all, so the palette
// is held to WCAG AA: 4.5:1 for body text, 3:1 for large text and UI edges.
test('dark palette text meets AA contrast on its own surfaces', async () => {
  const dark = parsePalette(await stylesheet(), '[data-theme="dark"] {');

  for (const surface of ['--bg', '--panel', '--panel2']) {
    const ratio = contrast(dark['--text'], dark[surface]);
    assert.ok(ratio >= 4.5, `--text on ${surface} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
  }
  const mutedOnBg = contrast(dark['--muted'], dark['--bg']);
  assert.ok(mutedOnBg >= 4.5, `--muted on --bg is ${mutedOnBg.toFixed(2)}:1, needs 4.5:1`);
});

test('dark palette status colours stay legible on their surfaces', async () => {
  const dark = parsePalette(await stylesheet(), '[data-theme="dark"] {');

  for (const token of ['--pos', '--neg', '--warn', '--accent', '--accent2', '--blueprint']) {
    for (const surface of ['--bg', '--panel']) {
      const ratio = contrast(dark[token], dark[surface]);
      assert.ok(ratio >= 3, `${token} on ${surface} is ${ratio.toFixed(2)}:1, needs 3:1`);
    }
  }
});

test('the light palette it replaces is still legible too', async () => {
  const light = parsePalette(await stylesheet(), ':root {');

  for (const surface of ['--bg', '--panel', '--panel2']) {
    const ratio = contrast(light['--text'], light[surface]);
    assert.ok(ratio >= 4.5, `--text on ${surface} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
  }
});

test('the stylesheet carries exactly one root palette and no dead duplicate', async () => {
  const css = await stylesheet();
  // Two :root blocks meant the first was silently overridden by the second and
  // never rendered, which is how the app came to ship light-only by accident.
  assert.equal((css.match(/^:root \{/gm) ?? []).length, 1);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /\[data-theme="light"\]/);
});
