import { buildWorkerAccessGraph } from '../models/access_graph.js?v=1';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_LABELS = {
  title: 'Worker access graph',
  exact: 'exact saved evidence',
  unavailable: 'Reachability not available yet',
  missing: 'This save has no decoded walking-edge evidence.',
  incomplete: 'Walking-edge decoding is incomplete, so reachability would be misleading.',
  notExact: 'At least one walking link is not exact, so no access claims are shown.',
  invalid: 'The saved access evidence is internally inconsistent.',
  select: 'Select a node to inspect its access corridor.',
  focus: 'Focus corridor here',
  expand: 'Expand neighborhood',
  locate: 'Locate on map',
  hidden: 'more nodes outside this neighborhood',
  hiddenEdges: 'more links not drawn',
  maxWorkers: 'Theoretical maximum workers',
  bottleneck: 'Bottleneck',
  walkingDistance: 'Walking distance',
  pathType: 'Path type',
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
};

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

function svg(tag, attrs = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
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

function clippedLabel(value, maximum = 18) {
  const label = String(value ?? '');
  return label.length > maximum ? `${label.slice(0, maximum - 1)}…` : label;
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

function nodeAriaLabel(node, bound, labels) {
  const kind = labels[node.kind] ?? node.kind;
  const capacity = bound ? `. ${labels.maxWorkers}: ${Math.round(bound.workers)}` : '';
  return `${kind}: ${node.label}${capacity}`;
}

export function mountWorkerAccessGraph(container, evidence, {
  labels: suppliedLabels = {},
  initialFocusId = null,
  maxNodes = 48,
  showHeading = true,
  onLocateBuilding = null,
  onSelectionChange = null,
} = {}) {
  const labels = { ...DEFAULT_LABELS, ...suppliedLabels };
  let focusId = initialFocusId;
  let selectedId = initialFocusId;
  const expandedIds = new Set();

  const renderUnavailable = graph => {
    const reason = accessGraphReasonKey(graph.reason);
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

  const hiddenLabel = graph => (graph.hiddenEdges
    ? `+${graph.hiddenNodes} ${labels.hidden} · +${graph.hiddenEdges} ${labels.hiddenEdges}`
    : `+${graph.hiddenNodes} ${labels.hidden}`);

  const render = () => {
    const graph = buildWorkerAccessGraph(evidence, {
      focusId,
      expandedIds: [...expandedIds],
      maxNodes,
    });
    if (!graph.available) {
      renderUnavailable(graph);
      return;
    }
    focusId = graph.focusId;
    if (!graph.nodes.some(node => node.id === selectedId)) selectedId = focusId;
    const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
    const boundsByNode = new Map(graph.upperBounds.map(bound => [bound.nodeId, bound]));
    const edgeElements = [];
    for (const edge of graph.edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      const x1 = source.x + 59;
      const x2 = target.x - 59;
      const label = workerAccessEdgeLabel(edge, labels);
      edgeElements.push(svg('g', {
        class: `worker-access-edge edge-${edge.kind}${edge.bottleneck ? ' bottleneck' : ''}`,
      },
      svg('line', {
        x1, y1: source.y, x2, y2: target.y,
        'marker-end': 'url(#worker-access-arrow)',
      }),
      svg('text', {
        x: (x1 + x2) / 2,
        y: (source.y + target.y) / 2 - 7,
        'text-anchor': 'middle',
      }, clippedLabel(label, 24))));
    }
    const nodeElements = graph.nodes.map(node => {
      const bound = boundsByNode.get(node.id);
      const selected = node.id === selectedId;
      const group = svg('g', {
        class: `worker-access-node node-${node.kind}${selected ? ' selected' : ''}`,
        transform: `translate(${node.x - 59} ${node.y - 25})`,
        tabindex: '0',
        role: 'button',
        'aria-pressed': String(selected),
        'aria-label': nodeAriaLabel(node, bound, labels),
        'data-access-node': node.id,
        onclick: () => select(node.id),
        onkeydown: event => {
          if (!['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          select(node.id);
        },
      },
      svg('rect', { width: 118, height: 50, rx: node.kind === 'line' ? 18 : 5 }),
      svg('text', { x: 10, y: 18, class: 'node-kind' },
        labels[node.kind] ?? node.kind),
      svg('text', { x: 10, y: 37, class: 'node-label' }, clippedLabel(node.label)),
      bound ? svg('text', {
        x: 108, y: 18, class: 'node-capacity', 'text-anchor': 'end',
      }, `≤${Math.round(bound.workers)}`) : null);
      return group;
    });
    const graphSvg = svg('svg', {
      class: 'worker-access-graph',
      viewBox: `0 0 ${graph.width} ${graph.height}`,
      role: 'group',
      'aria-label': labels.title,
      'data-access-node-count': graph.nodes.length,
      'data-access-edge-count': graph.edges.length,
      'data-access-hidden-count': graph.hiddenNodes,
      'data-access-hidden-edge-count': graph.hiddenEdges,
    },
    svg('defs', {},
      svg('marker', {
        id: 'worker-access-arrow',
        viewBox: '0 0 10 10',
        refX: 8,
        refY: 5,
        markerWidth: 5,
        markerHeight: 5,
        orient: 'auto-start-reverse',
      }, svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' }))),
    ...edgeElements,
    ...nodeElements);
    const inspector = html('aside', {
      class: 'worker-access-inspector',
      'aria-live': 'polite',
      'data-access-inspector': '',
    });
    const shell = html('section', { class: 'worker-access-shell' },
      showHeading ? html('header', { class: 'worker-access-heading' },
        html('div', {},
          html('h3', {}, labels.title),
          html('span', { class: 'evidence-badge exact' }, labels.exact)),
        graph.hiddenNodes
          ? html('span', { class: 'worker-access-hidden' }, hiddenLabel(graph))
          : null) : null,
      html('div', { class: 'worker-access-body' },
        html('div', { class: 'worker-access-canvas' },
          !showHeading && graph.hiddenNodes
            ? html('span', { class: 'worker-access-hidden-overlay' }, hiddenLabel(graph))
            : null,
          graphSvg),
        inspector));
    container.replaceChildren(shell);
    renderInspector(graph, inspector);
  };

  const select = id => {
    selectedId = id;
    const selected = evidence?.nodes?.find(node => node.id === id);
    onSelectionChange?.(selected ?? null);
    render();
    container.querySelector(`[data-access-node="${CSS.escape(id)}"]`)?.focus();
  };

  const renderInspector = (graph, inspector) => {
    const node = graph.nodes.find(item => item.id === selectedId);
    if (!node) {
      inspector.replaceChildren(html('p', { class: 'hint' }, labels.select));
      return;
    }
    const bound = graph.upperBounds.find(item => item.nodeId === node.id);
    const connectedEdges = graph.edges.filter(edge =>
      edge.source === node.id || edge.target === node.id);
    // replaceChildren stringifies null into a literal "null" text node, which is
    // how an absent capacity bound ended up printed in the panel.
    inspector.replaceChildren(...[
      html('p', { class: 'worker-access-kind' }, labels[node.kind] ?? node.kind),
      html('h4', {}, node.label),
      bound ? html('dl', {},
        html('div', {},
          html('dt', {}, labels.maxWorkers),
          html('dd', {}, `≤ ${Math.round(bound.workers)}`)),
        html('div', {},
          html('dt', {}, labels.bottleneck),
          html('dd', {}, workerAccessEdgeLabel(
            evidence.edges.find(edge => edge.id === bound.bottleneckEdgeId) ?? {}, labels,
          )))) : null,
      html('p', { class: 'worker-access-connection-count' },
        `${labels.connections}: ${connectedEdges.length}`),
      ...connectedEdges.slice(0, 6).map(edge =>
        html('p', {
          class: `worker-access-connection${edge.bottleneck ? ' bottleneck' : ''}`,
        }, workerAccessEdgeLabel(edge, labels))),
      html('div', { class: 'worker-access-actions' },
        html('button', {
          type: 'button',
          onclick: () => {
            focusId = node.id;
            render();
          },
        }, labels.focus),
        html('button', {
          type: 'button',
          onclick: () => {
            expandedIds.add(node.id);
            render();
          },
        }, labels.expand),
        Number.isInteger(node.buildingIndex) && onLocateBuilding
          ? html('button', {
            type: 'button',
            onclick: () => onLocateBuilding(node.buildingIndex),
          }, labels.locate)
          : null),
    ].filter(child => child != null));
  };

  render();
  return {
    focus(id) {
      focusId = id;
      selectedId = id;
      render();
    },
    destroy() {
      container.replaceChildren();
    },
  };
}
