export const RESIDENTIAL_MENU_TYPES = Object.freeze({
  building_residential_small: Object.freeze({
    de: 'Kleine Wohnhäuser', en: 'Small residential buildings',
  }),
  building_residential_medium: Object.freeze({
    de: 'Mittlere Wohnhäuser', en: 'Medium residential buildings',
  }),
  building_residential_big: Object.freeze({
    de: 'Große Wohnhäuser', en: 'Large residential buildings',
  }),
  building_internat1: Object.freeze({
    de: 'Studentenwohnheim', en: 'University halls of residence',
  }),
});

const UNKNOWN_FIELDS = Object.freeze([
  'power', 'maxKW', 'water', 'hotwater', 'waste', 'workdays',
  'gravel', 'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels',
  'ecomponents', 'mcomponents',
]);

const normalize = value => String(value ?? '')
  .trim()
  .toLocaleLowerCase('de-DE')
  .replace(/\s+/g, ' ');

const signature = (name, inhabitants, quality) => JSON.stringify([
  normalize(name),
  Number(inhabitants),
  quality == null ? null : Number(quality),
]);

const isWorkshopId = id => /^\d+\//.test(String(id ?? ''));

const isEligibleResidence = raw => Boolean(
  RESIDENTIAL_MENU_TYPES[raw?.menuSfx]
  && raw.types?.includes('TYPE_LIVING')
  && Number.isFinite(raw.livingSpace)
  && raw.livingSpace > 0
  && !isWorkshopId(raw.id)
);

const fallbackResidence = raw => {
  const de = raw.de ?? raw.nameStr ?? raw.id;
  const en = raw.en ?? raw.nameStr ?? de;
  const provenance = {
    identity: 'game-file',
    housing: 'game-file',
    workers: 'game-file',
  };
  const row = {
    gameId: raw.id,
    de,
    en,
    type: RESIDENTIAL_MENU_TYPES[raw.menuSfx],
    kind: 'Vanilla',
    quality: raw.qualityOfLiving ?? null,
    workers: Number.isFinite(raw.workers) ? raw.workers : 0,
    special: 0,
    visitors: 0,
    inhabitants: raw.livingSpace,
    recommendedFor: 0,
    provenance,
  };
  for (const field of UNKNOWN_FIELDS) {
    row[field] = null;
    provenance[field] = 'unavailable';
  }
  return row;
};

export function mergeVanillaCityResidences(cityBuildings, rawBuildings) {
  const result = [...cityBuildings];
  const existingIds = new Set(cityBuildings.map(row => row.gameId).filter(Boolean));
  const unmatchedBySignature = new Map();

  cityBuildings.forEach((row, index) => {
    if (row.gameId) return;
    const key = signature(row.de ?? row.en, row.inhabitants, row.quality);
    const bucket = unmatchedBySignature.get(key) ?? [];
    bucket.push(index);
    unmatchedBySignature.set(key, bucket);
  });

  for (const raw of rawBuildings) {
    if (!isEligibleResidence(raw) || existingIds.has(raw.id)) continue;
    const name = raw.de ?? raw.nameStr ?? raw.id;
    const key = signature(name, raw.livingSpace, raw.qualityOfLiving);
    const matches = unmatchedBySignature.get(key);
    if (matches?.length) {
      matches.shift();
      continue;
    }
    result.push(fallbackResidence(raw));
    existingIds.add(raw.id);
  }

  return result;
}
