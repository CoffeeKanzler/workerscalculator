export const CITY_PLANNING_DRAFT_KEY = 'wr-city-planning-draft-v1';

export function saveCityPlanningDraft(planning, storage = globalThis.localStorage) {
  if (!storage || !Array.isArray(planning?.cities)) return false;
  try {
    storage.setItem(CITY_PLANNING_DRAFT_KEY, JSON.stringify({
      schemaVersion: 1,
      revision: Number.isInteger(planning.revision) ? planning.revision : 0,
      activeCity: Number.isInteger(planning.activeCity) ? planning.activeCity : 0,
      cities: planning.cities,
    }));
    return true;
  } catch {
    // IndexedDB remains the durable fallback when localStorage is unavailable
    // or a very large modded plan exceeds its synchronous quota.
    return false;
  }
}

export function loadCityPlanningDraft(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const draft = JSON.parse(storage.getItem(CITY_PLANNING_DRAFT_KEY));
    if (draft?.schemaVersion !== 1 || !Number.isInteger(draft.revision)
      || !Number.isInteger(draft.activeCity) || !Array.isArray(draft.cities)) return null;
    return draft;
  } catch {
    return null;
  }
}
