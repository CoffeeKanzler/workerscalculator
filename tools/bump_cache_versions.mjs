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
//   3. Any changed JavaScript advances js/app.js in index.html, which is also
//      the DATA_V the app stamps onto every data/ fetch.
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
    new RegExp(`(${escaped})\\?v=(\\d+)`, 'g'),
    (_, file, version) => `${file}?v=${Number(version) + 1}`,
  );
  // A bare import is cached under a URL that never changes, so give it one.
  next = next.replace(
    new RegExp(`(from\\s+'[^']*${escaped})'`, 'g'),
    (match, prefix) => (match.includes('?v=') ? match : `${prefix}?v=1'`),
  );
  return next;
}

export function isJavaScript(file) {
  return file.endsWith('.js') || file.endsWith('.mjs');
}

// Which files should be rewritten, given what changed.
export function planBump(changedFiles, { allFiles = [] } = {}) {
  const changed = changedFiles.filter(file => file.startsWith('js/') || file.startsWith('css/'));
  const modules = changed.map(moduleName);
  const touchesJs = changed.some(isJavaScript);
  const touchesCss = changed.some(file => file.endsWith('.css'));

  // Anything that could hold a marker: the shell, plus every module, since
  // modules import one another.
  const targets = new Set([
    ...REFERRING_FILES,
    ...allFiles.filter(file => file.startsWith('js/') && isJavaScript(file)),
  ]);
  return { modules, targets: [...targets].sort(), touchesJs, touchesCss };
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files', 'js', 'css', 'index.html'], { cwd: ROOT })
    .toString().split('\n').filter(Boolean);
}

function stagedFiles() {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd: ROOT })
    .toString().split('\n').filter(Boolean);
}

function main(argv) {
  const check = argv.includes('--check');
  const explicit = argv.filter(arg => !arg.startsWith('--'));
  const changed = explicit.length ? explicit : stagedFiles();
  const plan = planBump(changed, { allFiles: listTrackedFiles() });

  if (!plan.modules.length) {
    if (!check) console.log('no js/ or css/ change, nothing to advance');
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

  if (check) {
    if (edits.length) {
      console.error(`cache markers are stale in: ${edits.join(', ')}`);
      console.error('run: node tools/bump_cache_versions.mjs');
      return 1;
    }
    console.log('cache markers are current');
    return 0;
  }
  console.log(edits.length ? `advanced markers in ${edits.join(', ')}` : 'markers already current');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
