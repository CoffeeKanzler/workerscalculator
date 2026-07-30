import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  bumpReferencesTo, planBump, moduleName, isJavaScript, staleReferenceTargets,
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

// Found by running the hook on a real commit: a stylesheet change matched both
// the changed-module loop and the shell special case, advancing style.css by
// two. Skipping a version is harmless to a browser but makes the markers lie
// about how many releases there have been.
test('a changed shell or stylesheet advances exactly once', () => {
  const html = '<link href="css/style.css?v=51">\n<script src="js/app.js?v=153"></script>';

  // Simulate the writer: modules loop first, then the shell special case.
  const afterModules = ['style.css', 'app.js'].reduce(bumpReferencesTo, html);
  assert.match(afterModules, /style\.css\?v=52/);
  assert.match(afterModules, /app\.js\?v=154/);

  const plan = planBump(['css/style.css', 'js/app.js']);
  assert.ok(plan.modules.includes('style.css'), 'the shell case must know to stand down');
  assert.ok(plan.modules.includes('app.js'));
});

test('check mode accepts a changed referenced module whose marker advanced', () => {
  const targets = ['index.html'];
  const previousFiles = {
    'index.html': '<script type="module" src="js/app.js?v=41"></script>',
  };
  const currentFiles = {
    'index.html': '<script type="module" src="js/app.js?v=42"></script>',
  };
  assert.deepEqual(staleReferenceTargets(['js/app.js'], {
    targets, previousFiles, currentFiles,
  }), []);
});

test('check mode rejects a changed referenced module whose marker stayed put', () => {
  const targets = ['index.html'];
  const previousFiles = {
    'index.html': '<script type="module" src="js/app.js?v=41"></script>',
  };
  const currentFiles = {
    'index.html': '<script type="module" src="js/app.js?v=41"></script>',
  };
  assert.deepEqual(staleReferenceTargets(['js/app.js'], {
    targets, previousFiles, currentFiles,
  }), ['index.html']);
});

test('check mode does not combine a module marker with a longer module suffix', () => {
  const targets = ['js/app.js'];
  const previousFiles = {
    'js/app.js': [
      "import './ui/republic_map.js?v=12';",
      "import './ui/leaflet_republic_map.js?v=21';",
    ].join('\n'),
  };
  const currentFiles = {
    'js/app.js': [
      "import './ui/republic_map.js?v=13';",
      "import './ui/leaflet_republic_map.js?v=22';",
    ].join('\n'),
  };
  assert.deepEqual(staleReferenceTargets([
    'js/ui/republic_map.js', 'js/ui/leaflet_republic_map.js',
  ], { targets, previousFiles, currentFiles }), []);
});

test('the check CLI accepts moved markers and rejects unchanged markers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workers-cache-check-'));
  const runGit = (...args) => execFileSync('git', args, {
    cwd: directory, stdio: 'ignore',
  });
  try {
    mkdirSync(join(directory, 'js'));
    mkdirSync(join(directory, 'tools'));
    cpSync(new URL('../tools/bump_cache_versions.mjs', import.meta.url),
      join(directory, 'tools/bump_cache_versions.mjs'));
    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 1;\n');
    writeFileSync(join(directory, 'index.html'),
      '<script type="module" src="js/app.js?v=1"></script>\n');
    runGit('init');
    runGit('config', 'user.email', 'tests@example.invalid');
    runGit('config', 'user.name', 'Cache tests');
    runGit('add', '.');
    runGit('commit', '-m', 'base');

    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 2;\n');
    writeFileSync(join(directory, 'index.html'),
      '<script type="module" src="js/app.js?v=2"></script>\n');
    runGit('add', '.');
    runGit('commit', '-m', 'bumped');
    const passed = spawnSync(process.execPath, [
      'tools/bump_cache_versions.mjs', '--check', 'js/app.js',
    ], { cwd: directory, encoding: 'utf8' });
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /cache markers are current/);

    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 3;\n');
    runGit('add', '.');
    runGit('commit', '-m', 'stale');
    const failed = spawnSync(process.execPath, [
      'tools/bump_cache_versions.mjs', '--check', 'js/app.js',
    ], { cwd: directory, encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /cache markers are stale in: index\.html/);
    assert.doesNotMatch(failed.stderr, /ReferenceError/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// data/ files are fetched with DATA_V, which is the shell's own marker. A
// refreshed workshop catalog was served stale for exactly this reason: the
// data changed, no code did, and nothing advanced.
test('a dataset change advances the shell, since DATA_V is its marker', () => {
  const plan = planBump(['data/workshop/index.json', 'data/game/buildings_raw.json']);
  assert.equal(plan.touchesJs, true, 'data changes must advance DATA_V');
  assert.deepEqual(plan.modules, [], 'no module changed, so no module marker moves');
  assert.ok(plan.targets.includes('index.html'));
});

// The stamp exists so a browser holding a stale index.html can be told a newer
// one is deployed. It is only worth anything if it agrees with the shell that
// actually ships, and for as long as it existed it did not: the hook re-staged
// index.html and js/ with a glob and never data/VERSION.json, so every commit
// recorded a build one behind and the working tree never came clean.
test('the recorded build is the build the shell ships', async () => {
  const { readFileSync } = await import('node:fs');
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const version = JSON.parse(readFileSync(new URL('../data/VERSION.json', import.meta.url), 'utf8'));

  assert.equal(version.appBuild, shell.match(/js\/app\.js\?v=(\d+)/)?.[1],
    'run: node tools/bump_cache_versions.mjs');
});

test('the pre-commit hook stages every file the bumper rewrote', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workers-cache-hook-'));
  const runGit = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  const read = relative => execFileSync('git', ['show', `HEAD:${relative}`], {
    cwd: directory, encoding: 'utf8',
  });
  try {
    mkdirSync(join(directory, 'js'));
    mkdirSync(join(directory, 'tools'));
    mkdirSync(join(directory, 'data'));
    mkdirSync(join(directory, '.githooks'));
    cpSync(new URL('../tools/bump_cache_versions.mjs', import.meta.url),
      join(directory, 'tools/bump_cache_versions.mjs'));
    cpSync(new URL('../.githooks/pre-commit', import.meta.url),
      join(directory, '.githooks/pre-commit'));
    chmodSync(join(directory, '.githooks/pre-commit'), 0o755);
    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 1;\n');
    writeFileSync(join(directory, 'index.html'),
      '<script type="module" src="js/app.js?v=1"></script>\n');
    writeFileSync(join(directory, 'data/VERSION.json'), `${JSON.stringify({ appBuild: '1' }, null, 1)}\n`);
    runGit('init');
    runGit('config', 'user.email', 'tests@example.invalid');
    runGit('config', 'user.name', 'Cache tests');
    runGit('config', 'core.hooksPath', '.githooks');
    runGit('add', '.');
    runGit('commit', '-m', 'base');

    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 2;\n');
    runGit('add', 'js/app.js');
    runGit('commit', '-m', 'change the module');

    // The base commit runs the hook too, so the exact number is not the point;
    // that the two files agree and nothing is left behind is.
    const marker = read('index.html').match(/js\/app\.js\?v=(\d+)/)?.[1];
    assert.ok(Number(marker) > 1, `the hook advanced the shell, got ${marker}`);
    assert.equal(JSON.parse(read('data/VERSION.json')).appBuild, marker,
      'the commit records the build it ships');
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], { cwd: directory, encoding: 'utf8' }).trim(),
      '', 'the hook leaves nothing behind in the working tree');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
