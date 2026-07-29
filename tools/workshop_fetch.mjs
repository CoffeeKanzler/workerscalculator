// Fetch missing Workshop items and fold them into the local catalog.
//
// The game's Workshop content is downloadable with an anonymous steamcmd
// login, so closing the gap needs no account and no credentials. Each item is
// a directory of building folders, and each of those holds a building.ini that
// the app already knows how to read — the same parser the local Workshop
// folder picker uses, so a fetched definition and a hand-loaded one cannot
// disagree.
//
// Only the extracted definitions are written into data/workshop/. The raw
// downloads are megabytes of models and textures the app never reads, and they
// stay where steamcmd put them.
//
// Usage:
//   node tools/workshop_fetch.mjs <id> [<id> ...]
//   node tools/workshop_fetch.mjs --from-saves <save-dir> [<save-dir> ...]
//   node tools/workshop_fetch.mjs --extract-only <id> ...   # skip the download

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseWorkshopBuildingIni, workshopBuildingIdentity } from '../js/workshop_ini.js';
import { workshopIdsInTypes, missingWorkshopIds } from './workshop_missing.mjs';
import { parseBuildingsGame } from '../js/savegame.js';

const APP_ID = '784150';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CATALOG = path.join(ROOT, 'data/workshop');
const CONTENT = process.env.WORKSHOP_CONTENT
  ?? path.join(process.env.HOME ?? '', 'Steam/steamapps/workshop/content', APP_ID);
const STEAMCMD = process.env.STEAMCMD ?? 'steamcmd';

// Items are sharded by their last two digits, keeping any one directory small.
export function shardFor(id) {
  return String(id).slice(-2).padStart(2, '0');
}

export function catalogPathFor(id) {
  return `items/${shardFor(id)}/${id}.json`;
}

// A building folder is one that actually declares a building; a mod may also
// ship shared models, preview images and a workshopconfig.ini at the top level.
export function buildingFoldersIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(entry => statSync(path.join(dir, entry)).isDirectory())
    .filter(entry => existsSync(path.join(dir, entry, 'building.ini')))
    .sort();
}

export function extractItem(id, dir, { now = new Date().toISOString() } = {}) {
  const buildings = [];
  for (const folder of buildingFoldersIn(dir)) {
    const file = path.join(dir, folder, 'building.ini');
    // The game writes these in a Windows codepage; latin1 keeps every byte
    // addressable rather than replacing unmappable ones.
    const text = readFileSync(file, 'latin1');
    const identity = workshopBuildingIdentity(`${folder}/building.ini`);
    const parsed = parseWorkshopBuildingIni(text, `${id}/${folder}`, identity);
    buildings.push({ ...parsed, id: `${id}/${folder}`, workshopId: String(id), modPath: folder });
  }
  return {
    schemaVersion: 1,
    workshopId: String(id),
    source: 'steamcmd-anonymous',
    extractedAt: now,
    buildings,
    vehicles: [],
  };
}

function download(ids) {
  // One invocation: the connection and content-server handshake is the slow
  // part, not the transfer, so batching is much faster than a call per item.
  const args = ['+login', 'anonymous'];
  for (const id of ids) args.push('+workshop_download_item', APP_ID, String(id));
  args.push('+quit');
  execFileSync(STEAMCMD, args, { stdio: ['ignore', 'inherit', 'inherit'], timeout: 30 * 60 * 1000 });
}

function saveIds(dirs) {
  const referenced = new Set();
  for (const dir of dirs) {
    const file = path.join(dir, 'buildings_game.bin');
    const buffer = readFileSync(file);
    const parsed = parseBuildingsGame(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    for (const id of workshopIdsInTypes(parsed.map(record => record.type))) referenced.add(id);
  }
  return referenced;
}

function main(argv) {
  const extractOnly = argv.includes('--extract-only');
  const fromSaves = argv.includes('--from-saves');
  const rest = argv.filter(arg => !arg.startsWith('--'));
  const indexFile = path.join(CATALOG, 'index.json');
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));

  let ids = rest;
  if (fromSaves) {
    ids = missingWorkshopIds(saveIds(rest), index);
    console.log(`${ids.length} missing item(s) referenced by ${rest.length} save(s)`);
  }
  if (!ids.length) {
    console.log('nothing to fetch');
    return;
  }

  if (!extractOnly) download(ids);

  let added = 0;
  let empty = 0;
  for (const id of ids) {
    const dir = path.join(CONTENT, String(id));
    if (!existsSync(dir)) {
      console.error(`  ${id}: not downloaded, skipping`);
      continue;
    }
    const item = extractItem(id, dir);
    // An item that declares no buildings is still recorded: without it the
    // next run would try to fetch it again forever.
    if (!item.buildings.length) empty += 1;
    const relative = catalogPathFor(id);
    const target = path.join(CATALOG, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(item, null, 2)}\n`);
    index.items[String(id)] = {
      path: relative,
      buildingCount: item.buildings.length,
      vehicleCount: 0,
    };
    added += 1;
    console.log(`  ${id}: ${item.buildings.length} building(s) -> ${relative}`);
  }

  index.itemCount = Object.keys(index.items).length;
  index.generatedAt = new Date().toISOString();
  writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`\n${added} item(s) catalogued (${empty} declared no buildings), `
    + `catalog now holds ${index.itemCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
