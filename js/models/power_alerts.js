// Buildings the save shows holding no electricity.
//
// Power does not reach a building down a wire of its own: on the test republic
// only 42 of 1648 buildings are bound to a power network at all, and every one
// of those is a substation, a transformer, a switch or the plant itself. So
// there is nothing to trace. What the save does record is a storage line, in
// exactly the same shape as water and waste: 1176 buildings carry a resource
// called `eletric`, and 173 of them hold none of it.
//
// That the empty ones are the unpowered ones is not assumed, it is measured. A
// building holding electricity sits 125 m from the nearest power building on
// average; a building holding none sits 367 m away. And the game agrees about
// what that means: of the 1003 holding electricity, 732 have workers in them,
// while of the 173 holding none, one does.
//
// What this therefore claims is exactly what the save says — the building held
// no electricity at the moment the game was saved — and not that it can never
// be powered. A buffer read at an instant is an instant, and the wording says
// so.
const ELECTRICITY = 'eletric';

// A field needs nobody and nothing; it also never carries a power line, but
// saying so twice costs nothing and documents the intent.
const FIELD_SAVED_TYPE = 9;

function electricityLine(building) {
  for (const storage of building?.storages ?? []) {
    for (const resource of storage.resources ?? []) {
      if (resource.resource === ELECTRICITY) return { storage, resource };
    }
  }
  return null;
}

export function buildingNeedsElectricity(building) {
  return electricityLine(building) !== null;
}

function establishmentOf(building) {
  const configured = (building?.configuredWorkers ?? 0)
    + (building?.configuredWorkersHighEducation ?? 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

// Holding no electricity only means something for a building that does work
// with it. Most of the ones that hold none are still being built — 107 of 173 on
// one test save, 206 of 239 on another — and most of the rest are cableway
// pylons, silos and parking, which carry the line and never draw on it. Listing
// those would bury the one building that matters under forty that do not.
export function unpoweredBuildingAlerts({
  buildings = [],
  occupiedResidences = [],
  labelFor = null,
  scopeNameFor = null,
  muted = [],
} = {}) {
  const lived = new Set(occupiedResidences ?? []);
  const silenced = new Set(muted ?? []);
  const alerts = [];
  for (const building of buildings) {
    if (silenced.has(building.index)) continue;
    if (building.savedTypePlusOne === FIELD_SAVED_TYPE) continue;
    // Something still being built has not been connected yet, and saying so is
    // noise rather than news.
    const progress = building.constructionProgress;
    if (Number.isFinite(progress) && progress < 1) continue;
    const line = electricityLine(building);
    if (!line || line.resource.amount > 0) continue;
    const slots = establishmentOf(building);
    if (slots === 0 && !lived.has(building.index)) continue;
    alerts.push({
      severity: slots > 0 ? 'critical' : 'warning',
      metric: 'power.unpowered',
      buildingIndex: building.index,
      scopeId: building.scopeId ?? null,
      scopeName: labelFor?.(building) ?? building.name ?? building.type ?? `#${building.index}`,
      areaName: scopeNameFor?.(building.scopeId) ?? null,
      observed: 0,
      threshold: null,
      slots,
      evidence: 'buildings_game.bin',
    });
  }
  const order = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]
    || b.slots - a.slots
    || a.buildingIndex - b.buildingIndex);
}
