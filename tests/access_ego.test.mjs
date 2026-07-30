import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAccessEgoView, NEIGHBOUR_CAP } from '../js/models/access_ego.js';
import { nodeCardLabel } from '../js/ui/access_graph.js';

function evidenceOf(nodes, edges) {
  return {
    completeness: 'complete', walkingEdgesComplete: true, reason: null,
    nodes, edges,
  };
}

const node = (id, kind, label, extra = {}) => ({ id, kind, stage: 0, label, ...extra });
const walk = (id, source, target, distanceMeters) => ({
  id, source, target, kind: 'walk', evidence: 'exact', distanceMeters, pathType: 'gravel',
});

const CORRIDOR = evidenceOf([
  node('home', 'residence', 'Wooden house', { people: 40, buildingIndex: 1 }),
  node('home2', 'residence', 'Panelak', { people: 10, buildingIndex: 2 }),
  node('work', 'workplace', 'Coal mine', { workerSlots: 40, buildingIndex: 3 }),
  node('shop', 'workplace', 'Alcohol kiosk', { workerSlots: 2, buildingIndex: 4 }),
], [
  walk('a', 'home', 'work', 143),
  walk('b', 'home2', 'work', 174),
  walk('c', 'home', 'shop', 90),
]);

test('the focus sits in the middle with what feeds it on the left', () => {
  const view = buildAccessEgoView(CORRIDOR, { focusId: 'work' });

  const at = id => view.nodes.find(item => item.id === id);
  assert.equal(view.focusId, 'work');
  assert.deepEqual([at('work').x, at('work').y], [0, 0], 'the focus is the origin');
  assert.ok(at('home').x < 0 && at('home2').x < 0, 'inbound neighbours go left');
  // Nearest first, top to bottom: 143 m before 174 m.
  assert.ok(at('home').y < at('home2').y);
});

test('what the focus leads to goes right', () => {
  const view = buildAccessEgoView(CORRIDOR, { focusId: 'home' });

  const at = id => view.nodes.find(item => item.id === id);
  assert.ok(at('shop').x > 0 && at('work').x > 0, 'outbound neighbours go right');
  assert.ok(at('shop').y < at('work').y, '90 m sits above 143 m');
});

// The old view hid most of the graph behind "+754 more nodes" with no way to
// tell which node was withholding what.
test('every node says how many neighbours it is still holding', () => {
  const view = buildAccessEgoView(CORRIDOR, { focusId: 'work' });

  const at = id => view.nodes.find(item => item.id === id);
  assert.equal(at('work').hiddenNeighbours, 0, 'the focus is fully open');
  assert.equal(at('home').hiddenNeighbours, 1, 'the kiosk it also feeds is not drawn yet');
  assert.equal(at('home2').hiddenNeighbours, 0);
  assert.equal(view.totalNodes, 4);
});

test('expanding a node opens exactly that node, in place', () => {
  const before = buildAccessEgoView(CORRIDOR, { focusId: 'work' });
  const after = buildAccessEgoView(CORRIDOR, { focusId: 'work', expandedIds: ['home'] });

  const at = (view, id) => view.nodes.find(item => item.id === id);
  assert.ok(!at(before, 'shop'), 'the kiosk was not there before');
  assert.ok(at(after, 'shop'), 'expanding the house brings it in');
  assert.equal(at(after, 'home').hiddenNeighbours, 0, 'the house holds nothing back now');
  // Nothing that was already on screen moves, so the reader's picture survives.
  for (const id of ['work', 'home', 'home2']) {
    assert.deepEqual(
      [at(after, id).x, at(after, id).y],
      [at(before, id).x, at(before, id).y], `${id} stayed put`,
    );
  }
});

test('one click cannot detonate the canvas', () => {
  const many = Array.from({ length: NEIGHBOUR_CAP + 15 }, (_, index) =>
    node(`h${index}`, 'residence', `House ${index}`, { people: 4 }));
  const evidence = evidenceOf(
    [node('work', 'workplace', 'Mine', { workerSlots: 90 }), ...many],
    many.map((item, index) => walk(`e${index}`, item.id, 'work', 100 + index)),
  );

  const view = buildAccessEgoView(evidence, { focusId: 'work' });

  assert.equal(view.nodes.length, NEIGHBOUR_CAP + 1, 'the focus plus its cap');
  assert.equal(view.nodes.find(item => item.id === 'work').hiddenNeighbours, 15);
  // The ones it kept are the nearest, not an arbitrary slice.
  assert.ok(view.nodes.some(item => item.id === 'h0'));
  assert.ok(!view.nodes.some(item => item.id === `h${NEIGHBOUR_CAP + 14}`));
});

test('a focus that no longer exists falls back rather than emptying the canvas', () => {
  const view = buildAccessEgoView(CORRIDOR, { focusId: 'nothing-like-this' });

  assert.equal(view.focusId, 'home', 'the first residence stands in');
  assert.ok(view.nodes.length > 0);
});

test('evidence that is not exact yields no view at all', () => {
  assert.equal(buildAccessEgoView(null).available, false);
  assert.equal(buildAccessEgoView({
    completeness: 'unavailable', walkingEdgesComplete: false,
    nodes: [], edges: [],
  }).available, false);
});

// A building enough people can reach needs no arithmetic on its card — a tick
// says it. Only a shortfall is worth the reader's attention. The old card
// printed "5/10 staffed", which was the bound from whichever node happened to
// be focused and read as a verdict on the building itself.
test('a workplace everyone can reach gets a tick, not a sum', () => {
  const card = nodeCardLabel(
    { kind: 'workplace', label: 'Coal mine', workerSlots: 40, staffable: true, reachableAdults: 900 },
    null, { places: 'places' },
  );

  assert.equal(card.split('\n')[1], '✓ 40 places');
});

test('a workplace nobody can fill states the shortfall', () => {
  const card = nodeCardLabel(
    { kind: 'workplace', label: 'Coal mine', workerSlots: 40, staffable: false, reachableAdults: 9 },
    null, { ofCanReach: 'of', canReach: 'can reach it' },
  );

  assert.equal(card.split('\n')[1], '9 of 40 can reach it');
});

test('a workplace with no catchment measured claims neither', () => {
  const card = nodeCardLabel(
    { kind: 'workplace', label: 'Coal mine', workerSlots: 40, staffable: null },
    null, { places: 'places' },
  );

  assert.equal(card.split('\n')[1], '40 places');
});

test('a very long mod name is shortened rather than overflowing its card', () => {
  const card = nodeCardLabel(
    { kind: 'workplace', label: 'Fire station · Hanpeterkleindorf Feuerwache Wetterologie' },
    null, {},
  );

  const name = card.split('\n')[0];
  assert.ok(name.length < 56, name);
  assert.ok(name.endsWith('…'));
  // Still far more than the eighteen characters that made two stations
  // indistinguishable.
  assert.ok(name.includes('Hanpeterkleindorf'));
});

test('a card with nothing held back and no bound still says what it is', () => {
  assert.equal(
    nodeCardLabel({ kind: 'stop', label: 'Bus platform', hiddenNeighbours: 0 }, null,
      { stop: 'Stop' }).split('\n')[1],
    'Stop',
  );
  assert.equal(
    nodeCardLabel({ kind: 'residence', label: 'Panelak', people: 41.4 }, null,
      { adults: 'adults' }).split('\n')[1],
    '41 adults',
  );
});

// A dozen neighbours fanned into one column stood a thousand units tall in a
// canvas four hundred high, so fitting it shrank every label past reading.
test('a wide fan wraps into columns instead of one unreadable tower', () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    node(`w${index}`, 'workplace', `Works ${index}`, { workerSlots: 5 }));
  const evidence = evidenceOf(
    [node('home', 'residence', 'Panelak', { people: 60 }), ...many],
    many.map((item, index) => walk(`e${index}`, 'home', item.id, 100 + index)),
  );

  const view = buildAccessEgoView(evidence, { focusId: 'home' });
  const spread = axis => {
    const values = view.nodes.map(item => item[axis]);
    return Math.max(...values) - Math.min(...values);
  };

  assert.equal(view.nodes.length, 13);
  const columns = new Set(view.nodes.filter(item => item.id !== 'home').map(item => item.x));
  assert.equal(columns.size, 3, 'twelve neighbours make three columns of five');
  // Roughly as wide as it is tall is what keeps a fit from shrinking the cards.
  assert.ok(spread('x') > spread('y') * 0.6,
    `x spread ${spread('x')} against y spread ${spread('y')}`);
});

test('a fan that fits one column keeps one column', () => {
  const few = Array.from({ length: 4 }, (_, index) =>
    node(`w${index}`, 'workplace', `Works ${index}`, { workerSlots: 5 }));
  const evidence = evidenceOf(
    [node('home', 'residence', 'Panelak', { people: 60 }), ...few],
    few.map((item, index) => walk(`e${index}`, 'home', item.id, 100 + index)),
  );

  const view = buildAccessEgoView(evidence, { focusId: 'home' });

  assert.equal(new Set(view.nodes.filter(item => item.id !== 'home').map(item => item.x)).size, 1);
});

// Whether a building can be staffed is a question about everyone who can reach
// it, not about the corridor from whichever node the reader focused.
test('staffability comes from the catchment, not from the focus', () => {
  const evidence = {
    ...CORRIDOR,
    catchment: new Map([
      [3, { walkAdults: 30, transitAdults: 15 }],
      [4, { walkAdults: 1, transitAdults: 0 }],
    ]),
  };

  const view = buildAccessEgoView(evidence, { focusId: 'home' });
  const at = id => view.nodes.find(item => item.id === id);

  assert.equal(at('work').staffable, true, '45 adults reach a mine with 40 places');
  assert.equal(at('work').reachableAdults, 45);
  assert.equal(at('shop').staffable, false, '1 adult reaches a kiosk with 2 places');
  assert.equal(at('home').staffable, null, 'a residence has no places to fill');
});

test('without a catchment nothing is claimed either way', () => {
  const view = buildAccessEgoView(CORRIDOR, { focusId: 'home' });

  assert.equal(view.nodes.find(item => item.id === 'work').staffable, null);
});

// A save names most housing automatically, so a workplace fed by two dozen
// identical panelaks drew two dozen cards all reading "Wooden house".
test('names that repeat on screen are told apart by their building number', () => {
  const houses = Array.from({ length: 3 }, (_, index) =>
    node(`h${index}`, 'residence', 'Wooden house', { people: 5, buildingIndex: 10 + index }));
  const evidence = evidenceOf(
    [node('work', 'workplace', 'Coal mine', { workerSlots: 40, buildingIndex: 1 }), ...houses],
    houses.map((item, index) => walk(`e${index}`, item.id, 'work', 100 + index)),
  );

  const view = buildAccessEgoView(evidence, { focusId: 'work' });

  assert.deepEqual(view.nodes.filter(item => item.kind === 'residence').map(item => item.label),
    ['Wooden house #10', 'Wooden house #11', 'Wooden house #12']);
  assert.equal(view.nodes.find(item => item.id === 'work').label, 'Coal mine',
    'a name that stands alone is left alone');
});
