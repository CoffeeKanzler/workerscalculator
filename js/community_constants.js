// Community-curated planning constants.
//
// These values are NOT in the game files — they were measured in-game or
// derived by the community (origin: project7_2020's planning spreadsheet).
// If a game patch changes one of them, edit it here (GitHub web UI works fine)
// and say in the PR how you verified the new value.

// Field yield: tons of plants per hectare per day.
export const SEASON_FACTOR = 0.1708767123287;    // with seasons enabled
export const NO_SEASON_FACTOR = 0.2255655296229; // without seasons

// Field sizes in hectares.
export const FIELD_SIZES = { small: 0.39, medium: 1.57, large: 4.81 };

// Runtime-tunable copies of the constants above. The formulas in calc.js read
// THESE, so the app's advanced mode can override values per session (and share
// them via share links). The exported constants remain the documented defaults.
export const TUNABLE_DEFAULTS = {
  seasonFactor: SEASON_FACTOR,
  noSeasonFactor: NO_SEASON_FACTOR,
  fieldSmall: 0.39, fieldMedium: 1.57, fieldLarge: 4.81,
  secretPolicePerBuildings: 7,
  heatPerSpecial: 5,
  exchangerSmall: 100, exchangerLarge: 300,
  serviceShopping: 19, serviceKindergarten: 15, serviceSchool: 18,
  serviceUniversity: 64, serviceCourt: 600, servicePolice: 150,
  serviceAttraction: 140, serviceHospital: 100,
};
export const TUNABLES = { ...TUNABLE_DEFAULTS };

const SERVICE_KEYS = {
  shopping: 'serviceShopping', kindergarten: 'serviceKindergarten',
  school: 'serviceSchool', university: 'serviceUniversity', court: 'serviceCourt',
  police: 'servicePolice', attraction: 'serviceAttraction', hospital: 'serviceHospital',
};

// Apply overrides ({tunableKey: value}) on top of the defaults and sync the
// SERVICES ratios. Pass {} to reset everything.
export function applyTuning(overrides = {}) {
  Object.assign(TUNABLES, TUNABLE_DEFAULTS, overrides);
  FIELD_SIZES.small = TUNABLES.fieldSmall;
  FIELD_SIZES.medium = TUNABLES.fieldMedium;
  FIELD_SIZES.large = TUNABLES.fieldLarge;
  HEAT_EXCHANGERS.small = TUNABLES.exchangerSmall;
  HEAT_EXCHANGERS.large = TUNABLES.exchangerLarge;
  for (const svc of SERVICES) svc.ratio = TUNABLES[SERVICE_KEYS[svc.id]];
}

// Buildings whose output scales with the resource richness ("quality") of the
// deposit instead of plain building count. German names as used in the data.
export const QUALITY_BUILDINGS_DE = new Set([
  'Kohlemine', 'Eisenmine', 'Ölförderpumpe', 'Bauxit-Mine', 'Uranmine',
  'Kiesgrube', 'Holzfällerposten', 'Kiesgrube Groß', 'Kiesgrube groß',
]);

// City service coverage: one provided "place" serves `ratio` inhabitants.
// Capacity source column: 'visitors' or 'special' (from the city data sheet).
export const SERVICES = [
  { id: 'shopping',     typeDe: 'Einkaufzentrum',  src: 'visitors', ratio: 19 },
  { id: 'kindergarten', typeDe: 'Kindergarten',    src: 'visitors', ratio: 15 },
  { id: 'school',       typeDe: 'Schule',          src: 'visitors', ratio: 18 },
  { id: 'university',   typeDe: 'Universität',     src: 'visitors', ratio: 64 },
  { id: 'court',        typeDe: 'Gerichtsgebäude', src: 'special',  ratio: 600 },
  { id: 'police',       typeDe: 'Polizei',         src: 'special',  ratio: 150 },
  { id: 'attraction',   typeDe: 'Attraktionen',    src: 'visitors', ratio: 140 },
  { id: 'hospital',     typeDe: 'Krankenhaus',     src: 'visitors', ratio: 100 },
];

// Secret police: one vehicle serves this many residential buildings.
export const SECRET_POLICE_PER_BUILDINGS = 7;

// City heating plants: hot water m³ per "special value" unit.
export const HEAT_PER_SPECIAL = 5;

// Power cable / transformer capacities (MW).
export const CABLES = [
  { de: 'Untergrund Kabel 0,65 MW', en: 'Underground cable 0.65 MW', mw: 0.65 },
  { de: 'Untergrund Kabel 1,15 MW', en: 'Underground cable 1.15 MW', mw: 1.15 },
  { de: 'Untergrund Kabel 1,85 MW', en: 'Underground cable 1.85 MW', mw: 1.85 },
  { de: 'Oberirdisches Kabel 0,65 MW', en: 'Overhead cable 0.65 MW', mw: 0.65 },
  { de: 'Oberirdisches Kabel 1,2 MW', en: 'Overhead cable 1.2 MW', mw: 1.2 },
  { de: 'Oberirdisches Kabel 1,5 MW', en: 'Overhead cable 1.5 MW', mw: 1.5 },
  { de: 'Oberirdisches Kabel 2,35 MW', en: 'Overhead cable 2.35 MW', mw: 2.35 },
];

// Heat exchanger sizes (m³ hot water).
export const HEAT_EXCHANGERS = { small: 100, large: 300 };

// Goods that move via wires/pipes and never pay border delivery cost.
export const NON_DELIVERABLE = new Set(['eletric', 'heat', 'water', 'usagewater']);
