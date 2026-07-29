// Every building on the map was drawn as the same small circle, so a republic
// read as undifferentiated confetti: housing, steelworks and a bus stop were
// visually identical.
//
// The save records a building by type name, and the extracted dataset gives
// each type its TYPE_* flags. Grouping those into a handful of categories a
// player already thinks in — where people live, where things are made, where
// they are stored, how they move, what serves the citizens, what powers it —
// gives the map a legend small enough to hold in your head.
//
// Order matters: a building carries several flags, and the first match wins.
// Production is checked before storage because a factory with a warehouse
// attached is a factory.
// Every name below is taken from the extracted dataset, not from what the
// game's flags ought to be called. The first pass here was written from
// guesswork and half of it never matched anything: the save calls a police
// station TYPE_POLICE_STATION, an oil well TYPE_MINE_OIL and a fire station
// TYPE_FIRESTATION, so TYPE_POLICE, TYPE_OIL_WELL and TYPE_FIRE_DEPARTMENT
// quietly matched nothing and their buildings all landed in 'other'.
// buildings_category.test.mjs now fails if the dataset carries a flag no rule
// mentions, which is what makes that class of mistake visible.
export const CATEGORY_RULES = Object.freeze([
  ['industry', ['TYPE_FACTORY', 'TYPE_ENGINE', 'TYPE_FIELD', 'TYPE_FARM',
    'TYPE_PRODUCTION_LINE', 'TYPE_SCRAPYARD',
    'TYPE_MINE_COAL', 'TYPE_MINE_IRON', 'TYPE_MINE_GRAVEL', 'TYPE_MINE_URANIUM',
    'TYPE_MINE_BAUXITE', 'TYPE_MINE_OIL', 'TYPE_MINE_WOOD']],
  // Water wells are flagged as mines but they supply the republic's water, so
  // they belong with the plumbing rather than with the ore pits.
  ['utility', ['TYPE_SUBSTATION', 'TYPE_TRANSFORMATOR', 'TYPE_POWERPLANT',
    'TYPE_COOLING_TOWER', 'TYPE_RAIL_TRAFO', 'TYPE_ELETRIC_IMPORT',
    'TYPE_WATER_PUMP', 'TYPE_WATER_ENDSTATION', 'SUBTYPE_WATER_SWITCH',
    'TYPE_WATER_TREATMENT', 'TYPE_MINE_WATER', 'TYPE_MINE_WATER_SURFACE',
    'TYPE_SEWAGE_PUMP', 'TYPE_SEWAGE_ENDSTATION', 'TYPE_SEWAGE_TREATMENT',
    'TYPE_SEWAGE_DISCHARGE', 'TYPE_HEATING_PLANT', 'TYPE_HEATING_ENDSTATION',
    'TYPE_HEATING_SWITCH', 'TYPE_TRASH_CONTAINER', 'TYPE_GARBAGE_OFFICE',
    'TYPE_POLLUTION_METER', 'TYPE_FOREIGN_PIPELINE_EXPORT', 'TYPE_ELETRIC_EXPORT']],
  ['transport', ['TYPE_CARGO_STATION', 'TYPE_PASSANGER_STATION', 'TYPE_WAITING_STATION',
    'TYPE_ROADDEPO', 'TYPE_RAILDEPO', 'TYPE_FORKLIFT_GARAGE',
    'TYPE_GAS_STATION', 'TYPE_GAS_STATION_COAL',
    'TYPE_AIRPLANE_GATE', 'TYPE_AIRPLANE_PARKING', 'TYPE_AIRPLANE_TOWER',
    'TYPE_TRAM_GATE', 'TYPE_SHIP_DOCK', 'TYPE_CUSTOMHOUSE',
    'TYPE_PEDESTRIAN_BRIDGE', 'TYPE_PARKING',
    'SUBTYPE_CABLEWAY', 'SUBTYPE_TRAM', 'SUBTYPE_TROLLEYBUS', 'SUBTYPE_METRO',
    'SUBTYPE_AIRPLANE', 'SUBTYPE_AIR', 'SUBTYPE_AIRCUSTOM', 'SUBTYPE_SHIP',
    'SUBTYPE_RAIL', 'SUBTYPE_ROAD', 'SUBTYPE_HORSE_WAGON',
    'SUBTYPE_SPACE_FOR_VEHICLES']],
  ['storage', ['TYPE_STORAGE', 'TYPE_DISTRIBUTION_OFFICE',
    'TYPE_DISTRIBUTION_OFFICE_RAIL', 'TYPE_CONTAINER_FACILITY']],
  ['living', ['TYPE_LIVING', 'TYPE_HOTEL', 'SUBTYPE_HOSTEL']],
  ['civic', ['CIVIL_BUILDING', 'TYPE_SHOP', 'TYPE_CAR_DEALER',
    'TYPE_UNIVERSITY', 'TYPE_SCHOOL', 'TYPE_KINDERGARTEN', 'TYPE_ORPHANAGE',
    'TYPE_HOSPITAL', 'SUBTYPE_MEDICAL', 'TYPE_SPORT', 'TYPE_ATTRACTION',
    'TYPE_MONUMENT', 'TYPE_POLICE_STATION', 'TYPE_SECRET_POLICE',
    'TYPE_FIRESTATION', 'TYPE_KINO', 'TYPE_CHURCH', 'TYPE_PUB',
    'SUBTYPE_RESTAURANT', 'TYPE_BROADCAST', 'SUBTYPE_RADIO', 'SUBTYPE_TELEVISION',
    'TYPE_CONSTRUCTION_OFFICE', 'TYPE_CONSTRUCTION_OFFICE_RAIL',
    'TYPE_DEMOLITION_OFFICE', 'TYPE_REPAIR_OFFICE',
    'TYPE_PRISON', 'TYPE_COURT_HOUSE', 'TYPE_CITYHALL']],
]);

// Flags that describe how a building looks or behaves rather than what it is
// for. They always sit beside a real type flag, so leaving them out of the
// rules costs nothing — but the coverage test needs to know they were left out
// on purpose rather than forgotten.
export const UNCATEGORISED_FLAGS = Object.freeze([
  'SUBTYPE_SOVIET', 'SUBTYPE_TECHNICAL', 'SUBTYPE_OWN_CUSTOM', 'SUBTYPE_HORSE_STUD',
]);

// What a player actually wants to tell apart: where people live, where things
// are made, and what serves the citizens. Everything else — substations, water
// switches, trash containers, pedestrian bridges — is the plumbing of the
// republic. It is nearly a third of all markers, so drawing it as loudly as
// the rest would bury the three that matter rather than reveal them.
const DISPLAY_GROUP = Object.freeze({
  living: 'living',
  industry: 'industry',
  civic: 'services',
  utility: 'support',
  transport: 'support',
  storage: 'support',
  other: 'other',
});

export const CATEGORIES = Object.freeze(['living', 'industry', 'services', 'support', 'other']);

export function displayGroupFor(category) {
  return DISPLAY_GROUP[category] ?? 'other';
}

// Shape carries the category even where colour cannot: printed, projected, or
// read by someone who does not separate red from green.
// Shape carries the group even where colour cannot: printed, projected, or
// read by someone who does not separate red from green. Support and other stay
// small round dots so the three meaningful groups read first.
export const CATEGORY_MARKS = Object.freeze({
  living: { shape: 'circle', token: 'blueprint', scale: 1.6 },
  industry: { shape: 'square', token: 'accent', scale: 1.6 },
  services: { shape: 'diamond', token: 'pos', scale: 1.6 },
  support: { shape: 'circle', token: 'muted', scale: 0.9 },
  other: { shape: 'circle', token: 'muted', scale: 0.9 },
});

export function categoryForFlags(flags) {
  const present = new Set(Array.isArray(flags) ? flags : []);
  for (const [category, matches] of CATEGORY_RULES) {
    if (matches.some(flag => present.has(flag))) return category;
  }
  return 'other';
}

// One pass over the dataset, so the map does a Map lookup per building rather
// than a search: a republic draws on the order of two thousand markers, and
// this runs again on every pan and zoom.
export function buildTypeCategoryIndex(rawBuildings) {
  const index = new Map();
  for (const building of rawBuildings ?? []) {
    const id = building?.id;
    if (!id) continue;
    index.set(String(id).toLowerCase(), categoryForFlags(building.types));
  }
  return index;
}

// The save writes DLC and mirrored buildings with prefixes the dataset does
// not use, and the same normalisation the building matcher applies is needed
// here or a whole DLC would fall through to 'other'.
export function categoryForSaveType(type, index) {
  if (!type || !index) return 'other';
  const clean = String(type).replace(/^MIRRORZ_/, '').toLowerCase();
  const direct = index.get(clean);
  if (direct) return displayGroupFor(direct);
  for (const prefix of ['cwc', 'dlc1', 'dlc2', 'dlc3']) {
    if (clean.startsWith(`${prefix}_`)) {
      const mapped = index.get(`${prefix}/${clean.slice(prefix.length + 1)}`);
      if (mapped) return displayGroupFor(mapped);
    }
  }
  return 'other';
}
