import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../js/vendor/leaflet-src.esm.js', import.meta.url), 'utf8');
const license = readFileSync(new URL('../js/vendor/LEAFLET-LICENSE.txt', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../css/vendor/leaflet.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the map library is a reviewed local Leaflet 1.9.4 copy', () => {
  assert.match(source.slice(0, 500), /Leaflet 1\.9\.4/);
  assert.match(license, /BSD 2-Clause/);
  assert.match(index, /css\/vendor\/leaflet\.css\?v=\d+/);
});

test('the vendored map stylesheet has no remote imports', () => {
  assert.doesNotMatch(stylesheet, /@import|url\(\s*['"]?https?:/i);
});
