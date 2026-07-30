// Advance the ?v= cache markers for whatever changed.
//
// GitHub Pages serves this with a ten-minute cache, so a module whose marker
// did not move can be served stale next to one that did. That has produced
// three separate false results in testing: a fixed research parser that kept
// throwing, a refreshed workshop catalog the app never read, and a corrected
// building matcher that never loaded because its importer was pinned while the
// import itself was bare.
//
// The rules, in the order they matter:
//   1. A changed module has every ?v= reference to it advanced.
//   2. A bare intra-project import of a changed module is given a marker,
//      since an unversioned import is cached under a URL that never changes.
//   3. Any changed JavaScript, or any changed file under data/, advances
//      js/app.js in index.html — that marker is also the DATA_V the app stamps
//      onto every data/ fetch, so a refreshed dataset is invisible without it.
//   4. Changed CSS advances css/style.css in index.html.
//
// Usage:
//   node tools/bump_cache_versions.mjs <changed-file> ...   # rewrite in place
//   node tools/bump_cache_versions.mjs --check <file> ...   # report only

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

// Files that carry markers pointing at other files.
export const REFERRING_FILES = ['index.html'];

export function moduleName(file) {
  return path.basename(file);
}

// Advances every "<name>?v=N" in the text, and versions a bare import of the
// same module. Returns the text unchanged when the module is not referenced.
export function bumpReferencesTo(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let next = text.replace(
    new RegExp(`((?<![A-Za-z0-9_.-])${escaped})\\?v=(\\d+)`, 'g'),
    (_, file, version) => `${file}?v=${Number(version) + 1}`,
  );
  // A bare import is cached under a URL that never changes, so give it one.
  next = next.replace(
    new RegExp(`(from\\s+'[^']*(?<![A-Za-z0-9_.-])${escaped})'`, 'g'),
    (match, prefix) => (match.includes('?v=') ? match : `${prefix}?v=1'`),
  );
  return next;
}

export function isJavaScript(file) {
  return file.endsWith('.js') || file.endsWith('.mjs');
}

// Which files should be rewritten, given what changed.
export function planBump(changedFiles, { allFiles = [] } = {}) {
  const changed = changedFiles.filter(file =>
    file.startsWith('js/') || file.startsWith('css/') || file.startsWith('data/'));
  const modules = changed.filter(file => !file.startsWith('data/')).map(moduleName);
  // Data is fetched with DATA_V, which is the shell's own marker, so a dataset
  // change has to advance it exactly as a code change does.
  const touchesJs = changed.some(isJavaScript) || changed.some(file => file.startsWith('data/'));
  const touchesCss = changed.some(file => file.endsWith('.css'));

  // Anything that could hold a marker: the shell, plus every module, since
  // modules import one another.
  const targets = new Set([
    ...REFERRING_FILES,
    ...allFiles.filter(file => file.startsWith('js/') && isJavaScript(file)),
  ]);
  return { modules, targets: [...targets].sort(), touchesJs, touchesCss };
}

function referenceMarkerStatus(previousText, currentText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp(`(?<![A-Za-z0-9_.-])${escaped}\\?v=(\\d+)`, 'g');
  const versions = text => [...text.matchAll(marker)].map(match => Number(match[1]));
  const previous = versions(previousText);
  const current = versions(currentText);
  if (!current.length) {
    const bareImport = new RegExp(
      `(?:from\\s+['"][^'"]*|(?:src|href)=['"][^'"]*)(?<![A-Za-z0-9_.-])${escaped}['"]`,
    );
    return bareImport.test(currentText) ? false : null;
  }
  if (!previous.length) return true;
  const previousMax = Math.max(...previous);
  return current.every(version => version > previousMax);
}

export function staleReferenceTargets(changedFiles, {
  targets, previousFiles, currentFiles,
}) {
  const plan = planBump(changedFiles, { allFiles: targets });
  const names = [...plan.modules];
  if (plan.touchesJs && !names.includes('app.js')) names.push('app.js');
  if (plan.touchesCss && !names.includes('style.css')) names.push('style.css');
  return targets.filter(target => names.some(name =>
    referenceMarkerStatus(
      previousFiles[target] ?? '',
      currentFiles[target] ?? '',
      name,
    ) === false));
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files', 'js', 'css', 'index.html'], { cwd: ROOT })
    .toString().split('\n').filter(Boolean);
}

function stagedFiles() {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd: ROOT })
    .toString().split('\n').filter(Boolean);
}

function previousFile(file) {
  try {
    return execFileSync('git', ['show', `HEAD^:${file}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return '';
  }
}

function main(argv) {
  const check = argv.includes('--check');
  // The pre-commit hook has to re-stage exactly what was rewritten. Guessing at
  // that with a glob missed data/VERSION.json for as long as the stamp has
  // existed, leaving every commit recording a build one behind the shell it
  // ships. Reporting the paths is the only way the hook can be right.
  const printChanged = argv.includes('--print-changed');
  const report = (edits, summary) => {
    if (printChanged) {
      if (edits.length) process.stdout.write(`${edits.join('\n')}\n`);
      if (summary) process.stderr.write(`${summary}\n`);
      return;
    }
    if (summary) console.log(summary);
  };
  const explicit = argv.filter(arg => !arg.startsWith('--'));
  const changed = explicit.length ? explicit : stagedFiles();
  const plan = planBump(changed, { allFiles: listTrackedFiles() });

  // A data-only change moves no module marker but still has to advance the
  // shell, since DATA_V is where data/ fetches get their marker from.
  if (!plan.modules.length && !plan.touchesJs && !plan.touchesCss) {
    // The build stamp still has to agree with the shell, whatever changed.
    const stamped = stampAppBuild({ check });
    if (stamped === 'stale') {
      console.error('data/VERSION.json appBuild is stale');
      return 1;
    }
    if (!check) {
      report(stamped ? [stamped] : [],
        stamped ? `advanced markers in ${stamped}` : 'no js/, css/ or data/ change, nothing to advance');
    }
    return 0;
  }

  if (check) {
    const previousFiles = {};
    const currentFiles = {};
    for (const target of plan.targets) {
      const file = path.join(ROOT, target);
      previousFiles[target] = previousFile(target);
      currentFiles[target] = existsSync(file) ? readFileSync(file, 'utf8') : '';
    }
    const stale = staleReferenceTargets(changed, {
      targets: plan.targets, previousFiles, currentFiles,
    });
    if (stale.length) {
      console.error(`cache markers are stale in: ${stale.join(', ')}`);
      console.error('run: node tools/bump_cache_versions.mjs');
      return 1;
    }
    console.log('cache markers are current');
    return 0;
  }

  const edits = [];
  for (const target of plan.targets) {
    const file = path.join(ROOT, target);
    if (!existsSync(file)) continue;
    const before = readFileSync(file, 'utf8');
    let after = before;
    for (const name of plan.modules) {
      // A module never needs a marker pointing at itself.
      if (moduleName(target) === name) continue;
      after = bumpReferencesTo(after, name);
    }
    // Any JavaScript change advances the shell, which is also DATA_V — unless
    // the shell itself changed, in which case the loop above already did, and
    // advancing twice would be wrong rather than merely untidy.
    if (target === 'index.html' && plan.touchesJs && !plan.modules.includes('app.js')) {
      after = bumpReferencesTo(after, 'app.js');
    }
    if (target === 'index.html' && plan.touchesCss && !plan.modules.includes('style.css')) {
      after = bumpReferencesTo(after, 'style.css');
    }
    if (after !== before) {
      edits.push(target);
      if (!check) writeFileSync(file, after);
    }
  }

  // The one file with no marker of its own is index.html, so a browser holding
  // a stale copy of it never learns that newer modules exist. Recording the
  // shell's marker in the dataset lets the running app fetch it uncached and
  // notice that it is out of date, instead of silently behaving like an old
  // build that has already been deployed over.
  const stampEdit = stampAppBuild({ check });
  if (stampEdit === 'stale') {
    console.error('data/VERSION.json appBuild is stale');
    console.error('run: node tools/bump_cache_versions.mjs');
    return 1;
  }
  if (stampEdit) edits.push(stampEdit);

  report(edits, edits.length ? `advanced markers in ${edits.join(', ')}` : 'markers already current');
  return 0;
}

export function appBuildMarker(html) {
  return html.match(/js\/app\.js\?v=(\d+)/)?.[1] ?? null;
}

function stampAppBuild({ check = false } = {}) {
  const shell = path.join(ROOT, 'index.html');
  const target = path.join(ROOT, 'data', 'VERSION.json');
  if (!existsSync(shell) || !existsSync(target)) return null;
  const marker = appBuildMarker(readFileSync(shell, 'utf8'));
  if (!marker) return null;
  const before = readFileSync(target, 'utf8');
  const parsed = JSON.parse(before);
  if (parsed.appBuild === marker) return null;
  if (check) return 'stale';
  parsed.appBuild = marker;
  writeFileSync(target, `${JSON.stringify(parsed, null, 1)}\n`);
  return 'data/VERSION.json';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
