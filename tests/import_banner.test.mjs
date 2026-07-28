import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { importBannerState } from '../js/ui/import_banner.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('an import in progress shows its status with a spinner', () => {
  const banner = importBannerState({
    importBusy: true,
    importStatus: 'Reading core save files …',
    importStatusError: false,
  });

  assert.equal(banner.visible, true);
  assert.equal(banner.spinner, true);
  assert.equal(banner.tone, 'busy');
  assert.equal(banner.dismissible, false);
});

// The whole point: the import moves the user to the republic tab, so a failure
// reported after that moment has to be visible from wherever they are. The
// status text otherwise lives only on the start and save-import tabs.
test('a failure stays on screen after the import stops being busy', () => {
  const banner = importBannerState({
    importBusy: false,
    importStatus: 'Republic ready · Optional map layers failed: heightmap',
    importStatusError: true,
  });

  assert.equal(banner.visible, true);
  assert.equal(banner.spinner, false);
  assert.equal(banner.tone, 'error');
  // It must be dismissible, or it outlives its usefulness.
  assert.equal(banner.dismissible, true);
});

test('a failure offers the map retry when one is available', () => {
  const withRetry = importBannerState({
    importBusy: false,
    importStatus: 'Optional map layers failed: pollution',
    importStatusError: true,
    mapLayersFailed: true,
  });
  assert.equal(withRetry.retry, true);

  const withoutRetry = importBannerState({
    importBusy: false,
    importStatus: 'Import failed: namepoints.bin missing',
    importStatusError: true,
    mapLayersFailed: false,
  });
  assert.equal(withoutRetry.retry, false);
});

// The case that shipped broken: a corrupt heightmap makes the import report
// "Import complete · some optional map layers are unavailable" with
// importStatusError still false. The map then draws with no water and the user
// is told nothing at all.
test('a degraded map layer is surfaced even though the import counts as complete', () => {
  const banner = importBannerState({
    importBusy: false,
    importStatus: 'Import complete · some optional map layers are unavailable',
    importStatusError: false,
    mapLayersFailed: true,
  });

  assert.equal(banner.visible, true);
  assert.equal(banner.tone, 'warn', 'a degraded layer is not a hard failure');
  assert.equal(banner.retry, true, 'the files are still held, so retry is offered');
  assert.equal(banner.dismissible, true);
});

// Success needs no banner once the work is done: the imported republic on
// screen is its own confirmation, and a lingering toast is just noise.
test('a finished import with no error shows nothing', () => {
  const banner = importBannerState({
    importBusy: false,
    importStatus: 'Import complete',
    importStatusError: false,
  });

  assert.equal(banner.visible, false);
});

test('a dismissed failure stays dismissed until something new happens', () => {
  const banner = importBannerState({
    importBusy: false,
    importStatus: 'Optional map layers failed: pollution',
    importStatusError: true,
    dismissedStatus: 'Optional map layers failed: pollution',
  });
  assert.equal(banner.visible, false);

  // A different failure is new information and must appear.
  const next = importBannerState({
    importBusy: false,
    importStatus: 'Optional map layers failed: heightmap',
    importStatusError: true,
    dismissedStatus: 'Optional map layers failed: pollution',
  });
  assert.equal(next.visible, true);
});

test('an empty status never renders a banner', () => {
  assert.equal(importBannerState({ importBusy: false, importStatus: '' }).visible, false);
  // Busy with nothing to say yet still shows the spinner.
  assert.equal(importBannerState({ importBusy: true, importStatus: '' }).visible, true);
});

test('the shell mounts the banner on failure, not only while busy', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');

  assert.match(app, /importBannerState\(/);
  // The old mount hid every message the moment the import stopped being busy.
  assert.doesNotMatch(app, /\.\.\.\(state\.importBusy \? \[renderImportActivity\(\)\] : \[\]\)/);
});
