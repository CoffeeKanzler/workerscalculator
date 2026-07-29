import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bumpReferencesTo, planBump, moduleName, isJavaScript,
} from '../tools/bump_cache_versions.mjs';

// Pages caches for ten minutes, so a module whose marker did not move is
// served stale beside one that did. That produced three false results in one
// session: a fixed parser that kept throwing, a refreshed catalog the app
// never read, and a corrected matcher that never loaded.
test('every reference to a changed module is advanced', () => {
  const html = '<script type="module" src="js/app.js?v=133"></script>';
  assert.equal(bumpReferencesTo(html, 'app.js'),
    '<script type="module" src="js/app.js?v=133"></script>'.replace('133', '134'));
});

test('several references to the same module all advance together', () => {
  const source = "import a from './research.js?v=2';\nimport b from '../research.js?v=2';";
  const next = bumpReferencesTo(source, 'research.js');
  assert.equal((next.match(/\?v=3/g) ?? []).length, 2);
  assert.doesNotMatch(next, /\?v=2/);
});

// The structural version of the bug: an importer was pinned while the import
// itself was bare, so the pair stayed cached together and a fix to the
// imported module could not reach the browser at all.
test('a bare import of a changed module is given a marker', () => {
  const source = "import { projectSave } from './save_projection.js';";
  assert.equal(bumpReferencesTo(source, 'save_projection.js'),
    "import { projectSave } from './save_projection.js?v=1';");
});

test('an already versioned import is advanced, not given a second marker', () => {
  const source = "import x from './save_projection.js?v=2';";
  const next = bumpReferencesTo(source, 'save_projection.js');
  assert.equal(next, "import x from './save_projection.js?v=3';");
  assert.equal((next.match(/\?v=/g) ?? []).length, 1);
});

test('an unrelated module is left alone', () => {
  const source = "import a from './calc.js?v=29';\nimport b from './chain.js?v=15';";
  assert.equal(bumpReferencesTo(source, 'fleet.js'), source);
  assert.match(bumpReferencesTo(source, 'calc.js'), /calc\.js\?v=30/);
  assert.match(bumpReferencesTo(source, 'calc.js'), /chain\.js\?v=15/);
});

test('a name that is a suffix of another is not confused with it', () => {
  const source = "import a from './model.js?v=4';\nimport b from './save_model.js?v=7';";
  const next = bumpReferencesTo(source, 'save_model.js');
  assert.match(next, /save_model\.js\?v=8/);
  assert.match(next, /'\.\/model\.js\?v=4'/);
});

test('any JavaScript change advances the shell, which is also DATA_V', () => {
  const plan = planBump(['js/models/planning_areas.js'], { allFiles: ['js/app.js'] });
  assert.deepEqual(plan.modules, ['planning_areas.js']);
  assert.equal(plan.touchesJs, true);
  assert.equal(plan.touchesCss, false);
  assert.ok(plan.targets.includes('index.html'));
});

test('a stylesheet change advances the stylesheet marker', () => {
  const plan = planBump(['css/style.css']);
  assert.equal(plan.touchesCss, true);
  assert.equal(plan.touchesJs, false);
});

test('changes outside js and css ask for nothing', () => {
  const plan = planBump(['README.md', 'tests/calc.test.mjs', 'data/game/research.json']);
  assert.deepEqual(plan.modules, []);
});

test('module names and javascript are recognised by extension', () => {
  assert.equal(moduleName('js/adapters/save_projection.js'), 'save_projection.js');
  assert.equal(isJavaScript('js/app.js'), true);
  assert.equal(isJavaScript('tools/x.mjs'), true);
  assert.equal(isJavaScript('css/style.css'), false);
});
