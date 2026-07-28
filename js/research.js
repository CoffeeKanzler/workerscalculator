// A save folder only has to contain namepoints.bin and buildings_game.bin, and
// the parser reports every other source as null when it is absent or
// unreadable. null slips past a default parameter, so both inputs are
// normalised here rather than trusted to be arrays.
export function completedPaidResearchKeys(definitions, savedResearch) {
  const paid = new Set((definitions ?? [])
    .filter(item => item.pointCost === 1).map(item => item.key));
  return [...new Set((savedResearch ?? [])
    .filter(item => item.progress >= 1 && paid.has(item.key))
    .map(item => item.key))].sort();
}
