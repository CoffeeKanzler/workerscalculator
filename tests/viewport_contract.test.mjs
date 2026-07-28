import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const FIXTURE = path.join(ROOT, 'tests/viewport_contract.html');
const CHROME = process.env.CHROME_BIN || 'google-chrome';

function computedViewport(width) {
  if (!existsSync('/usr/bin/google-chrome') && !process.env.CHROME_BIN) return null;
  const output = execFileSync(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${width},900`, '--dump-dom', `file://${FIXTURE}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const match = output.match(/<pre id="viewport-contract">([\s\S]*?)<\/pre>/);
  assert.ok(match, `Chrome did not emit a viewport contract for ${width}px`);
  return JSON.parse(match[1]);
}

for (const width of [1920, 2560, 5120]) {
  test(`computed viewport contract at ${width}px`, { skip: !existsSync('/usr/bin/google-chrome') && !process.env.CHROME_BIN }, () => {
    const actual = computedViewport(width);
    const expected = width < 2200
      ? { appWidth: 1840, bodyFontSize: '15px', controlMinHeight: '0px' }
      : width < 4000
        ? { appWidth: 2240, bodyFontSize: '16px', controlMinHeight: '0px' }
        : { appWidth: 4200, bodyFontSize: '20px', controlMinHeight: '44px' };
    assert.equal(actual.appWidth, expected.appWidth);
    assert.equal(actual.bodyFontSize, expected.bodyFontSize);
    assert.equal(actual.controlMinHeight, expected.controlMinHeight);
    assert.ok(Number.parseFloat(actual.controlFontSize) >= Number.parseFloat(expected.bodyFontSize));
    assert.ok(actual.controlHeight >= (width >= 4000 ? 44 : 28));
  });
}
