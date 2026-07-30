// Public transport that no line describes.
//
// A player does not have to create a line to move people. Every vehicle can be
// given a route of its own, and the save writes it: `routeTargetBuildingIndices`
// on the vehicle record is the ordered list of buildings it is told to call at.
// On the republic this was found with, exactly four vehicles out of 1341 are
// assigned to a line, while 428 carry a route — including four steam locomotives
// shuttling between the two passenger rail stations, four buses, and the 152
// cableway cabins. Reading only lines.bin saw none of it.
//
// A call that matters for worker access is a call at a passenger stop, which the
// save's own asset type identifies (savedTypePlusOne 2 — bus and tram stops,
// passenger rail platforms, metro entrances, cableway stations, heliports).
// Vehicles sharing the same set of stops are one service, which is what a line
// would have been.
import { isPassengerStation } from './cableway_access.js?v=3';

// Where the model of a vehicle is known, a declared cargo type rules it out; the
// extracted dataset has no DLC or Workshop vehicles in it, so an unknown model
// is judged on its route alone rather than dropped.
const PASSENGER_TRANSPORT = 'RESOURCE_TRANSPORT_PASSANGER';

function carriesPassengers(vehicle) {
  const declared = vehicle?.modelFacts?.transportType;
  return !declared || declared === PASSENGER_TRANSPORT;
}

function stopsOf(vehicle, byIndex) {
  const stops = [];
  for (const target of vehicle?.routeTargetBuildingIndices ?? []) {
    if (!Number.isInteger(target) || target < 0 || stops.includes(target)) continue;
    if (!isPassengerStation(byIndex.get(target))) continue;
    stops.push(target);
  }
  return stops;
}

export function buildVehicleRoutes({
  vehicles = [],
  buildings = [],
  lineVehicleIds = [],
  nameFor = null,
} = {}) {
  const byIndex = new Map(buildings.map(building => [building.index, building]));
  // A vehicle already assigned to a line is described by that line; counting its
  // route as well would draw the same service twice.
  const onLine = new Set(lineVehicleIds ?? []);
  const grouped = new Map();
  let routedVehicles = 0;
  for (const vehicle of vehicles) {
    if (onLine.has(vehicle?.id) || !carriesPassengers(vehicle)) continue;
    const stops = stopsOf(vehicle, byIndex);
    if (stops.length < 2) continue;
    routedVehicles += 1;
    const signature = [...stops].sort((a, b) => a - b).join('-');
    if (!grouped.has(signature)) {
      grouped.set(signature, {
        id: `route:${signature}`,
        stopIds: stops,
        stopSignature: signature,
        vehicleIds: [],
        mode: 'vehicleRoute',
        name: nameFor?.(vehicle) ?? vehicle.modelFacts?.name ?? vehicle.model ?? null,
      });
    }
    grouped.get(signature).vehicleIds.push(vehicle.id);
  }
  const routes = [...grouped.values()]
    .sort((a, b) => b.vehicleIds.length - a.vehicleIds.length
      || a.stopIds[0] - b.stopIds[0]);
  return {
    routes,
    completeness: {
      vehicleCount: vehicles.length,
      routedVehicles,
      routeCount: routes.length,
      servedStopCount: new Set(routes.flatMap(route => route.stopIds)).size,
    },
  };
}
