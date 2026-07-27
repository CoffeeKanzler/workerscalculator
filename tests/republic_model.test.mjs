import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidence,
  createEvidenceCollection,
  createEvidenceValue,
  createRepublicModel,
} from '../js/models/republic_model.js';

const saveEvidence = () => createEvidence({
  source: 'save',
  observedAt: '2026-07-27T12:30:00.000Z',
  gameDate: { year: 1984, day: 123 },
  completeness: 'partial',
  confidence: 'exact',
  capability: 'save.workers',
  warning: 'Vehicle assignments are unavailable in this save.',
});

test('createEvidence validates provenance fields and returns immutable metadata', () => {
  const evidence = saveEvidence();

  assert.deepEqual(evidence, {
    source: 'save',
    observedAt: '2026-07-27T12:30:00.000Z',
    gameDate: { year: 1984, day: 123 },
    completeness: 'partial',
    confidence: 'exact',
    capability: 'save.workers',
    warning: 'Vehicle assignments are unavailable in this save.',
  });
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence.gameDate));
  assert.throws(() => { evidence.source = 'plan'; }, TypeError);
});

test('createEvidence rejects unsupported provenance values and malformed dates', () => {
  const valid = {
    source: 'live-sdk',
    observedAt: null,
    gameDate: null,
    completeness: 'unavailable',
    confidence: 'estimated',
    capability: null,
    warning: null,
  };

  for (const [field, value] of [
    ['source', 'cache'],
    ['completeness', 'unknown'],
    ['confidence', 'likely'],
    ['observedAt', 'yesterday'],
    ['gameDate', { year: 1984, day: -1 }],
    ['capability', 12],
    ['warning', false],
  ]) {
    assert.throws(() => createEvidence({ ...valid, [field]: value }), {
      name: 'TypeError',
    }, `${field} should be validated`);
  }
});

test('game dates stay within the project 365-day year', () => {
  const valid = {
    source: 'save',
    observedAt: null,
    completeness: 'complete',
    confidence: 'exact',
    capability: null,
    warning: null,
  };

  assert.doesNotThrow(() => createEvidence({
    ...valid,
    gameDate: { year: 1984, day: 364 },
  }));
  assert.throws(() => createEvidence({
    ...valid,
    gameDate: { year: 1984, day: 365 },
  }), /gameDate/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' },
    gameDate: { year: 1984, day: 999 },
  }), /gameDate/i);
});

test('evidence consumers reject frozen objects missing required provenance fields', () => {
  const complete = {
    source: 'save',
    observedAt: '2026-07-27T12:30:00.000Z',
    gameDate: { year: 1984, day: 123 },
    completeness: 'complete',
    confidence: 'exact',
    capability: null,
    warning: null,
  };

  for (const field of ['observedAt', 'gameDate', 'capability', 'warning']) {
    const forged = { ...complete };
    delete forged[field];
    Object.freeze(forged);
    assert.throws(() => createEvidenceValue(10, forged), /evidence/i,
      `frozen evidence missing ${field} should be rejected`);
    assert.throws(() => createRepublicModel({
      identity: { id: 'r1' },
      sources: { forged },
    }), /source catalog/i, `source catalog evidence missing ${field} should be rejected`);
  }
});

test('evidence and model timestamps reject parseable non-ISO date strings', () => {
  assert.throws(() => createEvidence({
    source: 'save',
    observedAt: '07/27/2026',
    gameDate: null,
    completeness: 'complete',
    confidence: 'exact',
    capability: null,
    warning: null,
  }), /ISO date-time/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' },
    observedAt: '07/27/2026',
  }), /ISO date-time/i);
});

test('ISO-shaped timestamps reject impossible calendar dates without narrowing valid formats', () => {
  const evidenceInput = {
    source: 'save',
    gameDate: null,
    completeness: 'complete',
    confidence: 'exact',
    capability: null,
    warning: null,
  };

  for (const observedAt of [
    '2026-02-30T12:00:00Z',
    '2026-04-31T12:00:00Z',
  ]) {
    assert.throws(() => createEvidence({ ...evidenceInput, observedAt }), /ISO date-time/i);
  }
  for (const observedAt of [
    '2026-02-28T12:00:00Z',
    '2024-02-29T12:00:00.125+02:00',
    '2026-07-27T12:30:00-05:30',
  ]) {
    assert.doesNotThrow(() => createEvidence({ ...evidenceInput, observedAt }));
  }
});

test('evidence values and collections preserve nested payloads with stable IDs', () => {
  const evidence = saveEvidence();
  const population = createEvidenceValue(18420, evidence);
  const buildings = createEvidenceCollection([
    { id: 41, name: 'Coal mine', operation: { workers: 210 } },
    { id: 'custom:steel-1', name: 'Steel mill', operation: { workers: 480 } },
  ], evidence);

  assert.deepEqual(population, { value: 18420, evidence });
  assert.equal(buildings.completeness, 'partial');
  assert.deepEqual(buildings.items.map(item => item.id), [41, 'custom:steel-1']);
  assert.ok(Object.isFrozen(population));
  assert.ok(Object.isFrozen(buildings));
  assert.ok(Object.isFrozen(buildings.items[0].operation));
  assert.throws(() => createEvidenceCollection([{ name: 'Anonymous' }], evidence), /stable id/i);
  assert.throws(() => createEvidenceCollection([{ id: 7 }, { id: 7 }], evidence), /duplicate/i);
});

test('evidence payloads reject mutable non-JSON object types', () => {
  const evidence = saveEvidence();

  for (const payload of [
    new Date('2026-07-27T12:30:00Z'),
    new Map([['workers', 42]]),
    new Set(['workers']),
  ]) {
    assert.throws(() => createEvidenceValue(payload, evidence), /JSON-compatible/i);
    assert.throws(() => createEvidenceCollection([{ id: 1, payload }], evidence), /JSON-compatible/i);
  }
});

test('createRepublicModel revalidates stable IDs in supplied collections', () => {
  const evidence = saveEvidence();
  const forgedDuplicate = Object.freeze({
    items: Object.freeze([{ id: 7 }, { id: 7 }]),
    evidence,
    completeness: evidence.completeness,
  });
  const forgedInvalid = Object.freeze({
    items: Object.freeze([{ name: 'Anonymous' }]),
    evidence,
    completeness: evidence.completeness,
  });

  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' },
    buildings: forgedDuplicate,
  }), /duplicate stable id/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' },
    buildings: forgedInvalid,
  }), /stable id/i);
});

test('createRepublicModel supplies the complete immutable normalized schema', () => {
  const evidence = saveEvidence();
  const model = createRepublicModel({
    identity: { id: 'save:republic-1', name: 'Kohleburg Republic' },
    generation: 17,
    observedAt: '2026-07-27T12:30:00.000Z',
    gameDate: { year: 1984, day: 123 },
    sources: { workers: evidence },
    republic: {
      population: createEvidenceValue(18420, evidence),
      leadership: createEvidenceValue({ chairman: 'Novák' }, evidence),
    },
    buildings: createEvidenceCollection([{ id: 41, name: 'Coal mine' }], evidence),
  });

  assert.equal(model.schemaVersion, 1);
  assert.deepEqual(model.identity, { id: 'save:republic-1', name: 'Kohleburg Republic' });
  assert.equal(model.generation, 17);
  assert.equal(model.sources.workers, evidence);
  assert.equal(model.republic.population.value, 18420);
  assert.equal(model.republic.leadership.value.chairman, 'Novák');
  assert.deepEqual(model.buildings.items.map(item => item.id), [41]);
  for (const domain of [
    'republic', 'areas', 'buildings', 'citizens', 'resources',
    'transport', 'research', 'events',
  ]) {
    assert.ok(Object.hasOwn(model, domain), `missing ${domain} domain`);
  }
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.sources));
  assert.ok(Object.isFrozen(model.republic.leadership));
  assert.throws(() => { model.generation = 18; }, TypeError);
});

test('republic scalar metrics require evidence while nested domain objects remain practical', () => {
  const evidence = saveEvidence();

  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' },
    republic: { population: 18420 },
  }), /population.*evidence value/i);
  assert.doesNotThrow(() => createRepublicModel({
    identity: { id: 'r1' },
    republic: {
      population: createEvidenceValue(18420, evidence),
      government: { cabinet: [{ role: 'chairman', name: 'Novák' }] },
    },
  }));
});

test('createRepublicModel rejects invalid identity, generation, source catalog, and domains', () => {
  const evidence = saveEvidence();

  assert.throws(() => createRepublicModel({ identity: {} }), /identity/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' }, generation: -1,
  }), /generation/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' }, sources: { workers: {} },
  }), /source catalog/i);
  assert.throws(() => createRepublicModel({
    identity: { id: 'r1' }, areas: [{ id: 1 }],
  }), /areas/i);
  assert.doesNotThrow(() => createRepublicModel({
    identity: { id: 'r1' }, sources: { workers: evidence },
  }));
});

test('republic compatibility module exposes the normalized API without changing legacy exports', async () => {
  const republic = await import('../js/republic.js');

  assert.equal(republic.createRepublicModel, createRepublicModel);
  assert.equal(typeof republic.buildRepublicModel, 'function');
  assert.equal(typeof republic.compareObservedSnapshots, 'function');
  assert.equal(typeof republic.republicAlerts, 'function');
  assert.equal(typeof republic.visibleRepublicAlerts, 'function');
});
