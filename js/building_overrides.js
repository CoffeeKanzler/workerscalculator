const SCALAR_FIELDS = [
  'workers', 'power', 'maxKW', 'water', 'hotwater', 'wastePerWorker', 'workdays',
  'gravel', 'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels',
  'ecomponents', 'mcomponents',
];

export function buildingOverrideKey(dataset, building) {
  const identity = building.gameId
    || `${building.group?.en || building.group?.de || 'ungrouped'}:${building.en || building.de}`;
  return `${dataset}:${identity}`;
}

function applyRates(rows = [], overrides = {}) {
  return rows.map(row => {
    const key = row.en || row.de;
    return overrides[key] === undefined ? row : { ...row, rate: overrides[key] };
  });
}

export function applyBuildingOverrides(buildings, overrides = {}, dataset = 'game') {
  return buildings.map(building => {
    const override = overrides[buildingOverrideKey(dataset, building)];
    if (!override) return building;
    const next = { ...building };
    const provenance = { ...building.provenance, userOverride: true };
    for (const field of SCALAR_FIELDS) {
      if (override[field] !== undefined) {
        next[field] = override[field];
        provenance[field] = 'user-override';
      }
    }
    next.production = applyRates(building.production, override.production);
    next.consumption = applyRates(building.consumption, override.consumption);
    if (Object.keys(override.production ?? {}).length) provenance.production = 'user-override';
    if (Object.keys(override.consumption ?? {}).length) provenance.consumption = 'user-override';
    next.provenance = provenance;
    return next;
  });
}

export function duplicateCustomBuilding(building, dataset, id) {
  const provenance = Object.fromEntries([
    ...SCALAR_FIELDS, 'production', 'consumption',
  ].map(field => [field, 'user-override']));
  const name = `${building.en || building.de} (custom)`;
  return {
    ...structuredClone(building),
    gameId: `custom:${id}`,
    en: name,
    de: name,
    customBuilding: true,
    customDataset: dataset,
    provenance: { ...provenance, userOverride: true },
  };
}

export { SCALAR_FIELDS as BUILDING_OVERRIDE_FIELDS };
