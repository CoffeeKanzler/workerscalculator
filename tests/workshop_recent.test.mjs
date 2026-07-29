import test from 'node:test';
import assert from 'node:assert/strict';

import { itemIdsFrom, listingUrl, newIdsOnPage } from '../tools/workshop_recent.mjs';

// A trimmed shape of the real listing: item anchors alongside the other
// numeric ids Steam puts on the same page.
const PAGE = `
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3151692088">A</a>
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3747882115">B</a>
  <a href="https://steamcommunity.com/app/784150">the game</a>
  <a href="https://steamcommunity.com/profiles/76561198000000000">an author</a>
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3151692088">A again</a>
`;

test('item ids come from the item links only', () => {
  // Matching bare id= numbers would also pick up the app id and profile ids,
  // and a fetch for those would burn a steamcmd slot on nothing.
  assert.deepEqual(itemIdsFrom(PAGE).sort(), ['3151692088', '3747882115']);
});

test('an id listed twice on a page is returned once', () => {
  assert.equal(itemIdsFrom(PAGE).filter(id => id === '3151692088').length, 1);
});

test('a page with no items yields nothing rather than throwing', () => {
  assert.deepEqual(itemIdsFrom('<html><body>nothing here</body></html>'), []);
  assert.deepEqual(itemIdsFrom(''), []);
});

test('the listing is requested newest first, which is what a daily run needs', () => {
  const url = listingUrl(2);
  assert.match(url, /appid=784150/);
  assert.match(url, /browsesort=mostrecent/);
  assert.match(url, /[?&]p=2/);
});

test('only ids missing from the catalogue are reported', () => {
  const known = new Set(['111', '222']);
  assert.deepEqual(newIdsOnPage(['111', '333', '222', '444'], known), ['333', '444']);
});

test('a page of entirely known items reports nothing new', () => {
  assert.deepEqual(newIdsOnPage(['111', '222'], new Set(['111', '222'])), []);
});
