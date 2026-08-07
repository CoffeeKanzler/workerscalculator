// One section per tab. A tab listed in several sections made sectionForTab
// resolve to whichever section came first, so Observe captured almost every
// tab and Compare could never stay highlighted.
//
// Observe is read-only throughout: it reports what the save holds. Anything
// that accepts a hypothetical value belongs to Plan — which is why the price
// table (Observe) and the price overrides (Plan) are separate tabs.
export const QUICK_TOOLS_STORAGE_KEY = 'wr-command-quick-tools-v1';
export const QUICK_TOOLS_DEFAULTS = Object.freeze(['map', 'cities', 'chain', 'research']);
export const QUICK_TOOLS_LIMIT = 8;

export function normalizeQuickTools(ids, allowedTabs = []) {
  const allowed = new Set(allowedTabs);
  return [...new Set(Array.isArray(ids) ? ids : [])]
    .filter(id => allowed.has(id))
    .slice(0, QUICK_TOOLS_LIMIT);
}

export function defaultQuickTools(allowedTabs = []) {
  return normalizeQuickTools(QUICK_TOOLS_DEFAULTS, allowedTabs);
}

export function reorderQuickTools(ids, tab, direction) {
  const result = [...ids];
  const index = result.indexOf(tab);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= result.length) return result;
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export const COMMAND_SECTIONS = Object.freeze([
  Object.freeze({ id: 'observe', labelKey: 'navObserve', defaultTab: 'republic', tabs: Object.freeze(['home', 'republic', 'map', 'cities', 'history', 'construction', 'logistics', 'prices']) }),
  Object.freeze({ id: 'diagnose', labelKey: 'navDiagnose', defaultTab: 'alerts', tabs: Object.freeze(['alerts', 'pollution', 'crime']) }),
  Object.freeze({ id: 'plan', labelKey: 'navPlan', defaultTab: 'chain', tabs: Object.freeze(['chain', 'city', 'priceedit', 'production', 'vehicleprod', 'analysisRUB', 'analysisUSD', 'trains', 'research', 'advanced']) }),
  Object.freeze({ id: 'compare', labelKey: 'navCompare', defaultTab: 'saveimport', tabs: Object.freeze(['saveimport', 'snapshots', 'help']) }),
]);

const TAB_SECTION = new Map();
for (const section of COMMAND_SECTIONS) {
  for (const tab of section.tabs) TAB_SECTION.set(tab, section.id);
}
// Keep old shared links and saved sessions on the same section while the two
// explicit currency tabs become the visible navigation.
TAB_SECTION.set('analysis', 'plan');

export function sectionForTab(tab) {
  return TAB_SECTION.get(tab) ?? 'observe';
}

export function sectionById(id) {
  return COMMAND_SECTIONS.find(section => section.id === id) ?? COMMAND_SECTIONS[0];
}

export function tabsForSection(id) {
  return [...sectionById(id).tabs];
}

// Resuming a session an hour or more later usually means starting something
// new, and the deepest tab of the last republic is a poor place to land. The
// save is still restored in full; only the landing tab changes, and the start
// page already offers "continue", "open a save" and the saved snapshots.
export const START_PAGE_AFTER_MS = 60 * 60 * 1000;

export function shouldOpenStartPage({
  lastSavedAt = null,
  now = Date.now(),
  hasSave = false,
  viewingSharedLink = false,
} = {}) {
  // A shared link is an explicit request for that plan, and a planner with no
  // imported save has no republic to be confused about.
  if (viewingSharedLink || !hasSave) return false;
  if (!Number.isFinite(lastSavedAt)) return false;
  return now - lastSavedAt > START_PAGE_AFTER_MS;
}

const AGE_UNITS = [
  ['agoDay', 'agoDays', 24 * 60 * 60 * 1000],
  ['agoHour', 'agoHours', 60 * 60 * 1000],
  ['agoMinute', 'agoMinutes', 60 * 1000],
];

// Returns the translation key and its count so the caller can localise it. The
// singular key is chosen here rather than left to every caller to remember.
export function relativeAge(from, now = Date.now()) {
  if (!Number.isFinite(from)) return null;
  const elapsed = Math.max(0, now - from);
  for (const [singular, plural, span] of AGE_UNITS) {
    const value = Math.floor(elapsed / span);
    if (value >= 1) return { key: value === 1 ? singular : plural, value };
  }
  return { key: 'agoJustNow', value: 0 };
}

export function evidenceTone({ mode, runtimeStatus, hasSave, hasPlanning = true } = {}) {
  if (mode === 'addon' && runtimeStatus === 'ready') return 'live';
  if (mode === 'hosted' && hasSave) return 'save';
  if (hasPlanning) return 'plan';
  return 'unavailable';
}

export function surfaceState({ mode, runtimeStatus, hasSave, hasModel } = {}) {
  if (mode === 'addon' && runtimeStatus === 'resynchronizing') return 'resynchronizing';
  if (mode === 'addon' && runtimeStatus === 'unavailable') return 'error';
  if (mode === 'addon' && runtimeStatus !== 'ready' && !hasModel) return 'loading';
  if (mode === 'hosted' && !hasSave) return 'empty';
  return 'ready';
}
