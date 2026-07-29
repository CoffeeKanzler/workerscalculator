// Which Steam Workshop mods does a save use that the local catalog does not have?
//
// A save records every building by type. Workshop buildings carry their item id
// as a prefix — "2114329588/conveyortower1to1noroad" — so a save states exactly
// which mods it needs. Anything referenced but absent from data/workshop/
// index.json cannot be matched, and those buildings land in the import's
// unmatched list with no explanation of what they were.
//
// Steam's public API resolves an id to a name and a size, which is the
// difference between "2114329588" and "Conveyor towers, 1.8 MB". It does not
// serve the content: file_url comes back empty for these items, so fetching
// them needs steamcmd signed in to an account that owns the game. This tool
// therefore reports the gap and writes the commands that close it.
//
// Usage:
//   node tools/workshop_missing.mjs <save-dir> [<save-dir> ...]
//   node tools/workshop_missing.mjs --steamcmd <save-dir>   # emit fetch script
//
// Offline: pass --no-network to skip the name lookup.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseBuildingsGame } from '../js/savegame.js';

const STEAM_APP_ID = '784150';
const DETAILS_API = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
const WORKSHOP_TYPE = /^(\d{6,20})\//;

// --- pure helpers, exported so they can be tested without a save on disk ----

export function workshopIdsInTypes(types) {
  const ids = new Set();
  for (const type of types) {
    const match = WORKSHOP_TYPE.exec(String(type ?? ''));
    if (match) ids.add(match[1]);
  }
  return ids;
}

export function missingWorkshopIds(referenced, catalogIndex) {
  const known = new Set(Object.keys(catalogIndex?.items ?? {}));
  return [...referenced].filter(id => !known.has(id)).sort();
}

export function steamcmdScript(ids, { appId = STEAM_APP_ID, account = 'YOUR_STEAM_ACCOUNT' } = {}) {
  // One invocation, so the login prompt is answered once rather than per mod.
  const downloads = ids.map(id => `  +workshop_download_item ${appId} ${id}`).join(' \\\n');
  return [
    '#!/bin/sh',
    '# Fetch the Workshop items this save needs. Requires a Steam account that',
    '# owns the game; the public API does not serve item content.',
    'set -e',
    'steamcmd \\',
    `  +login ${account} \\`,
    downloads + ' \\',
    '  +quit',
  ].join('\n');
}

// --- save reading ----------------------------------------------------------

function typesInSave(saveDir) {
  const file = path.join(saveDir, 'buildings_game.bin');
  if (!existsSync(file)) throw new Error(`no buildings_game.bin in ${saveDir}`);
  const buffer = readFileSync(file);
  const parsed = parseBuildingsGame(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const counts = new Map();
  for (const record of parsed) {
    if (record.type) counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  return counts;
}

async function describe(ids) {
  if (!ids.length) return new Map();
  const body = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));
  const response = await fetch(DETAILS_API, { method: 'POST', body });
  if (!response.ok) throw new Error(`Steam API returned ${response.status}`);
  const payload = await response.json();
  return new Map((payload?.response?.publishedfiledetails ?? [])
    .map(item => [item.publishedfileid, {
      title: item.result === 1 ? (item.title || '(untitled)') : '(unavailable)',
      bytes: Number(item.file_size ?? 0),
    }]));
}

async function main(argv) {
  const wantScript = argv.includes('--steamcmd');
  const offline = argv.includes('--no-network');
  const dirs = argv.filter(arg => !arg.startsWith('--'));
  if (!dirs.length) {
    console.error('usage: node tools/workshop_missing.mjs [--steamcmd] [--no-network] <save-dir>...');
    process.exit(2);
  }

  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const catalog = JSON.parse(readFileSync(path.join(root, 'data/workshop/index.json'), 'utf8'));

  const referenced = new Set();
  const buildingsBymod = new Map();
  for (const dir of dirs) {
    const counts = typesInSave(dir);
    const ids = workshopIdsInTypes(counts.keys());
    for (const id of ids) referenced.add(id);
    for (const [type, count] of counts) {
      const match = WORKSHOP_TYPE.exec(type);
      if (match) buildingsBymod.set(match[1], (buildingsBymod.get(match[1]) ?? 0) + count);
    }
    if (!wantScript) {
      console.error(`${path.basename(dir)}: ${counts.size} types, ${ids.size} workshop mods referenced`);
    }
  }

  const missing = missingWorkshopIds(referenced, catalog);
  if (wantScript) {
    console.log(steamcmdScript(missing));
    return;
  }

  console.error(`\ncatalog holds ${Object.keys(catalog.items).length} items, `
    + `${referenced.size} referenced, ${missing.length} missing\n`);
  if (!missing.length) return;

  const details = offline ? new Map() : await describe(missing).catch(error => {
    console.error(`(name lookup skipped: ${error.message})`);
    return new Map();
  });

  let total = 0;
  const rows = missing.map(id => {
    const info = details.get(id) ?? { title: '', bytes: 0 };
    total += info.bytes;
    return { id, buildings: buildingsBymod.get(id) ?? 0, ...info };
  }).sort((a, b) => b.buildings - a.buildings);

  for (const row of rows) {
    const size = row.bytes ? `${(row.bytes / 1e6).toFixed(1)} MB` : '';
    console.log(`${row.id.padStart(12)}  ${String(row.buildings).padStart(4)} buildings  `
      + `${size.padStart(9)}  ${row.title}`);
  }
  console.log(`\n${rows.length} mods, ${(total / 1e6).toFixed(0)} MB, `
    + `${rows.reduce((sum, row) => sum + row.buildings, 0)} buildings affected`);
  console.log('run again with --steamcmd to emit the fetch script');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
