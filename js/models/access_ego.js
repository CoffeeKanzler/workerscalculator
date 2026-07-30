// The neighbourhood around one node, and where to draw it.
//
// The graph used to lay every node out in fixed stage columns and then hide
// whatever did not fit — "+754 more nodes, +570 more links not drawn". A reader
// cannot tell what was withheld or why, and the columns squeezed a whole
// republic into 900 units of width whatever the screen.
//
// This shows the focus and its immediate neighbours only, and says on each node
// how many more it is holding back. Clicking a node expands it in place, so the
// picture grows the way the reader asked it to rather than arriving as a
// hairball. Direction stays legible: whoever the focus draws people *from* is
// placed on the left, whatever it leads *to* on the right.
//
// Layout is computed here rather than left to the graph library so it is
// deterministic — the same save and the same clicks give the same picture, which
// is what makes it testable.
import { workerAccessAvailability, widestWorkplaceBounds } from './access_graph.js?v=17';

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 76;
const COLUMN_GAP = 120;
const ROW_GAP = 24;

// A residence in a dense city feeds a dozen workplaces. Fanned into one column
// that is a thousand units tall in a canvas four hundred high, so fitting it
// shrank every label past reading. Past this many the fan wraps into a second
// column further out, which keeps the picture roughly as wide as it is tall.
const ROWS_PER_COLUMN = 5;

// One click must not detonate the canvas: a tram line calling at forty stops
// would otherwise arrive all at once.
export const NEIGHBOUR_CAP = 24;

function adjacency(nodes, edges) {
  const inbound = new Map(nodes.map(node => [node.id, []]));
  const outbound = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    outbound.get(edge.source)?.push(edge);
    inbound.get(edge.target)?.push(edge);
  }
  return { inbound, outbound };
}

// Nearest first: the corridor a worker actually uses is the short one, and a
// reader scanning down a fan should meet it before the 400 m outliers.
function byDistance(a, b) {
  return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0) || a.id.localeCompare(b.id);
}

// Where the nth neighbour on one side of a node goes: down its column, then
// wrapping into the next column out.
export function fanPosition(index, count, origin, direction) {
  const columns = Math.max(1, Math.ceil(count / ROWS_PER_COLUMN));
  const column = Math.floor(index / ROWS_PER_COLUMN);
  const inColumn = index % ROWS_PER_COLUMN;
  const height = column === columns - 1 && count % ROWS_PER_COLUMN
    ? count % ROWS_PER_COLUMN : Math.min(ROWS_PER_COLUMN, count);
  const span = height * NODE_HEIGHT + Math.max(0, height - 1) * ROW_GAP;
  return {
    x: origin.x + direction * (NODE_WIDTH + COLUMN_GAP) * (column + 1),
    y: origin.y - span / 2 + inColumn * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT / 2,
  };
}

export function buildAccessEgoView(evidence, {
  focusId = null,
  expandedIds = [],
  neighbourCap = NEIGHBOUR_CAP,
} = {}) {
  const availability = workerAccessAvailability(evidence);
  if (!availability.available) return { ...availability, nodes: [], edges: [] };

  const allNodes = evidence.nodes;
  const nodeById = new Map(allNodes.map(node => [node.id, node]));
  const resolvedFocus = nodeById.has(focusId)
    ? focusId
    : allNodes.find(node => node.kind === 'residence')?.id ?? allNodes[0]?.id ?? null;
  if (!resolvedFocus) {
    return {
      available: true, reason: null, focusId: null,
      nodes: [], edges: [], upperBounds: [], totalNodes: allNodes.length,
    };
  }

  const { inbound, outbound } = adjacency(allNodes, evidence.edges);
  // The focus is always open; anything else only once the reader has clicked it.
  const opened = new Set([resolvedFocus, ...expandedIds.filter(id => nodeById.has(id))]);

  const placed = new Map();
  const drawnEdges = new Map();
  const heldBack = new Map();

  const place = (id, x, y) => {
    if (!placed.has(id)) placed.set(id, { ...nodeById.get(id), x, y });
    return placed.get(id);
  };
  place(resolvedFocus, 0, 0);

  // Breadth-first over the opened nodes only, so an expansion three hops out
  // still lands beside the node it came from rather than rearranging the world.
  const queue = [resolvedFocus];
  const visited = new Set([resolvedFocus]);
  while (queue.length) {
    const id = queue.shift();
    const origin = placed.get(id);
    for (const [edges, direction] of [[inbound.get(id) ?? [], -1], [outbound.get(id) ?? [], 1]]) {
      const sorted = [...edges].sort(byDistance);
      const shown = opened.has(id) ? sorted.slice(0, neighbourCap) : [];
      const held = sorted.length - shown.length;
      if (held > 0) heldBack.set(id, (heldBack.get(id) ?? 0) + held);
      const fresh = shown.filter(edge => {
        const other = direction < 0 ? edge.source : edge.target;
        return !placed.has(other);
      });
      let row = 0;
      for (const edge of shown) {
        const other = direction < 0 ? edge.source : edge.target;
        if (!placed.has(other)) {
          const spot = fanPosition(row, fresh.length, origin, direction);
          place(other, spot.x, spot.y);
          row += 1;
        }
        drawnEdges.set(edge.id, edge);
        if (!visited.has(other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
  }

  // How many links a node is still holding, counted against everything it has —
  // so "+7" means seven the reader has not seen, not seven of some inner subset.
  // Whether a workplace can be staffed at all is a question about everyone who
  // can reach it, not about the corridor from whichever node the reader happens
  // to have focused. That is the catchment, and it is the same measure the
  // overview raises its alerts from.
  const reachableAt = index => {
    const row = evidence.catchment?.get?.(index);
    return row ? (row.walkAdults ?? 0) + (row.transitAdults ?? 0) : null;
  };
  const nodes = [...placed.values()].map(node => {
    const total = (inbound.get(node.id)?.length ?? 0) + (outbound.get(node.id)?.length ?? 0);
    const drawn = evidence.edges.filter(edge =>
      drawnEdges.has(edge.id) && (edge.source === node.id || edge.target === node.id)).length;
    const reachable = Number.isInteger(node.buildingIndex) ? reachableAt(node.buildingIndex) : null;
    const slots = Number.isFinite(node.workerSlots) ? node.workerSlots : 0;
    return {
      ...node,
      expanded: opened.has(node.id),
      focused: node.id === resolvedFocus,
      hiddenNeighbours: Math.max(0, total - drawn),
      reachableAdults: reachable,
      staffable: slots > 0 && reachable != null ? reachable >= slots : null,
    };
  });

  // Twenty-four neighbours all reading "Wooden house" tell the reader nothing and
  // make the panel's list of legs unusable. Where a name repeats on screen, the
  // save's own building number settles which is which.
  const seen = new Map();
  for (const item of nodes) seen.set(item.label, (seen.get(item.label) ?? 0) + 1);
  const labelled = nodes.map(item => (seen.get(item.label) > 1 && Number.isInteger(item.buildingIndex)
    ? { ...item, label: `${item.label} #${item.buildingIndex}` }
    : item));

  return {
    available: true,
    reason: null,
    focusId: resolvedFocus,
    nodes: labelled,
    edges: [...drawnEdges.values()],
    upperBounds: widestWorkplaceBounds(allNodes, evidence.edges, resolvedFocus),
    totalNodes: allNodes.length,
    totalEdges: evidence.edges.length,
  };
}
