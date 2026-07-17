export const isLocomotive = vehicle =>
  ['Lokomotive', 'Triebwagen'].includes(vehicle?.attrs?.Typ);

// Combine the sheet-derived vehicle pool with the game-only rail supplement.
// Most supplement entries are locomotives absent from the sheet and get
// added outright, but some sheet locomotives got a tender attached via the
// game's $TRAINSET mechanic that the sheet doesn't know about - those arrive
// as {tenderOnly: true} patches and get merged onto the existing entry by
// name instead of appended as a second, duplicate roster entry.
export function mergeVehiclePools(sheetVehicles, railSupplement, rawGameVehicles = []) {
  const merged = sheetVehicles.map(vehicle => ({
    ...vehicle,
    attrs: { ...vehicle.attrs },
    provenance: { productionCost: 'spreadsheet', cargoCapacities: 'spreadsheet' },
  }));
  const rawByName = new Map();
  for (const vehicle of rawGameVehicles) {
    for (const name of [vehicle.de, vehicle.en]) {
      if (name) rawByName.set(name.toLowerCase(), vehicle);
    }
  }
  const fields = {
    length: 'Länge', emptyWeight: 'Leergewicht', powerKW: 'Motorleistung',
    speed: 'Max. Geschwindigkeit', from: 'Von', to: 'Bis',
  };
  for (const vehicle of merged) {
    const raw = rawByName.get(vehicle.name.toLowerCase());
    if (!raw) continue;
    for (const [source, target] of Object.entries(fields)) {
      if (Number.isFinite(raw[source])) vehicle.attrs[target] = raw[source];
    }
    vehicle.sourceGameId = raw.id;
    vehicle.provenance.dimensions = 'game-file';
    vehicle.provenance.performance = 'game-file';
    vehicle.provenance.availability = 'game-file';
  }
  const byName = new Map(merged.map(v => [v.name.toLowerCase(), v]));
  for (const r of railSupplement) {
    if (r.tenderOnly) {
      const match = byName.get(r.name.toLowerCase());
      if (match) match.tender = r.tender;
      continue;
    }
    merged.push(r);
  }
  return merged;
}

function vehicleMap(vehicles) {
  return vehicles instanceof Map
    ? vehicles
    : new Map(vehicles.map(vehicle => [vehicle.name, vehicle]));
}

export function expandConsist(consist, vehicles) {
  const byName = vehicleMap(vehicles);
  const expanded = [];

  consist.forEach((segment, sourceIndex) => {
    const vehicle = byName.get(segment.name);
    if (!vehicle || vehicle.attrs.Typ === 'Tender') return;

    if (isLocomotive(vehicle) && vehicle.tender) {
      for (let i = 0; i < segment.count; i++) {
        expanded.push({ ...segment, count: 1, vehicle, sourceIndex, locked: false });
        expanded.push({
          name: vehicle.tender.name,
          count: 1,
          cargo: null,
          vehicle: vehicle.tender,
          sourceIndex,
          locked: true,
        });
      }
      return;
    }

    expanded.push({ ...segment, vehicle, sourceIndex, locked: false });
  });

  return expanded;
}

export function evaluateConsist(consist, vehicles, cargoNames = new Set()) {
  const segments = expandConsist(consist, vehicles);
  let totalLength = 0;
  let powerKW = 0;
  let emptyWeight = 0;
  let availableFrom = 0;
  let isElectric = false;
  const speeds = [];
  const capacities = new Map();

  for (const segment of segments) {
    const { vehicle, count } = segment;
    const attrs = vehicle.attrs;
    totalLength += (attrs['Länge'] ?? 0) * count;
    emptyWeight += (attrs.Leergewicht ?? 0) * count;
    availableFrom = Math.max(availableFrom, attrs.Von ?? 0);
    if (attrs['Max. Geschwindigkeit'] > 0) {
      speeds.push(attrs['Max. Geschwindigkeit']);
    }

    if (isLocomotive(vehicle)) {
      powerKW += (attrs.Motorleistung ?? 0) * count;
      isElectric ||= attrs.Antriebsart === 'E';
      continue;
    }
    if (segment.locked || !segment.cargo || !cargoNames.has(segment.cargo)) continue;
    const capacity = attrs[segment.cargo];
    if (capacity > 0) {
      capacities.set(segment.cargo,
        (capacities.get(segment.cargo) ?? 0) + capacity * count);
    }
  }

  const cargoWeight = [...capacities.entries()]
    .filter(([cargo]) => cargo !== 'Passagiere')
    .reduce((sum, [, capacity]) => sum + capacity, 0);
  const loadedWeight = emptyWeight + cargoWeight;

  return {
    segments,
    totalLength,
    powerKW,
    emptyWeight,
    capacities,
    cargoWeight,
    loadedWeight,
    kwPerT: loadedWeight ? powerKW / loadedWeight : 0,
    maxSpeed: speeds.length ? Math.min(...speeds) : null,
    availableFrom,
    isElectric,
  };
}

export function eraOk(vehicle, year) {
  if (!year) return true;
  const from = vehicle.attrs.Von ?? 0;
  const to = typeof vehicle.attrs.Bis === 'number' ? vehicle.attrs.Bis : 3000;
  return from <= year && year <= to;
}

export function recommendTrain(train, locomotives, wagons) {
  const year = train.year || null;
  const wants = train.reco.rows.filter(row => row.cargo && row.tons > 0);
  const consist = [];
  let wagonWeight = 0;
  let wagonLength = 0;

  for (const want of wants) {
    const candidates = wagons.filter(wagon =>
      (wagon.attrs[want.cargo] ?? 0) > 0
      && eraOk(wagon, year)
      && (wagon.attrs['Länge'] ?? 0) > 0);
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) =>
      b.attrs[want.cargo] / b.attrs['Länge'] > a.attrs[want.cargo] / a.attrs['Länge']
        ? b : a);
    const count = Math.ceil(want.tons / best.attrs[want.cargo]);
    consist.push({ name: best.name, count, cargo: want.cargo });
    wagonWeight += count * ((best.attrs.Leergewicht ?? 0) + best.attrs[want.cargo]);
    wagonLength += count * best.attrs['Länge'];
  }

  if (!consist.length) return null;

  const targetKwt = train.reco.kwt || 2;
  let bestPick = null;
  for (const locomotive of locomotives) {
    if (!eraOk(locomotive, year)) continue;
    if (train.reco.drive !== 'all'
        && locomotive.attrs.Antriebsart !== train.reco.drive) continue;

    const power = locomotive.attrs.Motorleistung ?? 0;
    const attachedWeight = locomotive.tender?.attrs?.Leergewicht ?? 0;
    const attachedLength = locomotive.tender?.attrs?.['Länge'] ?? 0;
    const locomotiveWeight = (locomotive.attrs.Leergewicht ?? 0) + attachedWeight;
    const locomotiveLength = (locomotive.attrs['Länge'] ?? 0) + attachedLength;
    const denominator = power - targetKwt * locomotiveWeight;
    if (denominator <= 0) continue;
    const count = Math.max(1, Math.ceil(targetKwt * wagonWeight / denominator));
    if (count > 6) continue;
    const score = wagonLength + count * locomotiveLength;
    if (!bestPick || score < bestPick.score
        || (score === bestPick.score && count < bestPick.count)) {
      bestPick = { locomotive, count, score };
    }
  }

  if (bestPick) {
    consist.unshift({ name: bestPick.locomotive.name, count: bestPick.count, cargo: null });
  }
  return consist;
}
