export const COMMAND_SECTIONS = Object.freeze([
  Object.freeze({ id: 'observe', labelKey: 'navObserve', defaultTab: 'republic', tabs: ['republic', 'map', 'city', 'prices', 'production', 'vehicleprod', 'trains', 'research'] }),
  Object.freeze({ id: 'diagnose', labelKey: 'navDiagnose', defaultTab: 'analysis', tabs: ['analysis', 'republic', 'map', 'city'] }),
  Object.freeze({ id: 'plan', labelKey: 'navPlan', defaultTab: 'chain', tabs: ['chain', 'city', 'production', 'vehicleprod', 'trains', 'research', 'advanced'] }),
  Object.freeze({ id: 'compare', labelKey: 'navCompare', defaultTab: 'republic', tabs: ['republic', 'saveimport', 'help'] }),
]);

const TAB_SECTION = new Map();
for (const section of COMMAND_SECTIONS) {
  for (const tab of section.tabs) if (!TAB_SECTION.has(tab)) TAB_SECTION.set(tab, section.id);
}

export function sectionForTab(tab) {
  return TAB_SECTION.get(tab) ?? 'observe';
}

export function sectionById(id) {
  return COMMAND_SECTIONS.find(section => section.id === id) ?? COMMAND_SECTIONS[0];
}

export function tabsForSection(id) {
  return [...sectionById(id).tabs];
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
