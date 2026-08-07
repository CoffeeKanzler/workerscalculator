// Categories intentionally stay separate from city_buildings.json records:
// the quick-start action creates planning placeholders, not a guessed
// building variant or an invented service capacity.
export const CITY_CORE_CATEGORY_TYPES = Object.freeze([
  'Rathaus', 'Einkaufzentrum', 'Alkohol', 'Kindergarten', 'Schule', 'Universität',
  'Polizei', 'Krankenhaus', 'Feuerwehr', 'Kino', 'Sport', 'Kultur',
]);

export const CITY_WORKSHOP_GROUPS = Object.freeze(['Werkstätten', 'Workshops']);

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
