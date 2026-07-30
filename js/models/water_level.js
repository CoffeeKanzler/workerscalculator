// Where the water surface of a map actually is.
//
// heightmap.dds is normalised against each map's own vertical range, so a raw
// sample means nothing on its own and no fixed threshold classifies water
// everywhere. The previous rule — the lowest exactly-repeating height covering a
// meaningful share of the map — only works when the game clamps submerged
// terrain to the water plane. On a map whose seabed slopes it finds a deep
// plateau instead: on one test republic it settled on 0.0074, some 53 m below
// the shoreline, drawing 4.4% of the map as water where the truth is nearer 15%.
//
// The save states the answer twice over, though. Every building records both its
// position and its own height in metres, so sampling the heightmap under each
// one gives a straight line between sample and metres — the map's normalisation
// undone. Water is then everything at or below zero metres.
//
// The line is a genuinely good fit where terrain varies: r = 0.999 on one save
// and 0.977 and 0.979 on two others. It is worthless on a republic built
// entirely on one flat plain, where every building reports nearly the same
// height and there is no slope to recover (r = 0.07 on the flattest test save).
// Hence the correlation gate: below it, nothing is claimed and the caller keeps
// whatever it had.
export const SEA_LEVEL_METRES = 0;
const MINIMUM_SAMPLES = 50;
const MINIMUM_CORRELATION = 0.9;

// The foreign-trade markers sit at ±19000, far outside the terrain, and would
// drag the fit towards a height the heightmap never covers.
const ON_MAP_LIMIT = 9900;

export function isOnMap(x, z) {
  return Number.isFinite(x) && Number.isFinite(z)
    && Math.abs(x) < ON_MAP_LIMIT && Math.abs(z) < ON_MAP_LIMIT;
}

// The flat [x, z, height, ...] triples a worker can be handed without cloning an
// object per building.
export function buildingHeightSamples(buildings = []) {
  const usable = buildings.filter(building => isOnMap(building?.x, building?.z)
    && Number.isFinite(building?.y));
  const samples = new Float64Array(usable.length * 3);
  usable.forEach((building, index) => {
    samples[index * 3] = building.x;
    samples[index * 3 + 1] = building.z;
    samples[index * 3 + 2] = building.y;
  });
  return samples;
}

export function fitTerrainHeightScale(pairs) {
  const count = pairs.length;
  if (count < MINIMUM_SAMPLES) return { count, slope: null, intercept: null, correlation: null };
  let sumSample = 0;
  let sumHeight = 0;
  // Taken from the spread rather than from the variance: a hundred copies of the
  // same sample do not sum to exactly a hundred times it, and the rounding left
  // over is enough to make a variance test call a constant column "varying".
  let minSample = Infinity;
  let maxSample = -Infinity;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const [sample, height] of pairs) {
    sumSample += sample;
    sumHeight += height;
    minSample = Math.min(minSample, sample);
    maxSample = Math.max(maxSample, sample);
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  if (maxSample <= minSample || maxHeight <= minHeight) {
    return { count, slope: null, intercept: null, correlation: null };
  }
  const meanSample = sumSample / count;
  const meanHeight = sumHeight / count;
  let covariance = 0;
  let sampleVariance = 0;
  let heightVariance = 0;
  for (const [sample, height] of pairs) {
    const ds = sample - meanSample;
    const dh = height - meanHeight;
    covariance += ds * dh;
    sampleVariance += ds * ds;
    heightVariance += dh * dh;
  }
  if (!(sampleVariance > 0) || !(heightVariance > 0)) {
    return { count, slope: null, intercept: null, correlation: null };
  }
  const slope = covariance / sampleVariance;
  return {
    count,
    slope,
    intercept: meanHeight - slope * meanSample,
    correlation: covariance / Math.sqrt(sampleVariance * heightVariance),
  };
}

// `sampleAt(x, z)` reads the heightmap; `range` is the lowest and highest sample
// in the file, so a plane the terrain never reaches can be refused rather than
// classifying the whole map one way.
export function waterLevelFromBuildingHeights(samples, sampleAt, range, {
  minimumCorrelation = MINIMUM_CORRELATION,
  seaLevelMetres = SEA_LEVEL_METRES,
} = {}) {
  const reject = reason => ({ plane: null, reason, fit: null });
  if (!samples?.length || typeof sampleAt !== 'function') return reject('no-building-heights');
  const pairs = [];
  for (let index = 0; index + 2 < samples.length; index += 3) {
    const sample = sampleAt(samples[index], samples[index + 1]);
    if (!Number.isFinite(sample)) continue;
    pairs.push([sample, samples[index + 2]]);
  }
  const fit = fitTerrainHeightScale(pairs);
  if (fit.slope === null) {
    return {
      ...reject(fit.count < MINIMUM_SAMPLES
        ? 'not-enough-building-heights' : 'terrain-too-flat-to-fit'),
      fit,
    };
  }
  // A negative slope would mean the heightmap runs the other way, which no save
  // has ever shown; treating it as a fit would invert land and water.
  if (!(fit.slope > 0)) return { ...reject('height-scale-not-increasing'), fit };
  if (!(Math.abs(fit.correlation) >= minimumCorrelation)) {
    return { ...reject('terrain-too-flat-to-fit'), fit };
  }
  const plane = (seaLevelMetres - fit.intercept) / fit.slope;
  if (!Number.isFinite(plane)) return { ...reject('height-scale-degenerate'), fit };
  if (range && (plane <= range.min || plane >= range.max)) {
    return { ...reject('sea-level-outside-terrain'), fit };
  }
  return { plane, reason: null, fit };
}
