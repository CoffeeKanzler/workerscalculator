// City planning edits areas in place, so it needs the same view of the save's
// scopes that the republic overview already builds — otherwise a user with a
// loaded save lands on the hand-made placeholder area and never sees the
// settlements the save actually reported.
//
// Scope-backed areas come first, in scope order. An area the plan already holds
// is returned by identity so edits bind to stored state; a scope with no plan
// row yet is returned as a synthetic area the caller can materialise on demand.
// Hand-made areas that belong to no scope are kept so loading a save never
// hides work the user did by hand.
export function cityScopeIds(city) {
  const ids = Array.isArray(city?.scopeIds)
    ? city.scopeIds.filter(Number.isInteger)
    : Number.isInteger(city?.scopeId) ? [city.scopeId] : [];
  return [...new Set(ids)];
}

export function planningAreas({ cities = [], scopes = null, createDefault } = {}) {
  const planned = Array.isArray(cities) ? cities : [];
  if (!Array.isArray(scopes)) {
    return planned.length ? planned : [createDefault()];
  }

  const scopeIds = new Set(scopes.map(scope => scope.id));
  const byScope = new Map();
  for (const city of planned) {
    for (const scopeId of cityScopeIds(city)) {
      if (scopeIds.has(scopeId)) byScope.set(scopeId, city);
    }
  }
  const seen = new Set();
  const scoped = scopes
    .filter(scope => scope.city || scope.production)
    .flatMap(scope => {
      const city = byScope.get(scope.id);
      if (city) {
        if (seen.has(city)) return [];
        seen.add(city);
        return [city];
      }
      return [{
        ...createDefault(),
        name: scope.name,
        scopeId: scope.id,
        scopeIds: [scope.id],
        rows: [],
        syntheticArea: true,
      }];
    });
  // A plan may still carry an assignment from an older save. Keep it visible
  // as an unassigned plan instead of dropping the user's work silently.
  const unscoped = planned.filter(city => {
    const assigned = cityScopeIds(city);
    return !assigned.length || !assigned.some(scopeId => scopeIds.has(scopeId));
  });
  const areas = [...scoped, ...unscoped];
  return areas.length ? areas : [createDefault()];
}
