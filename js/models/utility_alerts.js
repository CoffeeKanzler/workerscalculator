// Buildings the save shows holding none of a utility they are plumbed for.
//
// Electricity established the shape and the evidence for it (see power_alerts
// and REVERSE_ENGINEERING.md): a building does not receive power down a wire of
// its own, but it does carry a storage line for it, and a line at zero is a
// building that had none at the instant the game was written.
//
// Water and heat record themselves the same way, which is why they can be read
// the same way rather than guessed at. Across the three test republics:
//
//   resource   buildings carrying a line   holding none
//   eletric                       1176              173
//   water                         1812              263
//   heat                           787               93
//
// What this claims is only what the save states — held none when saved — never
// that supply is impossible or that the building is broken. A buffer read at an
// instant is an instant, and the wording says so.
const FIELD_SAVED_TYPE = 9;

export const UTILITIES = Object.freeze({
  eletric: 'power.unpowered',
  water: 'water.missing',
  heat: 'heat.missing',
});

function storedLine(building, resource) {
  for (const storage of building?.storages ?? []) {
    for (const line of storage.resources ?? []) {
      if (line.resource === resource) return line;
    }
  }
  return null;
}

export function buildingNeedsUtility(building, resource) {
  return storedLine(building, resource) !== null;
}

function establishmentOf(building) {
  const configured = (building?.configuredWorkers ?? 0)
    + (building?.configuredWorkersHighEducation ?? 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

// Holding none only means something for a building that does something with it.
// Most of the ones that hold none are still being built, and most of the rest
// are pylons, silos and parking that carry a line and never draw on it —
// listing those would bury the one building that matters under forty that do not.
export function missingUtilityAlerts({
  buildings = [],
  occupiedResidences = [],
  resource = 'eletric',
  labelFor = null,
  scopeNameFor = null,
  muted = [],
} = {}) {
  const metric = UTILITIES[resource];
  if (!metric) throw new Error(`no alert defined for utility ${resource}`);
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
    const line = storedLine(building, resource);
    if (!line || line.amount > 0) continue;
    const slots = establishmentOf(building);
    if (slots === 0 && !lived.has(building.index)) continue;
    alerts.push({
      severity: slots > 0 ? 'critical' : 'warning',
      metric,
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
