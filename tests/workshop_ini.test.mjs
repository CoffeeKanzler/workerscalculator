import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkshopBuildingIni, workshopBuildingIdentity } from '../js/workshop_ini.js';

test('Workshop building.ini parser keeps planner-relevant exact fields', () => {
  const text = `
$NAME_STR "Compact housing"
$TYPE_LIVING
$WORKERS_NEEDED 12
$STORAGE RESOURCE_TRANSPORT_PASSANGER 96
$QUALITY_OF_LIVING 0.87
$PRODUCTION food 0.25
$CONSUMPTION eletric 0.1
$CONSUMPTION_PER_SECOND eletric 0.025
$COST_RESOURCE steel 7.5
`;
  assert.deepEqual(parseWorkshopBuildingIni(text, '1234567890/house'), {
    id: '1234567890/house', nameId: null, nameStr: 'Compact housing',
    types: ['TYPE_LIVING'], workers: 12, professors: 0,
    production: { food: 0.25 }, consumption: { eletric: 0.1 }, consumptionPerSecond: { eletric: 0.025 },
    livingSpace: 96, citizenAbleServe: 0, qualityOfLiving: 0.87,
    attractiveScore: null, storages: { RESOURCE_TRANSPORT_PASSANGER: 96 },
    constructionResources: { steel: 7.5 }, electricWorkerFactors: {},
    workshopId: '1234567890', modPath: 'house',
  });
});

test('Workshop identity finds the numeric package directory from a selected tree', () => {
  assert.deepEqual(workshopBuildingIdentity(
    '784150/1234567890/buildings/apartment/building.ini'), {
    workshopId: '1234567890', modPath: 'buildings/apartment',
    id: '1234567890/buildings/apartment',
  });
  assert.equal(workshopBuildingIdentity('some-folder/building.ini'), null);
});
