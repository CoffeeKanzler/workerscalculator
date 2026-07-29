export function virtualWindow({
  rowCount, scrollTop, viewportHeight, rowHeight = 36, overscan = 6,
}) {
  const count = Math.max(0, Math.floor(rowCount || 0));
  if (!count) return { start: 0, end: 0, topHeight: 0, bottomHeight: 0 };
  const height = Math.max(1, rowHeight);
  const extra = Math.max(0, overscan);
  const offset = Math.max(0, scrollTop);
  const first = Math.min(count - 1, Math.floor(offset / height));
  const visibleEnd = Math.ceil((offset + Math.max(0, viewportHeight)) / height);
  const start = Math.max(0, first - extra);
  const end = Math.min(count, Math.max(first + 1, visibleEnd + extra));
  return {
    start,
    end,
    topHeight: start * height,
    bottomHeight: (count - end) * height,
  };
}

function spacerRow(columnCount, height) {
  const cell = document.createElement('td');
  cell.colSpan = columnCount;
  cell.style.height = `${height}px`;
  const row = document.createElement('tr');
  row.className = 'virtual-spacer';
  row.setAttribute('aria-hidden', 'true');
  row.append(cell);
  return row;
}

export function createVirtualTable({
  rows,
  columnCount,
  renderHead,
  renderRow,
  className = 'data',
  ariaLabel,
  rowHeight = 36,
  overscan = 6,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tablewrap virtual-tablewrap';
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', ariaLabel);

  const table = document.createElement('table');
  table.className = className;
  table.setAttribute('aria-rowcount', String(rows.length + 1));
  const body = document.createElement('tbody');
  table.append(renderHead(), body);
  wrapper.append(table);

  let previousStart = -1;
  let previousEnd = -1;
  let frame = null;
  const render = () => {
    frame = null;
    const viewportHeight = wrapper.clientHeight
      || Math.min(680, Math.max(rowHeight, globalThis.innerHeight * .68 || 360));
    const window = virtualWindow({
      rowCount: rows.length,
      scrollTop: wrapper.scrollTop,
      viewportHeight,
      rowHeight,
      overscan,
    });
    if (window.start === previousStart && window.end === previousEnd) return;
    previousStart = window.start;
    previousEnd = window.end;
    const visible = rows.slice(window.start, window.end).map((row, offset) => {
      const node = renderRow(row, window.start + offset);
      node.setAttribute('aria-rowindex', String(window.start + offset + 2));
      node.style.height = `${rowHeight}px`;
      return node;
    });
    body.replaceChildren(
      spacerRow(columnCount, window.topHeight),
      ...visible,
      spacerRow(columnCount, window.bottomHeight));
    wrapper.dataset.virtualStart = String(window.start);
    wrapper.dataset.virtualEnd = String(window.end);
    wrapper.dataset.virtualTotal = String(rows.length);
  };
  const schedule = () => {
    if (frame == null) frame = requestAnimationFrame(render);
  };
  wrapper.addEventListener('scroll', schedule, { passive: true });
  render();
  requestAnimationFrame(() => {
    previousStart = -1;
    render();
  });
  return wrapper;
}
