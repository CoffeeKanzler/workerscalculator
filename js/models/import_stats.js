// stats.ini records are per-save and can be tens of thousands of rows, so they
// live outside SHARE_KEYS and are not replaced by replaceSharedState. That
// makes them easy to leak: importing a save that has no stats.ini would
// otherwise leave the previous republic's price history on screen, priced from
// a save the user is no longer looking at.
//
// Returning the whole stats slice from one place keeps the import path and the
// "start a manual plan" path telling the same story.
export function statsStateForImport({
  statsRecords = null,
  statsFileName = null,
  previousPriceSource = 'default',
} = {}) {
  if (Array.isArray(statsRecords) && statsRecords.length) {
    return {
      statsRecords,
      statsName: statsFileName,
      recordIndex: statsRecords.length - 1,
      priceSource: 'stats',
    };
  }
  return {
    statsRecords: null,
    statsName: null,
    recordIndex: 0,
    // Only fall back when the current source has nothing left to read from.
    priceSource: previousPriceSource === 'stats' ? 'default' : previousPriceSource,
  };
}
