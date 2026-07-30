// "This building can never be fully staffed by the people who can reach it."
//
// The count compared against the establishment is the catchment already
// accumulated for the map inspector: for each residence within the walking
// budget, or within a walk-ride-walk of it, every adult living there. The same
// adult is therefore counted for every workplace they could choose, which makes
// the figure an upper bound and not a forecast — and an upper bound is exactly
// what this alert needs. If it falls short of the establishment, no arrangement
// of shifts fills the building; if it does not, nothing here claims the
// building will actually be full.
//
// Buildings that need nobody raise nothing, and neither does anything still
// under construction.
//
// A field is the case worth spelling out. It does carry a worker count in the
// save — 150 on a medium one — but that is the size of the job, worked by the
// farm the field belongs to, not an establishment anybody staffs by walking
// there. Left in, fields were most of the list. They are excluded by the save's
// own asset type rather than by name: savedTypePlusOne is 9 for every field and
// for nothing else, on both test republics, mods included.
const FIELD_SAVED_TYPE = 9;
const UNREACHABLE = 'access.unreachable';
const UNDERSTAFFED = 'access.understaffed';

function establishmentOf(building) {
  const configured = (building?.configuredWorkers ?? 0)
    + (building?.configuredWorkersHighEducation ?? 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

function isComplete(building) {
  const progress = building?.constructionProgress;
  return !Number.isFinite(progress) || progress >= 1;
}

export function workerAccessAlerts({
  evidence = null,
  walkingNetwork = null,
  buildings = [],
  scopeNameFor = null,
  labelFor = null,
  muted = [],
  criticalShare = 0.5,
} = {}) {
  if (!evidence?.catchment || evidence.completeness !== 'complete') return [];
  const silenced = new Set(muted ?? []);
  const alerts = [];
  for (const building of buildings) {
    const slots = establishmentOf(building);
    if (!slots || building.savedTypePlusOne === FIELD_SAVED_TYPE
      || !isComplete(building) || silenced.has(building.index)) continue;
    const row = evidence.catchment.get(building.index);
    const reachable = (row?.walkAdults ?? 0) + (row?.transitAdults ?? 0);
    // Not bound to a footpath or a road at all: nobody can walk the last metre,
    // whatever transport runs nearby. That is a different problem from a short
    // catchment and reads as one.
    const attached = walkingNetwork ? walkingNetwork.buildingEdges?.has(building.index) : true;
    if (reachable >= slots && attached) continue;
    const share = slots ? reachable / slots : 0;
    alerts.push({
      severity: !attached || share < criticalShare ? 'critical' : 'warning',
      metric: !attached ? UNREACHABLE : UNDERSTAFFED,
      buildingIndex: building.index,
      scopeId: building.scopeId ?? null,
      scopeName: labelFor?.(building) ?? building.name ?? building.type ?? `#${building.index}`,
      areaName: scopeNameFor?.(building.scopeId) ?? null,
      observed: share,
      threshold: 1,
      slots,
      reachableAdults: reachable,
      walkAdults: row?.walkAdults ?? 0,
      transitAdults: row?.transitAdults ?? 0,
      evidence: 'buildings_game.bin + pedestrianway.bin + road.bin',
    });
  }
  const order = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]
    || a.observed - b.observed
    || b.slots - a.slots
    || a.buildingIndex - b.buildingIndex);
}
