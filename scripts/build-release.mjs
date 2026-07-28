import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listFiles, writeIntegrityManifest } from './integrity-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['css', 'data', 'js'];
const SOURCE_FILES = ['.nojekyll', 'index.html'];

async function copyEntry(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });
}

async function copySource(target) {
  await fs.mkdir(target, { recursive: true });
  for (const directory of SOURCE_DIRS) await copyEntry(path.join(ROOT, directory), path.join(target, directory));
  for (const file of SOURCE_FILES) await copyEntry(path.join(ROOT, file), path.join(target, file));
}

async function normalizeArchiveTimes(root) {
  const archiveTime = new Date('2000-01-01T00:00:00Z');
  for (const file of await listFiles(root)) {
    await fs.utimes(path.join(root, file), archiveTime, archiveTime);
  }
}

async function patchRuntimeMode(target, mode) {
  const file = path.join(target, 'index.html');
  const original = await fs.readFile(file, 'utf8');
  const patched = original.replace('data-runtime-mode="hosted"', `data-runtime-mode="${mode}"`);
  if (patched === original) throw new Error(`runtime mode marker missing in ${file}`);
  await fs.writeFile(file, patched);
}

function revisionFromEnv() {
  return process.env.REPUBLIC_COMMAND_CENTER_REVISION || 'working-tree';
}

export async function buildRelease({ outDir = path.join(ROOT, 'dist'), revision = revisionFromEnv() } = {}) {
  await fs.rm(outDir, { recursive: true, force: true });
  const hosted = path.join(outDir, 'hosted');
  const addon = path.join(outDir, 'addon');
  await copySource(hosted);
  await copySource(addon);
  await patchRuntimeMode(addon, 'addon');
  await copyEntry(path.join(ROOT, 'packaging', 'addon.json'), path.join(addon, 'addon.json'));
  await writeIntegrityManifest(hosted, { revision });
  await writeIntegrityManifest(addon, { revision });

  const zipPath = path.join(outDir, 'republic-command-center-addon.zip');
  try {
    await normalizeArchiveTimes(addon);
    execFileSync('zip', ['-X', '-q', '-r', '-D', zipPath, '.'], { cwd: addon, stdio: 'ignore' });
  } catch {
    // Folder output remains the portable artifact when zip is unavailable.
  }
  return { outDir, hosted, addon, zip: zipPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outArg = process.argv.find(arg => arg.startsWith('--out='));
  const result = await buildRelease({ outDir: outArg ? path.resolve(outArg.slice(6)) : undefined });
  process.stdout.write(`hosted=${result.hosted}\naddon=${result.addon}\n`);
  if (await fs.stat(result.zip).then(() => true).catch(() => false)) process.stdout.write(`zip=${result.zip}\n`);
}
