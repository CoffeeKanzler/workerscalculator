import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { STRINGS } from '../js/i18n.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

// A key with no translation renders as the raw key name in the interface —
// "tabCities" instead of "Cities". Nothing else catches that, and it is easy
// to introduce by adding a string to one language and forgetting the other.
async function staticKeysUsedIn(file) {
  const source = await fs.readFile(path.join(ROOT, file), 'utf8');
  return new Set([...source.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'\s*\)/g)].map(match => match[1]));
}

test('every string the interface asks for exists in every language', async () => {
  const keys = await staticKeysUsedIn('js/app.js');
  assert.ok(keys.size > 500, `expected the app to use many strings, found ${keys.size}`);

  for (const [lang, table] of Object.entries(STRINGS)) {
    const missing = [...keys].filter(key => table[key] === undefined);
    assert.deepEqual(missing, [], `${lang} is missing: ${missing.join(', ')}`);
  }
});

test('the languages define the same set of strings', async () => {
  const [first, ...rest] = Object.keys(STRINGS);
  for (const lang of rest) {
    const onlyFirst = Object.keys(STRINGS[first]).filter(key => STRINGS[lang][key] === undefined);
    const onlyOther = Object.keys(STRINGS[lang]).filter(key => STRINGS[first][key] === undefined);
    assert.deepEqual(onlyFirst, [], `only in ${first}: ${onlyFirst.join(', ')}`);
    assert.deepEqual(onlyOther, [], `only in ${lang}: ${onlyOther.join(', ')}`);
  }
});

test('no translation is left empty', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    const empty = Object.entries(table)
      .filter(([, value]) => typeof value === 'string' && value.trim() === '')
      .map(([key]) => key);
    assert.deepEqual(empty, [], `${lang} has empty strings: ${empty.join(', ')}`);
  }
});

// Strings carrying a placeholder are filled in with .replace('{n}', …) at the
// call site. If one language drops the placeholder the number silently
// disappears from the sentence.
test('placeholders survive translation', () => {
  const langs = Object.keys(STRINGS);
  const placeholders = value => (String(value).match(/\{[a-zA-Z]+\}/g) ?? []).sort();

  for (const key of Object.keys(STRINGS[langs[0]])) {
    const expected = placeholders(STRINGS[langs[0]][key]);
    if (!expected.length) continue;
    for (const lang of langs.slice(1)) {
      assert.deepEqual(placeholders(STRINGS[lang][key]), expected,
        `${key} has different placeholders in ${langs[0]} and ${lang}`);
    }
  }
});
