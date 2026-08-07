// A save folder only has to contain namepoints.bin and buildings_game.bin, and
// the parser reports every other source as null when it is absent or
// unreadable. null slips past a default parameter, so both inputs are
// normalised here rather than trusted to be arrays.
export function completedPaidResearchKeys(definitions, savedResearch) {
  const paid = new Set((definitions ?? [])
    .filter(item => item.pointCost === 1).map(item => item.key));
  return [...new Set((savedResearch ?? [])
    .filter(item => item.progress >= 1 && paid.has(item.key))
    .map(item => item.key))].sort();
}

// LowTech is a planning rule, but these inputs are observable in an imported
// save. Keep the source gate strict: a missing optional file must leave the
// planner's manual value alone rather than turning an unavailable value into 0.
export function lowTechSaveValues(saveImport, {
  definitions = [],
  gameDate = null,
  statsRecords = null,
} = {}) {
  if (!saveImport || typeof saveImport !== 'object') return {};
  const exact = key => saveImport.sourceStatus?.[key] === 'exact';
  const values = {};

  if (exact('workers') && Number.isFinite(saveImport.citizenCount)) {
    values.population = Math.max(0, Math.floor(saveImport.citizenCount));
    const scopes = Array.isArray(saveImport.scopes) ? saveImport.scopes : [];
    const hasScopePopulation = scopes.some(scope => Number.isFinite(scope?.citizens?.residents));
    if (hasScopePopulation) {
      values.cities = scopes.filter(scope => (scope.citizens?.residents ?? 0) >= 200).length;
    }
  }

  let importedYear = null;
  if (exact('stats') && Array.isArray(statsRecords)) {
    const latest = [...statsRecords].reverse().find(record => Number.isInteger(record?.year));
    if (latest) importedYear = latest.year;
  }
  if (importedYear === null && Number.isInteger(gameDate?.year)) importedYear = gameDate.year;
  if (importedYear !== null) values.currentYear = importedYear;

  if (exact('stats') && Array.isArray(statsRecords)) {
    const historyYears = statsRecords
      .map(record => record?.year)
      .filter(Number.isInteger);
    if (historyYears.length) values.startYear = Math.min(...historyYears);
  }

  if (exact('research') && Array.isArray(saveImport.research)) {
    const researchKeys = completedPaidResearchKeys(definitions, saveImport.research);
    values.researched = researchKeys.length;
    values.researchKeys = researchKeys;
  }
  return values;
}

export function lowTechDisplayValues(lowtech, saveValues = {}) {
  if (!lowtech || lowtech.inputSource === 'manual' || !Object.keys(saveValues).length) {
    return { ...(lowtech ?? {}) };
  }
  return { ...lowtech, ...saveValues };
}
