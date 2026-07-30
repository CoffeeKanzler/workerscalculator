import test from 'node:test';
import assert from 'node:assert/strict';

import { composeServices, indexServices, transitReachFrom } from '../js/models/transit_reach.js';

// A walking search result in the shape walkingReachFrom returns.
function walk(...pairs) {
  return {
    available: true,
    budgetMeters: 480,
    buildings: new Map(pairs.map(([index, distanceMeters = 100]) => [index, {
      buildingIndex: index, distanceMeters, budgetUsed: distanceMeters,
      limitingSurface: 'asphalt', limitingEdgeId: 0,
    }])),
  };
}

test('services are composed from lines, vehicle routes and cables alike', () => {
  const services = composeServices({
    vehicleLines: [{ slot: 0, name: 'Bus', stopIds: [1, 2], vehicleIds: [9] }],
    vehicleRoutes: {
      routes: [{ id: 'route:3-4', stopIds: [3, 4], stopSignature: '3-4', vehicleIds: [1], name: 'Peckett' }],
    },
    cablewayRoutes: { routes: [{ id: 'cableway:0', stationIndices: [5, 6], lengthMeters: 200 }] },
    cablewayLabel: 'Cableway',
  });

  assert.deepEqual(services.map(service => `${service.name}/${service.mode ?? 'line'}`),
    ['Bus/line', 'Peckett/vehicleRoute', 'Cableway 1/cableway']);
});

test('a cable already run by its cabins is not composed twice', () => {
  const services = composeServices({
    vehicleRoutes: {
      routes: [{ id: 'route:5-6', stopIds: [5, 6], stopSignature: '5-6', vehicleIds: [1], name: 'Cabin' }],
    },
    cablewayRoutes: { routes: [{ id: 'cableway:0', stationIndices: [5, 6], lengthMeters: 200 }] },
  });

  assert.deepEqual(services.map(service => service.mode), ['vehicleRoute']);
});

test('a service with fewer than two stops reaches nothing', () => {
  assert.deepEqual(composeServices({ vehicleLines: [{ slot: 0, stopIds: [1, -1] }] }), []);
});

test('a stop nobody can walk to serves nobody', () => {
  const services = [{ slot: 0, stopIds: [1, 2] }];

  const attached = indexServices(services, () => true);
  const detached = indexServices(services, stop => stop !== 2);

  assert.deepEqual([...attached.stopIndices].sort(), [1, 2]);
  assert.deepEqual([...detached.stopIndices], [1], 'the unattached station drops out');
});

test('riding reaches what walking alone never does', () => {
  // Home walks to stop 1; the service runs 1 to 2; the mine is a walk from 2.
  const reaches = new Map([
    [10, walk([1, 80])],
    [1, walk([10, 80])],
    [2, walk([20, 120])],
    [20, walk([2, 120])],
  ]);
  const index = indexServices([{ slot: 0, stopIds: [1, 2] }]);

  const reach = transitReachFrom(10, { reachOf: key => reaches.get(key), ...index });

  assert.equal(reach.available, true);
  assert.deepEqual([...reach.walk.keys()], [1], 'on foot, only the stop');
  assert.deepEqual([...reach.transit.keys()].sort((a, b) => a - b), [2, 20],
    'the far stop and the mine beyond it');
  assert.deepEqual([...reach.serviceSlots], [0]);
  assert.equal(reach.transit.get(20).alightStop, 2);
  assert.equal(reach.transit.get(20).distanceMeters, 120, 'the last walk, not the ride');
  assert.equal(reach.transit.get(2).distanceMeters, 0, 'the stop itself needs no walk');
});

test('what is already within walking distance is not reported as a ride', () => {
  const reaches = new Map([
    [10, walk([1, 80], [2, 200], [20, 300])],
    [1, walk([10, 80])],
    [2, walk([20, 120])],
  ]);
  const index = indexServices([{ slot: 0, stopIds: [1, 2] }]);

  const reach = transitReachFrom(10, { reachOf: key => reaches.get(key), ...index });

  assert.equal(reach.transit.size, 0, 'everything the service reaches was already walkable');
});

test('one change is allowed and a second is not', () => {
  const reaches = new Map([
    [10, walk([1, 50])],
    [1, walk()],
    [2, walk()],
    [3, walk()],
    [4, walk([40, 90])],
    [5, walk([50, 90])],
    [40, walk()],
    [50, walk()],
  ]);
  const index = indexServices([
    { slot: 'a', stopIds: [1, 2] },
    { slot: 'b', stopIds: [2, 3, 4] },
    { slot: 'c', stopIds: [5] },
    { slot: 'd', stopIds: [4, 5] },
  ]);

  const reach = transitReachFrom(10, { reachOf: key => reaches.get(key), ...index });

  assert.deepEqual([...reach.serviceSlots].sort(), ['a', 'b'],
    'boarded a, changed once onto b, and stopped there');
  assert.ok(reach.transit.has(40), 'the far end of the second service is reached');
  assert.ok(!reach.transit.has(50), 'a third service would be a second change');
});

test('a building bound to nothing reaches nothing at all', () => {
  const reach = transitReachFrom(99, {
    reachOf: () => ({ available: false, buildings: new Map() }),
    ...indexServices([{ slot: 0, stopIds: [1, 2] }]),
  });

  assert.equal(reach.available, false);
  assert.equal(reach.transit.size, 0);
});

test('a republic with no services reaches only what it can walk to', () => {
  const reaches = new Map([[10, walk([11, 60])]]);

  const reach = transitReachFrom(10, {
    reachOf: key => reaches.get(key), ...indexServices([]),
  });

  assert.equal(reach.available, true);
  assert.equal(reach.transit.size, 0);
  assert.deepEqual([...reach.walk.keys()], [11]);
});
