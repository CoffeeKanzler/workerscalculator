import {
  createEvidence,
  createEvidenceCollection,
  createEvidenceValue,
  createRepublicModel,
} from '../models/republic_model.js';

const COLLECTION_SOURCES = Object.freeze({
  areas: ['cities'],
  buildings: ['buildings', 'building_identities', 'building_asset_metadata', 'building_recipes'],
  citizens: ['citizens', 'citizen_wellbeing', 'citizen_activity'],
  resources: ['resources', 'resource_flows', 'building_storage', 'building_resource_amounts'],
  transport: ['vehicles', 'used_vehicle_offers', 'vehicle_catalog'],
  research: ['research', 'research_unlock_edges'],
  events: ['sdk_events', 'global_events', 'audit', 'used_market_events'],
});

function firstItem(data, id) { return data.get(id)?.items?.[0] ?? null; }

function gameDate(data) {
  const source = firstItem(data, 'lifecycle') ?? firstItem(data, 'game_state') ?? firstItem(data, 'republic');
  if (!source || !Number.isInteger(source.dateYear) || !Number.isInteger(source.dateDay)) return null;
  return { year: source.dateYear, day: source.dateDay };
}

function sourceEvidence(sourceId, data, observedAt, date) {
  const response = data.get(sourceId);
  const available = !!response;
  return createEvidence({
    source: 'live-sdk', observedAt: available ? observedAt : null,
    gameDate: available ? date : null,
    completeness: available ? 'complete' : 'unavailable', confidence: 'exact',
    capability: sourceId,
    warning: available ? null : `Live capability '${sourceId}' is unavailable`,
  });
}

function stableId(item, sourceId, index) {
  const raw = item.id ?? item.handle ?? item.index ?? item.key ?? item.sequence;
  return raw === undefined || raw === null || raw === '' ? `${sourceId}:${index}` : raw;
}

function records(data, sourceId) {
  return (data.get(sourceId)?.items ?? []).map((item, index) => ({
    id: stableId(item, sourceId, index),
    ...item,
  }));
}

function collection(data, sourceIds, observedAt, date) {
  const sourceId = sourceIds.find(id => data.has(id)) ?? sourceIds[0];
  const items = sourceIds.flatMap((id, sourceIndex) => records(data, id).map(item => ({
    ...item,
    id: sourceIndex === 0 ? item.id : `${id}:${item.id}`,
    source: id,
  })));
  return createEvidenceCollection(items, sourceEvidence(sourceId, data, observedAt, date));
}

function scalar(data, sourceId, field, observedAt, date, fallback = null) {
  const record = firstItem(data, sourceId);
  const value = record?.[field] ?? fallback;
  return createEvidenceValue(value, sourceEvidence(sourceId, data, observedAt, date));
}

function population(stat) {
  if (Number.isFinite(stat?.population)) return stat.population;
  const fields = ['smallChildren', 'mediumChildren', 'adultsParent', 'adults'];
  if (!fields.some(field => Number.isFinite(stat?.[field]))) return null;
  return fields.reduce((total, field) => total + (stat[field] ?? 0), 0);
}

export function projectLiveSnapshot({ catalog, data, observedAt, generation }) {
  const date = gameDate(data);
  const republicRecord = firstItem(data, 'republic');
  const stat = republicRecord?.republic ?? republicRecord;
  const republicEvidence = sourceEvidence('republic', data, observedAt, date);
  const domains = {};
  for (const [domain, sources] of Object.entries(COLLECTION_SOURCES)) {
    domains[domain] = collection(data, sources, observedAt, date);
  }

  return createRepublicModel({
    identity: { id: `live:${generation}`, name: catalog.name },
    generation,
    observedAt,
    gameDate: date,
    sources: Object.fromEntries([...new Set([
      ...Object.keys(COLLECTION_SOURCES).flatMap(domain => COLLECTION_SOURCES[domain]),
      'lifecycle', 'game_state', 'republic',
    ])].map(id => [id, sourceEvidence(id, data, observedAt, date)])),
    republic: {
      population: createEvidenceValue(population(stat), republicEvidence),
      configuredIndustryWorkers: createEvidenceValue(stat?.configuredWorkers ?? null, republicEvidence),
      currentIndustryWorkers: createEvidenceValue(stat?.currentWorkers ?? null, republicEvidence),
      productivity: createEvidenceValue(stat?.averageProductivity ?? null, republicEvidence),
      liveBuildingCount: scalar(data, 'game_state', 'buildingCount', observedAt, date),
      occupiedNamedAreas: scalar(data, 'game_state', 'cityCount', observedAt, date),
      health: createEvidenceValue(null, republicEvidence),
      happiness: createEvidenceValue(null, republicEvidence),
      loyalty: createEvidenceValue(null, republicEvidence),
    },
    ...domains,
  });
}

export { COLLECTION_SOURCES, gameDate, stableId };
