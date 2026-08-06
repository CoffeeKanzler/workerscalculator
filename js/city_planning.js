// Categories intentionally stay separate from city_buildings.json records:
// the quick-start action creates planning placeholders, not a guessed
// building variant or an invented service capacity.
export const CITY_CORE_CATEGORY_TYPES = Object.freeze([
  'Rathaus', 'Einkaufzentrum', 'Alkohol', 'Kindergarten', 'Schule', 'Universität',
  'Polizei', 'Krankenhaus', 'Feuerwehr', 'Kino', 'Sport', 'Kultur',
]);

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
