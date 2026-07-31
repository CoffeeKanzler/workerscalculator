// What a town needs to keep the taps and radiators running, and what supplies it.
//
// City planning has always summed the demand side — a block of flats states how
// much water and hot water it draws — and has never had a supply side. There was
// a "water divisor" to type a number into and a cable to pick from a list, which
// is not planning a well.
//
// The supply buildings exist and are already catalogued. Water rates come from
// the game's own files — a small well makes 70 a day and needs nobody, a big one
// 1,505 with seven workers — and a test pins that provenance so a catalogue
// change cannot quietly downgrade it. Heating is weaker: those rates are
// community-measured, like the demand side, and are not to be presented as the
// game's word.
//
// Demand is measured throughout, because the game hardcodes what a resident
// draws rather than stating it in a building file. That the two halves share a
// unit is checked rather than assumed: on the Volldampf republic the catalogue
// puts its water buildings at 675 a day against 575 for the people living there.
//
// That asymmetry is why nothing here is called exact. The count is a
// recommendation from a measured demand, and the caller is expected to badge it
// as such.

// Each kind names the demand field it reads and the produced resource that
// answers it. Sewage is deliberately absent: treatment plants consume it, but a
// town's own production of it is not a field the city catalogue carries.
export const UTILITY_KINDS = Object.freeze([
  Object.freeze({ id: 'water', demandField: 'water', produces: 'water' }),
  Object.freeze({ id: 'heating', demandField: 'hotwater', produces: 'hot water' }),
]);

function producedRate(building, produces) {
  for (const line of building?.production ?? []) {
    if ((line.en ?? '').toLowerCase() === produces) return line.rate ?? 0;
  }
  return 0;
}

export function utilitySuppliers(catalogue = [], produces) {
  return catalogue
    .map(building => ({ building, rate: producedRate(building, produces) }))
    .filter(entry => entry.rate > 0)
    .sort((a, b) => a.rate - b.rate);
}

// Whole buildings only: three quarters of a well pumps nothing.
export function coverage({ demand = 0, rate = 0, workers = 0, power = 0 } = {}) {
  if (!(rate > 0)) return null;
  const count = demand > 0 ? Math.ceil(demand / rate - 1e-9) : 0;
  const supplied = count * rate;
  return {
    count,
    supplied,
    spare: supplied - demand,
    workers: count * workers,
    power: count * power,
  };
}

export function cityUtilityPlan({ demand = {}, catalogue = [], choice = {} } = {}) {
  return UTILITY_KINDS.map(kind => {
    const needed = demand[kind.demandField] ?? 0;
    const suppliers = utilitySuppliers(catalogue, kind.produces);
    const chosenName = choice[kind.id];
    // Default to the smallest supplier that covers the demand on its own, so a
    // hamlet is offered a well rather than a waterworks; fall back to the
    // largest when nothing single-handedly covers it.
    const chosen = suppliers.find(entry => entry.building.en === chosenName)
      ?? suppliers.find(entry => entry.rate >= needed)
      ?? suppliers[suppliers.length - 1]
      ?? null;
    return {
      kind: kind.id,
      demand: needed,
      suppliers,
      chosen: chosen?.building ?? null,
      coverage: chosen ? coverage({
        demand: needed,
        rate: chosen.rate,
        workers: chosen.building.workers ?? 0,
        power: chosen.building.power ?? 0,
      }) : null,
    };
  });
}
