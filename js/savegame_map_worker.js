import { parseRoadNetwork, parseHeightmapWater, parsePollution } from './savegame.js?v=38';

// The heightmap needs the buildings' own saved heights to place sea level, so
// each source is parsed with the whole payload in reach rather than the file
// alone. See models/water_level.js.
const sources = [
  ['road', 'roadNetwork', buffer => parseRoadNetwork(buffer)],
  ['rail', 'railNetwork', buffer => parseRoadNetwork(buffer)],
  ['pedestrian', 'pedestrianNetwork', buffer => parseRoadNetwork(buffer)],
  ['cableway', 'cablewayNetwork', buffer => parseRoadNetwork(buffer)],
  ['powerHigh', 'powerHighNetwork', buffer => parseRoadNetwork(buffer)],
  ['powerLow', 'powerLowNetwork', buffer => parseRoadNetwork(buffer)],
  ['heightmap', 'terrainWater', (buffer, data) =>
    parseHeightmapWater(buffer, { buildingHeights: data.buildingHeights ?? null })],
];

self.onmessage = async ({ data }) => {
  const parsed = {};
  const sourceStatus = {};
  const warnings = [];
  for (const [key, outputKey, parse] of sources) {
    const file = data[key];
    if (!file) {
      sourceStatus[key] = 'missing';
      parsed[outputKey] = null;
      continue;
    }
    try {
      self.postMessage({ type: 'progress', file: key, phase: 'reading' });
      const buffer = await file.arrayBuffer();
      self.postMessage({ type: 'progress', file: key, phase: 'parsing' });
      parsed[outputKey] = parse(buffer, data);
      sourceStatus[key] = 'exact';
      self.postMessage({ type: 'progress', file: key, phase: 'complete' });
    } catch (error) {
      parsed[outputKey] = null;
      sourceStatus[key] = 'failed';
      warnings.push({ file: key, message: error.message });
    }
  }
  const pollutionFile = data.pollution;
  if (!pollutionFile) {
    sourceStatus.pollution = 'missing';
    parsed.pollutionLayer = null;
  } else {
    try {
      self.postMessage({ type: 'progress', file: 'pollution', phase: 'reading' });
      const buffer = await pollutionFile.arrayBuffer();
      self.postMessage({ type: 'progress', file: 'pollution', phase: 'parsing' });
      parsed.pollutionLayer = parsePollution(buffer, {
        worldBounds: parsed.terrainWater?.worldBounds,
      });
      sourceStatus.pollution = parsed.pollutionLayer ? 'exact' : 'missing';
      self.postMessage({ type: 'progress', file: 'pollution', phase: 'complete' });
    } catch (error) {
      parsed.pollutionLayer = null;
      sourceStatus.pollution = 'failed';
      warnings.push({ file: 'pollution', message: error.message });
    }
  }
  self.postMessage({ type: 'complete', parsed, sourceStatus, warnings });
};
