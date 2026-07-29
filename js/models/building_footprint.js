// Real building shapes for the map.
//
// The footprint dataset is extracted offline from the installed game's `.bbox`
// companions (see tools/extract_building_footprints.mjs): one or more local
// axis-aligned boxes per building type. Placing them needs the building's exact
// saved position and rotation, both of which the save records directly.
//
// The rotation convention was settled against the saves rather than assumed: of
// the two candidate signs, only this one puts the saved connection points on the
// building they belong to (mean miss 2.0 m against 6.1 m over 3187 points on
// bigsavegame, and 2.0 m is the length of the entrance stub itself).
export function rotateLocalPoint(x, z, rotationY) {
  const cos = Math.cos(rotationY ?? 0);
  const sin = Math.sin(rotationY ?? 0);
  return { x: x * cos + z * sin, z: z * cos - x * sin };
}

const PACK_PREFIXES = ['cwc', 'dlc1', 'dlc2', 'dlc3', 'elc2', 'elc3', 'elc4',
  'campaign1', 'campaign2'];

// The save writes DLC and mirrored buildings with prefixes the dataset does not
// use, the same mismatch the category index has to undo.
export function footprintKeyFor(type, footprints) {
  if (!type || !footprints) return null;
  const clean = String(type).replace(/^MIRRORZ_/, '').toLowerCase();
  if (footprints[clean]) return clean;
  for (const prefix of PACK_PREFIXES) {
    if (!clean.startsWith(`${prefix}_`)) continue;
    const key = `${prefix}/${clean.slice(prefix.length + 1)}`;
    if (footprints[key]) return key;
  }
  return null;
}

// Each box becomes a quad in world coordinates. Boxes are kept separate rather
// than merged so a courtyard building stays a courtyard rather than a slab.
export function footprintRingsFor(building, footprints) {
  const key = footprintKeyFor(building?.type, footprints);
  const entry = key ? footprints[key] : null;
  if (!entry?.boxes?.length) return null;
  if (!Number.isFinite(building.x) || !Number.isFinite(building.z)) return null;
  const rotationY = building.rotation?.y ?? 0;
  return entry.boxes.map(([minX, minZ, maxX, maxZ]) =>
    [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map(([x, z]) => {
      const rotated = rotateLocalPoint(x, z, rotationY);
      return { x: building.x + rotated.x, z: building.z + rotated.z };
    }));
}

// A modded republic is mostly Workshop buildings, and the mod catalogue carries
// each one's own outline in the same shape and the same local coordinates the
// retail extraction produces. Merging is therefore a key-by-key overlay rather
// than a conversion — and it returns a new object, because the base dataset is
// shared with everything else already drawn from it.
export function mergedFootprints(base, workshopBuildings = []) {
  const merged = { ...(base ?? {}) };
  for (const building of workshopBuildings ?? []) {
    const footprint = building?.footprint;
    if (!building?.id || !footprint?.boxes?.length) continue;
    merged[String(building.id).toLowerCase()] = footprint;
  }
  return merged;
}
