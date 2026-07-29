// The workshop catalog index is fetched on every page load, and it had grown
// into a per-visit tax: 344 KB at 2,955 items, heading for roughly 861 KB once
// the download backlog lands. A typical save references about ninety items.
//
// Almost all of that weight is redundant. The index stored a path and two
// counts per item, but every one of the 2,955 paths was exactly
// items/<last-two-digits>/<id>.json — derivable from the id — and nothing
// reads the stored counts: the catalog totals shown after an import are
// computed from the definitions actually loaded. All the index has to answer
// is which ids exist.
//
// Version 1 (an items object) is still read, because a browser holding a
// cached copy must keep working until its marker moves.
export const WORKSHOP_INDEX_VERSION = 2;

export function catalogPathFor(id) {
  return `items/${String(id).slice(-2).padStart(2, '0')}/${id}.json`;
}

export function readWorkshopIndex(raw) {
  const ids = Array.isArray(raw?.ids) ? raw.ids.map(String)
    : raw?.items ? Object.keys(raw.items)
      : [];
  const present = new Set(ids);
  return {
    size: present.size,
    has: id => present.has(String(id)),
    // A version 1 index may hold a path that does not follow the convention,
    // so an explicit one still wins where it exists.
    pathFor: id => raw?.items?.[String(id)]?.path ?? catalogPathFor(id),
    ids: () => [...present],
  };
}

export function writeWorkshopIndex({ appId, ids, generatedAt = new Date().toISOString() }) {
  const unique = [...new Set((ids ?? []).map(String))].sort();
  return {
    schemaVersion: WORKSHOP_INDEX_VERSION,
    appId,
    generatedAt,
    itemCount: unique.length,
    ids: unique,
  };
}
