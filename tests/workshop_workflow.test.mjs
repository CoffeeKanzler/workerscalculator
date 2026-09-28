import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const workflow = readFileSync(
  new URL('../.github/workflows/workshop.yml', import.meta.url), 'utf8');

// The catalogue job runs unattended, so the only thing that ever notices it
// committing a shell and a build stamp that disagree is the next one. Pull the
// step's script out of the workflow rather than restating it here, so this
// test fails if the workflow changes and the test does not.
function commitStepScript(source) {
  const start = source.indexOf('- name: Commit the new definitions');
  assert.ok(start > 0, 'the workflow no longer has the commit step');
  const runAt = source.indexOf('run: |', start);
  assert.ok(runAt > start, 'the commit step no longer has a run script');
  const body = source.slice(source.indexOf('\n', runAt) + 1);
  const lines = [];
  for (const line of body.split('\n')) {
    if (line.trim() && !line.startsWith('        ')) break;
    lines.push(line.slice(8));
  }
  return lines.join('\n');
}

test('the catalogue workflow commits the build stamp with the shell it describes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workers-workshop-workflow-'));
  // Outside the working tree, so the remote is not part of what the step
  // leaves behind.
  const remote = mkdtempSync(join(tmpdir(), 'workers-workshop-remote-'));
  const runGit = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  const read = relative => execFileSync('git', ['show', `HEAD:${relative}`], {
    cwd: directory, encoding: 'utf8',
  });
  try {
    for (const name of ['js', 'css', 'tools', 'data/workshop/items/02', '.github/workflows']) {
      mkdirSync(join(directory, name), { recursive: true });
    }
    // The directories the workflow names explicitly have to exist, or the step
    // aborts on the pathspec before the behaviour under test is reached.
    writeFileSync(join(directory, 'css/style.css'), ':root {}\n');
    cpSync(new URL('../tools/bump_cache_versions.mjs', import.meta.url),
      join(directory, 'tools/bump_cache_versions.mjs'));
    writeFileSync(join(directory, 'js/app.js'), 'export const revision = 1;\n');
    writeFileSync(join(directory, 'index.html'),
      '<script type="module" src="js/app.js?v=1"></script>\n');
    writeFileSync(join(directory, 'data/VERSION.json'),
      `${JSON.stringify({ appBuild: '1' }, null, 1)}\n`);
    writeFileSync(join(directory, 'data/workshop/index.json'), '{"ids":[]}\n');
    writeFileSync(join(directory, 'data/workshop/items/02/1.json'), '{}\n');
    runGit('init', '--initial-branch=main');
    runGit('config', 'user.email', 'tests@example.invalid');
    runGit('config', 'user.name', 'Workflow tests');
    runGit('add', '.');
    runGit('commit', '-m', 'base');
    // A real remote, so the step's own `git push` is exercised rather than
    // stripped out of the script under test.
    execFileSync('git', ['init', '--bare', join(remote, 'origin.git')], { stdio: 'ignore' });
    runGit('remote', 'add', 'origin', join(remote, 'origin.git'));
    runGit('push', '-u', 'origin', 'main');

    // What the catalogue run leaves behind: a new item and a touched index.
    writeFileSync(join(directory, 'data/workshop/items/02/2.json'), '{"name":"new"}\n');
    writeFileSync(join(directory, 'data/workshop/index.json'), '{"ids":[2]}\n');

    const script = commitStepScript(workflow);
    assert.match(script, /bump_cache_versions\.mjs --print-changed/,
      'the step must ask the bumper which files it rewrote');
    const run = spawnSync('bash', ['-e', '-c', script], {
      cwd: directory, encoding: 'utf8',
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

    const marker = read('index.html').match(/js\/app\.js\?v=(\d+)/)?.[1];
    assert.ok(Number(marker) > 1, `the step advanced the shell, got ${marker}`);
    assert.equal(JSON.parse(read('data/VERSION.json')).appBuild, marker,
      'the catalogue commit records the build it ships');
    assert.deepEqual(JSON.parse(read('data/workshop/index.json')), { ids: [2] });
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], { cwd: directory, encoding: 'utf8' }).trim(),
      '', 'the step leaves nothing behind in the working tree');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});
