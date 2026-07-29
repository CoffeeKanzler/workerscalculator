// Is this save a continuation of the republic already loaded, or a different
// one? The answer decides whether planning is refreshed, keeping the user's
// edits, or re-seeded from scratch and losing them.
//
// It was decided by comparing header.savePath, which fails on the ordinary
// case of playing across save slots: two saves of one republic, a year apart,
// read "453 - 2001_Kohle_Tanker2" and "10253 - Real N1.75 Mellerhöffe" and
// were treated as unrelated.
//
// Nothing else in the save is stable enough to use instead. Settlement ids are
// sequential array indices, not identifiers — between those two saves 20 of 43
// ids point at a different settlement. The terrain is not stable either, since
// the game lets you reshape it. The header holds no identifier that can be
// told apart from a map id with the saves available.
//
// Settlement names are stable, and they separate cleanly: those two saves
// share 42 of 43 names, while an unrelated republic shares none.

export function republicFingerprint(saveImport) {
  const scopes = Array.isArray(saveImport?.scopes) ? saveImport.scopes : [];
  const areas = new Set(scopes
    .map(scope => String(scope?.name ?? '').trim().toLowerCase())
    .filter(Boolean));
  return {
    path: saveImport?.header?.savePath || null,
    sourceName: saveImport?.sourceName || null,
    areas,
  };
}

// Overlap against the smaller set, so founding new towns does not make a
// republic stop being itself.
export function areaOverlap(a, b) {
  const smaller = a.size <= b.size ? a : b;
  const larger = smaller === a ? b : a;
  if (!smaller.size) return 0;
  let shared = 0;
  for (const name of smaller) if (larger.has(name)) shared += 1;
  return shared / smaller.size;
}

// The costly mistake is calling two republics the same and keeping a plan that
// describes neither, so the threshold is high and small saves are not judged
// on names at all — a handful of default names could coincide by chance.
export function isSameRepublic(current, incoming, { threshold = 0.7, minAreas = 4 } = {}) {
  if (!current || !incoming) return false;
  const a = republicFingerprint(current);
  const b = republicFingerprint(incoming);

  // An identical save path is the same file being re-imported: certain.
  if (a.path && b.path && a.path === b.path) return true;
  if (a.areas.size < minAreas || b.areas.size < minAreas) {
    // Too little to judge, so fall back to the name it was saved under.
    return !!a.sourceName && a.sourceName === b.sourceName;
  }
  return areaOverlap(a.areas, b.areas) >= threshold;
}
