// The worker access graph, on a canvas the reader can actually move around.
//
// What this replaces: a fixed 900-unit SVG with no pan, no zoom and no hover,
// names clipped at eighteen characters, edge labels colliding wherever a column
// had more than one link, and three buttons on the side — "Focus corridor here",
// "Expand neighborhood" — that never said what they did.
//
// Cytoscape is vendored beside Leaflet and uPlot rather than imported from a CDN
// so the offline addon build keeps working and the browser test can go on
// failing the run if any request leaves the page's origin. That test is the
// guard that a save never escapes the machine it was opened on.
import cytoscape from '../vendor/cytoscape-src.esm.js?v=3';
import { buildAccessEgoView, NODE_HEIGHT, NODE_WIDTH } from '../models/access_ego.js?v=8';

const DEFAULT_LABELS = {
  title: 'Worker access graph',
  exact: 'exact saved evidence',
  unavailable: 'Reachability not available yet',
  missing: 'This save has no decoded walking-edge evidence.',
  incomplete: 'Walking-edge decoding is incomplete, so reachability would be misleading.',
  notExact: 'At least one walking link is not exact, so no access claims are shown.',
  invalid: 'The saved access evidence is internally inconsistent.',
  select: 'Select a node to inspect its access corridor.',
  locate: 'Locate on map',
  maxWorkers: 'Theoretical maximum workers',
  ofSlots: 'of the workplace',
  bottleneck: 'Bottleneck',
  connections: 'Visible connections',
  residence: 'Residence',
  stop: 'Stop',
  line: 'Transport line',
  transfer: 'Transfer',
  workplace: 'Workplace',
  walk: 'Walk',
  board: 'Board',
  ride: 'Ride',
  direct: 'same footpath',
  hint: 'Click a node to open what connects to it · double-click to start again from there · drag to pan, scroll to zoom',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  arrivesBy: 'People arrive by',
  places: 'places',
  adults: 'adults',
  ofCanReach: 'of',
  canReach: 'can reach it',
  staffable: 'Enough people can reach this building to fill it',
  notStaffable: 'Fewer people can reach this building than it has places',
  leadsTo: 'From here they reach',
  more: 'more',
  showingOf: 'showing {shown} of {total}',
};

// Geometric glyphs, not emoji: an emoji falls back to a tofu box wherever the
// font is missing, and "□ Coal mine" is worse than no glyph at all. These live
// in every font that ships with a browser.
const KIND_MARK = {
  residence: '●',
  stop: '◆',
  line: '▬',
  transfer: '⇄',
  workplace: '■',
};

// Long enough for any real building name — the old view clipped at eighteen
// characters, which made two cableway stations indistinguishable — but short
// enough that a mod's four-word name cannot overflow its card.
const NAME_LIMIT = 46;

function clampName(label) {
  const name = String(label ?? '');
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT - 1)}…` : name;
}

function html(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2), value);
    } else if (value != null) {
      element.setAttribute(key, value);
    }
  }
  element.append(...children.filter(child => child != null));
  return element;
}

export function accessGraphReasonKey(reason) {
  if (reason === 'walking-evidence-missing') return 'missing';
  if (reason === 'walking-evidence-incomplete') return 'incomplete';
  if (reason === 'walking-edge-not-exact') return 'notExact';
  return 'invalid';
}

export function workerAccessEdgeLabel(edge, labels = {}) {
  const name = key => labels[key] ?? key;
  const parts = edge.kind === 'walk'
    ? [`${Math.round(edge.distanceMeters)} m`, name(edge.pathType)]
    : [name(edge.kind)];
  if (Number.isFinite(edge.capacityUpperBound)) {
    parts.push(`≤${Math.round(edge.capacityUpperBound)}`);
  }
  return parts.join(' · ');
}

export function boundLabel(bound) {
  const workers = Math.round(bound.workers);
  if (!bound.slots) return `≤${workers}`;
  return `≤${workers}/${Math.round(bound.slots)}`;
}

// The card's own two lines. The name is never clipped — a graph whose nodes read
// "Small cableway st…" cannot be used to tell two stations apart.
export function nodeCardLabel(node, bound, labels = {}) {
  const mark = KIND_MARK[node.kind] ?? '●';
  const facts = [];
  const slots = Number.isFinite(node.workerSlots) ? node.workerSlots : 0;
  // A building that enough people can reach needs no arithmetic on its card —
  // a tick says it. Only a shortfall is worth the reader's attention, and then
  // the numbers behind it are the point.
  if (slots > 0 && node.staffable === true) {
    facts.push(`✓ ${slots} ${labels.places ?? 'places'}`);
  } else if (slots > 0 && node.staffable === false) {
    facts.push(`${Math.round(node.reachableAdults)} ${labels.ofCanReach ?? 'of'} ${slots} ${labels.canReach ?? 'can reach'}`);
  } else if (slots > 0) {
    facts.push(`${slots} ${labels.places ?? 'places'}`);
  }
  if (Number.isFinite(node.people)) facts.push(`${Math.round(node.people)} ${labels.adults ?? 'adults'}`);
  if (node.hiddenNeighbours > 0) facts.push(`+${node.hiddenNeighbours} ${labels.more ?? 'more'}`);
  const kind = labels[node.kind] ?? node.kind;
  return `${mark}  ${clampName(node.label)}\n${facts.length ? facts.join(' · ') : kind}`;
}

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  const value = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    text: value('--text', '#252a29'),
    muted: value('--muted', '#626762'),
    panel: value('--panel', '#f1eadb'),
    border: value('--border', '#aaa18f'),
    accent: value('--accent', '#9f2f2b'),
    accent2: value('--accent2', '#a36f19'),
    blueprint: value('--blueprint', '#48657b'),
    focus: value('--focus', '#1f587d'),
    neg: value('--neg', '#9f2f2b'),
  };
}

const kindColors = colors => ({
  residence: colors.blueprint,
  stop: colors.accent2,
  transfer: colors.accent2,
  line: colors.focus,
  workplace: colors.accent,
});

function graphStyle(colors) {
  return [
    {
      selector: 'node',
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        shape: 'round-rectangle',
        'background-color': colors.panel,
        'border-width': 1,
        'border-color': colors.border,
        label: 'data(card)',
        'text-wrap': 'wrap',
        'text-max-width': NODE_WIDTH - 28,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 12,
        'font-weight': 600,
        'line-height': 1.35,
        color: colors.text,
        'transition-property': 'opacity, border-width',
        'transition-duration': '140ms',
      },
    },
    ...Object.entries(kindColors(colors)).map(([name, color]) => ({
      selector: `node[kind = "${name}"]`,
      style: {
        'border-color': color,
        'border-width': 2,
        // A wash of the kind's own colour down one edge, so a stop and a
        // workplace are told apart at a glance without reading either.
        'background-fill': 'linear-gradient',
        'background-gradient-direction': 'to-right',
        'background-gradient-stop-colors': `${color} ${colors.panel} ${colors.panel}`,
        'background-gradient-stop-positions': '0% 6% 100%',
      },
    })),
    { selector: 'node[kind = "line"]', style: { 'border-style': 'double', 'border-width': 4 } },
    {
      selector: 'node.focused',
      style: {
        'border-width': 3,
        'underlay-color': colors.focus,
        'underlay-opacity': 0.2,
        'underlay-padding': 10,
        'font-weight': 700,
      },
    },
    {
      selector: 'node.selected',
      style: {
        'border-width': 3,
        'underlay-color': colors.accent,
        'underlay-opacity': 0.24,
        'underlay-padding': 12,
      },
    },
    { selector: 'node[expandable > 0]', style: { 'border-style': 'dashed' } },
    {
      selector: 'node[staffable = "short"]',
      style: {
        'border-color': colors.neg,
        'border-width': 3,
        'background-gradient-stop-colors': `${colors.neg} ${colors.panel} ${colors.panel}`,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'curve-style': 'bezier',
        'control-point-step-size': 70,
        'line-color': colors.muted,
        'target-arrow-color': colors.muted,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.1,
        opacity: 0.8,
        label: 'data(label)',
        'font-size': 11,
        'font-weight': 500,
        color: colors.muted,
        'text-background-color': colors.panel,
        'text-background-opacity': 0.92,
        'text-background-padding': 3,
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'transition-property': 'opacity, width',
        'transition-duration': '140ms',
      },
    },
    {
      selector: 'edge[kind = "walk"]',
      style: { 'line-color': colors.blueprint, 'target-arrow-color': colors.blueprint },
    },
    {
      selector: 'edge[kind = "ride"]',
      style: {
        'line-color': colors.focus,
        'target-arrow-color': colors.focus,
        width: 3,
        'line-style': 'dashed',
        'line-dash-pattern': [10, 6],
      },
    },
    {
      selector: 'edge[kind = "board"]',
      style: { 'line-color': colors.focus, 'target-arrow-color': colors.focus },
    },
    {
      selector: 'edge[kind = "transfer"]',
      style: {
        'line-color': colors.accent2,
        'target-arrow-color': colors.accent2,
        'line-style': 'dotted',
        width: 3,
      },
    },
    {
      selector: 'edge.bottleneck',
      style: {
        'line-color': colors.neg, 'target-arrow-color': colors.neg, width: 4, opacity: 1,
      },
    },
    // Hovering asks "what touches this?", so everything that does not is pushed
    // back rather than removed — the shape of the whole stays readable.
    { selector: '.faded', style: { opacity: 0.12, 'text-opacity': 0 } },
    { selector: 'edge', style: { 'text-opacity': 0 } },
    { selector: 'edge.telling', style: { 'text-opacity': 1 } },
  ];
}

export function mountWorkerAccessGraph(container, evidence, {
  labels: suppliedLabels = {},
  initialFocusId = null,
  showHeading = true,
  onLocateBuilding = null,
  onSelectionChange = null,
  cytoscapeFactory = cytoscape,
} = {}) {
  const labels = { ...DEFAULT_LABELS, ...suppliedLabels };
  let focusId = initialFocusId;
  let selectedId = initialFocusId;
  const expandedIds = new Set();
  let cy = null;
  let dashTimer = null;

  const teardown = () => {
    if (dashTimer) cancelAnimationFrame(dashTimer);
    dashTimer = null;
    cy?.destroy();
    cy = null;
  };

  const renderUnavailable = view => {
    teardown();
    const reason = accessGraphReasonKey(view.reason);
    container.replaceChildren(html('section', {
      class: 'worker-access-unavailable',
      role: 'status',
      'data-access-unavailable': reason,
    },
    html('div', { class: 'worker-access-evidence-mark', 'aria-hidden': 'true' }, '×'),
    html('div', {},
      html('h3', {}, labels.unavailable),
      html('p', {}, labels[reason]))));
  };

  const elementsFor = view => {
    const bounds = new Map(view.upperBounds.map(bound => [bound.nodeId, bound]));
    const bottlenecks = new Set(view.upperBounds
      .map(bound => bound.bottleneckEdgeId).filter(Boolean));
    const nodes = view.nodes.map(node => ({
      group: 'nodes',
      data: {
        id: node.id,
        kind: node.kind,
        card: nodeCardLabel(node, bounds.get(node.id), labels),
        expandable: node.hiddenNeighbours,
        staffable: node.staffable === false ? 'short' : node.staffable === true ? 'full' : '',
        buildingIndex: Number.isInteger(node.buildingIndex) ? node.buildingIndex : null,
      },
      position: { x: node.x, y: node.y },
      classes: [node.focused ? 'focused' : '', node.id === selectedId ? 'selected' : '']
        .filter(Boolean).join(' '),
    }));
    const edges = view.edges.map(edge => ({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
        label: workerAccessEdgeLabel(edge, labels),
      },
      classes: bottlenecks.has(edge.id) ? 'bottleneck' : '',
    }));
    return [...nodes, ...edges];
  };

  const inspector = html('aside', {
    class: 'worker-access-inspector',
    'aria-live': 'polite',
    'data-access-inspector': '',
  });

  const renderInspector = view => {
    const node = view.nodes.find(item => item.id === selectedId)
      ?? view.nodes.find(item => item.id === view.focusId);
    if (!node) {
      inspector.replaceChildren(html('p', { class: 'hint' }, labels.select));
      return;
    }
    const nameOf = id => view.nodes.find(item => item.id === id)?.label
      ?? evidence.nodes.find(item => item.id === id)?.label ?? id;
    const legList = (title, legs, otherEnd) => (legs.length
      ? html('div', { class: 'worker-access-legs' },
        html('p', { class: 'worker-access-kind' }, title),
        ...legs.slice(0, 8).map(edge => html('p', { class: 'worker-access-connection' },
          `${workerAccessEdgeLabel(edge, labels)} — ${nameOf(otherEnd(edge))}`)))
      : null);
    inspector.replaceChildren(...[
      html('p', { class: 'worker-access-kind' }, labels[node.kind] ?? node.kind),
      html('h4', {}, node.label),
      node.staffable != null ? html('p', {
        class: `worker-access-headline${node.staffable ? '' : ' short'}`,
      }, node.staffable ? labels.staffable
        : labels.notStaffable
          .replace('{reachable}', String(Math.round(node.reachableAdults)))
          .replace('{slots}', String(node.workerSlots))) : null,
      legList(labels.arrivesBy, view.edges.filter(edge => edge.target === node.id),
        edge => edge.source),
      legList(labels.leadsTo, view.edges.filter(edge => edge.source === node.id),
        edge => edge.target),
      Number.isInteger(node.buildingIndex) && onLocateBuilding
        ? html('div', { class: 'worker-access-actions' },
          html('button', {
            type: 'button',
            onclick: () => onLocateBuilding(node.buildingIndex),
          }, labels.locate))
        : null,
    ].filter(child => child != null));
  };

  // Marching dashes on the riding legs: the only motion on the canvas, and it
  // carries meaning — that is the leg which moves without anyone walking.
  const animateRides = () => {
    let offset = 0;
    const step = () => {
      offset = (offset - 0.7) % 64;
      cy?.edges('[kind = "ride"]').style('line-dash-offset', offset);
      dashTimer = requestAnimationFrame(step);
    };
    dashTimer = requestAnimationFrame(step);
  };

  const highlight = node => {
    if (!cy) return;
    if (!node) {
      cy.elements().removeClass('faded');
      tellLabels(null);
      return;
    }
    const keep = node.closedNeighborhood();
    cy.elements().difference(keep).addClass('faded');
    keep.removeClass('faded');
    tellLabels(node);
  };

  // Distances belong to the node the reader is asking about. Drawn on every edge
  // at once they crossed the cards and each other; drawn on the edges touching
  // the hovered or selected node they are exactly the answer.
  const tellLabels = node => {
    if (!cy) return;
    cy.edges().removeClass('telling');
    const anchor = node ?? cy.getElementById(selectedId);
    if (anchor?.nonempty?.() ?? anchor) anchor.connectedEdges().addClass('telling');
  };

  // Fitting a wide neighbourhood into a short canvas shrank the cards until the
  // names were unreadable, which is the whole thing this view exists to fix. So
  // the fit has a floor: below it the picture is centred on the focus and the
  // reader pans instead of squinting.
  const MINIMUM_READABLE_ZOOM = 0.62;
  const fitToView = () => {
    if (!cy) return;
    cy.fit(undefined, 50);
    if (cy.zoom() >= MINIMUM_READABLE_ZOOM) return;
    cy.zoom(MINIMUM_READABLE_ZOOM);
    const focused = cy.getElementById(focusId);
    if (focused.nonempty()) cy.center(focused);
  };

  const render = ({ animate = false } = {}) => {
    const view = buildAccessEgoView(evidence, { focusId, expandedIds: [...expandedIds] });
    if (!view.available) {
      renderUnavailable(view);
      return;
    }
    focusId = view.focusId;
    if (!view.nodes.some(node => node.id === selectedId)) selectedId = focusId;
    const counter = labels.showingOf
      .replace('{shown}', String(view.nodes.length))
      .replace('{total}', String(view.totalNodes));

    if (!cy) {
      const canvas = html('div', { class: 'worker-access-canvas', 'data-access-canvas': '' });
      const zoomBy = factor => cy?.zoom({
        level: cy.zoom() * factor,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
      const shell = html('section', { class: 'worker-access-shell' },
        showHeading ? html('header', { class: 'worker-access-heading' },
          html('div', {},
            html('h3', {}, labels.title),
            html('span', { class: 'evidence-badge exact' }, labels.exact))) : null,
        html('div', { class: 'worker-access-body' },
          html('div', { class: 'worker-access-stage' },
            canvas,
            html('div', { class: 'worker-access-controls' },
              html('button', {
                type: 'button', title: labels.fit, 'data-access-fit': '',
                onclick: fitToView,
              }, '⤢'),
              html('button', { type: 'button', title: labels.zoomIn, onclick: () => zoomBy(1.3) }, '+'),
              html('button', { type: 'button', title: labels.zoomOut, onclick: () => zoomBy(1 / 1.3) }, '−')),
            html('p', { class: 'worker-access-counter', 'data-access-counter': '' }, counter)),
          inspector),
        html('p', { class: 'worker-access-hint hint' }, labels.hint));
      container.replaceChildren(shell);

      cy = cytoscapeFactory({
        container: canvas,
        elements: elementsFor(view),
        style: graphStyle(themeColors()),
        layout: { name: 'preset' },
        wheelSensitivity: 0.25,
        minZoom: 0.2,
        maxZoom: 2.5,
        boxSelectionEnabled: false,
        autounselectify: true,
      });
      cy.on('tap', 'node', event => selectNode(event.target.id()));
      cy.on('dbltap', 'node', event => reroot(event.target.id()));
      cy.on('mouseover', 'node', event => highlight(event.target));
      cy.on('mouseout', 'node', () => highlight(null));
      cy.on('tap', event => { if (event.target === cy) highlight(null); });
      // Edge labels stack into an unreadable smear when zoomed out, so they wait
      // until there is room for them.
      cy.ready(() => {
        fitToView();
        tellLabels(null);
      });
      animateRides();
    } else {
      cy.batch(() => {
        cy.elements().remove();
        cy.add(elementsFor(view));
      });
      cy.layout({ name: 'preset', animate, animationDuration: 220 }).run();
      tellLabels(null);
      container.querySelector('[data-access-counter]')?.replaceChildren(counter);
    }
    const canvas = container.querySelector('[data-access-canvas]');
    if (canvas) {
      canvas.dataset.accessNodeCount = String(view.nodes.length);
      canvas.dataset.accessEdgeCount = String(view.edges.length);
      canvas.dataset.accessFocus = String(view.focusId ?? '');
    }
    renderInspector(view);
  };

  const selectNode = id => {
    const wasSelected = selectedId === id;
    selectedId = id;
    onSelectionChange?.(evidence?.nodes?.find(node => node.id === id) ?? null);
    // The first click selects; clicking a node that is already selected is the
    // reader asking for what it is holding back.
    if (wasSelected || !expandedIds.has(id)) expandedIds.add(id);
    render({ animate: true });
  };

  const reroot = id => {
    focusId = id;
    selectedId = id;
    expandedIds.clear();
    render({ animate: true });
    fitToView();
  };

  render();
  return {
    focus(id) {
      focusId = id;
      selectedId = id;
      expandedIds.clear();
      render();
      fitToView();
    },
    destroy() {
      teardown();
      container.replaceChildren();
    },
  };
}
