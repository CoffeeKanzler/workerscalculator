import {
  WALKING_BUDGET_METRES, buildWalkingNetwork, walkingReachFrom,
} from './walking_access.js?v=6';
import { composeServices, indexServices, transitReachFrom } from './transit_reach.js?v=2';

// The access corridor a worker can actually use: walk, or walk to a saved stop,
// ride a saved line in its saved stop order, change at most once, and walk the
// last leg. Every leg here comes from the save — the walking legs from the
// pedestrian network and the buildings' own connection slots, the riding legs
// from lines.bin. Nothing is inferred from proximity or from a straight line.
const STAGE = Object.freeze({
  residence: 0, board: 1, firstLine: 2, transfer: 3, secondLine: 4, alight: 5, workplace: 6,
});

// "Building 464" is the game's auto-generated instance name and says nothing;
// what a reader needs on a node is "Kindergarten". The caller supplies the
// localised type name, and an instance name is only used when the player
// actually chose one.
const AUTO_INSTANCE_NAME = /^building\s*\d+$/i;

function makeDisplayName(labelFor) {
  return building => {
    const typeName = String(labelFor?.(building) ?? '').trim();
    const given = String(building?.name ?? '').trim();
    if (typeName && (!given || AUTO_INSTANCE_NAME.test(given))) return typeName;
    if (typeName && given) return `${typeName} · ${given}`;
    return given || String(building?.type ?? '').trim() || `#${building?.index}`;
  };
}

function workerSlots(building) {
  const configured = (building?.configuredWorkers ?? 0) + (building?.configuredWorkersHighEducation ?? 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

function walkEdge(id, source, target, reach) {
  return {
    id, source, target, kind: 'walk', evidence: 'exact',
    distanceMeters: reach.distanceMeters,
    pathType: reach.limitingSurface ?? 'direct',
    budgetUsedMeters: reach.budgetUsed,
    limitingEdgeId: reach.limitingEdgeId,
  };
}

// One search per building, reused for every corridor that starts there. A
// republic has a few hundred of these and each is bounded by the walking
// budget, so the whole set costs less than a frame.
function reachCache(network) {
  const cache = new Map();
  return index => {
    if (!cache.has(index)) cache.set(index, walkingReachFrom(network, index));
    return cache.get(index);
  };
}

export function buildWorkerAccessEvidence({
  pedestrianNetwork = null,
  buildings = [],
  residenceOccupancy = null,
  vehicleLines = null,
  vehicleRoutes = null,
  cablewayRoutes = null,
  cablewayLabel = null,
  labelFor = null,
  maxDirectEdgesPerResidence = 60,
  maxWalkEdgesPerStop = 60,
} = {}) {
  const displayName = makeDisplayName(labelFor);
  const unavailable = reason => ({
    completeness: 'unavailable', walkingEdgesComplete: false, reason,
    nodes: [], edges: [], summary: null,
  });
  // Either a bare footpath network or the { pedestrian, road } pair the import
  // supplies; walking uses both.
  const hasEdges = pedestrianNetwork?.edges?.length
    || pedestrianNetwork?.pedestrian?.edges?.length || pedestrianNetwork?.road?.edges?.length;
  if (!hasEdges) return unavailable('pedestrian-network-missing');

  const byIndex = new Map(buildings.map(building => [building.index, building]));
  const network = buildWalkingNetwork(pedestrianNetwork, buildings);
  if (!network.completeness.walkingEdgesComplete) {
    return { ...unavailable('walking-evidence-incomplete'), summary: network.completeness };
  }

  const adultsByResidence = new Map();
  for (const row of residenceOccupancy ?? []) {
    const people = Number.isFinite(row.adults) ? row.adults : row.residents;
    if (people > 0) adultsByResidence.set(row.buildingIndex, people);
  }
  const workplaceIndices = new Set(buildings
    .filter(building => workerSlots(building) > 0 && network.buildingEdges.has(building.index))
    .map(building => building.index));

  // Saved lines, the routes individual vehicles carry, and cableway routes that
  // nothing schedules — composed once, so the map overlay and this graph answer
  // with the same set of services. See models/transit_reach.js.
  const lines = composeServices({ vehicleLines, vehicleRoutes, cablewayRoutes, cablewayLabel });
  const routeLines = lines.filter(line => line.mode === 'vehicleRoute');
  const cablewayLines = lines.filter(line => line.mode === 'cableway');
  const { stopIndices, servicesByStop: linesByStop, bySlot } =
    indexServices(lines, stop => network.buildingEdges.has(stop));

  const nodes = new Map();
  const edges = [];
  const addNode = (id, node) => {
    if (!nodes.has(id)) nodes.set(id, { id, ...node });
    return id;
  };
  const reachOf = reachCache(network);

  const residenceIds = new Map();
  for (const [index, people] of adultsByResidence) {
    if (!network.buildingEdges.has(index)) continue;
    const building = byIndex.get(index);
    if (!building) continue;
    residenceIds.set(index, addNode(`residence:${index}`, {
      kind: 'residence', stage: STAGE.residence, label: displayName(building),
      buildingIndex: index, people,
    }));
  }
  const workplaceIds = new Map();
  for (const index of workplaceIndices) {
    const building = byIndex.get(index);
    workplaceIds.set(index, addNode(`workplace:${index}`, {
      kind: 'workplace', stage: STAGE.workplace, label: displayName(building),
      buildingIndex: index, workerSlots: workerSlots(building),
    }));
  }

  const stopNode = (index, role, stage) => {
    const building = byIndex.get(index);
    return addNode(`stop:${index}:${role}`, {
      kind: role === 'transfer' ? 'transfer' : 'stop', stage,
      label: displayName(building), buildingIndex: index,
      lineCount: linesByStop.get(index)?.length ?? 0,
    });
  };
  const lineNode = (line, leg) => addNode(`line:${line.slot}:${leg}`, {
    kind: 'line', stage: leg === 1 ? STAGE.firstLine : STAGE.secondLine,
    label: String(line.name ?? '').trim() || `#${line.slot + 1}`,
    mode: line.mode ?? 'vehicle',
    lineSlot: line.slot,
    stopCount: (line.stopIds ?? []).filter(stop => stop >= 0).length,
    vehicleCount: (line.vehicleIds ?? []).length,
  });

  // Who can get to a given building, counted from the other end. The graph
  // answers "where can this residence reach"; a player looking at a farm wants
  // the reverse, and the two are not the same question because the walking rule
  // is not symmetric — a leg that is refused uphill of a dirt path is allowed
  // in the other order. So this is accumulated from the residence searches that
  // were run anyway, never by reversing one of them.
  const catchment = new Map();
  const catchmentEntry = index => {
    if (!catchment.has(index)) {
      catchment.set(index, {
        buildingIndex: index, walkAdults: 0, walkResidences: 0,
        transitAdults: 0, transitResidences: 0, transitLineSlots: new Set(),
      });
    }
    return catchment.get(index);
  };

  // Direct walking. This is the corridor most workers actually use, so it is
  // built first and never truncated below the nearest workplaces.
  let truncatedResidences = 0;
  for (const [index, sourceId] of residenceIds) {
    const reach = reachOf(index);
    if (!reach.available) continue;
    const people = nodes.get(sourceId).people;
    for (const entry of reach.buildings.values()) {
      const row = catchmentEntry(entry.buildingIndex);
      row.walkAdults += people;
      row.walkResidences += 1;
    }
    const targets = [...reach.buildings.values()]
      .filter(entry => workplaceIds.has(entry.buildingIndex))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    if (targets.length > maxDirectEdgesPerResidence) truncatedResidences += 1;
    for (const entry of targets.slice(0, maxDirectEdgesPerResidence)) {
      edges.push({
        ...walkEdge(`walk:${index}:${entry.buildingIndex}`, sourceId,
          workplaceIds.get(entry.buildingIndex), entry),
        capacityUpperBound: Math.min(
          nodes.get(sourceId).people,
          nodes.get(workplaceIds.get(entry.buildingIndex)).workerSlots,
        ),
      });
    }
    for (const entry of reach.buildings.values()) {
      if (!stopIndices.has(entry.buildingIndex)) continue;
      const boardId = stopNode(entry.buildingIndex, 'board', STAGE.board);
      edges.push({
        ...walkEdge(`walk:${index}:stop:${entry.buildingIndex}`, sourceId, boardId, entry),
        capacityUpperBound: nodes.get(sourceId).people,
      });
    }
  }

  // Riding legs. A line's saved stop order is kept exactly as written; the
  // vehicles run it as a cycle, so any stop on a line can be left at any other.
  const alightIds = new Map();
  for (const line of lines) {
    const served = line.stopIds.filter(stop => stop >= 0 && stopIndices.has(stop));
    const boarded = served.filter(stop => nodes.has(`stop:${stop}:board`));
    if (!boarded.length) continue;
    const firstLeg = lineNode(line, 1);
    for (const stop of boarded) {
      edges.push({
        id: `board:${stop}:${line.slot}`, source: `stop:${stop}:board`, target: firstLeg,
        kind: 'board', evidence: 'exact',
      });
    }
    for (const stop of served) {
      // Riding back to the stop you boarded at reaches nothing the walk from
      // the residence did not already reach.
      if (boarded.length === 1 && boarded[0] === stop) continue;
      const alightId = stopNode(stop, 'alight', STAGE.alight);
      alightIds.set(stop, alightId);
      edges.push({
        id: `alight:${line.slot}:${stop}`, source: firstLeg, target: alightId,
        kind: 'ride', evidence: 'exact', stopOrder: line.stopIds.indexOf(stop),
      });
      const otherSlots = (linesByStop.get(stop) ?? []).filter(slot => slot !== line.slot);
      if (!otherSlots.length) continue;
      const transferId = stopNode(stop, 'transfer', STAGE.transfer);
      edges.push({
        id: `transfer:${line.slot}:${stop}`, source: firstLeg, target: transferId,
        kind: 'transfer', evidence: 'exact',
      });
      for (const slot of otherSlots) {
        const second = bySlot.get(slot);
        if (!second) continue;
        const secondLeg = lineNode(second, 2);
        edges.push({
          id: `board:${stop}:${slot}:2`, source: transferId, target: secondLeg,
          kind: 'board', evidence: 'exact',
        });
        for (const target of second.stopIds) {
          if (target < 0 || target === stop || !stopIndices.has(target)) continue;
          const targetId = stopNode(target, 'alight', STAGE.alight);
          alightIds.set(target, targetId);
          edges.push({
            id: `alight:${slot}:${target}:2`, source: secondLeg, target: targetId,
            kind: 'ride', evidence: 'exact', stopOrder: second.stopIds.indexOf(target),
          });
        }
      }
    }
  }

  // The last leg: a stop reached by transit starts its own walking search.
  for (const [stop, alightId] of alightIds) {
    const reach = reachOf(stop);
    if (!reach.available) continue;
    const targets = [...reach.buildings.values()]
      .filter(entry => workplaceIds.has(entry.buildingIndex))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, maxWalkEdgesPerStop);
    for (const entry of targets) {
      edges.push({
        ...walkEdge(`walk:stop:${stop}:${entry.buildingIndex}`, alightId,
          workplaceIds.get(entry.buildingIndex), entry),
        capacityUpperBound: nodes.get(workplaceIds.get(entry.buildingIndex)).workerSlots,
      });
    }
  }

  // The transit half of the catchment: the same walk-ride-change-walk rule the
  // map's click overlay answers with, so the two can never disagree.
  const services = { reachOf, stopIndices, servicesByStop: linesByStop, bySlot };
  for (const [index, sourceId] of residenceIds) {
    const reach = transitReachFrom(index, services);
    if (!reach.available || !reach.transit.size) continue;
    const people = nodes.get(sourceId).people;
    for (const target of reach.transit.keys()) {
      const row = catchmentEntry(target);
      row.transitAdults += people;
      row.transitResidences += 1;
      for (const slot of reach.serviceSlots) row.transitLineSlots.add(slot);
    }
  }

  const connected = new Set();
  for (const edge of edges) { connected.add(edge.source); connected.add(edge.target); }
  const keptNodes = [...nodes.values()].filter(node => connected.has(node.id));
  const keptIds = new Set(keptNodes.map(node => node.id));
  const keptEdges = edges.filter(edge => keptIds.has(edge.source) && keptIds.has(edge.target));

  return {
    completeness: 'complete',
    walkingEdgesComplete: true,
    reason: null,
    nodes: keptNodes,
    edges: keptEdges,
    catchment,
    // Kept so the map's click overlay answers with the same services this graph
    // was built from, rather than composing its own set.
    services: { services: lines, stopIndices, servicesByStop: linesByStop, bySlot },
    summary: {
      walkingBudgetMeters: WALKING_BUDGET_METRES,
      residenceCount: keptNodes.filter(node => node.kind === 'residence').length,
      workplaceCount: keptNodes.filter(node => node.kind === 'workplace').length,
      stopCount: keptNodes.filter(node => node.kind === 'stop').length,
      transferCount: keptNodes.filter(node => node.kind === 'transfer').length,
      lineCount: keptNodes.filter(node => node.kind === 'line').length,
      cablewayLineCount: keptNodes.filter(node => node.mode === 'cableway').length,
      cablewayRouteCount: cablewayLines.length,
      vehicleRouteCount: routeLines.length,
      walkEdgeCount: keptEdges.filter(edge => edge.kind === 'walk').length,
      truncatedResidences,
      ...network.completeness,
    },
  };
}
