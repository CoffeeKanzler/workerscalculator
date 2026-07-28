import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { matchSaveBuilding } from '../js/adapters/save_projection.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

// The map labels each plotted building by resolving its saved type against the
// game and Workshop catalogs. That resolver lives in the projection module, so
// the map render throws a ReferenceError the moment app.js calls it without
// importing it - and the whole Republic map disappears behind one dead name.
test('the map building name resolver is importable by the app shell', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');

  const importsResolver = /import \{[^}]*\bmatchSaveBuilding\b[^}]*\} from '\.\/adapters\/save_projection\.js/s;
  assert.match(app, importsResolver);
  assert.equal(typeof matchSaveBuilding, 'function');
});

test('saved building types resolve to catalog entries by exact id and unique basename', () => {
  const entries = [
    { id: 'industrial_steel', en: 'Steel mill' },
    { id: '123456789/custom_clinic', en: 'Workshop clinic' },
  ];

  assert.equal(matchSaveBuilding('industrial_steel', entries, entry => entry.id)?.en, 'Steel mill');
  assert.equal(matchSaveBuilding('unknown_type', entries, entry => entry.id), null);
});
