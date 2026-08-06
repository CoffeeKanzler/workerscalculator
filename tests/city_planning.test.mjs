import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CITY_CORE_CATEGORY_TYPES,
  addMissingCityCategoryRows,
} from '../js/city_planning.js';

test('city quick-start covers the requested exact building categories', () => {
  assert.deepEqual([...CITY_CORE_CATEGORY_TYPES], [
    'Rathaus', 'Einkaufzentrum', 'Alkohol', 'Kindergarten', 'Schule', 'Universität',
    'Polizei', 'Krankenhaus', 'Feuerwehr', 'Kino', 'Sport', 'Kultur',
  ]);
});

test('city quick-start preserves rows and is idempotent', () => {
  const existing = { type: 'Schule', name: 'Schule konkret', count: 2 };
  const initial = [existing, { type: 'Wohngebäude', name: 'Haus', count: 1 }];
  const first = addMissingCityCategoryRows(initial);

  assert.equal(first.rows.length, initial.length + 11);
  assert.equal(first.rows[0], existing);
  assert.equal(first.addedTypes.includes('Schule'), false);
  assert.deepEqual(first.rows.filter(row => row.categoryOnly).map(row => row.type),
    CITY_CORE_CATEGORY_TYPES.filter(type => type !== 'Schule'));

  const second = addMissingCityCategoryRows(first.rows);
  assert.equal(second.rows.length, first.rows.length);
  assert.deepEqual(second.addedTypes, []);
  assert.equal(second.rows.filter(row => row.type === 'Schule').length, 1);
});
