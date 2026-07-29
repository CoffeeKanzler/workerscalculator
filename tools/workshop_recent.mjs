// Lists Workshop items published since the catalogue was last filled.
//
// The catalogue was built once from a backlog list assembled by hand, which is
// fine for catching up and useless for keeping up: the Workshop gains items
// every week, and a save referencing one of them shows an untranslated
// `3153910867/pojazdy4` where a building name belongs.
//
// Steam's QueryFiles API would be the tidy way to enumerate them and it needs
// an API key. The public browse listing needs nothing, and sorted by most
// recent it answers the only question a daily run asks: what appeared since
// last time. Walking a page or two of that is enough to stay current, and the
// walk stops early once a page contains nothing new.
//
// Usage:
//   node tools/workshop_recent.mjs [--pages 3] [--out backlog.txt]
//
// Prints the ids that are not in the catalogue yet, one per line.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX_FILE = path.join(ROOT, 'data', 'workshop', 'index.json');
const APP_ID = '784150';

// Steam serves the listing only to something that looks like a browser.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) workerscalculator-catalogue';

export function itemIdsFrom(html) {
  // Anchors to the item pages. Matching bare `id=` numbers would also pick up
  // app ids and profile ids that appear elsewhere on the page.
  const ids = new Set();
  for (const match of String(html).matchAll(/filedetails\/\?id=(\d{6,})/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export function listingUrl(page, { sort = 'mostrecent' } = {}) {
  return `https://steamcommunity.com/workshop/browse/?appid=${APP_ID}`
    + `&browsesort=${sort}&section=readytouseitems&p=${page}`;
}

// A page whose ids are all catalogued means the walk has reached items that
// were already known, so there is nothing older worth reading.
export function newIdsOnPage(pageIds, known) {
  return pageIds.filter(id => !known.has(id));
}

function knownIds() {
  if (!existsSync(INDEX_FILE)) return new Set();
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  return new Set(index.ids ?? Object.keys(index.items ?? {}));
}

function argValue(argv, flag, fallback) {
  const at = argv.indexOf(flag);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

async function main(argv) {
  const pages = Number(argValue(argv, '--pages', '3'));
  const out = argValue(argv, '--out', null);
  const known = knownIds();
  const found = [];
  let scanned = 0;

  for (let page = 1; page <= pages; page += 1) {
    const response = await fetch(listingUrl(page), { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      console.error(`page ${page}: HTTP ${response.status}`);
      break;
    }
    const ids = itemIdsFrom(await response.text());
    if (!ids.length) {
      console.error(`page ${page}: no items found, stopping`);
      break;
    }
    scanned += ids.length;
    const fresh = newIdsOnPage(ids, known);
    for (const id of fresh) {
      known.add(id);
      found.push(id);
    }
    console.error(`page ${page}: ${ids.length} listed, ${fresh.length} new`);
    // Courtesy to a public endpoint being polled on a schedule.
    if (page < pages) await new Promise(resolve => setTimeout(resolve, 1200));
  }

  console.error(`${scanned} item(s) scanned, ${found.length} not yet catalogued`);
  if (out) {
    writeFileSync(out, found.length ? `${found.join('\n')}\n` : '');
    console.error(`wrote ${out}`);
  } else {
    for (const id of found) console.log(id);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
