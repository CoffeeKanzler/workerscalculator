// Categories intentionally stay separate from city_buildings.json records:
// the quick-start action creates planning placeholders, not a guessed
// building variant or an invented service capacity.
export const CITY_CORE_CATEGORY_TYPES = Object.freeze([
  'Rathaus', 'Einkaufzentrum', 'Alkohol', 'Kindergarten', 'Schule', 'Universität',
  'Polizei', 'Krankenhaus', 'Feuerwehr', 'Kino', 'Sport', 'Kultur',
]);

export const CITY_WORKSHOP_GROUPS = Object.freeze(['Werkstätten', 'Workshops']);

export function cityBuildingDisplayName(building, lang = 'de') {
  return `${building?.[lang] ?? ''}${building?.dlc ? ' [DLC]' : ''}`;
}

export function cityWorkshopBuildings(buildings = []) {
  return buildings.filter(building => CITY_WORKSHOP_GROUPS.some(group =>
    building?.group?.de === group || building?.group?.en === group));
}

export function resolveCityWorkshopRows(rows, buildings = []) {
  const byGameId = new Map(cityWorkshopBuildings(buildings)
    .filter(building => building.gameId)
    .map(building => [building.gameId, building]));
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ...row,
    count: Number.isFinite(row?.count) ? row.count : 0,
    building: byGameId.get(row?.gameId) ?? null,
  }));
}

// Observation only: a planned city may be assigned to several real save
// cities. Their buildings and citizen snapshot then form one current-state
// baseline, while the plan rows remain owned by the planning city.
export function aggregateCityObservations(cities = [], scopeIds = []) {
  const wanted = new Set(scopeIds.filter(Number.isInteger));
  const selected = (Array.isArray(cities) ? cities : [])
    .filter(city => wanted.has(city?.scopeId));
  if (!selected.length) return null;

  const rowMap = new Map();
  for (const city of selected) {
    for (const row of city.rows ?? []) {
      const key = row.sourceGameId ?? row.importedBuilding?.gameId
        ?? `${row.type ?? ''}:${row.name ?? ''}`;
      const current = rowMap.get(key);
      if (!current) {
        rowMap.set(key, { ...row });
        continue;
      }
      current.count = (current.count ?? 0) + (row.count ?? 0);
      for (const field of ['currentWorkers', 'configuredWorkers', 'nominalWorkers']) {
        if (Number.isFinite(row[field])) current[field] = (current[field] ?? 0) + row[field];
      }
    }
  }

  const observedKeys = ['residents', 'adults', 'highEducation'];
  const observed = Object.fromEntries(observedKeys.map(key => [key,
    selected.reduce((sum, city) => sum + (city.observed?.[key] ?? 0), 0)]));
  for (const key of ['productivity', 'happiness', 'food', 'health', 'loyalty', 'criminality']) {
    const weighted = selected.reduce((result, city) => {
      const value = city.observed?.[key];
      const residents = city.observed?.residents;
      if (!Number.isFinite(value) || !Number.isFinite(residents) || residents <= 0) return result;
      return { value: result.value + value * residents, residents: result.residents + residents };
    }, { value: 0, residents: 0 });
    observed[key] = weighted.residents > 0 ? weighted.value / weighted.residents : null;
  }

  return {
    scopeIds: selected.map(city => city.scopeId),
    rows: [...rowMap.values()],
    observed,
  };
}

export function addMissingCityCategoryRows(rows, categoryTypes = CITY_CORE_CATEGORY_TYPES) {
  const existingRows = Array.isArray(rows) ? rows : [];
  const existingTypes = new Set(existingRows.map(row => row?.type).filter(Boolean));
  const addedTypes = categoryTypes.filter(type => !existingTypes.has(type));
  return {
    rows: [
      ...existingRows,
      ...addedTypes.map(type => ({ type, name: null, count: 1, categoryOnly: true })),
    ],
    addedTypes,
  };
}
