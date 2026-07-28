import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_SECTIONS, sectionForTab, sectionById, tabsForSection, evidenceTone, surfaceState,
  shouldOpenStartPage, relativeAge,
} from '../js/ui/command_center.js';

test('command center keeps observe, diagnose, plan, and compare as stable IA sections', () => {
  assert.deepEqual(COMMAND_SECTIONS.map(section => section.id), ['observe', 'diagnose', 'plan', 'compare']);
  assert.equal(sectionForTab('republic'), 'observe');
  assert.equal(sectionForTab('analysis'), 'diagnose');
  assert.equal(sectionForTab('chain'), 'plan');
  assert.ok(tabsForSection('plan').includes('trains'));
});

// Section highlighting is only stable if a tab resolves to exactly one section.
// Listing a tab in several sections made sectionForTab pick the first, so
// Observe silently won almost every tab and Compare could never stay lit.
test('every tab belongs to exactly one section', () => {
  const seen = new Map();
  for (const section of COMMAND_SECTIONS) {
    for (const tab of section.tabs) {
      assert.equal(seen.has(tab), false,
        `${tab} is claimed by both ${seen.get(tab)} and ${section.id}`);
      seen.set(tab, section.id);
    }
  }
});

test('each section opens on a tab it actually owns', () => {
  for (const section of COMMAND_SECTIONS) {
    assert.ok(section.tabs.includes(section.defaultTab),
      `${section.id} opens on ${section.defaultTab}, which it does not own`);
  }
  assert.equal(sectionById('compare').defaultTab, 'saveimport');
});

test('the confirmed tab to section table is what ships', () => {
  assert.deepEqual(tabsForSection('observe'), ['home', 'republic', 'map', 'cities', 'prices']);
  assert.deepEqual(tabsForSection('diagnose'), ['analysis']);
  assert.deepEqual(tabsForSection('plan'), [
    'chain', 'city', 'priceedit', 'production', 'vehicleprod', 'trains', 'research', 'advanced',
  ]);
  assert.deepEqual(tabsForSection('compare'), ['saveimport', 'help']);
});

// Observe is the read-only surface: it reports what the save contains and
// never lets a hypothetical value be typed into it.
test('observe carries no editable planning tab', () => {
  const EDITABLE = ['city', 'priceedit', 'production', 'vehicleprod', 'trains', 'research', 'chain', 'advanced'];
  for (const tab of EDITABLE) {
    assert.notEqual(sectionForTab(tab), 'observe', `${tab} must not sit under Observe`);
  }
  assert.equal(sectionForTab('cities'), 'observe');
  assert.equal(sectionForTab('city'), 'plan');
  assert.equal(sectionForTab('prices'), 'observe');
  assert.equal(sectionForTab('priceedit'), 'plan');
});

test('evidence and surface states are textual and explicit for hosted and addon modes', () => {
  assert.equal(evidenceTone({ mode: 'addon', runtimeStatus: 'ready' }), 'live');
  assert.equal(evidenceTone({ mode: 'hosted', hasSave: true }), 'save');
  assert.equal(evidenceTone({ mode: 'hosted', hasSave: false }), 'plan');
  assert.equal(surfaceState({ mode: 'addon', runtimeStatus: 'resynchronizing' }), 'resynchronizing');
  assert.equal(surfaceState({ mode: 'addon', runtimeStatus: 'unavailable' }), 'error');
  assert.equal(surfaceState({ mode: 'hosted', hasSave: false }), 'empty');
});

// Coming back later, the useful landing place is the chooser, not whichever
// tab happened to be open. The save still restores; only the landing changes.
test('a session resumed within the hour keeps the tab you were on', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const base = { hasSave: true, viewingSharedLink: false, now };

  assert.equal(shouldOpenStartPage({ ...base, lastSavedAt: now - 60_000 }), false);
  assert.equal(shouldOpenStartPage({ ...base, lastSavedAt: now - 59 * 60_000 }), false);
});

test('a session resumed after an hour lands on the start page', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const base = { hasSave: true, viewingSharedLink: false, now };

  assert.equal(shouldOpenStartPage({ ...base, lastSavedAt: now - 61 * 60_000 }), true);
  assert.equal(shouldOpenStartPage({ ...base, lastSavedAt: now - 26 * 60 * 60_000 }), true);
});

test('the landing rule never hijacks a shared link or a plan with no save', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const stale = now - 5 * 60 * 60_000;

  // A shared link is an explicit request to look at that plan.
  assert.equal(shouldOpenStartPage({ lastSavedAt: stale, now, hasSave: true, viewingSharedLink: true }), false);
  // With no imported save there is no republic to be confused about.
  assert.equal(shouldOpenStartPage({ lastSavedAt: stale, now, hasSave: false, viewingSharedLink: false }), false);
  // A first run has nothing to be stale.
  assert.equal(shouldOpenStartPage({ lastSavedAt: null, now, hasSave: true, viewingSharedLink: false }), false);
});

test('the start page can say how long ago the republic was last open', () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  assert.deepEqual(relativeAge(now - 30_000, now), { key: 'agoJustNow', value: 0 });
  assert.deepEqual(relativeAge(now - 5 * 60_000, now), { key: 'agoMinutes', value: 5 });
  assert.deepEqual(relativeAge(now - 3 * 60 * 60_000, now), { key: 'agoHours', value: 3 });
  assert.deepEqual(relativeAge(now - 2 * 24 * 60 * 60_000, now), { key: 'agoDays', value: 2 });
  assert.equal(relativeAge(null, now), null);
  // "1 days ago" reads as a bug to the person looking at it.
  assert.deepEqual(relativeAge(now - 60_000, now), { key: 'agoMinute', value: 1 });
  assert.deepEqual(relativeAge(now - 60 * 60_000, now), { key: 'agoHour', value: 1 });
  assert.deepEqual(relativeAge(now - 26 * 60 * 60_000, now), { key: 'agoDay', value: 1 });
});
