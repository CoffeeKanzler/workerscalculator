import { parseBlueprintOwned, parseStatsIni } from './statsini.js?v=17';

const PRICE_MAPS = ['purchaseUSD', 'purchaseRUB', 'sellUSD', 'sellRUB'];

function hasPriceData(records) {
  return records.some(record => PRICE_MAPS.some(key => Object.keys(record[key] ?? {}).length));
}

function contentHash(text) {
  // Fast deterministic hash. File metadata alone is insufficient because the game
  // can rewrite stats.ini within a filesystem timestamp's resolution.
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseLiveStatsFile(text, file = {}) {
  const records = parseStatsIni(text);
  if (!records.length || !hasPriceData(records)) {
    throw new Error('No $STAT_RECORD price data found in stats.ini.');
  }
  const latest = records.at(-1);
  return {
    records,
    blueprintOwned: parseBlueprintOwned(text),
    name: file.name || 'stats.ini',
    revision: [file.size ?? text.length, file.lastModified ?? 0, records.length,
      latest.year ?? '', latest.day ?? '', contentHash(text)].join(':'),
  };
}
