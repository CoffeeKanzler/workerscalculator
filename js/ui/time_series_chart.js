import uPlot from '../vendor/uPlot.esm.js?v=2';

export function alignTimeSeries(series) {
  const xValues = [...new Set(series.flatMap(item => item.points.map(point => point.x)))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const indexes = new Map(xValues.map((x, index) => [x, index]));
  const labelsByX = new Map();
  const valueColumns = series.map(item => {
    const values = Array(xValues.length).fill(null);
    for (const point of item.points) {
      const index = indexes.get(point.x);
      if (index === undefined || !Number.isFinite(point.y)) continue;
      values[index] = point.y;
      if (point.label) labelsByX.set(point.x, point.label);
    }
    return values;
  });
  return { xValues, valueColumns, labelsByX };
}

export function gameDateParts(dateKey) {
  const year = Math.floor(dateKey / 366);
  return { year, day: Math.max(0, Math.round(dateKey - year * 366)) };
}

export function formatGameDateKey(dateKey) {
  const { year, day } = gameDateParts(dateKey);
  return `${year} / ${String(day).padStart(3, '0')}`;
}

export function seriesSummary(series) {
  return series.filter(item => item.points.length).map(item => {
    const values = item.points.map(point => point.y).filter(Number.isFinite);
    return {
      label: item.label,
      first: values[0],
      last: values.at(-1),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
}

export function createChartGroupState() {
  const plots = new Set();
  const listeners = new Set();
  let range = null;
  let updating = false;
  const updatePlots = (next, source) => {
    if (updating) return;
    updating = true;
    for (const plot of plots) {
      if (plot !== source) plot.setScale('x', next);
    }
    updating = false;
    for (const listener of listeners) listener(range);
  };
  return {
    get range() { return range; },
    add(plot) {
      plots.add(plot);
      return () => plots.delete(plot);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(range);
      return () => listeners.delete(listener);
    },
    setRange(min, max, source = null) {
      range = { min, max };
      updatePlots(range, source);
    },
    reset() {
      range = null;
      updatePlots({ min: null, max: null }, null);
    },
    clear() {
      plots.clear();
      listeners.clear();
      range = null;
    },
  };
}

const chartGroups = new Map();
const activeCharts = new Set();

function chartGroup(name) {
  if (!chartGroups.has(name)) chartGroups.set(name, createChartGroupState());
  return chartGroups.get(name);
}

function element(tag, attrs = {}, ...children) {
  const result = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') result.className = value;
    else if (key.startsWith('aria-')) result.setAttribute(key, value);
    else result[key] = value;
  }
  result.append(...children);
  return result;
}

function themeValue(style, token) {
  return style.getPropertyValue(token).trim();
}

function replaceSummaryTokens(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export function resetChartGroup(name) {
  chartGroups.get(name)?.reset();
}

export function destroyTimeSeriesCharts() {
  for (const destroy of [...activeCharts]) destroy();
  chartGroups.clear();
}

export function mountTimeSeriesChart(container, {
  title,
  series,
  group,
  logScale = false,
  formatValue = value => String(value),
  valueSuffix = '',
  resetZoomLabel = 'Reset zoom',
  summaryTemplate = '{series}: {first}, {last}, {min}, {max}',
  height = 230,
}) {
  const usable = series.filter(item => item.points.length);
  const aligned = alignTimeSeries(usable);
  if (aligned.xValues.length < 2) return { plot: null, destroy() {} };

  const style = getComputedStyle(document.documentElement);
  const colors = usable.map(item =>
    themeValue(style, `--chart-${((item.colorSlot ?? 1) - 1) % 8 + 1}`));
  const grid = themeValue(style, '--chart-grid');
  const cursorColor = themeValue(style, '--chart-cursor');
  const selection = themeValue(style, '--chart-selection');
  const text = themeValue(style, '--muted');
  const shared = chartGroup(group);
  const plotHost = element('div', { class: 'chart-plot' });
  const reset = element('button', {
    type: 'button',
    class: 'chart-reset',
    onclick: () => shared.reset(),
  }, resetZoomLabel);
  const toolbar = element('div', { class: 'chart-toolbar' }, reset);
  const tooltip = element('div', {
    class: 'chart-tooltip',
    role: 'status',
    'aria-live': 'polite',
  });
  const legend = element('div', { class: 'chart-legend' });
  const summary = element('p', { class: 'virtual-summary' },
    ...seriesSummary(usable).map(item => replaceSummaryTokens(summaryTemplate, {
      series: item.label,
      first: formatValue(item.first),
      last: formatValue(item.last),
      min: formatValue(item.min),
      max: formatValue(item.max),
    }) + ' '));
  container.classList.add('history-chart-host');
  container.replaceChildren(toolbar, plotHost, legend, tooltip, summary);

  let plot = null;
  let destroyed = false;
  let resizeObserver = null;
  const legendButtons = usable.map((item, index) => {
    const marker = element('i', { 'aria-hidden': 'true' });
    marker.style.background = colors[index];
    const button = element('button', {
      type: 'button',
      class: 'chart-legend-item',
      'aria-pressed': 'true',
      onclick: () => plot?.setSeries(index + 1, { show: !plot.series[index + 1].show }),
    }, marker, element('span', {}, item.label));
    legend.append(button);
    return button;
  });

  const hideTooltip = () => {
    tooltip.style.opacity = '0';
  };
  hideTooltip();

  const updateTooltip = chart => {
    const index = chart.cursor.idx;
    if (index == null || !chart.over.matches(':hover')) return hideTooltip();
    const xValue = chart.data[0][index];
    const rows = usable.flatMap((item, seriesIndex) => {
      const value = chart.data[seriesIndex + 1][index];
      if (!chart.series[seriesIndex + 1].show || !Number.isFinite(value)) return [];
      const marker = element('i', { 'aria-hidden': 'true' });
      marker.style.background = colors[seriesIndex];
      return [element('span', { class: 'chart-tooltip-row' },
        marker,
        element('span', { class: 'chart-tooltip-label' }, item.label),
        element('b', {}, `${formatValue(value)}${valueSuffix}`))];
    });
    if (!rows.length) return hideTooltip();
    tooltip.replaceChildren(
      element('strong', {}, aligned.labelsByX.get(xValue) ?? formatGameDateKey(xValue)),
      ...rows);
    tooltip.style.opacity = '1';
    const pixelRatio = chart.pxRatio ?? globalThis.devicePixelRatio ?? 1;
    const cursorLeft = chart.bbox.left / pixelRatio + chart.cursor.left;
    const width = tooltip.offsetWidth;
    const available = container.clientWidth;
    const left = cursorLeft + 12 + width <= available
      ? cursorLeft + 12 : Math.max(0, cursorLeft - width - 12);
    tooltip.style.left = `${left}px`;
  };

  const fullMin = aligned.xValues[0];
  const fullMax = aligned.xValues.at(-1);
  const epsilon = Math.max(1e-7, (fullMax - fullMin) / 1e7);
  let groupedPlot = null;
  const options = {
    title: null,
    width: Math.max(320, Math.floor(container.getBoundingClientRect().width || 640)),
    height,
    legend: { show: false },
    scales: {
      x: { time: false },
      y: logScale ? { distr: 3 } : {},
    },
    cursor: {
      drag: { x: true, y: false, dist: 8 },
      sync: { key: group, setSeries: false, scales: ['x', null] },
      points: { size: 7 },
    },
    select: { show: true, fill: selection },
    axes: [{
      stroke: text,
      grid: { show: true, stroke: grid, width: 1 },
      ticks: { show: true, stroke: grid, width: 1 },
      space: 82,
      values: (_chart, values) => values.map(formatGameDateKey),
    }, {
      stroke: text,
      grid: { show: true, stroke: grid, width: 1 },
      ticks: { show: true, stroke: grid, width: 1 },
      space: 52,
      values: (_chart, values) => values.map(formatValue),
    }],
    series: [{}, ...usable.map((item, index) => ({
      label: item.label,
      stroke: colors[index],
      width: 2,
      spanGaps: false,
      points: { show: false },
    }))],
    hooks: {
      setCursor: [updateTooltip],
      setSeries: [(_chart, index) => {
        if (index > 0) {
          legendButtons[index - 1].setAttribute(
            'aria-pressed', String(_chart.series[index].show));
        }
      }],
      setScale: [(chart, key) => {
        if (key !== 'x' || chart.status !== 1) return;
        const { min, max } = chart.scales.x;
        const zoomed = min > fullMin + epsilon || max < fullMax - epsilon;
        if (zoomed) shared.setRange(min, max, groupedPlot);
      }],
    },
  };
  plot = new uPlot(options, [aligned.xValues, ...aligned.valueColumns], plotHost);
  plot.root.setAttribute('role', 'img');
  plot.root.setAttribute('aria-label',
    `${title}: ${formatGameDateKey(fullMin)}–${formatGameDateKey(fullMax)}`);
  plot.root.querySelector('.u-cursor-x')?.style.setProperty('border-color', cursorColor);
  plot.root.querySelector('.u-select')?.style.setProperty('background', selection);
  groupedPlot = {
    setScale(key, range) {
      plot.setScale(key, range.min == null
        ? { min: fullMin, max: fullMax } : range);
    },
  };
  const unregisterPlot = shared.add(groupedPlot);
  const unsubscribe = shared.subscribe(range => {
    reset.classList.toggle('active', !!range);
    reset.disabled = !range;
  });

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(entries => {
      if (destroyed) return;
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (width > 0 && width !== plot.width) plot.setSize({ width, height });
    });
    resizeObserver.observe(container);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    resizeObserver?.disconnect();
    unregisterPlot();
    unsubscribe();
    plot.destroy();
    activeCharts.delete(destroy);
  };
  activeCharts.add(destroy);
  return { plot, destroy };
}

export { uPlot };
