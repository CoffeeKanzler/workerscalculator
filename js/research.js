export function completedPaidResearchKeys(definitions = [], savedResearch = []) {
  const paid = new Set(definitions.filter(item => item.pointCost === 1).map(item => item.key));
  return [...new Set(savedResearch
    .filter(item => item.progress >= 1 && paid.has(item.key))
    .map(item => item.key))].sort();
}
