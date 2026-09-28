import {
  normalVehicleProductionRecipe, resourceTransportSubtype, vehicleRuntimeCategory,
} from './fleet.js?v=26';

export const isLocomotive = vehicle =>
  ['Lokomotive', 'Triebwagen'].includes(vehicle?.attrs?.Typ);

const cargoNames = (...names) => new Set(names.map(name => name.toLowerCase()));
const COVERED_CARGO = cargoNames(
  'plants', 'Pflanzen', 'Plant', 'chemicals', 'Chemikalien', 'Chemicals',
  'food', 'Essen', 'Food', 'clothes', 'Kleidung', 'Clothes',
  'alcohol', 'Alkohol', 'Alcohol', 'fabric', 'Stoff', 'Fabric',
  'mcomponents', 'Mechanik-Bauteile', 'Mechanical components',
  'ecomponents', 'Elektronik-Bauteile', 'Electronic components',
  'plastics', 'Kunststoffe', 'Plastic', 'eletronics', 'Elektronik', 'Electronics',
  'explosives', 'Sprengstoff', 'Explosives');
const OPEN_CARGO = cargoNames(
  'steel', 'Stahl', 'Steel', 'aluminium', 'Aluminium', 'aluminum',
  'prefabpanels', 'Plattenbauteile', 'Plate components', 'bricks', 'Ziegel', 'Brick',
  'wood', 'Holz', 'Wood', 'boards', 'Bretter', 'Boards',
  'yellowcake', 'Uranoxid', 'Uranium oxide');
const TRANSPORT_CARGO = new Map([
  ['RESOURCE_TRANSPORT_COVERED', COVERED_CARGO],
  ['RESOURCE_TRANSPORT_OPEN', OPEN_CARGO],
  ['RESOURCE_TRANSPORT_GRAVEL', cargoNames(
    'gravel', 'Kies', 'Gravel', 'rawgravel', 'Bruchstein', 'Broken stone',
    'coal', 'Kohle', 'Coal', 'rawcoal', 'Kohlenerz', 'Raw coal',
    'iron', 'Eisen', 'Iron', 'rawiron', 'Eisenerz', 'Iron ore',
    'bauxite', 'Bauxit', 'Bauxite', 'rawbauxite', 'Rohes Bauxit', 'Raw bauxite',
    'uranium', 'Uranerz', 'Uranium ore', 'asphalt', 'Asphalt',
    'waste_gravel', 'Bauschutt', 'Construction waste',
    'waste_steel', 'Metallschrott', 'Scrap metal',
    'waste_aluminium', 'Aluminiumschrott', 'Aluminum scrap')],
  ['RESOURCE_TRANSPORT_OIL', cargoNames(
    'oil', 'Öl', 'fuel', 'Treibstoff', 'Fuel', 'bitumen', 'Bitumen',
    'fertiliser_liquid', 'Flüssigdünger', 'Liquid fertilizer')],
  ['RESOURCE_TRANSPORT_CEMENT', cargoNames(
    'cement', 'Zement', 'Cement', 'alumina', 'Aluminiumoxid', 'Aluminum oxide')],
  ['RESOURCE_TRANSPORT_COOLER', cargoNames('meat', 'Fleisch', 'Meat')],
  ['RESOURCE_TRANSPORT_LIVESTOCK', cargoNames('livestock', 'Vieh', 'Livestock')],
  ['RESOURCE_TRANSPORT_PASSANGER', cargoNames('Passagiere', 'Passengers')],
  ['RESOURCE_TRANSPORT_CONCRETE', cargoNames('concrete', 'Beton', 'Concrete')],
  ['RESOURCE_TRANSPORT_WATER', cargoNames('water', 'Wasser', 'Water')],
  ['RESOURCE_TRANSPORT_SEWAGE', cargoNames('usagewater', 'Abwasser', 'Sewage')],
  ['RESOURCE_TRANSPORT_WASTE', cargoNames(
    'waste_gravel', 'Bauschutt', 'Construction waste',
    'waste_steel', 'Metallschrott', 'Scrap metal',
    'waste_aluminium', 'Aluminiumschrott', 'Aluminum scrap',
    'waste_plastic', 'Plastikmüll', 'Plastic waste',
    'waste_bio', 'Biomüll', 'Biological waste',
    'fertiliser', 'Dünger', 'Fertilizer',
    'waste_burnable', 'Brennbarer Müll', 'Burnable waste',
    'waste_toxic', 'Sondermüll', 'Hazardous waste',
    'waste_other', 'Sonstigermüll', 'Mixed waste', 'waste_ash', 'Asche', 'Ash')],
  ['RESOURCE_TRANSPORT_GENERAL', new Set([...COVERED_CARGO, ...OPEN_CARGO])],
]);
const SHEET_FREIGHT_TRANSPORT = new Map([
  ['Abgedeckte Ladefläche', 'RESOURCE_TRANSPORT_COVERED'],
  ['Offene Ladefläche', 'RESOURCE_TRANSPORT_OPEN'],
  ['Kipper', 'RESOURCE_TRANSPORT_GRAVEL'],
  ['Flüssigkeitstank', 'RESOURCE_TRANSPORT_OIL'],
  ['Staubgut-Behälter', 'RESOURCE_TRANSPORT_CEMENT'],
  ['Kühlung', 'RESOURCE_TRANSPORT_COOLER'],
  ['Vieh', 'RESOURCE_TRANSPORT_LIVESTOCK'],
  ['Passagiere', 'RESOURCE_TRANSPORT_PASSANGER'],
  ['Beton', 'RESOURCE_TRANSPORT_CONCRETE'],
  ['Müll', 'RESOURCE_TRANSPORT_WASTE'],
  ['Ladung', 'RESOURCE_TRANSPORT_GENERAL'],
]);
// The sheet uses the same columns for wagon cargo and vehicle-production
// materials. On unmatched wagons these values cannot be distinguished safely:
// e.g. "Stahl: 17" on a 67 t open wagon is its construction bill, not cargo.
// Exact game-file matches do not have this ambiguity and take the branch above.
const AMBIGUOUS_SHEET_CARGO = cargoNames(
  'steel', 'Stahl', 'Steel', 'aluminium', 'Aluminium', 'aluminum',
  'plastics', 'Kunststoffe', 'Plastic', 'fabric', 'Stoff', 'Fabric',
  'mcomponents', 'Mechanik-Bauteile', 'Mechanical components',
  'ecomponents', 'Elektronik-Bauteile', 'Electronic components',
  'eletronics', 'Elektronik', 'Electronics');

// Curated display names, not a fallback for missing data. The game now ships a
// literal English name ("RuBalt D24/40 Dry Bulk") for these ids, but the pool
// has always listed them in the established German spelling that matches the
// spreadsheet's "Russo-Balt T40/65 …" rows, so this table keeps winning over
// the raw game string instead of showing one vehicle under a second name.
const D24_40_DISPLAY_NAMES = Object.freeze({
  cement_russo_balt_d24_40: 'Russo-Balt D24/40 (cement)',
  covered_russo_balt_d24_40: 'Russo-Balt D24/40 (covered cargo)',
  firetruck_russo_balt_d24_40: 'Russo-Balt D24/40 (fire truck)',
  garbage_russo_balt_d24_40: 'Russo-Balt D24/40 (garbage)',
  gravel_russo_balt_d24_40: 'Russo-Balt D24/40 (gravel)',
  oil_russo_balt_d24_40: 'Russo-Balt D24/40 (cistern)',
  oil_russo_balt_d24_40_sewage: 'Russo-Balt D24/40 (sewage cistern)',
  oil_russo_balt_d24_40_water: 'Russo-Balt D24/40 (water cistern)',
  open_russo_balt_d24_40: 'Russo-Balt D24/40 (open cargo)',
  refrigerator_russo_balt_d24_40: 'Russo-Balt D24/40 (refrigerated)',
  service_mixer_russo_balt_d24_40: 'Russo-Balt D24/40 (concrete mixer)',
  snowplow_russo_balt_d24_40: 'Russo-Balt D24/40 (snowplow)',
});

function rawVehicleDisplayName(raw) {
  return D24_40_DISPLAY_NAMES[raw.id] || raw.de || raw.en || null;
}

export function vehicleSupportsCargo(vehicle, cargo) {
  if (Number.isFinite(vehicle?.gameCapacity) && vehicle?.gameTransportType) {
    return vehicle.gameCapacity > 0
      && (TRANSPORT_CARGO.get(vehicle.gameTransportType)?.has(String(cargo).toLowerCase()) ?? false);
  }
  const fallbackType = SHEET_FREIGHT_TRANSPORT.get(vehicle?.attrs?.Frachtart);
  if (fallbackType
      && !(TRANSPORT_CARGO.get(fallbackType)?.has(String(cargo).toLowerCase()) ?? false)) return false;
  if (AMBIGUOUS_SHEET_CARGO.has(String(cargo).toLowerCase())) return false;
  if (fallbackType === 'RESOURCE_TRANSPORT_GENERAL') return (vehicle?.attrs?.Ladefläche ?? 0) > 0;
  return (vehicle?.attrs?.[cargo] ?? 0) > 0;
}

export function vehicleCargoCapacity(vehicle, cargo) {
  if (Number.isFinite(vehicle?.gameCapacity) && vehicle?.gameTransportType) {
    return vehicleSupportsCargo(vehicle, cargo) ? vehicle.gameCapacity : 0;
  }
  if (SHEET_FREIGHT_TRANSPORT.get(vehicle?.attrs?.Frachtart) === 'RESOURCE_TRANSPORT_GENERAL') {
    return vehicleSupportsCargo(vehicle, cargo) ? (vehicle.attrs.Ladefläche ?? 0) : 0;
  }
  return vehicleSupportsCargo(vehicle, cargo) ? (vehicle?.attrs?.[cargo] ?? 0) : 0;
}

export function vehicleDrive(vehicle) {
  if (vehicle?.gameElectric === true) return 'E';
  if (vehicle?.gameElectric === false && vehicle?.attrs?.Antriebsart === 'E') return '?';
  return vehicle?.attrs?.Antriebsart ?? '?';
}

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
  const byName = new Map(merged.map(v => [v.name.toLowerCase(), v]));
  for (const r of railSupplement) {
    if (r.tenderOnly) {
      const match = byName.get(r.name.toLowerCase());
      if (match) match.tender = r.tender;
      continue;
    }
    merged.push({
      ...r, attrs: { ...r.attrs },
      provenance: { productionCost: 'unavailable', cargoCapacities: 'unavailable' },
    });
  }
  const rawByName = new Map();
  for (const raw of rawGameVehicles) {
    for (const name of [raw.de, raw.en]) {
      if (!name) continue;
      const key = name.toLowerCase();
      const matches = rawByName.get(key) ?? [];
      if (!matches.includes(raw)) matches.push(raw);
      rawByName.set(key, matches);
    }
  }
  const fields = {
    length: 'Länge', emptyWeight: 'Leergewicht', powerKW: 'Motorleistung',
    speed: 'Max. Geschwindigkeit', from: 'Von', to: 'Bis',
  };
  for (const vehicle of merged) {
    const matches = rawByName.get(vehicle.name.toLowerCase()) ?? [];
    if (matches.length !== 1) continue;
    const [raw] = matches;
    for (const [source, target] of Object.entries(fields)) {
      if (Number.isFinite(raw[source])) vehicle.attrs[target] = raw[source];
    }
    const recipe = normalVehicleProductionRecipe({
      runtimeCategory: vehicleRuntimeCategory(raw.type),
      emptyWeight: raw.emptyWeight,
      powerKW: raw.powerKW ?? 0,
      introductionYear: raw.from ?? 0,
      transportSubtype: resourceTransportSubtype(raw.transportType) ?? 0,
      capacity: raw.capacity ?? 0,
      electric: raw.electric,
      roadRecipeBranch: raw.roadRecipeBranch,
      singleHorsePower: raw.singleHorsePower,
    });
    vehicle.sourceGameId = raw.id;
    if (Number.isInteger(raw.countryId)) vehicle.gameCountryId = raw.countryId;
    if (Number.isFinite(raw.capacity) && raw.transportType) {
      vehicle.gameCapacity = raw.capacity;
      vehicle.gameTransportType = raw.transportType;
      vehicle.provenance.cargoCapacities = 'game-file';
    }
    if (typeof raw.electric === 'boolean') {
      vehicle.gameElectric = raw.electric;
      vehicle.provenance.electric = 'game-file';
    }
    if (recipe) {
      vehicle.gameRecipe = recipe;
      vehicle.provenance.productionCost = 'game-file';
    }
    // Each of these is only claimed where the game file actually states the
    // value. A vehicle with no bbox has no length, and one with no $AVAILABLE
    // has no era, so calling the whole record game-file asserted dimensions and
    // performance the source never gave - 84 entries claimed a performance the
    // game does not state.
    if (Number.isFinite(raw.length)) vehicle.provenance.dimensions = 'game-file';
    if (Number.isFinite(raw.speed) || Number.isFinite(raw.powerKW)
      || Number.isFinite(raw.emptyWeight)) vehicle.provenance.performance = 'game-file';
    if (Number.isFinite(raw.from) && Number.isFinite(raw.to)) {
      vehicle.provenance.availability = 'game-file';
    }
  }

  // Everything above only reaches a game vehicle that happens to share a name
  // with a spreadsheet row, so the pool was capped by the spreadsheet: 800 of
  // the game's vehicles had no row and could not be listed at all, whole bus
  // and DLC families among them. The game files are the authority on what
  // exists, so anything they describe and the spreadsheet does not is added
  // here on its own terms rather than left out.
  for (const raw of rawGameVehicles) {
    const name = rawVehicleDisplayName(raw);
    if (!name || byName.has(name.toLowerCase())) continue;
    if (isGameTender(raw)) continue;
    const entry = gameOnlyVehicle(raw);
    if (!entry) continue;
    byName.set(name.toLowerCase(), entry);
    merged.push(entry);
  }
  for (const vehicle of merged) vehicle.vehicleRef = vehicleReference(vehicle);
  return merged;
}

// A plan row that remembers which vehicle the user picked has to survive the
// pool being reordered. The array index it used to store does not: re-extracting
// the game added 264 vehicles, which moved 321 of the 1148 that already had a
// row, so a saved plan silently started describing a different truck. The game's
// own id is the stable identity; the display name is the fallback for a
// spreadsheet row the game files do not describe.
export function vehicleReference(vehicle) {
  const gameId = vehicle?.sourceGameId;
  if (typeof gameId === 'string' && gameId) return `game:${gameId}`;
  return vehicle?.name ? `name:${vehicle.name}` : null;
}

// A pool entry built from game data alone. The interface reads German attr
// keys because that is the shape the spreadsheet defined, so the mapping stays
// even though the spreadsheet no longer supplies the values.
function gameOnlyVehicle(raw) {
  const recipe = normalVehicleProductionRecipe({
    runtimeCategory: vehicleRuntimeCategory(raw.type),
    emptyWeight: raw.emptyWeight,
    powerKW: raw.powerKW ?? 0,
    introductionYear: raw.from ?? 0,
    transportSubtype: resourceTransportSubtype(raw.transportType) ?? 0,
    capacity: raw.capacity ?? 0,
    electric: raw.electric,
    roadRecipeBranch: raw.roadRecipeBranch,
    singleHorsePower: raw.singleHorsePower,
  });
  const name = rawVehicleDisplayName(raw);
  const entry = {
    name,
    attrs: {
      Typ: gameVehicleTypeLabel(raw),
      Von: raw.from ?? '',
      Bis: raw.to ?? '',
      'Max. Geschwindigkeit': raw.speed ?? '',
      Motorleistung: raw.powerKW ?? '',
      Leergewicht: raw.emptyWeight ?? '',
      'Länge': raw.length ?? '',
      Passagiere: raw.capacity ?? '',
    },
    sourceGameId: raw.id,
    gameOnly: true,
    // The game states the country of origin as a $COUNTRY id, which is what
    // decides the cross-market factor and the blueprint currency. Without it
    // every vehicle built here rather than described by the spreadsheet is
    // priced as Soviet, which is how the whole DLC catalogue ended up that way.
    gameCountryId: Number.isInteger(raw.countryId) ? raw.countryId : null,
    provenance: {
      productionCost: recipe ? 'game-file' : 'unavailable',
      cargoCapacities: Number.isFinite(raw.capacity) && raw.transportType ? 'game-file' : 'unavailable',
      // Only what the game file states, for the same reason as above.
      dimensions: Number.isFinite(raw.length) ? 'game-file' : 'unavailable',
      performance: Number.isFinite(raw.speed) || Number.isFinite(raw.powerKW)
        || Number.isFinite(raw.emptyWeight) ? 'game-file' : 'unavailable',
      availability: Number.isFinite(raw.from) && Number.isFinite(raw.to)
        ? 'game-file' : 'unavailable',
    },
  };
  if (recipe) entry.gameRecipe = recipe;
  if (Number.isFinite(raw.capacity) && raw.transportType) {
    entry.gameCapacity = raw.capacity;
    entry.gameTransportType = raw.transportType;
  }
  if (typeof raw.electric === 'boolean') entry.gameElectric = raw.electric;
  return entry;
}

// A tender is attached to its locomotive by the game, never bought on its own,
// so it must not become a purchasable pool entry. Same rule the extractor uses
// when it nests a tender on the locomotive it belongs to.
function isGameTender(raw) {
  return raw.type === 'VEHICLETYPE_RAIL_VAGON'
    && (raw.trainGroup === 'locomotive' || /tender/i.test(raw.id));
}

// The type filter groups by this label, so it has to land in the same buckets
// the spreadsheet rows use rather than inventing a parallel vocabulary. The
// $TRAINGROUP_* the game states for its rail stock is exactly what separates
// those buckets, and each one lines up with the sheet's own rows: the six
// motorvagon stock are the sheet's six Triebwagen, the metro sets are its
// U-Bahn, the track-laying sets its Gleisbau. Falling through to the road
// default instead published 52 rail wagons and locomotives as trucks.
function gameVehicleTypeLabel(raw) {
  const transport = String(raw.transportType ?? '');
  const passenger = Number.isFinite(raw.capacity) && raw.capacity > 0
    && transport.includes('PASSANGER');
  const isPassengerStock = passenger;
  // Passenger capacity only makes something a bus if the game says it runs on
  // roads. A ferry or a plane that carries people is still a ship or an
  // aircraft, and three ships were being offered as buses, which put them in
  // the road recommendation group alongside the trucks.
  if (raw.type === 'VEHICLETYPE_ROAD' && passenger) return 'Bus';
  const rail = raw.type === 'VEHICLETYPE_RAIL_LOCOMOTIVE' || raw.type === 'VEHICLETYPE_RAIL_VAGON';
  if (rail) {
    switch (raw.trainGroup) {
      case 'tram': return 'Straßenbahn';
      case 'metro': return 'U-Bahn';
      case 'motorvagon': return 'Triebwagen';
      case 'trainset': return 'Zugverband';
      case 'trackbuilder':
      case 'trackbuilder_steam': return 'Gleisbau';
      default: break;
    }
    if (raw.type === 'VEHICLETYPE_RAIL_LOCOMOTIVE') return 'Lokomotive';
    return passenger ? 'Passagierwagen' : 'Güterwagon';
  }
  switch (raw.type) {
    case 'VEHICLETYPE_RAIL': return 'Güterwagen';
    // The sheet splits ships by what they carry, and 'Schiff' is not a label it
    // uses at all: a game-only ship labelled 'Schiff' matched no sheet row, so
    // vehicleProductionGroup - which keys on the sheet's own labels - filed it
    // under road, and the road recommendation table filled up with ferries.
    case 'VEHICLETYPE_SHIP': return isPassengerStock ? 'Passagierschiff' : 'Frachtschiff';
    case 'VEHICLETYPE_AIRPLANE': return 'Flugzeug';
    case 'VEHICLETYPE_HELICOPTER': return 'Helikopter';
    default: return 'LKW';
  }
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
      isElectric ||= vehicleDrive(vehicle) === 'E';
      continue;
    }
    if (segment.locked || !segment.cargo || !cargoNames.has(segment.cargo)) continue;
    const capacity = vehicleCargoCapacity(vehicle, segment.cargo);
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
      vehicleSupportsCargo(wagon, want.cargo)
      && eraOk(wagon, year)
      && (wagon.attrs['Länge'] ?? 0) > 0);
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) =>
      vehicleCargoCapacity(b, want.cargo) / b.attrs['Länge']
        > vehicleCargoCapacity(a, want.cargo) / a.attrs['Länge']
        ? b : a);
    const bestCapacity = vehicleCargoCapacity(best, want.cargo);
    const count = Math.ceil(want.tons / bestCapacity);
    consist.push({ name: best.name, count, cargo: want.cargo });
    wagonWeight += count * ((best.attrs.Leergewicht ?? 0) + bestCapacity);
    wagonLength += count * best.attrs['Länge'];
  }

  if (!consist.length) return null;

  const targetKwt = train.reco.kwt || 2;
  let bestPick = null;
  for (const locomotive of locomotives) {
    if (!eraOk(locomotive, year)) continue;
    if (train.reco.drive !== 'all'
        && vehicleDrive(locomotive) !== train.reco.drive) continue;

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
