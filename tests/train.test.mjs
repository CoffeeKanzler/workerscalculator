import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expandConsist, evaluateConsist, recommendTrain, mergeVehiclePools,
  vehicleCargoCapacity, vehicleSupportsCargo, vehicleDrive,
} from '../js/train.js';

const sheetVehicles = JSON.parse(readFileSync(new URL('../data/vehicles.json', import.meta.url))).vehicles;
const rail = JSON.parse(readFileSync(new URL('../data/game/rail_vehicles.json', import.meta.url)));
const rawVehicles = JSON.parse(readFileSync(new URL('../data/game/vehicles_raw.json', import.meta.url)));
const merged = mergeVehiclePools(sheetVehicles, rail, rawVehicles);
const byName = new Map(merged.map(v => [v.name, v]));

test('matching game vehicle facts override stale sheet dimensions, performance, and production bill', () => {
  const [vehicle] = mergeVehiclePools([{
    name: 'AN-2', attrs: { Typ: 'Flugzeug', 'Länge': 12, Leergewicht: 3, Motorleistung: 900, Stahl: 4 },
  }], [], [{
    id: 'plane_an2', de: 'AN-2', length: 12.29, emptyWeight: 3.4,
    powerKW: 1000, speed: 258, from: 1947, to: 2001,
    type: 'VEHICLETYPE_AIRPLANE', capacity: 12,
    transportType: 'RESOURCE_TRANSPORT_PASSANGER', electric: false,
  }]);
  assert.equal(vehicle.attrs['Länge'], 12.29);
  assert.equal(vehicle.attrs.Leergewicht, 3.4);
  assert.equal(vehicle.attrs.Motorleistung, 1000);
  assert.equal(vehicle.attrs['Max. Geschwindigkeit'], 258);
  assert.equal(vehicle.attrs.Stahl, 4);
  assert.equal(vehicle.sourceGameId, 'plane_an2');
  assert.equal(vehicle.gameCapacity, 12);
  assert.equal(vehicle.gameTransportType, 'RESOURCE_TRANSPORT_PASSANGER');
  assert.equal(vehicle.gameElectric, false);
  assert.deepEqual(vehicle.gameRecipe.slice(0, 3), [
    ['workers', 595], ['steel', 0.17000000178813934], ['aluminium', 2.5500001907348633],
  ]);
  assert.equal(vehicle.provenance.performance, 'game-file');
  assert.equal(vehicle.provenance.productionCost, 'game-file');
  assert.equal(vehicle.provenance.cargoCapacities, 'game-file');
});

test('ambiguous raw names retain the labeled spreadsheet production fallback', () => {
  const [vehicle] = mergeVehiclePools([
    { name: 'Duplicate', attrs: { Typ: 'Bus', Arbeitstage: 100, Stahl: 2 } },
  ], [], [
    { id: 'a', de: 'Duplicate', type: 'VEHICLETYPE_ROAD', emptyWeight: 2, powerKW: 50,
      from: 1960, capacity: 20, transportType: 'RESOURCE_TRANSPORT_PASSANGER', roadRecipeBranch: 'ordinary' },
    { id: 'b', en: 'Duplicate', type: 'VEHICLETYPE_ROAD', emptyWeight: 3, powerKW: 60,
      from: 1960, capacity: 30, transportType: 'RESOURCE_TRANSPORT_PASSANGER', roadRecipeBranch: 'ordinary' },
  ]);
  assert.equal(vehicle.gameRecipe, undefined);
  assert.equal(vehicle.sourceGameId, undefined);
  assert.equal(vehicle.provenance.productionCost, 'spreadsheet');
});

test('exact wagon transport class replaces stale capacity and rejects production-material columns', () => {
  const [vehicle] = mergeVehiclePools([{
    name: 'Exact hopper', attrs: {
      Typ: 'Güterwagon', 'Länge': 10, Leergewicht: 10, Kohle: 40,
      Stahl: 9, 'Elektronik-Bauteile': 3,
    },
  }], [], [{
    id: 'hopper', de: 'Exact hopper', type: 'VEHICLETYPE_RAIL_VAGON',
    emptyWeight: 10, from: 1960, capacity: 55,
    transportType: 'RESOURCE_TRANSPORT_GRAVEL', electric: false,
  }]);
  assert.equal(vehicleCargoCapacity(vehicle, 'Kohle'), 55);
  assert.equal(vehicleSupportsCargo(vehicle, 'Eisenerz'), true);
  assert.equal(vehicleCargoCapacity(vehicle, 'Stahl'), 0);
  assert.equal(vehicleCargoCapacity(vehicle, 'Elektronik-Bauteile'), 0);
  const result = evaluateConsist(
    [{ name: 'Exact hopper', count: 2, cargo: 'Kohle' }], [vehicle], new Set(['Kohle']));
  assert.equal(result.capacities.get('Kohle'), 110);
  assert.equal(result.loadedWeight, 130);
});

test('unmatched wagons retain spreadsheet capacity fallback', () => {
  const wagon = { name: 'Fallback', attrs: { Typ: 'Güterwagon', Kohle: 40 } };
  assert.equal(vehicleCargoCapacity(wagon, 'Kohle'), 40);
  assert.equal(vehicleSupportsCargo(wagon, 'Kohle'), true);
});

test('unmatched wagons do not mistake construction materials for cargo', () => {
  const open = { name: 'Fallback open', attrs: {
    Typ: 'Güterwagon', Frachtart: 'Offene Ladefläche', Ladefläche: 67,
    Stahl: 17, Aluminium: 67, Holz: 67,
  } };
  const covered = { name: 'Fallback covered', attrs: {
    Typ: 'Güterwagon', Frachtart: 'Abgedeckte Ladefläche',
    Pflanzen: 44, Stoff: 0.005, 'Elektronik-Bauteile': 0.2,
  } };
  assert.equal(vehicleCargoCapacity(open, 'Stahl'), 0);
  assert.equal(vehicleCargoCapacity(open, 'Aluminium'), 0);
  assert.equal(vehicleCargoCapacity(open, 'Holz'), 67);
  assert.equal(vehicleCargoCapacity(covered, 'Pflanzen'), 44);
  assert.equal(vehicleCargoCapacity(covered, 'Stoff'), 0);
  assert.equal(vehicleCargoCapacity(covered, 'Elektronik-Bauteile'), 0);
});

test('current game data gives exact capacities to 70 of 98 train wagons', () => {
  const wagons = merged.filter(vehicle =>
    ['Güterwagon', 'Passagierwagen'].includes(vehicle.attrs.Typ));
  assert.equal(wagons.length, 98);
  assert.equal(wagons.filter(vehicle =>
    vehicle.provenance?.cargoCapacities === 'game-file').length, 70);

  const hopper = byName.get('Schüttgutwagen');
  assert.equal(vehicleCargoCapacity(hopper, 'Kohle'), 50);
  assert.equal(vehicleCargoCapacity(hopper, 'Stahl'), 0);
  const open = byName.get('Offener Wagen 13-401');
  assert.equal(vehicleCargoCapacity(open, 'Stahl'), 67);
  assert.equal(vehicleCargoCapacity(open, 'Kohle'), 0);
});

test('exact electric fact controls catenary state without inventing diesel versus steam', () => {
  assert.equal(vehicleDrive({ attrs: { Antriebsart: 'D' }, gameElectric: true }), 'E');
  assert.equal(vehicleDrive({ attrs: { Antriebsart: 'S' }, gameElectric: false }), 'S');
});

test('game rail data nests hard-attached tenders instead of publishing choices', () => {
  assert.equal(merged.filter(v => v.attrs.Typ === 'Tender').length, 0);
  assert.equal(byName.get('FD-Serie').tender.name, 'FD Tender');
  assert.equal(byName.get('Ol49').tender.name, '25D49 (Ol49) Tender');
  assert.equal(byName.get('Ty45').tender.name, '32D43 (Ty45) Tender');
  assert.equal(byName.get('Pm2').tender.name, '34D44 (Pm2) Tender');
  assert.equal(byName.get('Br80').tender, undefined);
});

const tender = {
  name: 'FD Tender',
  attrs: { Typ: 'Tender', 'Länge': 12, Leergewicht: 34, Von: 1931, Bis: 1978 },
};
const steam = {
  name: 'FD', tender,
  attrs: {
    Typ: 'Lokomotive', 'Länge': 17, Leergewicht: 135,
    Motorleistung: 2205, 'Max. Geschwindigkeit': 85,
    Antriebsart: 'S', Von: 1931, Bis: 1978,
  },
};
const tankEngine = {
  name: 'Br80',
  attrs: {
    Typ: 'Lokomotive', 'Länge': 9, Leergewicht: 54,
    Motorleistung: 423, 'Max. Geschwindigkeit': 45,
    Antriebsart: 'S', Von: 1927, Bis: 1977,
  },
};
const wagon = {
  name: 'Coal wagon',
  attrs: {
    Typ: 'Güterwagon', 'Länge': 10, Leergewicht: 10,
    Kohle: 40, Von: 1900, Bis: 2000,
  },
};
const vehicles = [steam, tankEngine, wagon, tender];

test('each locomotive instance expands to an adjacent locked tender', () => {
  const expanded = expandConsist([{ name: 'FD', count: 2 }], vehicles);
  assert.deepEqual(expanded.map(s => [s.name, s.locked]), [
    ['FD', false], ['FD Tender', true],
    ['FD', false], ['FD Tender', true],
  ]);
});

test('tender affects dimensions but not cargo capacity', () => {
  const result = evaluateConsist([
    { name: 'FD', count: 1 },
    { name: 'Coal wagon', count: 1, cargo: 'Kohle' },
  ], vehicles, new Set(['Kohle']));
  assert.equal(result.totalLength, 39);
  assert.equal(result.emptyWeight, 179);
  assert.equal(result.capacities.get('Kohle'), 40);
  assert.equal(result.loadedWeight, 219);
});

test('steam tank locomotive without tender remains standalone', () => {
  const expanded = expandConsist([{ name: 'Br80', count: 1 }], vehicles);
  assert.deepEqual(expanded.map(s => s.name), ['Br80']);
});

test('recommendation includes tender mass when choosing locomotive count', () => {
  const tr = {
    year: 1940,
    reco: { rows: [{ cargo: 'Kohle', tons: 760 }], kwt: 2, drive: 'S' },
  };
  const result = recommendTrain(tr, [steam], [wagon]);
  assert.deepEqual(result[0], { name: 'FD', count: 2, cargo: null });
  const evaluated = evaluateConsist(result, vehicles, new Set(['Kohle']));
  assert.ok(evaluated.kwPerT >= 2);
});

test('recommendation ranks and sizes wagons using exact compatible capacity', () => {
  const exactSmall = { name: 'Exact short', gameCapacity: 30,
    gameTransportType: 'RESOURCE_TRANSPORT_GRAVEL',
    attrs: { Typ: 'Güterwagon', 'Länge': 10, Leergewicht: 10, Kohle: 100, Stahl: 8, Von: 1900, Bis: 2000 } };
  const exactLarge = { name: 'Exact long', gameCapacity: 70,
    gameTransportType: 'RESOURCE_TRANSPORT_GRAVEL',
    attrs: { Typ: 'Güterwagon', 'Länge': 20, Leergewicht: 20, Kohle: 20, Von: 1900, Bis: 2000 } };
  const tr = { year: 1950, reco: { rows: [{ cargo: 'Kohle', tons: 140 }], kwt: 1, drive: 'S' } };
  const result = recommendTrain(tr, [steam], [exactSmall, exactLarge]);
  assert.deepEqual(result[1], { name: 'Exact long', count: 2, cargo: 'Kohle' });
  assert.equal(vehicleSupportsCargo(exactLarge, 'Stahl'), false);
});
