export function citizenProductivity(citizen) {
  const base = 0.5 * (
    0.6 * citizen.food
    + 0.5 * citizen.health
    + 1.8 * citizen.happiness
    - 0.675
  );
  return Math.max(0.3, base * (0.65 + 0.7 * citizen.loyalty));
}

function average(total, count) {
  return count ? total / count : 0;
}

export function aggregateCitizensByScope(citizens, buildings) {
  const buildingsByIndex = new Map(buildings.map((building) => [building.index, building]));
  const scopes = new Map();
  let unassigned = 0;
  let invalidResidenceRefs = 0;

  for (const citizen of citizens) {
    if (citizen.residenceBuildingIndex < 0) {
      unassigned += 1;
      continue;
    }

    const residence = buildingsByIndex.get(citizen.residenceBuildingIndex);
    if (!residence) {
      invalidResidenceRefs += 1;
      continue;
    }
    if (!Number.isInteger(residence.scopeId)) {
      unassigned += 1;
      continue;
    }

    const aggregate = scopes.get(residence.scopeId) || {
      residents: 0,
      adults: 0,
      highEducation: 0,
      productivity: 0,
      happiness: 0,
      food: 0,
      health: 0,
      loyalty: 0,
    };
    aggregate.residents += 1;
    aggregate.adults += citizen.age > 21 ? 1 : 0;
    aggregate.highEducation += citizen.education >= 2 ? 1 : 0;
    aggregate.productivity += citizenProductivity(citizen);
    aggregate.happiness += citizen.happiness;
    aggregate.food += citizen.food;
    aggregate.health += citizen.health;
    aggregate.loyalty += citizen.loyalty;
    scopes.set(residence.scopeId, aggregate);
  }

  for (const aggregate of scopes.values()) {
    const count = aggregate.residents;
    aggregate.productivity = average(aggregate.productivity, count);
    aggregate.happiness = average(aggregate.happiness, count);
    aggregate.food = average(aggregate.food, count);
    aggregate.health = average(aggregate.health, count);
    aggregate.loyalty = average(aggregate.loyalty, count);
  }

  return {
    scopes,
    unassigned,
    invalidResidenceRefs,
    recordCount: citizens.length,
  };
}

export function compactObservedBuildings(buildings) {
  const keys = [
    'index', 'type', 'name', 'scopeId', 'x', 'y', 'z', 'currentWorkers',
    'configuredWorkers', 'configuredWorkersHighEducation', 'mineQuality',
  ];
  return buildings.map((building) => Object.fromEntries(
    keys.map((key) => [key, building[key]]),
  ));
}
