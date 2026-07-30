// The deferred map pass parses these after the core import returns, so a
// failure here leaves the republic intact and only the map degraded.
export const MAP_LAYER_KEYS = Object.freeze([
  'road', 'rail', 'pedestrian', 'cableway', 'heightmap', 'pollution',
]);

const LAYER_SET = new Set(MAP_LAYER_KEYS);

// Binary layouts are read at fixed offsets, and those offsets are tied to the
// save format version. A save older than the one the parser was written
// against can therefore fail every map layer while every required source reads
// cleanly, which looks to the user like "the map is broken".
//
// Saying which layers failed, and on which save version, is the difference
// between a report we can act on and one we cannot.
export function mapLayerReport({ warnings = [], saveVersion = null } = {}) {
  const relevant = (Array.isArray(warnings) ? warnings : [])
    .filter(warning => warning && LAYER_SET.has(warning.file));
  const layers = [...new Set(relevant.map(warning => warning.file))];
  const version = Number.isFinite(saveVersion) ? saveVersion : null;

  if (!layers.length) {
    return { failed: false, layers: [], saveVersion: version, summary: '', detail: [] };
  }
  const summary = version === null
    ? `${layers.join(', ')}`
    : `${layers.join(', ')} · save version ${version}`;
  return {
    failed: true,
    layers,
    saveVersion: version,
    summary,
    detail: relevant.map(warning => `${warning.file}: ${warning.message}`),
  };
}
