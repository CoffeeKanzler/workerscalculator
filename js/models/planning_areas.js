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
export function planningAreas({ cities = [], scopes = null, createDefault } = {}) {
  const planned = Array.isArray(cities) ? cities : [];
  if (!Array.isArray(scopes)) {
    return planned.length ? planned : [createDefault()];
  }

  const byScope = new Map(
    planned.filter(city => Number.isInteger(city.scopeId)).map(city => [city.scopeId, city]),
  );
  const scoped = scopes
    .filter(scope => scope.city || scope.production)
    .map(scope => byScope.get(scope.id) ?? {
      ...createDefault(),
      name: scope.name,
      scopeId: scope.id,
      rows: [],
      syntheticArea: true,
    });
  const unscoped = planned.filter(city => !Number.isInteger(city.scopeId));
  const areas = [...scoped, ...unscoped];
  return areas.length ? areas : [createDefault()];
}
