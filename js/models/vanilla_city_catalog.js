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

const POLICE_TYPE = Object.freeze({ de: 'Polizei', en: 'police' });

const policeStaffing = raw => ({
  workers: Number.isFinite(raw?.workers) ? raw.workers : 0,
  officers: Number.isFinite(raw?.professors) ? raw.professors : 0,
});

const policeSignature = (workers, officers) => JSON.stringify([
  Number(workers), Number(officers),
]);

const isEligiblePoliceStation = raw => Boolean(
  raw?.types?.includes('TYPE_POLICE_STATION')
  && !isWorkshopId(raw.id)
  && Number.isFinite(raw.workers)
  && Number.isFinite(raw.professors)
);

const fallbackPoliceStation = raw => {
  const staffing = policeStaffing(raw);
  const workerLabel = String(staffing.workers);
  const officerLabel = String(staffing.officers);
  const provenance = {
    identity: 'game-file',
    workers: 'game-file',
    specialStaff: 'game-file',
  };
  const row = {
    gameId: raw.id,
    de: `Polizeirevier (${workerLabel} Helfer + ${officerLabel} Polizisten)`,
    en: `Police station (${workerLabel} workers + ${officerLabel} police officers)`,
    type: POLICE_TYPE,
    kind: 'Vanilla',
    quality: null,
    workers: staffing.workers + staffing.officers,
    special: staffing.officers,
    visitors: 0,
    inhabitants: 0,
    recommendedFor: 0,
    provenance,
  };
  const dlc = String(raw.id).match(/^(dlc\d+)\//i)?.[1];
  if (dlc) row.dlc = dlc.toLowerCase();
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

export function mergeVanillaCityCatalog(cityBuildings, rawBuildings) {
  const result = mergeVanillaCityResidences(cityBuildings, rawBuildings);
  const existingIds = new Set(result.map(row => row.gameId).filter(Boolean));
  const policeBySignature = new Map();

  for (const raw of rawBuildings) {
    if (!isEligiblePoliceStation(raw) || existingIds.has(raw.id)) continue;
    const staffing = policeStaffing(raw);
    const key = policeSignature(staffing.workers + staffing.officers, staffing.officers);
    const matches = policeBySignature.get(key) ?? [];
    matches.push(raw);
    policeBySignature.set(key, matches);
  }

  for (let index = 0; index < result.length; index += 1) {
    const row = result[index];
    if (row.gameId || row.kind !== 'Vanilla' || row.type?.de !== POLICE_TYPE.de) continue;
    const matches = policeBySignature.get(policeSignature(row.workers, row.special));
    if (matches?.length !== 1) continue;
    const [raw] = matches;
    result[index] = {
      ...row,
      gameId: raw.id,
      provenance: {
        ...row.provenance,
        identity: 'game-file',
        workers: 'game-file',
        specialStaff: 'game-file',
      },
    };
    existingIds.add(raw.id);
    policeBySignature.delete(policeSignature(row.workers, row.special));
  }

  for (const raw of rawBuildings) {
    if (!isEligiblePoliceStation(raw) || existingIds.has(raw.id)) continue;
    result.push(fallbackPoliceStation(raw));
    existingIds.add(raw.id);
  }

  return result;
}
