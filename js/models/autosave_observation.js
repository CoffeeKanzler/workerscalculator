// Fields that only describe what is happening right now. They are rebuilt on
// every launch, and persisting them means a stale "Import failed …" can
// reappear on a later visit and make a healthy build look broken.
const TRANSIENT_KEYS = [
  'statsRecords', 'viewingSharedLink', 'snapshotNotice',
  'planningPersistenceError', 'observationPersistenceError',
  'importStatus', 'importStatusError', 'importBusy',
  'localWorkshopStatus', 'liveStatsStatus', 'liveStatsStatusError',
  'runtimeStatus', 'runtimeReason', 'runtimeGeneration', 'runtimeObservedAt', 'liveModel',
];

// Exact network and terrain geometry: several megabytes that belong to the
// named snapshot, which is restored separately. Re-serialising it on every
// edit would make each keystroke pay for data no autosave consumer reads.
const HEAVY_MAP_KEYS = [
  'roadNetwork', 'railNetwork', 'pedestrianNetwork', 'terrainWater', 'pollutionLayer',
];

export function hasHeavyMapData(saveImport) {
  return !!saveImport && HEAVY_MAP_KEYS.some(key => saveImport[key]);
}

// Builds the value handed to the autosave. It shallow-copies rather than
// round-tripping through JSON: the persistence layer serialises it once
// already, and doing it twice doubled the main-thread cost of every keystroke.
export function observationForAutosave(state = {}) {
  const observation = {};
  for (const [key, value] of Object.entries(state)) {
    if (!TRANSIENT_KEYS.includes(key)) observation[key] = value;
  }
  if (hasHeavyMapData(observation.saveImport)) {
    const summary = {};
    for (const [key, value] of Object.entries(observation.saveImport)) {
      if (!HEAVY_MAP_KEYS.includes(key)) summary[key] = value;
    }
    observation.saveImport = summary;
  }
  return observation;
}

export { TRANSIENT_KEYS, HEAVY_MAP_KEYS };
