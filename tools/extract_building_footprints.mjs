// Offline extraction of building footprints from the installed game files.
//
// Every building asset ships a `.bbox` companion: a u32 count followed by that
// many 540-byte collision-node records, each carrying its local axis-aligned
// box as six floats at +516 (min x/y/z then max x/y/z). Every one of the 996
// files in the retail install matches `4 + count * 540` exactly, which is what
// makes reading only the boxes safe without decoding the rest of the record.
//
// Usage: node tools/extract_building_footprints.mjs /path/to/media_soviet
//
// The map draws these boxes rotated by the building's exact saved rotation, so
// a republic reads as its real buildings rather than as identical dots.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RECORD_SIZE = 540;
const BOX_OFFSET = 516;

export function parseBoundingBoxes(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = view.getUint32(0, true);
  if (buffer.byteLength !== 4 + count * RECORD_SIZE) {
    throw new Error(`bbox length ${buffer.byteLength} does not match ${count} records`);
  }
  const boxes = [];
  for (let index = 0; index < count; index += 1) {
    const at = 4 + index * RECORD_SIZE + BOX_OFFSET;
    const values = Array.from({ length: 6 }, (_, item) => view.getFloat32(at + item * 4, true));
    if (!values.every(Number.isFinite)) continue;
    const [minX, minY, minZ, maxX, maxY, maxZ] = values;
    if (!(minX < maxX) || !(minZ < maxZ) || !(minY <= maxY)) continue;
    boxes.push({ minX, minZ, maxX, maxZ, height: maxY - Math.min(0, minY) });
  }
  return boxes;
}

const round = value => Math.round(value * 100) / 100;

export function collectFootprints(media) {
  const footprints = {};
  const add = (id, file) => {
    try {
      const boxes = parseBoundingBoxes(readFileSync(file));
      // Rounding to centimetres keeps the dataset small, but a box thinner than
      // that collapses to a line, so it is dropped after rounding rather than
      // before.
      const rounded = boxes
        .map(box => [round(box.minX), round(box.minZ), round(box.maxX), round(box.maxZ)])
        .filter(([minX, minZ, maxX, maxZ]) => maxX > minX && maxZ > minZ);
      if (!rounded.length) return;
      footprints[id] = {
        boxes: rounded,
        height: round(Math.max(...boxes.map(box => box.height))),
      };
    } catch (error) {
      process.stderr.write(`skipped ${id}: ${error.message}\n`);
    }
  };
  const vanilla = path.join(media, 'buildings_types');
  for (const name of readdirSync(vanilla).sort()) {
    if (!name.endsWith('.bbox')) continue;
    add(name.slice(0, -'.bbox'.length).toLowerCase(), path.join(vanilla, name));
  }
  for (const pack of readdirSync(media).sort()) {
    const root = path.join(media, pack, 'buildings');
    if (!safeIsDirectory(root)) continue;
    for (const sub of readdirSync(root).sort()) {
      const file = path.join(root, sub, 'building.bbox');
      if (!safeIsFile(file)) continue;
      add(`${pack}/${sub}`.toLowerCase(), file);
    }
  }
  return footprints;
}

function safeIsDirectory(target) {
  try { return statSync(target).isDirectory(); } catch { return false; }
}

function safeIsFile(target) {
  try { return statSync(target).isFile(); } catch { return false; }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const media = process.argv[2];
  if (!media) {
    process.stderr.write('usage: extract_building_footprints.mjs /path/to/media_soviet\n');
    process.exit(1);
  }
  const footprints = collectFootprints(media);
  const output = path.resolve(new URL('../data/building_footprints.json', import.meta.url).pathname);
  writeFileSync(output, `${JSON.stringify({ version: 1, footprints }, null, 0)}\n`);
  process.stdout.write(`${Object.keys(footprints).length} footprints written to ${output}\n`);
}
