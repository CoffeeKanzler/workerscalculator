import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expandConsist, evaluateConsist, recommendTrain,
} from '../js/train.js';

const rail = JSON.parse(readFileSync(new URL('../data/game/rail_vehicles.json', import.meta.url)));
const byName = new Map(rail.map(v => [v.name, v]));

test('game rail data nests hard-attached tenders instead of publishing choices', () => {
  assert.equal(rail.filter(v => v.attrs.Typ === 'Tender').length, 0);
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
