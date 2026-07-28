import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_SECTIONS, sectionForTab, sectionById, tabsForSection, evidenceTone, surfaceState,
} from '../js/ui/command_center.js';

test('command center keeps observe, diagnose, plan, and compare as stable IA sections', () => {
  assert.deepEqual(COMMAND_SECTIONS.map(section => section.id), ['observe', 'diagnose', 'plan', 'compare']);
  assert.equal(sectionForTab('republic'), 'observe');
  assert.equal(sectionForTab('analysis'), 'diagnose');
  assert.equal(sectionForTab('chain'), 'plan');
  assert.equal(sectionById('compare').defaultTab, 'republic');
  assert.ok(tabsForSection('plan').includes('trains'));
});

test('evidence and surface states are textual and explicit for hosted and addon modes', () => {
  assert.equal(evidenceTone({ mode: 'addon', runtimeStatus: 'ready' }), 'live');
  assert.equal(evidenceTone({ mode: 'hosted', hasSave: true }), 'save');
  assert.equal(evidenceTone({ mode: 'hosted', hasSave: false }), 'plan');
  assert.equal(surfaceState({ mode: 'addon', runtimeStatus: 'resynchronizing' }), 'resynchronizing');
  assert.equal(surfaceState({ mode: 'addon', runtimeStatus: 'unavailable' }), 'error');
  assert.equal(surfaceState({ mode: 'hosted', hasSave: false }), 'empty');
});
