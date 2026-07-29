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
//   node tools/workshop_fetch.mjs --ids-file <path> [--batch-size 100] [--prune]
//
// A large backlog must be pruned as it goes: the full catalogue is on the
// order of 130 GB of models and textures, against far less free disk, while
// the definitions extracted from it are a few megabytes. --prune deletes each
// item's raw download once its definitions are safely written.

import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync, rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseWorkshopBuildingIni, workshopBuildingIdentity } from '../js/workshop_ini.js';
import { workshopIdsInTypes, missingWorkshopIds } from './workshop_missing.mjs';
import { parseBuildingsGame } from '../js/savegame.js';
import { readWorkshopIndex, writeWorkshopIndex } from '../js/models/workshop_index.js';
import { parseBoundingBoxes } from './extract_building_footprints.mjs';

const APP_ID = '784150';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CATALOG = path.join(ROOT, 'data/workshop');
const CONTENT = process.env.WORKSHOP_CONTENT
  ?? path.join(process.env.HOME ?? '', 'Steam/steamapps/workshop/content', APP_ID);
const STEAMCMD = process.env.STEAMCMD ?? 'steamcmd';

// Items are sharded by their last two digits, keeping any one directory small.
// steamcmd is rate limited per login, and the original catalogue run spawned
// one invocation per item: 7,478 logins, of which 5,026 failed and were
// abandoned after three attempts. Batching into a single login fixed every one
// of a sample that had failed that way, so batches stay large but bounded.
export function batches(ids, size = 100) {
  const out = [];
  for (let index = 0; index < ids.length; index += size) out.push(ids.slice(index, index + size));
  return out;
}

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

// A building's outline, read from the `.bbox` companion beside its ini. The
// boxes are local to the building and the map rotates them by the saved
// rotation, so nothing here needs to know where the building stands.
//
// Rounded to centimetres to keep the catalogue small. A box thinner than that
// collapses to a line and is dropped after rounding rather than before, or a
// wall two centimetres thick would round to nothing and take the building's
// whole outline with it.
export function footprintBesideIni(folder) {
  const file = path.join(folder, 'building.bbox');
  if (!existsSync(file)) return null;
  try {
    const boxes = parseBoundingBoxes(readFileSync(file));
    const round = value => Math.round(value * 100) / 100;
    const rounded = boxes
      .map(box => [round(box.minX), round(box.minZ), round(box.maxX), round(box.maxZ)])
      .filter(([minX, minZ, maxX, maxZ]) => maxX > minX && maxZ > minZ);
    if (!rounded.length) return null;
    return { boxes: rounded, height: round(Math.max(...boxes.map(box => box.height))) };
  } catch {
    // A malformed bbox costs the building its outline, not its definition.
    return null;
  }
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
    // The map draws each building's real outline rather than an identical dot,
    // and a modded republic is most of what a modded save contains. Mods ship
    // the same `building.bbox` the retail install does, in the same format, so
    // reading it here means a Workshop building is shaped on the map exactly
    // as a vanilla one is.
    const footprint = footprintBesideIni(path.join(dir, folder));
    buildings.push({
      ...parsed,
      id: `${id}/${folder}`,
      workshopId: String(id),
      modPath: folder,
      ...(footprint ? { footprint } : {}),
    });
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
  //
  // An anonymous login can only fetch a subset of the Workshop: of a 5,026
  // item backlog, 3,141 were still public on the Steam API — real titles, real
  // file sizes — and steamcmd refused every one of them with a bare
  // "Failure", most without logging anything at all. It is not rate limiting
  // or batch size; an item that works works immediately after one that does
  // not.
  //
  // STEAM_USER switches to a named account, which can fetch the rest. No
  // password is passed here and none is stored: steamcmd is expected to have a
  // cached session from an interactive `steamcmd +login <user>` run beforehand,
  // and if that session has expired this exits rather than prompting, because
  // a prompt inside a batch run would hang until the timeout.
  const user = process.env.STEAM_USER?.trim();
  const args = ['+login', user || 'anonymous'];
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

// Deletes the raw download of anything already catalogued. A run of several
// thousand items takes hours, and a download is dead weight the moment its
// definitions are extracted, so this runs between batches too rather than only
// at startup.
export function reclaimCataloguedDownloads(index, contentDir = CONTENT) {
  if (!existsSync(contentDir)) return 0;
  let reclaimed = 0;
  for (const entry of readdirSync(contentDir)) {
    if (!index.items[entry]) continue;
    rmSync(path.join(contentDir, entry), { recursive: true, force: true });
    reclaimed += 1;
  }
  if (reclaimed) console.log(`reclaimed ${reclaimed} download(s) already catalogued`);
  return reclaimed;
}

function catalogueOne(id, index, { prune = false } = {}) {
  const dir = path.join(CONTENT, String(id));
  if (!existsSync(dir)) return { ok: false };
  const item = extractItem(id, dir);
  const relative = catalogPathFor(id);
  const target = path.join(CATALOG, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(item, null, 2)}\n`);
  // An item that declares no buildings is still recorded: without it the next
  // run would try to fetch it again forever.
  index.items[String(id)] = {
    path: relative,
    buildingCount: item.buildings.length,
    vehicleCount: 0,
  };
  // Only after the definitions are on disk, so a crash mid-run loses a
  // download rather than a catalogue entry.
  if (prune) rmSync(dir, { recursive: true, force: true });
  return { ok: true, buildings: item.buildings.length };
}

function writeIndex(indexFile, index) {
  // Compact form: the index is fetched on every page load, and all it has to
  // answer is which ids exist. Paths are derived and the counts are unread.
  const compact = writeWorkshopIndex({
    appId: index.appId ?? APP_ID,
    ids: Object.keys(index.items),
  });
  index.itemCount = compact.itemCount;
  writeFileSync(indexFile, `${JSON.stringify(compact, null, 2)}\n`);
}

function flagValue(argv, name, fallback) {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

function main(argv) {
  const extractOnly = argv.includes('--extract-only');
  const fromSaves = argv.includes('--from-saves');
  const prune = argv.includes('--prune');
  const refresh = argv.includes('--refresh');
  const size = Number(flagValue(argv, '--batch-size', '100'));
  const idsFile = flagValue(argv, '--ids-file', null);
  const flagValues = new Set([idsFile, String(size)].filter(Boolean));
  const rest = argv.filter(arg => !arg.startsWith('--') && !flagValues.has(arg));
  const indexFile = path.join(CATALOG, 'index.json');
  const stored = JSON.parse(readFileSync(indexFile, 'utf8'));
  // Normalise to the working shape regardless of which format is on disk.
  const index = {
    appId: stored.appId ?? APP_ID,
    items: Object.fromEntries(readWorkshopIndex(stored).ids().map(id => [id, {}])),
  };

  let ids = rest;
  if (idsFile) {
    ids = readFileSync(idsFile, 'utf8').split(/\s+/).filter(Boolean);
  }
  if (fromSaves) {
    ids = missingWorkshopIds(saveIds(rest), index);
    console.log(`${ids.length} missing item(s) referenced by ${rest.length} save(s)`);
  }
  // Resumable: anything already catalogued is skipped, so a re-run continues.
  //
  // --refresh re-fetches them instead. The catalogue is a cache of what was
  // extracted, so widening what gets extracted — building footprints, say —
  // leaves every existing entry missing the new field, and skipping them is
  // exactly wrong.
  const requested = new Set(ids);
  if (!refresh) ids = missingWorkshopIds(requested, index);

  // Skipping them is right, but they were reaching the catalogue without ever
  // reaching the pruning that happens alongside it, so their raw downloads
  // accumulated across runs — 14 GB of them before this was noticed. Anything
  // already catalogued has no further use for its download.
  //
  // The sweep walks everything on disk rather than only this run's id list.
  // Scoped to `requested` it could not see downloads left by an earlier run
  // with a different list, which is how 33 GB accumulated while a run with
  // --prune was in progress and apparently working.
  // Not under --refresh: that pass is re-downloading the very items this
  // would delete, and the per-item prune after cataloguing still runs.
  if (prune && !refresh) reclaimCataloguedDownloads(index);
  if (!ids.length) {
    console.log('nothing to fetch');
    return;
  }

  const groups = extractOnly ? [ids] : batches(ids, size);
  console.log(`${ids.length} item(s) in ${groups.length} batch(es) of up to ${size}`
    + `${prune ? ', pruning raw downloads as they are catalogued' : ''}`
    + `, as ${process.env.STEAM_USER?.trim() || 'anonymous'}`);

  let added = 0;
  let failed = 0;
  let buildings = 0;
  groups.forEach((group, number) => {
    if (!extractOnly) {
      try {
        download(group);
      } catch (error) {
        // A whole batch failing is worth reporting, but the next one may well
        // succeed, so the run continues rather than abandoning the backlog.
        console.error(`batch ${number + 1}: steamcmd failed (${error.message.slice(0, 80)})`);
      }
    }
    for (const id of group) {
      const result = catalogueOne(id, index, { prune });
      if (result.ok) { added += 1; buildings += result.buildings; } else failed += 1;
    }
    writeIndex(indexFile, index);
    // Between batches, not only at startup: a failed download leaves its
    // directory behind, and a long run would otherwise hold every one of them
    // until it finished.
    if (prune && !refresh) reclaimCataloguedDownloads(index);
    console.log(`batch ${number + 1}/${groups.length}: ${added} catalogued, `
      + `${failed} unavailable, ${buildings} building definitions, `
      + `catalog holds ${index.itemCount}`);
  });

  console.log(`\ndone: ${added} catalogued, ${failed} unavailable, `
    + `${buildings} building definitions, catalog holds ${index.itemCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
