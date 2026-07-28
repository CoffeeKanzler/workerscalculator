import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function listFiles(root, current = root) {
  const entries = (await fs.readdir(current, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

export async function buildIntegrityManifest(root, { revision = 'working-tree', exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const files = (await listFiles(root)).filter(file => !excluded.has(file));
  const entries = [];
  for (const file of files) {
    const bytes = await fs.readFile(path.join(root, file));
    entries.push({ path: file, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return { schema: 1, revision, files: entries };
}

export async function writeIntegrityManifest(root, options = {}) {
  const manifest = await buildIntegrityManifest(root, options);
  await fs.writeFile(path.join(root, 'integrity.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
