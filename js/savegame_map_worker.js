import { parseRoadNetwork, parseHeightmapWater, parsePollution } from './savegame.js?v=23';

const sources = [
  ['road', 'roadNetwork', parseRoadNetwork],
  ['rail', 'railNetwork', parseRoadNetwork],
  ['pedestrian', 'pedestrianNetwork', parseRoadNetwork],
  ['heightmap', 'terrainWater', parseHeightmapWater],
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
      parsed[outputKey] = parse(buffer);
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
