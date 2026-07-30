import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVehicleRoutes } from '../js/models/vehicle_routes.js';

const stop = index => ({ index, type: 'rail_station_passenger', savedTypePlusOne: 2 });
const depot = index => ({ index, type: 'rail_depot', savedTypePlusOne: 29 });

function vehicle(id, model, targets, extra = {}) {
  return { id, model, routeTargetBuildingIndices: targets, ...extra };
}

test('a vehicle route between two passenger stops is a service, line or no line', () => {
  const { routes, completeness } = buildVehicleRoutes({
    vehicles: [vehicle(1, 'peckett', [10, 11])],
    buildings: [stop(10), stop(11)],
  });

  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].stopIds, [10, 11]);
  assert.deepEqual(routes[0].vehicleIds, [1]);
  assert.equal(routes[0].name, 'peckett');
  assert.equal(routes[0].mode, 'vehicleRoute');
  assert.deepEqual(completeness,
    { vehicleCount: 1, routedVehicles: 1, routeCount: 1, servedStopCount: 2 });
});

test('vehicles calling at the same stops are one service, not four', () => {
  const { routes } = buildVehicleRoutes({
    vehicles: [
      vehicle(1, 'peckett', [10, 11]),
      vehicle(2, 'peckett', [11, 10]),
      vehicle(3, 'gwr5700', [10, 11]),
    ],
    buildings: [stop(10), stop(11)],
  });

  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].vehicleIds, [1, 2, 3]);
});

// The route also names a depot and a warehouse; neither is somewhere a citizen
// can board, so neither belongs in a corridor.
test('only calls at passenger stops count as stops', () => {
  const { routes } = buildVehicleRoutes({
    vehicles: [vehicle(1, 'peckett', [99, 10, 98, 11, 10])],
    buildings: [stop(10), stop(11), depot(98), depot(99)],
  });

  assert.deepEqual(routes[0].stopIds, [10, 11]);
});

test('a route with one stop reaches nowhere and is not a service', () => {
  assert.deepEqual(buildVehicleRoutes({
    vehicles: [vehicle(1, 'peckett', [10, 98]), vehicle(2, 'truck', [])],
    buildings: [stop(10), depot(98)],
  }).routes, []);
});

test('a vehicle already on a line is described by that line, not twice', () => {
  const options = {
    vehicles: [vehicle(1, 'bus', [10, 11])],
    buildings: [stop(10), stop(11)],
  };

  assert.equal(buildVehicleRoutes(options).routes.length, 1);
  assert.deepEqual(buildVehicleRoutes({ ...options, lineVehicleIds: [1] }).routes, []);
});

// The extracted dataset carries no DLC or Workshop vehicle, so an unknown model
// must be judged on its route; a model that declares gravel must not be.
test('a declared cargo type rules a vehicle out, an unknown model does not', () => {
  const buildings = [stop(10), stop(11)];
  const gravel = vehicle(1, 'tipper', [10, 11],
    { modelFacts: { transportType: 'RESOURCE_TRANSPORT_GRAVEL' } });
  const bus = vehicle(2, 'bus_ikr_55', [10, 11],
    { modelFacts: { transportType: 'RESOURCE_TRANSPORT_PASSANGER', name: 'Ikarus 55' } });
  const mod = vehicle(3, '3695353480/peckett', [10, 11]);

  const { routes } = buildVehicleRoutes({ vehicles: [gravel, bus, mod], buildings });

  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].vehicleIds, [2, 3]);
  assert.equal(routes[0].name, 'Ikarus 55', 'the resolved model name is preferred over the raw id');
});

test('the busiest service comes first', () => {
  const { routes } = buildVehicleRoutes({
    vehicles: [
      vehicle(1, 'bus', [10, 11]),
      vehicle(2, 'cabin', [12, 13]), vehicle(3, 'cabin', [12, 13]), vehicle(4, 'cabin', [12, 13]),
    ],
    buildings: [stop(10), stop(11), stop(12), stop(13)],
  });

  assert.deepEqual(routes.map(route => route.vehicleIds.length), [3, 1]);
});

test('no vehicles means no routes rather than a failure', () => {
  assert.deepEqual(buildVehicleRoutes({}).routes, []);
});
