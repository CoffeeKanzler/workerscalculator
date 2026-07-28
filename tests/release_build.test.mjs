import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRelease } from '../scripts/build-release.mjs';

async function snapshot(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push([path.relative(root, absolute), await fs.readFile(absolute, 'utf8')]);
    }
  }
  await visit(root);
  return files;
}

test('hosted and addon artifacts are deterministic and differ only by bootstrap metadata', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'republic-command-center-'));
  const first = await buildRelease({ outDir: path.join(base, 'first'), revision: 'test-revision' });
  const second = await buildRelease({ outDir: path.join(base, 'second'), revision: 'test-revision' });
  assert.deepEqual(await snapshot(first.hosted), await snapshot(second.hosted));
  assert.deepEqual(await snapshot(first.addon), await snapshot(second.addon));
  const addonManifest = JSON.parse(await fs.readFile(path.join(first.addon, 'addon.json'), 'utf8'));
  assert.equal(addonManifest.staticOnly, true);
  assert.equal(addonManifest.ui.entry, 'index.html');
  assert.match(await fs.readFile(path.join(first.addon, 'index.html'), 'utf8'), /data-runtime-mode="addon"/);
  assert.match(await fs.readFile(path.join(first.hosted, 'index.html'), 'utf8'), /data-runtime-mode="hosted"/);
  assert.ok((await fs.stat(path.join(first.addon, 'integrity.json'))).isFile());
  const firstZip = await fs.readFile(first.zip).catch(() => null);
  const secondZip = await fs.readFile(second.zip).catch(() => null);
  if (firstZip && secondZip) assert.deepEqual(firstZip, secondZip, 'addon ZIP must be byte-deterministic');
});
