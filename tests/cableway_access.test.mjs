import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CABLEWAY_NETWORK_CLASS, PASSENGER_STATION_SAVED_TYPE,
  buildCablewayRoutes, cablewayEdgeIdsOf, isPassengerStation,
} from '../js/models/cableway_access.js';

// cableway.bin is written the way the real saves write it: every span is its own
// pair of nodes, so nothing in the file itself joins one span to the next.
function spans(count, { length = 300 } = {}) {
  return {
    nodes: Array.from({ length: count * 2 }, (_, index) => ({ id: index, x: index, y: 0, z: 0 })),
    edges: Array.from({ length: count }, (_, index) => ({
      id: index, from: index * 2, to: index * 2 + 1, length,
      networkClass: CABLEWAY_NETWORK_CLASS, surfaceType: 10, surfaceSubtype: 0,
    })),
  };
}

function carrier(index, edgeIds, { station = false } = {}) {
  return {
    index,
    savedTypePlusOne: station ? PASSENGER_STATION_SAVED_TYPE : 12,
    connections: [{
      kind: 9,
      references: edgeIds.map(id => ({ id, networkClass: CABLEWAY_NETWORK_CLASS })),
    }],
  };
}

test('cableway references are read out of the connection slots and nowhere else', () => {
  const building = {
    connections: [
      { kind: 0, references: [{ id: 7, networkClass: 0 }] },
      { kind: 9, references: [{ id: 3, networkClass: CABLEWAY_NETWORK_CLASS }, { id: 3, networkClass: CABLEWAY_NETWORK_CLASS }] },
      { kind: 1, references: [{ id: 9, networkClass: 1 }] },
    ],
  };

  assert.deepEqual(cablewayEdgeIdsOf(building), [3], 'road and rail slots are not cableway spans');
  assert.deepEqual(cablewayEdgeIdsOf({ cablewayEdgeIds: [4, 5] }), [4, 5],
    'a snapshot carries the list it already resolved');
  assert.deepEqual(cablewayEdgeIdsOf(null), []);
});

test('the save asset type tells a station from a pylon', () => {
  assert.equal(isPassengerStation({ savedTypePlusOne: 2 }), true);
  assert.equal(isPassengerStation({ savedTypePlusOne: 12 }), false);
  assert.equal(isPassengerStation({}), false);
});

test('a route is the run of spans joined by the pylons that carry them', () => {
  const network = spans(3);
  const buildings = [
    carrier(10, [0], { station: true }),
    carrier(11, [0, 1]),
    carrier(12, [1, 2]),
    carrier(13, [2], { station: true }),
  ];

  const { routes, completeness } = buildCablewayRoutes(network, buildings);

  assert.equal(routes.length, 1, 'three spans on one cable are one route');
  assert.deepEqual(routes[0].edgeIds, [0, 1, 2]);
  assert.deepEqual(routes[0].stationIndices, [10, 13]);
  assert.equal(routes[0].lengthMeters, 900);
  assert.deepEqual(completeness,
    { edgeCount: 3, attachedBuildings: 4, stationCount: 2, danglingReferences: 0 });
});

test('two cables that share no pylon stay two routes', () => {
  const network = spans(2);
  const buildings = [
    carrier(1, [0], { station: true }), carrier(2, [0], { station: true }),
    carrier(3, [1], { station: true }), carrier(4, [1], { station: true }),
  ];

  const { routes } = buildCablewayRoutes(network, buildings);

  assert.equal(routes.length, 2);
  assert.deepEqual(routes.map(route => route.stationIndices), [[1, 2], [3, 4]]);
});

test('changing cable is possible where one station serves both', () => {
  const network = spans(2);
  const buildings = [
    carrier(1, [0], { station: true }),
    carrier(2, [0, 1], { station: true }),
    carrier(3, [1], { station: true }),
  ];

  const { routes } = buildCablewayRoutes(network, buildings);

  assert.equal(routes.length, 1, 'a station carrying both cables joins them into one route');
  assert.deepEqual(routes[0].stationIndices, [1, 2, 3]);
});

// A pylon line still under construction reaches no passenger, and drawing it as
// a corridor would claim transport where there is none to board.
test('a cable with fewer than two stations is not a corridor', () => {
  const network = spans(2);
  const buildings = [carrier(1, [0], { station: true }), carrier(2, [0, 1]), carrier(3, [1])];

  assert.deepEqual(buildCablewayRoutes(network, buildings).routes, []);
});

test('a save without a cableway file reports no routes rather than failing', () => {
  assert.deepEqual(buildCablewayRoutes(null, []).routes, []);
  assert.deepEqual(buildCablewayRoutes({ nodes: [], edges: [] }, []).routes, []);
});

test('a reference into a span the file does not contain is counted, not guessed at', () => {
  const network = spans(1);
  const buildings = [
    carrier(1, [0], { station: true }),
    carrier(2, [0, 99], { station: true }),
  ];

  const { routes, completeness } = buildCablewayRoutes(network, buildings);

  assert.equal(completeness.danglingReferences, 1);
  assert.deepEqual(routes[0].stationIndices, [1, 2]);
});

test('only cableway-class edges are taken from the file', () => {
  const network = spans(1);
  network.edges.push({
    id: 50, from: 0, to: 1, length: 10, networkClass: 0, surfaceType: 0, surfaceSubtype: 0,
  });
  const buildings = [carrier(1, [0], { station: true }), carrier(2, [0], { station: true })];

  const { routes, completeness } = buildCablewayRoutes(network, buildings);

  assert.equal(completeness.edgeCount, 1);
  assert.deepEqual(routes[0].edgeIds, [0]);
});
