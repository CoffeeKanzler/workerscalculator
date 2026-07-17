const ECON_TOKENS = new Set([
  'NAME', 'NAME_STR', 'WORKERS_NEEDED', 'PROFESORS_NEEDED', 'PRODUCTION',
  'CONSUMPTION', 'CONSUMPTION_PER_SECOND', 'CITIZEN_ABLE_SERVE',
  'QUALITY_OF_LIVING', 'ATTRACTIVE_SCORE', 'STORAGE', 'COST_RESOURCE',
  'ELETRIC_CONSUMPTION_LIGHTING_WORKER_FACTOR',
  'ELETRIC_CONSUMPTION_LIVING_WORKER_FACTOR',
  'ELETRIC_CONSUMPTION_HEATING_WORKER_FACTOR',
]);

export function workshopBuildingIdentity(relativePath) {
  const parts = String(relativePath).replaceAll('\\', '/').split('/').filter(Boolean);
  const appIndex = parts.indexOf('784150');
  const index = appIndex >= 0
    ? parts.findIndex((part, position) => position > appIndex && /^\d{6,20}$/.test(part))
    : parts.findIndex(part => /^\d{6,20}$/.test(part));
  if (index < 0 || parts.at(-1)?.toLowerCase() !== 'building.ini') return null;
  const workshopId = parts[index];
  const modPath = parts.slice(index + 1, -1).join('/') || '.';
  return { workshopId, modPath, id: `${workshopId}/${modPath}` };
}

export function parseWorkshopBuildingIni(text, id, identity = workshopBuildingIdentity(`${id}/building.ini`)) {
  const building = {
    id, nameId: null, types: [], workers: 0, professors: 0,
    production: {}, consumption: {}, consumptionPerSecond: {}, livingSpace: 0, citizenAbleServe: 0,
    qualityOfLiving: null, attractiveScore: null, storages: {},
    constructionResources: {}, electricWorkerFactors: {},
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('$')) continue;
    const type = /^\$(TYPE_[A-Z_]+|SUBTYPE_[A-Z_]+|CIVIL_BUILDING)\b/.exec(line);
    if (type) {
      building.types.push(type[1]);
      continue;
    }
    const parts = line.slice(1).match(/"[^"]*"|\S+/g) ?? [];
    const [key, ...args] = parts;
    if (!ECON_TOKENS.has(key)) continue;
    const number = index => Number.parseFloat(args[index]);
    if (key === 'NAME_STR' && args.length) building.nameStr = args.join(' ').replace(/^"|"$/g, '');
    else if (key === 'NAME' && args.length && Number.isFinite(number(0))) building.nameId = Number.parseInt(args[0], 10);
    else if (key === 'WORKERS_NEEDED' && Number.isFinite(number(0))) building.workers = number(0);
    else if (key === 'PROFESORS_NEEDED' && Number.isFinite(number(0))) building.professors = number(0);
    else if (key === 'PRODUCTION' && args[0] && Number.isFinite(number(1))) building.production[args[0]] = number(1);
    else if (key === 'CONSUMPTION' && args[0] && Number.isFinite(number(1))) {
      building.consumption[args[0]] = number(1);
    } else if (key === 'CONSUMPTION_PER_SECOND' && args[0] && Number.isFinite(number(1))) {
      building.consumptionPerSecond[args[0]] = number(1);
    }
    else if (key === 'CITIZEN_ABLE_SERVE' && Number.isFinite(number(0))) building.citizenAbleServe = number(0);
    else if (key === 'QUALITY_OF_LIVING' && Number.isFinite(number(0))) building.qualityOfLiving = number(0);
    else if (key === 'ATTRACTIVE_SCORE' && Number.isFinite(number(0))) building.attractiveScore = number(0);
    else if (key === 'STORAGE' && args[0] && Number.isFinite(number(1))) {
      building.storages[args[0]] = (building.storages[args[0]] ?? 0) + number(1);
      if (args[0] === 'RESOURCE_TRANSPORT_PASSANGER') building.livingSpace += number(1);
    } else if (key === 'COST_RESOURCE' && args[0] && Number.isFinite(number(1))) {
      building.constructionResources[args[0]] = (building.constructionResources[args[0]] ?? 0) + number(1);
    } else if (key.startsWith('ELETRIC_CONSUMPTION_') && key.endsWith('_WORKER_FACTOR')
      && Number.isFinite(number(0))) {
      const kind = key.slice('ELETRIC_CONSUMPTION_'.length, -'_WORKER_FACTOR'.length).toLowerCase();
      building.electricWorkerFactors[kind] = number(0);
    }
  }
  if (identity) Object.assign(building, {
    workshopId: identity.workshopId,
    modPath: identity.modPath,
  });
  return building;
}
