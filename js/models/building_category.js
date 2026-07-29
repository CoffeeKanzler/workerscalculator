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
const CATEGORY_RULES = Object.freeze([
  ['industry', ['TYPE_FACTORY', 'TYPE_ENGINE', 'TYPE_FIELD', 'TYPE_MINE',
    'TYPE_OIL_WELL', 'TYPE_FARM', 'TYPE_FORESTRY']],
  ['utility', ['TYPE_SUBSTATION', 'TYPE_TRANSFORMATOR', 'TYPE_POWERPLANT',
    'TYPE_WATER_PUMP', 'TYPE_WATER_ENDSTATION', 'SUBTYPE_WATER_SWITCH', 'TYPE_WATER_TOWER',
    'TYPE_SEWAGE_PUMP', 'TYPE_SEWAGE_ENDSTATION', 'SUBTYPE_SEWAGE_SWITCH',
    'TYPE_HEATING_PLANT', 'TYPE_HEATING_ENDSTATION', 'TYPE_HEATING_SWITCH',
    'TYPE_TRASH_CONTAINER', 'TYPE_WASTE', 'TYPE_INCINERATOR']],
  ['transport', ['TYPE_CARGO_STATION', 'TYPE_PASSANGER_STATION', 'TYPE_GARAGE',
    'TYPE_GAS_STATION', 'TYPE_AIRPLANE_GATE', 'TYPE_CUSTOMHOUSE', 'TYPE_PEDESTRIAN_BRIDGE',
    'SUBTYPE_CABLEWAY', 'SUBTYPE_TRAM', 'SUBTYPE_TROLLEYBUS', 'SUBTYPE_AIRPLANE',
    'SUBTYPE_SHIP', 'TYPE_PARKING']],
  ['storage', ['TYPE_STORAGE', 'TYPE_OPEN_STORAGE', 'TYPE_DISTRIBUTION_OFFICE',
    'TYPE_CONTAINER_STAND']],
  ['living', ['TYPE_LIVING', 'TYPE_HOTEL']],
  ['civic', ['CIVIL_BUILDING', 'TYPE_SHOP', 'TYPE_UNIVERSITY', 'TYPE_SCHOOL',
    'TYPE_HOSPITAL', 'TYPE_SPORT', 'TYPE_ATTRACTION', 'TYPE_MONUMENT',
    'TYPE_POLICE', 'TYPE_FIRE_DEPARTMENT', 'TYPE_KINO', 'TYPE_CHURCH',
    'TYPE_CONSTRUCTION_OFFICE', 'TYPE_PRISON', 'TYPE_COURT']],
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
